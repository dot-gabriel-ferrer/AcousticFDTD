/**
 * AcousticFDTD — Example 3D Models for Acoustic Simulation
 *
 * Provides procedurally generated 3D model data for common acoustic
 * simulation scenarios. Models are returned as OBJ-format strings
 * that can be parsed by GeometryLoader.
 *
 * Models:
 *  - Simplified vocal tract (phonatory organ)
 *  - Open tube / resonator
 *  - Horn / exponential flare
 *  - Helmholtz resonator
 *  - Simple room with stage
 *  - Sphere (for diffraction studies)
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class ExampleModels {

    /**
     * Get list of available example models with metadata.
     * @returns {Object[]}
     */
    static getModelList() {
        return [
            {
                id: "vocal-tract",
                name: "Vocal Tract (Phonatory Organ)",
                description: "Simplified model of the human vocal tract from glottis to lips. Source at the glottis simulates vocal cord vibration.",
                suggestedSource: { type: "glottal", f0: 120, position: "glottis" },
                suggestedMics: [
                    { position: "lips", label: "Lips (Output)" },
                    { position: "exterior", label: "External (1m)" }
                ],
                suggestedRoom: [0.4, 0.3, 0.3],
                mode: "cavity"
            },
            {
                id: "open-tube",
                name: "Open Tube / Resonator",
                description: "Cylindrical tube open at both ends. Demonstrates standing wave patterns and resonance.",
                suggestedSource: { type: "sine", frequency: 500, position: "end" },
                suggestedMics: [
                    { position: "center", label: "Center" },
                    { position: "end", label: "Open End" }
                ],
                suggestedRoom: [0.6, 0.2, 0.2],
                mode: "cavity"
            },
            {
                id: "horn",
                name: "Exponential Horn",
                description: "Horn with exponentially expanding cross-section. Demonstrates impedance matching and directivity.",
                suggestedSource: { type: "sine", frequency: 1000, position: "throat" },
                suggestedMics: [
                    { position: "mouth", label: "Horn Mouth" },
                    { position: "far-field", label: "Far Field" }
                ],
                suggestedRoom: [0.5, 0.4, 0.4],
                mode: "cavity"
            },
            {
                id: "helmholtz",
                name: "Helmholtz Resonator",
                description: "Cavity with a narrow neck. Demonstrates low-frequency resonance below the cavity's natural modes.",
                suggestedSource: { type: "gaussian", position: "exterior" },
                suggestedMics: [
                    { position: "inside", label: "Inside Cavity" },
                    { position: "neck", label: "Neck" }
                ],
                suggestedRoom: [0.3, 0.3, 0.3],
                mode: "cavity"
            },
            {
                id: "sphere",
                name: "Rigid Sphere",
                description: "Solid sphere for studying acoustic diffraction and scattering.",
                suggestedSource: { type: "gaussian", position: "front" },
                suggestedMics: [
                    { position: "shadow", label: "Shadow Zone" },
                    { position: "bright", label: "Bright Zone" }
                ],
                suggestedRoom: [0.5, 0.5, 0.5],
                mode: "solid"
            },
            {
                id: "room-stage",
                name: "Room with Stage",
                description: "Small room with a raised stage platform. For room acoustics studies.",
                suggestedSource: { type: "impulse", position: "stage-center" },
                suggestedMics: [
                    { position: "audience-near", label: "Near Audience" },
                    { position: "audience-far", label: "Far Audience" }
                ],
                suggestedRoom: [1.0, 0.8, 0.6],
                mode: "solid"
            }
        ];
    }

    /**
     * Generate OBJ string for the vocal tract model.
     * The vocal tract is modeled as a series of cylindrical cross-sections
     * with varying radius to approximate the pharynx, oral cavity, and lips.
     *
     * Tract is oriented along the X-axis.
     * Cross-section profiles based on MRI measurements of vowel /a/.
     *
     * @param {number} length - Total tract length in meters (default: 0.17)
     * @param {number} segments - Number of cross-section segments (default: 20)
     * @param {number} radialRes - Points per cross-section circle (default: 12)
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateVocalTract(length, segments, radialRes) {
        length = length || 0.17;
        segments = segments || 20;
        radialRes = radialRes || 12;

        // Cross-section areas along the tract (normalized, glottis=0, lips=1)
        // Based on Fant (1960) vocal tract area function for vowel /a/
        const areaProfile = [
            0.3,  // Glottis
            0.5,  // Lower pharynx
            0.8,  // Pharynx
            1.2,  // Upper pharynx
            1.8,  // Oropharynx
            2.5,  // Oropharynx wide
            2.8,  // Uvula region
            2.2,  // Back oral cavity
            1.5,  // Mid oral cavity (tongue constriction for /a/)
            1.0,  // Tongue constriction
            0.8,  // Minimum constriction
            1.0,  // Post-constriction
            1.5,  // Front oral cavity
            2.0,  // Palatal region
            2.5,  // Alveolar region
            2.8,  // Pre-dental
            2.5,  // Dental
            2.0,  // Lip region
            1.5,  // Lip aperture
            1.0   // Lip opening
        ];

        // Interpolate area profile to match segment count
        const areas = [];
        for (let i = 0; i < segments; i++) {
            const t = i / (segments - 1);
            const idx = t * (areaProfile.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.min(lo + 1, areaProfile.length - 1);
            const frac = idx - lo;
            areas.push(areaProfile[lo] * (1 - frac) + areaProfile[hi] * frac);
        }

        // Convert areas to radii (area = π r²)
        const maxArea = 3.0; // cm² reference
        const maxRadius = 0.015; // meters (1.5 cm)
        const radii = areas.map(a => Math.sqrt(a / maxArea) * maxRadius);

        // Y,Z center of the tract
        const centerY = 0.15;
        const centerZ = 0.15;
        const startX = 0.05; // Offset from room boundary

        // Generate vertices
        const vertices = [];
        const faces = [];

        for (let s = 0; s < segments; s++) {
            const x = startX + (s / (segments - 1)) * length;
            const r = radii[s];

            for (let a = 0; a < radialRes; a++) {
                const angle = (2 * Math.PI * a) / radialRes;
                const y = centerY + r * Math.cos(angle);
                const z = centerZ + r * Math.sin(angle);
                vertices.push([x, y, z]);
            }
        }

        // Generate quads between consecutive cross-sections, then triangulate
        for (let s = 0; s < segments - 1; s++) {
            for (let a = 0; a < radialRes; a++) {
                const a1 = (a + 1) % radialRes;
                const i0 = s * radialRes + a;
                const i1 = s * radialRes + a1;
                const i2 = (s + 1) * radialRes + a1;
                const i3 = (s + 1) * radialRes + a;
                // Two triangles per quad
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        // Cap the glottis end (closed)
        const glottisCenter = vertices.length;
        vertices.push([startX, centerY, centerZ]);
        for (let a = 0; a < radialRes; a++) {
            const a1 = (a + 1) % radialRes;
            faces.push([glottisCenter, a, a1]);
        }

        // Cap the lips end (open — but we add the cap for visual completeness)
        const lipsCenter = vertices.length;
        const lipsBase = (segments - 1) * radialRes;
        vertices.push([startX + length, centerY, centerZ]);
        for (let a = 0; a < radialRes; a++) {
            const a1 = (a + 1) % radialRes;
            faces.push([lipsCenter, lipsBase + a, lipsBase + a1]);
        }

        // Build OBJ string
        let obj = "# AcousticFDTD - Vocal Tract Model (vowel /a/)\n";
        obj += "# Glottis at X=" + startX.toFixed(3) + ", Lips at X=" + (startX + length).toFixed(3) + "\n";
        obj += "o VocalTract\n";

        for (const v of vertices) {
            obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        }

        for (const f of faces) {
            obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";
        }

        // Source at glottis position
        const sourcePos = [startX + 0.002, centerY, centerZ];

        // Microphone positions
        const micPositions = [
            { position: [startX + length - 0.002, centerY, centerZ], label: "Lips (Output)" },
            { position: [startX + length + 0.05, centerY, centerZ], label: "External (5cm)" }
        ];

        return { obj, sourcePos, micPositions, mode: "cavity" };
    }

    /**
     * Generate OBJ string for an open cylindrical tube.
     * @param {number} length - Tube length in meters
     * @param {number} radius - Tube radius in meters
     * @param {number} segments - Axial segments
     * @param {number} radialRes - Circumferential resolution
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateOpenTube(length, radius, segments, radialRes) {
        length = length || 0.34;
        radius = radius || 0.02;
        segments = segments || 15;
        radialRes = radialRes || 12;

        const centerY = 0.10;
        const centerZ = 0.10;
        const startX = 0.05;

        const vertices = [];
        const faces = [];

        for (let s = 0; s <= segments; s++) {
            const x = startX + (s / segments) * length;
            for (let a = 0; a < radialRes; a++) {
                const angle = (2 * Math.PI * a) / radialRes;
                vertices.push([x, centerY + radius * Math.cos(angle), centerZ + radius * Math.sin(angle)]);
            }
        }

        for (let s = 0; s < segments; s++) {
            for (let a = 0; a < radialRes; a++) {
                const a1 = (a + 1) % radialRes;
                const i0 = s * radialRes + a;
                const i1 = s * radialRes + a1;
                const i2 = (s + 1) * radialRes + a1;
                const i3 = (s + 1) * radialRes + a;
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        let obj = "# AcousticFDTD - Open Tube\no OpenTube\n";
        for (const v of vertices) obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        for (const f of faces) obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";

        return {
            obj,
            sourcePos: [startX + 0.005, centerY, centerZ],
            micPositions: [
                { position: [startX + length / 2, centerY, centerZ], label: "Center" },
                { position: [startX + length - 0.005, centerY, centerZ], label: "Open End" }
            ],
            mode: "cavity"
        };
    }

    /**
     * Generate OBJ string for an exponential horn.
     * @param {number} length - Horn length in meters
     * @param {number} throatRadius - Throat radius in meters
     * @param {number} mouthRadius - Mouth radius in meters
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateHorn(length, throatRadius, mouthRadius) {
        length = length || 0.3;
        throatRadius = throatRadius || 0.01;
        mouthRadius = mouthRadius || 0.08;

        const segments = 20;
        const radialRes = 12;
        const centerY = 0.20;
        const centerZ = 0.20;
        const startX = 0.05;

        // Exponential radius growth
        const flare = Math.log(mouthRadius / throatRadius) / length;

        const vertices = [];
        const faces = [];

        for (let s = 0; s <= segments; s++) {
            const x = startX + (s / segments) * length;
            const dist = (s / segments) * length;
            const r = throatRadius * Math.exp(flare * dist);

            for (let a = 0; a < radialRes; a++) {
                const angle = (2 * Math.PI * a) / radialRes;
                vertices.push([x, centerY + r * Math.cos(angle), centerZ + r * Math.sin(angle)]);
            }
        }

        for (let s = 0; s < segments; s++) {
            for (let a = 0; a < radialRes; a++) {
                const a1 = (a + 1) % radialRes;
                const i0 = s * radialRes + a;
                const i1 = s * radialRes + a1;
                const i2 = (s + 1) * radialRes + a1;
                const i3 = (s + 1) * radialRes + a;
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        // Cap throat
        const throatCenter = vertices.length;
        vertices.push([startX, centerY, centerZ]);
        for (let a = 0; a < radialRes; a++) {
            const a1 = (a + 1) % radialRes;
            faces.push([throatCenter, a1, a]);
        }

        let obj = "# AcousticFDTD - Exponential Horn\no Horn\n";
        for (const v of vertices) obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        for (const f of faces) obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";

        return {
            obj,
            sourcePos: [startX + 0.005, centerY, centerZ],
            micPositions: [
                { position: [startX + length, centerY, centerZ], label: "Horn Mouth" },
                { position: [startX + length + 0.10, centerY, centerZ], label: "Far Field" }
            ],
            mode: "cavity"
        };
    }

    /**
     * Generate OBJ string for a Helmholtz resonator.
     * Consists of a spherical cavity with a narrow cylindrical neck.
     * @param {number} cavityRadius - Cavity radius in meters
     * @param {number} neckRadius - Neck radius in meters
     * @param {number} neckLength - Neck length in meters
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateHelmholtz(cavityRadius, neckRadius, neckLength) {
        cavityRadius = cavityRadius || 0.05;
        neckRadius = neckRadius || 0.01;
        neckLength = neckLength || 0.03;

        const radialRes = 16;
        const latRes = 12;  // Latitude rings for sphere
        const neckSegments = 6;
        const centerX = 0.15;
        const centerY = 0.15;
        const centerZ = 0.15;

        const vertices = [];
        const faces = [];

        // Generate sphere (cavity body)
        // Skip top pole area where neck connects (at +X direction)
        const neckAngle = Math.asin(neckRadius / cavityRadius);

        for (let lat = 0; lat <= latRes; lat++) {
            const phi = Math.PI * lat / latRes;  // 0 (top) to PI (bottom)
            for (let lon = 0; lon < radialRes; lon++) {
                const theta = 2 * Math.PI * lon / radialRes;
                const x = centerX + cavityRadius * Math.cos(phi);
                const y = centerY + cavityRadius * Math.sin(phi) * Math.cos(theta);
                const z = centerZ + cavityRadius * Math.sin(phi) * Math.sin(theta);
                vertices.push([x, y, z]);
            }
        }

        // Sphere faces
        for (let lat = 0; lat < latRes; lat++) {
            for (let lon = 0; lon < radialRes; lon++) {
                const lon1 = (lon + 1) % radialRes;
                const i0 = lat * radialRes + lon;
                const i1 = lat * radialRes + lon1;
                const i2 = (lat + 1) * radialRes + lon1;
                const i3 = (lat + 1) * radialRes + lon;
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        // Generate neck (cylinder extending from sphere in +X direction)
        const neckStart = centerX + cavityRadius;
        const neckVertStart = vertices.length;

        for (let s = 0; s <= neckSegments; s++) {
            const x = neckStart + (s / neckSegments) * neckLength;
            for (let a = 0; a < radialRes; a++) {
                const angle = (2 * Math.PI * a) / radialRes;
                vertices.push([x, centerY + neckRadius * Math.cos(angle), centerZ + neckRadius * Math.sin(angle)]);
            }
        }

        for (let s = 0; s < neckSegments; s++) {
            for (let a = 0; a < radialRes; a++) {
                const a1 = (a + 1) % radialRes;
                const i0 = neckVertStart + s * radialRes + a;
                const i1 = neckVertStart + s * radialRes + a1;
                const i2 = neckVertStart + (s + 1) * radialRes + a1;
                const i3 = neckVertStart + (s + 1) * radialRes + a;
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        let obj = "# AcousticFDTD - Helmholtz Resonator\no Helmholtz\n";
        for (const v of vertices) obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        for (const f of faces) obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";

        const neckEnd = neckStart + neckLength;
        return {
            obj,
            sourcePos: [neckEnd + 0.02, centerY, centerZ],
            micPositions: [
                { position: [centerX, centerY, centerZ], label: "Inside Cavity" },
                { position: [neckStart + neckLength / 2, centerY, centerZ], label: "Neck" }
            ],
            mode: "cavity"
        };
    }

    /**
     * Generate OBJ string for a rigid sphere.
     * @param {number} radius - Sphere radius in meters
     * @param {number} centerPos - [x,y,z] center position in meters
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateSphere(radius, centerPos) {
        radius = radius || 0.08;
        centerPos = centerPos || [0.25, 0.25, 0.25];

        const latRes = 16;
        const lonRes = 24;
        const vertices = [];
        const faces = [];

        // Add top pole
        vertices.push([centerPos[0], centerPos[1] + radius, centerPos[2]]);

        // Interior vertices
        for (let lat = 1; lat < latRes; lat++) {
            const phi = Math.PI * lat / latRes;
            for (let lon = 0; lon < lonRes; lon++) {
                const theta = 2 * Math.PI * lon / lonRes;
                vertices.push([
                    centerPos[0] + radius * Math.sin(phi) * Math.cos(theta),
                    centerPos[1] + radius * Math.cos(phi),
                    centerPos[2] + radius * Math.sin(phi) * Math.sin(theta)
                ]);
            }
        }

        // Add bottom pole
        const bottomPole = vertices.length;
        vertices.push([centerPos[0], centerPos[1] - radius, centerPos[2]]);

        // Top cap
        for (let lon = 0; lon < lonRes; lon++) {
            const lon1 = (lon + 1) % lonRes;
            faces.push([0, 1 + lon, 1 + lon1]);
        }

        // Body
        for (let lat = 0; lat < latRes - 2; lat++) {
            for (let lon = 0; lon < lonRes; lon++) {
                const lon1 = (lon + 1) % lonRes;
                const i0 = 1 + lat * lonRes + lon;
                const i1 = 1 + lat * lonRes + lon1;
                const i2 = 1 + (lat + 1) * lonRes + lon1;
                const i3 = 1 + (lat + 1) * lonRes + lon;
                faces.push([i0, i1, i2]);
                faces.push([i0, i2, i3]);
            }
        }

        // Bottom cap
        const lastRing = 1 + (latRes - 2) * lonRes;
        for (let lon = 0; lon < lonRes; lon++) {
            const lon1 = (lon + 1) % lonRes;
            faces.push([bottomPole, lastRing + lon1, lastRing + lon]);
        }

        let obj = "# AcousticFDTD - Rigid Sphere\no Sphere\n";
        for (const v of vertices) obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        for (const f of faces) obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";

        return {
            obj,
            sourcePos: [centerPos[0] - radius - 0.05, centerPos[1], centerPos[2]],
            micPositions: [
                { position: [centerPos[0] + radius + 0.05, centerPos[1], centerPos[2]], label: "Shadow Zone" },
                { position: [centerPos[0] - radius - 0.10, centerPos[1], centerPos[2]], label: "Bright Zone" }
            ],
            mode: "solid"
        };
    }

    /**
     * Generate a model by ID.
     * @param {string} modelId - Model identifier from getModelList()
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[], mode: string }}
     */
    static generate(modelId) {
        switch (modelId) {
            case "vocal-tract":
                return ExampleModels.generateVocalTract();
            case "open-tube":
                return ExampleModels.generateOpenTube();
            case "horn":
                return ExampleModels.generateHorn();
            case "helmholtz":
                return ExampleModels.generateHelmholtz();
            case "sphere":
                return ExampleModels.generateSphere();
            case "room-stage":
                return ExampleModels.generateRoomStage();
            default:
                return null;
        }
    }

    /**
     * Generate a simplified room with a stage platform.
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[], mode: string }}
     */
    static generateRoomStage() {
        // Stage is a box at the front of the room
        const stageW = 0.4, stageD = 0.2, stageH = 0.1;
        const stageX = 0.05, stageY = 0.05, stageZ = 0.0;

        const vertices = [
            // Stage box: 8 vertices
            [stageX, stageY, stageZ],
            [stageX + stageW, stageY, stageZ],
            [stageX + stageW, stageY + stageD, stageZ],
            [stageX, stageY + stageD, stageZ],
            [stageX, stageY, stageZ + stageH],
            [stageX + stageW, stageY, stageZ + stageH],
            [stageX + stageW, stageY + stageD, stageZ + stageH],
            [stageX, stageY + stageD, stageZ + stageH]
        ];

        const faces = [
            // Bottom
            [0, 3, 2], [0, 2, 1],
            // Top
            [4, 5, 6], [4, 6, 7],
            // Front
            [0, 1, 5], [0, 5, 4],
            // Back
            [2, 3, 7], [2, 7, 6],
            // Left
            [0, 4, 7], [0, 7, 3],
            // Right
            [1, 2, 6], [1, 6, 5]
        ];

        let obj = "# AcousticFDTD - Room with Stage\no Stage\n";
        for (const v of vertices) obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        for (const f of faces) obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";

        return {
            obj,
            sourcePos: [stageX + stageW / 2, stageY + stageD / 2, stageH + 0.05],
            micPositions: [
                { position: [0.3, 0.5, 0.15], label: "Near Audience" },
                { position: [0.3, 0.7, 0.15], label: "Far Audience" }
            ],
            mode: "solid"
        };
    }
}

if (typeof module !== "undefined") {
    module.exports = { ExampleModels };
}
