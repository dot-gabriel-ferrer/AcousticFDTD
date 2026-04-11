/**
 * AcousticFDTD — Geometry Loader & Voxelizer
 *
 * Parses OBJ and STL 3D model files, then voxelizes the mesh onto
 * the FDTD grid using ray-casting to determine inside/outside status.
 * Supports both solid (wall) and hollow (air cavity) voxelization modes.
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class GeometryLoader {

    /**
     * Parse an OBJ file string into vertices and triangles.
     * @param {string} text - Contents of an .obj file
     * @returns {{ vertices: number[][], triangles: number[][] }}
     */
    static parseOBJ(text) {
        const vertices = [];
        const triangles = [];
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === "" || line[0] === "#") continue;

            const parts = line.split(/\s+/);
            const keyword = parts[0];

            if (keyword === "v" && parts.length >= 4) {
                vertices.push([
                    parseFloat(parts[1]),
                    parseFloat(parts[2]),
                    parseFloat(parts[3])
                ]);
            } else if (keyword === "f" && parts.length >= 4) {
                // Parse face — may have v, v/vt, v/vt/vn, v//vn formats
                const faceIndices = [];
                for (let j = 1; j < parts.length; j++) {
                    const idx = parseInt(parts[j].split("/")[0]);
                    // OBJ indices are 1-based
                    faceIndices.push(idx > 0 ? idx - 1 : vertices.length + idx);
                }
                // Triangulate polygon (fan triangulation)
                for (let j = 1; j < faceIndices.length - 1; j++) {
                    triangles.push([faceIndices[0], faceIndices[j], faceIndices[j + 1]]);
                }
            }
        }

        return { vertices, triangles };
    }

    /**
     * Parse a binary STL file.
     * @param {ArrayBuffer} buffer - The STL file content
     * @returns {{ vertices: number[][], triangles: number[][] }}
     */
    static parseSTLBinary(buffer) {
        const vertices = [];
        const triangles = [];
        const view = new DataView(buffer);

        // Skip 80-byte header
        const numTriangles = view.getUint32(80, true);
        let offset = 84;

        const vertMap = new Map();
        let vertCount = 0;

        const getVertexIndex = (x, y, z) => {
            // Quantize to avoid floating-point duplicates
            const key = x.toFixed(6) + "," + y.toFixed(6) + "," + z.toFixed(6);
            if (vertMap.has(key)) return vertMap.get(key);
            const idx = vertCount++;
            vertMap.set(key, idx);
            vertices.push([x, y, z]);
            return idx;
        };

        for (let i = 0; i < numTriangles; i++) {
            // Skip normal vector (12 bytes)
            offset += 12;

            const v1 = [
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ];
            offset += 12;

            const v2 = [
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ];
            offset += 12;

            const v3 = [
                view.getFloat32(offset, true),
                view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true)
            ];
            offset += 12;

            // Skip attribute byte count
            offset += 2;

            const i1 = getVertexIndex(v1[0], v1[1], v1[2]);
            const i2 = getVertexIndex(v2[0], v2[1], v2[2]);
            const i3 = getVertexIndex(v3[0], v3[1], v3[2]);
            triangles.push([i1, i2, i3]);
        }

        return { vertices, triangles };
    }

    /**
     * Parse an ASCII STL file.
     * @param {string} text - The STL file content
     * @returns {{ vertices: number[][], triangles: number[][] }}
     */
    static parseSTLAscii(text) {
        const vertices = [];
        const triangles = [];
        const vertMap = new Map();
        let vertCount = 0;

        const getVertexIndex = (x, y, z) => {
            const key = x.toFixed(6) + "," + y.toFixed(6) + "," + z.toFixed(6);
            if (vertMap.has(key)) return vertMap.get(key);
            const idx = vertCount++;
            vertMap.set(key, idx);
            vertices.push([x, y, z]);
            return idx;
        };

        const regex = /vertex\s+([\-\d.eE+]+)\s+([\-\d.eE+]+)\s+([\-\d.eE+]+)/gi;
        let match;
        const faceVerts = [];

        while ((match = regex.exec(text)) !== null) {
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            const z = parseFloat(match[3]);
            faceVerts.push(getVertexIndex(x, y, z));

            if (faceVerts.length === 3) {
                triangles.push([faceVerts[0], faceVerts[1], faceVerts[2]]);
                faceVerts.length = 0;
            }
        }

        return { vertices, triangles };
    }

    /**
     * Detect STL format and parse accordingly.
     * @param {ArrayBuffer} buffer - Raw file data
     * @returns {{ vertices: number[][], triangles: number[][] }}
     */
    static parseSTL(buffer) {
        // Try to detect ASCII vs binary
        const header = new Uint8Array(buffer, 0, Math.min(80, buffer.byteLength));
        let isAscii = false;
        try {
            const headerStr = new TextDecoder().decode(header);
            if (headerStr.toLowerCase().startsWith("solid") &&
                headerStr.indexOf("\n") !== -1) {
                // Check further: ASCII STL has "facet normal" keywords
                const fullText = new TextDecoder().decode(buffer);
                if (fullText.indexOf("facet") !== -1 && fullText.indexOf("vertex") !== -1) {
                    isAscii = true;
                }
            }
        } catch (_) { /* binary */ }

        if (isAscii) {
            return GeometryLoader.parseSTLAscii(new TextDecoder().decode(buffer));
        } else {
            return GeometryLoader.parseSTLBinary(buffer);
        }
    }

    /**
     * Compute the axis-aligned bounding box of a mesh.
     * @param {number[][]} vertices
     * @returns {{ min: number[], max: number[], center: number[], size: number[] }}
     */
    static computeAABB(vertices) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i];
            for (let j = 0; j < 3; j++) {
                if (v[j] < min[j]) min[j] = v[j];
                if (v[j] > max[j]) max[j] = v[j];
            }
        }

        return {
            min,
            max,
            center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
            size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
        };
    }

    /**
     * Scale and translate mesh vertices to fit within a target bounding box.
     * @param {number[][]} vertices - Original vertices (modified in-place)
     * @param {number[]} targetOrigin - [x, y, z] target min corner in meters
     * @param {number[]} targetSize - [w, h, d] target dimensions in meters
     * @param {boolean} keepAspect - Uniform scaling to preserve aspect ratio
     */
    static fitToBox(vertices, targetOrigin, targetSize, keepAspect) {
        const aabb = GeometryLoader.computeAABB(vertices);
        const srcSize = aabb.size;

        let scale;
        if (keepAspect) {
            const maxSrc = Math.max(srcSize[0], srcSize[1], srcSize[2]);
            if (maxSrc < 1e-10) return;
            const maxTgt = Math.min(targetSize[0], targetSize[1], targetSize[2]);
            scale = [maxTgt / maxSrc, maxTgt / maxSrc, maxTgt / maxSrc];
        } else {
            scale = [
                srcSize[0] > 1e-10 ? targetSize[0] / srcSize[0] : 1,
                srcSize[1] > 1e-10 ? targetSize[1] / srcSize[1] : 1,
                srcSize[2] > 1e-10 ? targetSize[2] / srcSize[2] : 1
            ];
        }

        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i];
            v[0] = (v[0] - aabb.min[0]) * scale[0] + targetOrigin[0];
            v[1] = (v[1] - aabb.min[1]) * scale[1] + targetOrigin[1];
            v[2] = (v[2] - aabb.min[2]) * scale[2] + targetOrigin[2];
        }
    }

    /**
     * Möller–Trumbore ray-triangle intersection test.
     * @param {number[]} origin - Ray origin [x,y,z]
     * @param {number[]} dir - Ray direction [x,y,z] (unit vector)
     * @param {number[]} v0 - Triangle vertex 0
     * @param {number[]} v1 - Triangle vertex 1
     * @param {number[]} v2 - Triangle vertex 2
     * @returns {number} t parameter (distance), or -1 on miss
     */
    static rayTriangleIntersect(origin, dir, v0, v1, v2) {
        const EPSILON = 1e-8;
        const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

        // h = dir × e2
        const h = [
            dir[1] * e2[2] - dir[2] * e2[1],
            dir[2] * e2[0] - dir[0] * e2[2],
            dir[0] * e2[1] - dir[1] * e2[0]
        ];

        const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
        if (a > -EPSILON && a < EPSILON) return -1;

        const f = 1.0 / a;
        const s = [origin[0] - v0[0], origin[1] - v0[1], origin[2] - v0[2]];
        const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
        if (u < 0.0 || u > 1.0) return -1;

        const q = [
            s[1] * e1[2] - s[2] * e1[1],
            s[2] * e1[0] - s[0] * e1[2],
            s[0] * e1[1] - s[1] * e1[0]
        ];
        const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
        if (v < 0.0 || u + v > 1.0) return -1;

        const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
        return t > EPSILON ? t : -1;
    }

    /**
     * Voxelize a mesh onto an FDTD grid using ray casting.
     *
     * For each grid cell center, casts a ray in the +X direction and counts
     * intersections with the mesh. If odd → inside; even → outside.
     *
     * @param {number[][]} vertices - Mesh vertices in meters (FDTD coords)
     * @param {number[][]} triangles - Triangle index triples
     * @param {number} nx - Grid X dimension
     * @param {number} ny - Grid Y dimension
     * @param {number} nz - Grid Z dimension
     * @param {number} dres - Spatial resolution in meters
     * @param {string} mode - 'solid' (inside=wall) or 'cavity' (inside=air, shell=wall)
     * @param {number} wallThickness - Shell wall thickness in grid cells (for cavity mode)
     * @returns {Uint8Array} Binary mask: 1 = wall cell, 0 = air cell
     */
    static voxelize(vertices, triangles, nx, ny, nz, dres, mode, wallThickness) {
        mode = mode || "solid";
        wallThickness = wallThickness || 1;
        const totalNodes = nx * ny * nz;
        const inside = new Uint8Array(totalNodes); // 0=outside, 1=inside

        // Pre-extract triangle vertices for fast access
        const triVerts = new Array(triangles.length);
        for (let t = 0; t < triangles.length; t++) {
            const tri = triangles[t];
            triVerts[t] = [vertices[tri[0]], vertices[tri[1]], vertices[tri[2]]];
        }

        // Build a simple spatial acceleration: slice triangles by Y-Z bounding ranges
        // For each (iy, iz) we only test triangles whose YZ bbox overlaps
        const triYZBounds = new Array(triangles.length);
        for (let t = 0; t < triangles.length; t++) {
            const tv = triVerts[t];
            triYZBounds[t] = {
                minY: Math.min(tv[0][1], tv[1][1], tv[2][1]),
                maxY: Math.max(tv[0][1], tv[1][1], tv[2][1]),
                minZ: Math.min(tv[0][2], tv[1][2], tv[2][2]),
                maxZ: Math.max(tv[0][2], tv[1][2], tv[2][2])
            };
        }

        const dir = [1, 0, 0]; // Cast rays in +X direction

        for (let iz = 0; iz < nz; iz++) {
            const cellZ = (iz + 0.5) * dres;
            for (let iy = 0; iy < ny; iy++) {
                const cellY = (iy + 0.5) * dres;
                const origin = [0, cellY, cellZ];

                // Collect intersections along this ray
                const hits = [];
                for (let t = 0; t < triangles.length; t++) {
                    const bounds = triYZBounds[t];
                    // Quick YZ overlap check
                    if (cellY < bounds.minY - dres || cellY > bounds.maxY + dres) continue;
                    if (cellZ < bounds.minZ - dres || cellZ > bounds.maxZ + dres) continue;

                    const hitT = GeometryLoader.rayTriangleIntersect(
                        origin, dir, triVerts[t][0], triVerts[t][1], triVerts[t][2]);
                    if (hitT > 0) {
                        hits.push(hitT);
                    }
                }

                // Sort intersections
                hits.sort((a, b) => a - b);

                // Remove near-duplicate hits (grazing edges)
                const uniqueHits = [];
                for (let h = 0; h < hits.length; h++) {
                    if (uniqueHits.length === 0 || hits[h] - uniqueHits[uniqueHits.length - 1] > dres * 0.1) {
                        uniqueHits.push(hits[h]);
                    }
                }

                // For each cell in this row, determine inside/outside
                let hitIdx = 0;
                let isInside = false;
                for (let ix = 0; ix < nx; ix++) {
                    const cellX = (ix + 0.5) * dres;
                    while (hitIdx < uniqueHits.length && uniqueHits[hitIdx] < cellX) {
                        isInside = !isInside;
                        hitIdx++;
                    }
                    if (isInside) {
                        inside[ix + iy * nx + iz * nx * ny] = 1;
                    }
                }
            }
        }

        // Depending on mode, produce the wall mask
        if (mode === "solid") {
            // Inside cells become walls
            return inside;
        } else {
            // "cavity" mode: only the shell is wall, interior is air
            const mask = new Uint8Array(totalNodes);
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    for (let ix = 0; ix < nx; ix++) {
                        const i = ix + iy * nx + iz * nx * ny;
                        if (inside[i] === 0) continue;

                        // Check if this cell is within wallThickness of an outside cell
                        let nearBoundary = false;
                        const wt = wallThickness;
                        outer:
                        for (let dz = -wt; dz <= wt && !nearBoundary; dz++) {
                            for (let dy = -wt; dy <= wt && !nearBoundary; dy++) {
                                for (let dx = -wt; dx <= wt; dx++) {
                                    const nx2 = ix + dx, ny2 = iy + dy, nz2 = iz + dz;
                                    if (nx2 < 0 || nx2 >= nx || ny2 < 0 || ny2 >= ny || nz2 < 0 || nz2 >= nz) {
                                        nearBoundary = true;
                                        break outer;
                                    }
                                    const neighbor = inside[nx2 + ny2 * nx + nz2 * nx * ny];
                                    if (neighbor === 0) {
                                        nearBoundary = true;
                                        break outer;
                                    }
                                }
                            }
                        }

                        if (nearBoundary) {
                            mask[i] = 1; // Wall cell (boundary of the solid)
                        }
                        // Interior cells (not near boundary) remain 0 (air)
                    }
                }
            }
            return mask;
        }
    }

    /**
     * Apply a voxelized mask to an FDTDSolver density field.
     * Cells marked as wall get high density; air cells keep nominal density.
     *
     * @param {FDTDSolver} solver - The solver instance
     * @param {Uint8Array} mask - Binary voxel mask (1=wall)
     * @param {number} wallRho - Density for wall cells (default: 2000 kg/m³ — like concrete)
     */
    static applyMaskToSolver(solver, mask, wallRho) {
        wallRho = wallRho || 2000;
        const n = solver.totalNodes;
        for (let i = 0; i < n; i++) {
            if (mask[i] === 1) {
                solver.rho[i] = wallRho;
            }
        }
    }

    /**
     * Convert mesh vertices to Three.js BufferGeometry for rendering.
     * @param {number[][]} vertices
     * @param {number[][]} triangles
     * @returns {THREE.BufferGeometry}
     */
    static toThreeGeometry(vertices, triangles) {
        if (typeof THREE === "undefined") return null;

        const positions = new Float32Array(triangles.length * 3 * 3);
        let idx = 0;
        for (let t = 0; t < triangles.length; t++) {
            const tri = triangles[t];
            for (let j = 0; j < 3; j++) {
                const v = vertices[tri[j]];
                // Map FDTD (X,Y,Z) -> Three.js (X, Z, Y)
                positions[idx++] = v[0];
                positions[idx++] = v[2];
                positions[idx++] = v[1];
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        return geometry;
    }
}

if (typeof module !== "undefined") {
    module.exports = { GeometryLoader };
}
