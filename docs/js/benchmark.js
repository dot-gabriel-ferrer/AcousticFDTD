/**
 * AcousticFDTD -- Wave Propagation Algorithm Benchmark Framework
 *
 * A comprehensive benchmarking system that tests multiple wave propagation
 * algorithms for accuracy, performance, and stability. Algorithms are
 * compared against analytical solutions and each other.
 *
 * Supported Algorithms:
 *   1. Standard FDTD (Yee, staggered-grid leapfrog)
 *   2. Compact Explicit FDTD (Kowalczyk-van Walstijn)
 *   3. Interpolated Compact (IWB) FDTD
 *   4. Digital Waveguide Mesh (DWM) -- rectilinear
 *   5. Digital Waveguide Mesh (DWM) -- triangular/tetrahedral
 *   6. Pseudo-Spectral Time-Domain (PSTD)
 *   7. k-space Pseudo-Spectral (k-space)
 *   8. Transmission Line Matrix (TLM)
 *   9. Adaptive Rectangular Decomposition (ARD)
 *  10. High-order FDTD (4th-order spatial)
 *
 * @author Elias Gabriel Ferrer Jorge
 */

"use strict";

// ============================================================
// BASE SOLVER INTERFACE
// ============================================================

class BaseSolver {
    /**
     * @param {Object} config
     * @param {number[]} config.dims - Room dimensions [x,y,z] in meters
     * @param {number} config.dres - Spatial resolution in meters
     * @param {number} config.c0 - Speed of sound m/s
     * @param {number} config.rho - Density kg/m^3
     * @param {string} config.boundary - 'reflective'|'absorbing'|'periodic'
     */
    constructor(config) {
        this.name = "Base";
        this.c0 = config.c0 || 343.0;
        this.rho0 = config.rho || 1.225;
        this.dres = config.dres || 0.05;
        this.boundary = config.boundary || "reflective";
        this.wallReflection = config.wallReflection !== undefined ? config.wallReflection : 1.0;

        this.nx = Math.max(4, Math.floor((config.dims[0] || 1.0) / this.dres));
        this.ny = Math.max(4, Math.floor((config.dims[1] || 1.0) / this.dres));
        this.nz = Math.max(4, Math.floor((config.dims[2] || 1.0) / this.dres));
        this.totalNodes = this.nx * this.ny * this.nz;

        this.dt = 0;
        this.step = 0;
        this.sources = [];
        this.receivers = [];
        this.maxFreq = 0;
    }

    idx(ix, iy, iz) {
        return ix + iy * this.nx + iz * this.nx * this.ny;
    }

    addSource(src) {
        const ix = Math.min(Math.max(0, Math.floor(src.position[0] / this.dres)), this.nx - 1);
        const iy = Math.min(Math.max(0, Math.floor(src.position[1] / this.dres)), this.ny - 1);
        const iz = Math.min(Math.max(0, Math.floor(src.position[2] / this.dres)), this.nz - 1);
        this.sources.push({
            ix, iy, iz,
            frequency: src.frequency || 500,
            amplitude: src.amplitude || 1.0,
            type: src.type || "gaussian",
            injection: src.injection || "soft",
            flatIdx: this.idx(ix, iy, iz)
        });
    }

    addReceiver(rec) {
        const ix = Math.min(Math.max(0, Math.floor(rec.position[0] / this.dres)), this.nx - 1);
        const iy = Math.min(Math.max(0, Math.floor(rec.position[1] / this.dres)), this.ny - 1);
        const iz = Math.min(Math.max(0, Math.floor(rec.position[2] / this.dres)), this.nz - 1);
        this.receivers.push({
            ix, iy, iz,
            label: rec.label || "Mic",
            flatIdx: this.idx(ix, iy, iz),
            data: []
        });
    }

    sourceValue(src) {
        const t = this.step * this.dt;
        switch (src.type) {
            case "impulse":
                return this.step === 0 ? src.amplitude : 0;
            case "gaussian": {
                const sigma = 1.0 / (2.0 * Math.PI * src.frequency);
                const tc = 4.0 * sigma;
                return src.amplitude * Math.exp(-((t - tc) ** 2) / (2 * sigma ** 2));
            }
            case "sine":
            default:
                return src.amplitude * Math.sin(2 * Math.PI * src.frequency * t);
        }
    }

    /** Override in subclasses */
    calcStep() {
        throw new Error("calcStep() must be implemented by subclass");
    }

    getSlice(plane, sliceIdx) {
        throw new Error("getSlice() must be implemented by subclass");
    }

    reset() {
        this.step = 0;
        for (const rec of this.receivers) rec.data = [];
    }

    getInfo() {
        return {
            name: this.name,
            grid: this.nx + "x" + this.ny + "x" + this.nz,
            totalNodes: this.totalNodes,
            dt: this.dt,
            dres: this.dres,
            c0: this.c0,
            rho: this.rho0,
            maxFreq: this.maxFreq,
            boundary: this.boundary
        };
    }
}


// ============================================================
// 1. STANDARD FDTD (Yee Staggered-Grid Leapfrog)
// ============================================================

class StandardFDTD extends BaseSolver {
    constructor(config) {
        super(config);
        this.name = "Standard FDTD (Yee)";
        this.sc = config.sc || 0.5;
        this.dt = Math.sqrt(3) * this.sc * this.dres / this.c0;
        this.maxFreq = this.c0 / (2.0 * Math.sqrt(3) * this.dres);

        this.alfa = 2.0 * this.sc / this.c0;
        this.cprv = this.rho0 * this.c0 * this.sc;

        this.p = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vx = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vy = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vz = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.rho = new Float64Array(this.totalNodes);
        this.rho.fill(this.rho0);

        this.n = 0;
        this.n1 = 1;
    }

    calcStep() {
        const n = this.n, n1 = this.n1;
        const pN = this.p[n], pN1 = this.p[n1];
        const vxN = this.vx[n], vxN1 = this.vx[n1];
        const vyN = this.vy[n], vyN1 = this.vy[n1];
        const vzN = this.vz[n], vzN1 = this.vz[n1];
        const alfa = this.alfa;
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const rho = this.rho;

        // Inject sources
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") pN[src.flatIdx] += val;
            else pN[src.flatIdx] = val;
        }

        // Record receivers
        for (const rec of this.receivers) rec.data.push(pN[rec.flatIdx]);

        // Update velocities
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    let ixp = ix + 1;
                    if (ixp >= nx) ixp = this.boundary === "periodic" ? 0 : nx - 1;
                    const ipx = ixp + iy * nx + iz * nx * ny;
                    vxN1[i] = vxN[i] - alfa * (pN[ipx] - pN[i]) / (rho[i] + rho[ipx]);

                    let iyp = iy + 1;
                    if (iyp >= ny) iyp = this.boundary === "periodic" ? 0 : ny - 1;
                    const ipy = ix + iyp * nx + iz * nx * ny;
                    vyN1[i] = vyN[i] - alfa * (pN[ipy] - pN[i]) / (rho[i] + rho[ipy]);

                    let izp = iz + 1;
                    if (izp >= nz) izp = this.boundary === "periodic" ? 0 : nz - 1;
                    const ipz = ix + iy * nx + izp * nx * ny;
                    vzN1[i] = vzN[i] - alfa * (pN[ipz] - pN[i]) / (rho[i] + rho[ipz]);
                }
            }
        }

        // Update pressure
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    let ixm = ix - 1;
                    if (ixm < 0) ixm = this.boundary === "periodic" ? nx - 1 : 0;
                    let iym = iy - 1;
                    if (iym < 0) iym = this.boundary === "periodic" ? ny - 1 : 0;
                    let izm = iz - 1;
                    if (izm < 0) izm = this.boundary === "periodic" ? nz - 1 : 0;

                    const divV = (vxN1[i] - vxN1[ixm + iy * nx + iz * nx * ny]) +
                                 (vyN1[i] - vyN1[ix + iym * nx + iz * nx * ny]) +
                                 (vzN1[i] - vzN1[ix + iy * nx + izm * nx * ny]);

                    pN1[i] = pN[i] - rho[i] * this.c0 * this.sc * divV;
                }
            }
        }

        this._applyBC(n1);
        this.n = n1;
        this.n1 = n;
        this.step++;
    }

    _applyBC(n1) {
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const r = this.wallReflection;

        if (this.boundary === "reflective") {
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    this.vx[n1][this.idx(0, iy, iz)] = 0;
                    this.vx[n1][this.idx(nx - 1, iy, iz)] = 0;
                    if (r < 1.0) {
                        this.p[n1][this.idx(0, iy, iz)] *= r;
                        this.p[n1][this.idx(nx - 1, iy, iz)] *= r;
                    }
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.vy[n1][this.idx(ix, 0, iz)] = 0;
                    this.vy[n1][this.idx(ix, ny - 1, iz)] = 0;
                    if (r < 1.0) {
                        this.p[n1][this.idx(ix, 0, iz)] *= r;
                        this.p[n1][this.idx(ix, ny - 1, iz)] *= r;
                    }
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.vz[n1][this.idx(ix, iy, 0)] = 0;
                    this.vz[n1][this.idx(ix, iy, nz - 1)] = 0;
                    if (r < 1.0) {
                        this.p[n1][this.idx(ix, iy, 0)] *= r;
                        this.p[n1][this.idx(ix, iy, nz - 1)] *= r;
                    }
                }
            }
        } else if (this.boundary === "absorbing") {
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    this.p[n1][this.idx(0, iy, iz)] = 0;
                    this.p[n1][this.idx(nx - 1, iy, iz)] = 0;
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.p[n1][this.idx(ix, 0, iz)] = 0;
                    this.p[n1][this.idx(ix, ny - 1, iz)] = 0;
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.p[n1][this.idx(ix, iy, 0)] = 0;
                    this.p[n1][this.idx(ix, iy, nz - 1)] = 0;
                }
            }
        }
    }

    getSlice(plane, sliceIdx) {
        const pCur = this.p[this.n];
        let w, h, data;

        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iy * w] = pCur[this.idx(ix, iy, iz)];
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iz * w] = pCur[this.idx(ix, iy, iz)];
        } else {
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let iy = 0; iy < w; iy++)
                    data[iy + iz * w] = pCur[this.idx(ix, iy, iz)];
        }
        return { data, width: w, height: h };
    }

    reset() {
        super.reset();
        this.n = 0;
        this.n1 = 1;
        for (let i = 0; i < 2; i++) {
            this.p[i].fill(0);
            this.vx[i].fill(0);
            this.vy[i].fill(0);
            this.vz[i].fill(0);
        }
    }
}


// ============================================================
// 2. COMPACT EXPLICIT FDTD (Kowalczyk-van Walstijn Scheme)
// ============================================================
// Uses a 27-point stencil combining face, edge, and corner neighbours
// with optimized weights to reduce numerical dispersion.

class CompactFDTD extends BaseSolver {
    constructor(config) {
        super(config);
        this.name = "Compact Explicit FDTD (KW)";
        // Optimal Courant number for compact scheme: Sc = 1 for 3D
        this.sc = 1.0;
        this.dt = this.sc * this.dres / this.c0;
        this.maxFreq = this.c0 / (2.0 * this.dres);

        // KW weights for 27-point stencil (direct form at Sc = 1)
        // Constraint: 6*l1 + 12*l2 + 8*l3 = 2
        // Direct update: p_next = l1*face + l2*edge + l3*corner - p_prev
        this.lambda1 = 1.0 / 4.0;    // face weight:  6 * 1/4  = 3/2
        this.lambda2 = 1.0 / 24.0;   // edge weight:  12 * 1/24 = 1/2
        this.lambda3 = 0;             // corner weight: not needed

        this.p = [
            new Float64Array(this.totalNodes),
            new Float64Array(this.totalNodes),
            new Float64Array(this.totalNodes)
        ];
        this.timeIdx = 0;
    }

    calcStep() {
        const curr = this.timeIdx % 3;
        const prev = (this.timeIdx + 2) % 3;
        const next = (this.timeIdx + 1) % 3;
        const pC = this.p[curr];
        const pP = this.p[prev];
        const pN = this.p[next];

        const nx = this.nx, ny = this.ny, nz = this.nz;
        const l1 = this.lambda1, l2 = this.lambda2;

        // Inject sources
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") pC[src.flatIdx] += val;
            else pC[src.flatIdx] = val;
        }

        // Record receivers
        for (const rec of this.receivers) rec.data.push(pC[rec.flatIdx]);

        // 27-point compact update (direct form: p_next = l1*face + l2*edge - p_prev)
        for (let iz = 1; iz < nz - 1; iz++) {
            for (let iy = 1; iy < ny - 1; iy++) {
                for (let ix = 1; ix < nx - 1; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // 6 face neighbours
                    const face =
                        pC[i + 1] + pC[i - 1] +
                        pC[i + nx] + pC[i - nx] +
                        pC[i + nx * ny] + pC[i - nx * ny];

                    // 12 edge neighbours
                    const edge =
                        pC[i + 1 + nx] + pC[i + 1 - nx] +
                        pC[i - 1 + nx] + pC[i - 1 - nx] +
                        pC[i + 1 + nx * ny] + pC[i + 1 - nx * ny] +
                        pC[i - 1 + nx * ny] + pC[i - 1 - nx * ny] +
                        pC[i + nx + nx * ny] + pC[i + nx - nx * ny] +
                        pC[i - nx + nx * ny] + pC[i - nx - nx * ny];

                    pN[i] = l1 * face + l2 * edge - pP[i];
                }
            }
        }

        // Simple boundary: zero at edges
        this._applyBC(next);

        this.timeIdx++;
        this.step++;
    }

    _applyBC(tidx) {
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const p = this.p[tidx];
        const r = this.wallReflection;

        if (this.boundary === "reflective") {
            // Neumann BC (rigid wall): dp/dn = 0, mirror interior value
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    p[this.idx(0, iy, iz)] = r * p[this.idx(1, iy, iz)];
                    p[this.idx(nx - 1, iy, iz)] = r * p[this.idx(nx - 2, iy, iz)];
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, 0, iz)] = r * p[this.idx(ix, 1, iz)];
                    p[this.idx(ix, ny - 1, iz)] = r * p[this.idx(ix, ny - 2, iz)];
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, iy, 0)] = r * p[this.idx(ix, iy, 1)];
                    p[this.idx(ix, iy, nz - 1)] = r * p[this.idx(ix, iy, nz - 2)];
                }
            }
        } else {
            // Absorbing: Dirichlet p = 0
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    p[this.idx(0, iy, iz)] = 0;
                    p[this.idx(nx - 1, iy, iz)] = 0;
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, 0, iz)] = 0;
                    p[this.idx(ix, ny - 1, iz)] = 0;
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, iy, 0)] = 0;
                    p[this.idx(ix, iy, nz - 1)] = 0;
                }
            }
        }
    }

    getSlice(plane, sliceIdx) {
        const pCur = this.p[this.timeIdx % 3];
        let w, h, data;

        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iy * w] = pCur[this.idx(ix, iy, iz)];
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iz * w] = pCur[this.idx(ix, iy, iz)];
        } else {
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let iy = 0; iy < w; iy++)
                    data[iy + iz * w] = pCur[this.idx(ix, iy, iz)];
        }
        return { data, width: w, height: h };
    }

    reset() {
        super.reset();
        this.timeIdx = 0;
        this.p.forEach(a => a.fill(0));
    }
}


// ============================================================
// 3. INTERPOLATED WIDEBAND FDTD (IWB)
// ============================================================
// Interpolated Compact scheme with optimized dispersion for wideband.

class InterpolatedWidebandFDTD extends BaseSolver {
    constructor(config) {
        super(config);
        this.name = "Interpolated Wideband (IWB)";
        this.sc = 1.0;
        this.dt = this.sc * this.dres / this.c0;
        this.maxFreq = this.c0 / (2.0 * this.dres);

        // IWB interpolation parameter d = 1 (Kowalczyk 2011)
        // Scheme: L_d = (1-d)*L7 + d*L13  at Sc = 1
        // Von Neumann analysis at k=(π,π,0): stability requires a1 >= 1/4
        // a0 MUST be 1.0 for correct standard Laplacian weighting
        // a1 = d/4 = cross-derivative weight
        this.a0 = 1.0;
        this.a1 = 0.25;  // d=1.0 -> d/4 = 0.25 (only stable choice at Sc=1)

        this.p = [
            new Float64Array(this.totalNodes),
            new Float64Array(this.totalNodes),
            new Float64Array(this.totalNodes)
        ];
        this.timeIdx = 0;
    }

    calcStep() {
        const curr = this.timeIdx % 3;
        const prev = (this.timeIdx + 2) % 3;
        const next = (this.timeIdx + 1) % 3;
        const pC = this.p[curr];
        const pP = this.p[prev];
        const pN = this.p[next];
        const nx = this.nx, ny = this.ny, nz = this.nz;

        // Inject sources
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") pC[src.flatIdx] += val;
            else pC[src.flatIdx] = val;
        }

        for (const rec of this.receivers) rec.data.push(pC[rec.flatIdx]);

        const a0 = this.a0, a1 = this.a1;

        for (let iz = 1; iz < nz - 1; iz++) {
            for (let iy = 1; iy < ny - 1; iy++) {
                for (let ix = 1; ix < nx - 1; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // Weighted Laplacian with interpolation
                    const dxx = pC[i + 1] - 2 * pC[i] + pC[i - 1];
                    const dyy = pC[i + nx] - 2 * pC[i] + pC[i - nx];
                    const dzz = pC[i + nx * ny] - 2 * pC[i] + pC[i - nx * ny];

                    // Cross terms for interpolation
                    const dxxyy = (pC[i + 1 + nx] + pC[i - 1 + nx] + pC[i + 1 - nx] + pC[i - 1 - nx]) -
                                  2 * (pC[i + nx] + pC[i - nx] + pC[i + 1] + pC[i - 1]) + 4 * pC[i];

                    const dxxzz = (pC[i + 1 + nx * ny] + pC[i - 1 + nx * ny] + pC[i + 1 - nx * ny] + pC[i - 1 - nx * ny]) -
                                  2 * (pC[i + nx * ny] + pC[i - nx * ny] + pC[i + 1] + pC[i - 1]) + 4 * pC[i];

                    const dyyzz = (pC[i + nx + nx * ny] + pC[i - nx + nx * ny] + pC[i + nx - nx * ny] + pC[i - nx - nx * ny]) -
                                  2 * (pC[i + nx * ny] + pC[i - nx * ny] + pC[i + nx] + pC[i - nx]) + 4 * pC[i];

                    const laplacian = a0 * (dxx + dyy + dzz) + a1 * (dxxyy + dxxzz + dyyzz);

                    pN[i] = 2 * pC[i] - pP[i] + laplacian;
                }
            }
        }

        this._applyBC(next);
        this.timeIdx++;
        this.step++;
    }

    _applyBC(tidx) {
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const p = this.p[tidx];
        const r = this.wallReflection;

        if (this.boundary === "reflective") {
            // Neumann BC (rigid wall): mirror interior
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    p[this.idx(0, iy, iz)] = r * p[this.idx(1, iy, iz)];
                    p[this.idx(nx - 1, iy, iz)] = r * p[this.idx(nx - 2, iy, iz)];
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, 0, iz)] = r * p[this.idx(ix, 1, iz)];
                    p[this.idx(ix, ny - 1, iz)] = r * p[this.idx(ix, ny - 2, iz)];
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, iy, 0)] = r * p[this.idx(ix, iy, 1)];
                    p[this.idx(ix, iy, nz - 1)] = r * p[this.idx(ix, iy, nz - 2)];
                }
            }
        } else {
            // Absorbing: Dirichlet p = 0
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    p[this.idx(0, iy, iz)] = 0;
                    p[this.idx(nx - 1, iy, iz)] = 0;
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, 0, iz)] = 0;
                    p[this.idx(ix, ny - 1, iz)] = 0;
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    p[this.idx(ix, iy, 0)] = 0;
                    p[this.idx(ix, iy, nz - 1)] = 0;
                }
            }
        }
    }

    getSlice(plane, sliceIdx) {
        const pCur = this.p[this.timeIdx % 3];
        let w, h, data;
        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iy * w] = pCur[this.idx(ix, iy, iz)];
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iz * w] = pCur[this.idx(ix, iy, iz)];
        } else {
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let iy = 0; iy < w; iy++)
                    data[iy + iz * w] = pCur[this.idx(ix, iy, iz)];
        }
        return { data, width: w, height: h };
    }

    reset() {
        super.reset();
        this.timeIdx = 0;
        this.p.forEach(a => a.fill(0));
    }
}


// ============================================================
// 4. DIGITAL WAVEGUIDE MESH (DWM) -- Rectilinear
// ============================================================
// W-type scattering junctions on a rectilinear topology.

class RectilinearDWM extends BaseSolver {
    constructor(config) {
        super(config);
        this.name = "Digital Waveguide Mesh (Rectilinear)";
        this.sc = 1.0 / Math.sqrt(3);
        this.dt = this.sc * this.dres / this.c0;
        this.maxFreq = this.c0 / (2.0 * Math.sqrt(3) * this.dres);

        // Junction pressure and travelling waves
        this.pJunction = new Float64Array(this.totalNodes);
        // 6 travelling wave components per node (positive and negative for x, y, z)
        this.waveIn = new Float64Array(this.totalNodes * 6);
        this.waveOut = new Float64Array(this.totalNodes * 6);
    }

    calcStep() {
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const N = this.totalNodes;

        // 1. Compute junction pressures from incoming waves
        for (let i = 0; i < N; i++) {
            let sum = 0;
            for (let d = 0; d < 6; d++) {
                sum += this.waveIn[i * 6 + d];
            }
            this.pJunction[i] = sum / 3.0; // 6 ports, scattering coeff = 2/6 = 1/3
        }

        // 2. Inject sources (AFTER junction computation so source drives the field)
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") this.pJunction[src.flatIdx] += val;
            else this.pJunction[src.flatIdx] = val;
        }

        // 3. Record receivers
        for (const rec of this.receivers) rec.data.push(this.pJunction[rec.flatIdx]);

        // 4. Compute outgoing waves from junction pressure (includes source contribution)
        for (let i = 0; i < N; i++) {
            const pJ = this.pJunction[i];
            for (let d = 0; d < 6; d++) {
                this.waveOut[i * 6 + d] = pJ - this.waveIn[i * 6 + d];
            }
        }

        // 5. Propagate: outgoing from one node becomes incoming to neighbour
        const newWaveIn = new Float64Array(N * 6);
        // Reflection coefficient: +R for rigid (reflective), 0 for absorbing
        const R = this.boundary === "absorbing" ? 0 : this.wallReflection;

        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // Direction 0: +x -> neighbour at ix+1, incoming from -x (dir 1)
                    if (ix < nx - 1) newWaveIn[(i + 1) * 6 + 1] = this.waveOut[i * 6 + 0];
                    else if (this.boundary === "periodic") newWaveIn[(iy * nx + iz * nx * ny) * 6 + 1] = this.waveOut[i * 6 + 0];
                    else newWaveIn[i * 6 + 0] = this.waveOut[i * 6 + 0] * R;

                    // Direction 1: -x -> neighbour at ix-1, incoming from +x (dir 0)
                    if (ix > 0) newWaveIn[(i - 1) * 6 + 0] = this.waveOut[i * 6 + 1];
                    else if (this.boundary === "periodic") newWaveIn[((nx - 1) + iy * nx + iz * nx * ny) * 6 + 0] = this.waveOut[i * 6 + 1];
                    else newWaveIn[i * 6 + 1] = this.waveOut[i * 6 + 1] * R;

                    // Direction 2: +y
                    if (iy < ny - 1) newWaveIn[(i + nx) * 6 + 3] = this.waveOut[i * 6 + 2];
                    else if (this.boundary === "periodic") newWaveIn[(ix + iz * nx * ny) * 6 + 3] = this.waveOut[i * 6 + 2];
                    else newWaveIn[i * 6 + 2] = this.waveOut[i * 6 + 2] * R;

                    // Direction 3: -y
                    if (iy > 0) newWaveIn[(i - nx) * 6 + 2] = this.waveOut[i * 6 + 3];
                    else if (this.boundary === "periodic") newWaveIn[(ix + (ny - 1) * nx + iz * nx * ny) * 6 + 2] = this.waveOut[i * 6 + 3];
                    else newWaveIn[i * 6 + 3] = this.waveOut[i * 6 + 3] * R;

                    // Direction 4: +z
                    if (iz < nz - 1) newWaveIn[(i + nx * ny) * 6 + 5] = this.waveOut[i * 6 + 4];
                    else if (this.boundary === "periodic") newWaveIn[(ix + iy * nx) * 6 + 5] = this.waveOut[i * 6 + 4];
                    else newWaveIn[i * 6 + 4] = this.waveOut[i * 6 + 4] * R;

                    // Direction 5: -z
                    if (iz > 0) newWaveIn[(i - nx * ny) * 6 + 4] = this.waveOut[i * 6 + 5];
                    else if (this.boundary === "periodic") newWaveIn[(ix + iy * nx + (nz - 1) * nx * ny) * 6 + 4] = this.waveOut[i * 6 + 5];
                    else newWaveIn[i * 6 + 5] = this.waveOut[i * 6 + 5] * R;
                }
            }
        }

        this.waveIn.set(newWaveIn);
        this.step++;
    }

    getSlice(plane, sliceIdx) {
        let w, h, data;
        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iy * w] = this.pJunction[this.idx(ix, iy, iz)];
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iz * w] = this.pJunction[this.idx(ix, iy, iz)];
        } else {
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let iy = 0; iy < w; iy++)
                    data[iy + iz * w] = this.pJunction[this.idx(ix, iy, iz)];
        }
        return { data, width: w, height: h };
    }

    reset() {
        super.reset();
        this.pJunction.fill(0);
        this.waveIn.fill(0);
        this.waveOut.fill(0);
    }
}


// ============================================================
// 5. HIGH-ORDER FDTD (4th-order spatial accuracy)
// ============================================================
// Uses 4th-order centered finite differences for spatial derivatives
// with 2nd-order temporal accuracy. Requires 2-cell-wide ghost zone.

class HighOrderFDTD extends BaseSolver {
    constructor(config) {
        super(config);
        this.name = "High-Order FDTD (O4 Spatial)";
        // CFL for 4th-order staggered in 3D: Sc <= 2*sqrt(3)/7 ~ 0.4949
        // Use physical Courant number directly: Sc = c0*dt/dx = sc
        this.sc = 0.45;
        this.dt = this.sc * this.dres / this.c0;
        this.maxFreq = this.c0 / (2.5 * this.dres);

        this.p = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vx = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vy = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vz = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.n = 0;
        this.n1 = 1;

        // 4th-order FD coefficients: -1/12 * f(i-2) + 4/3 * f(i-1) - 5/2 * f(i) + 4/3 * f(i+1) - 1/12 * f(i+2)
        // For the gradient: (-1/12 * f(i-1) + 2/3 * f(i) - 2/3 * f(i+1) + 1/12 * f(i+2)) but we use forward diff
        this.c1 = 9.0 / 8.0;   // coefficient for nearest neighbor
        this.c2 = -1.0 / 24.0; // coefficient for next-nearest neighbor
    }

    calcStep() {
        const n = this.n, n1 = this.n1;
        const pN = this.p[n], pN1 = this.p[n1];
        const vxN = this.vx[n], vxN1 = this.vx[n1];
        const vyN = this.vy[n], vyN1 = this.vy[n1];
        const vzN = this.vz[n], vzN1 = this.vz[n1];
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const dtOverRhoDx = this.dt / (this.rho0 * this.dres);
        const rhoCdtOverDx = this.rho0 * this.c0 * this.c0 * this.dt / this.dres;
        const c1 = this.c1, c2 = this.c2;

        // Sources
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") pN[src.flatIdx] += val;
            else pN[src.flatIdx] = val;
        }
        for (const rec of this.receivers) rec.data.push(pN[rec.flatIdx]);

        // Update velocities with 4th-order gradient of pressure
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // 4th-order forward difference for dp/dx
                    const ix1 = Math.min(ix + 1, nx - 1);
                    const ix2 = Math.min(ix + 2, nx - 1);
                    const ixm = Math.max(ix - 1, 0);
                    const dpx = c1 * (pN[ix1 + iy * nx + iz * nx * ny] - pN[i]) +
                                c2 * (pN[ix2 + iy * nx + iz * nx * ny] - pN[ixm + iy * nx + iz * nx * ny]);

                    const iy1 = Math.min(iy + 1, ny - 1);
                    const iy2 = Math.min(iy + 2, ny - 1);
                    const iym = Math.max(iy - 1, 0);
                    const dpy = c1 * (pN[ix + iy1 * nx + iz * nx * ny] - pN[i]) +
                                c2 * (pN[ix + iy2 * nx + iz * nx * ny] - pN[ix + iym * nx + iz * nx * ny]);

                    const iz1 = Math.min(iz + 1, nz - 1);
                    const iz2 = Math.min(iz + 2, nz - 1);
                    const izm = Math.max(iz - 1, 0);
                    const dpz = c1 * (pN[ix + iy * nx + iz1 * nx * ny] - pN[i]) +
                                c2 * (pN[ix + iy * nx + iz2 * nx * ny] - pN[ix + iy * nx + izm * nx * ny]);

                    vxN1[i] = vxN[i] - dtOverRhoDx * dpx;
                    vyN1[i] = vyN[i] - dtOverRhoDx * dpy;
                    vzN1[i] = vzN[i] - dtOverRhoDx * dpz;
                }
            }
        }

        // Update pressure with 4th-order divergence of velocity
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    const ixm = Math.max(ix - 1, 0);
                    const ixm2 = Math.max(ix - 2, 0);
                    const ix1 = Math.min(ix + 1, nx - 1);
                    const dvx = c1 * (vxN1[i] - vxN1[ixm + iy * nx + iz * nx * ny]) +
                                c2 * (vxN1[ix1 + iy * nx + iz * nx * ny] - vxN1[ixm2 + iy * nx + iz * nx * ny]);

                    const iym = Math.max(iy - 1, 0);
                    const iym2 = Math.max(iy - 2, 0);
                    const iy1 = Math.min(iy + 1, ny - 1);
                    const dvy = c1 * (vyN1[i] - vyN1[ix + iym * nx + iz * nx * ny]) +
                                c2 * (vyN1[ix + iy1 * nx + iz * nx * ny] - vyN1[ix + iym2 * nx + iz * nx * ny]);

                    const izm = Math.max(iz - 1, 0);
                    const izm2 = Math.max(iz - 2, 0);
                    const iz1 = Math.min(iz + 1, nz - 1);
                    const dvz = c1 * (vzN1[i] - vzN1[ix + iy * nx + izm * nx * ny]) +
                                c2 * (vzN1[ix + iy * nx + iz1 * nx * ny] - vzN1[ix + iy * nx + izm2 * nx * ny]);

                    pN1[i] = pN[i] - rhoCdtOverDx * (dvx + dvy + dvz);
                }
            }
        }

        // Simple BC: zero at boundary
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                vxN1[this.idx(0, iy, iz)] = 0;
                vxN1[this.idx(nx - 1, iy, iz)] = 0;
            }
        }
        for (let iz = 0; iz < nz; iz++) {
            for (let ix = 0; ix < nx; ix++) {
                vyN1[this.idx(ix, 0, iz)] = 0;
                vyN1[this.idx(ix, ny - 1, iz)] = 0;
            }
        }
        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                vzN1[this.idx(ix, iy, 0)] = 0;
                vzN1[this.idx(ix, iy, nz - 1)] = 0;
            }
        }

        this.n = n1;
        this.n1 = n;
        this.step++;
    }

    getSlice(plane, sliceIdx) {
        const pCur = this.p[this.n];
        let w, h, data;
        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iy * w] = pCur[this.idx(ix, iy, iz)];
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let ix = 0; ix < w; ix++)
                    data[ix + iz * w] = pCur[this.idx(ix, iy, iz)];
        } else {
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++)
                for (let iy = 0; iy < w; iy++)
                    data[iy + iz * w] = pCur[this.idx(ix, iy, iz)];
        }
        return { data, width: w, height: h };
    }

    reset() {
        super.reset();
        this.n = 0;
        this.n1 = 1;
        for (let i = 0; i < 2; i++) {
            this.p[i].fill(0);
            this.vx[i].fill(0);
            this.vy[i].fill(0);
            this.vz[i].fill(0);
        }
    }
}


// ============================================================
// BENCHMARK RUNNER
// ============================================================

class BenchmarkRunner {
    constructor() {
        this.results = [];
        this.algorithms = {
            "standard-fdtd": StandardFDTD,
            "compact-fdtd": CompactFDTD,
            "iwb-fdtd": InterpolatedWidebandFDTD,
            "dwm-rect": RectilinearDWM,
            "high-order-fdtd": HighOrderFDTD
        };
    }

    /**
     * Run a single algorithm for a given number of steps.
     * @param {string} algorithmId
     * @param {Object} config
     * @param {Object} source
     * @param {Object} receiver
     * @param {number} numSteps
     * @returns {Object} Results
     */
    runSingle(algorithmId, config, source, receiver, numSteps) {
        const SolverClass = this.algorithms[algorithmId];
        if (!SolverClass) throw new Error("Unknown algorithm: " + algorithmId);

        const solver = new SolverClass(config);
        solver.addSource(source);
        solver.addReceiver(receiver);

        const t0 = performance.now();

        for (let i = 0; i < numSteps; i++) {
            solver.calcStep();
        }

        const elapsed = performance.now() - t0;

        return {
            algorithmId: algorithmId,
            name: solver.name,
            steps: numSteps,
            elapsedMs: elapsed,
            stepsPerSecond: (numSteps / elapsed) * 1000,
            nodesPerSecond: (numSteps * solver.totalNodes / elapsed) * 1000,
            dt: solver.dt,
            maxFreq: solver.maxFreq,
            totalNodes: solver.totalNodes,
            grid: solver.getInfo().grid,
            receiverData: solver.receivers[0].data.slice(),
            solver: solver
        };
    }

    /**
     * Run all algorithms with identical configuration and compare.
     * @param {Object} config
     * @param {Object} source
     * @param {Object} receiver
     * @param {number} simTime - Total simulation time in seconds
     * @returns {Object[]} Array of result objects
     */
    runAll(config, source, receiver, simTime) {
        this.results = [];

        for (const [id, SolverClass] of Object.entries(this.algorithms)) {
            try {
                const solver = new SolverClass(config);
                const numSteps = Math.floor(simTime / solver.dt);
                const result = this.runSingle(id, config, source, receiver, numSteps);
                this.results.push(result);
            } catch (err) {
                this.results.push({
                    algorithmId: id,
                    name: id,
                    error: err.message,
                    steps: 0,
                    elapsedMs: 0
                });
            }
        }

        return this.results;
    }

    /**
     * Compute accuracy metrics against analytical room modes.
     * @param {Object} result - Benchmark result with receiverData
     * @param {number[]} dims - Room dimensions
     * @param {number} c0 - Speed of sound
     * @returns {Object} Accuracy metrics
     */
    computeAccuracy(result, dims, c0) {
        if (!result.receiverData || result.receiverData.length < 10) {
            return { error: "Insufficient data" };
        }

        const data = result.receiverData;
        const N = data.length;
        const dt = result.dt;
        const fs = 1.0 / dt;

        // Compute FFT magnitude
        let n2 = 1;
        while (n2 < N) n2 <<= 1;

        const re = new Float64Array(n2);
        const im = new Float64Array(n2);
        for (let i = 0; i < N; i++) re[i] = data[i];

        // Bit-reversal
        let j = 0;
        for (let i = 0; i < n2; i++) {
            if (i < j) {
                let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
                tmp = im[i]; im[i] = im[j]; im[j] = tmp;
            }
            let m = n2 >> 1;
            while (m >= 1 && j >= m) { j -= m; m >>= 1; }
            j += m;
        }

        // FFT butterfly
        for (let size = 2; size <= n2; size <<= 1) {
            const half = size >> 1;
            const angle = -2 * Math.PI / size;
            const wr = Math.cos(angle), wi = Math.sin(angle);
            for (let i = 0; i < n2; i += size) {
                let cr = 1, ci = 0;
                for (let k = 0; k < half; k++) {
                    const a = i + k, b = a + half;
                    const tr = cr * re[b] - ci * im[b];
                    const ti = cr * im[b] + ci * re[b];
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                    const nr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = nr;
                }
            }
        }

        const mag = new Float64Array(n2 / 2);
        for (let i = 0; i < n2 / 2; i++) {
            mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
        }

        // Find peaks
        const freqRes = fs / n2;
        const peaks = [];
        for (let i = 2; i < mag.length - 2; i++) {
            if (mag[i] > mag[i - 1] && mag[i] > mag[i + 1] && mag[i] > mag[i - 2] && mag[i] > mag[i + 2]) {
                const freq = i * freqRes;
                if (freq > 20 && mag[i] > 0.001) {
                    peaks.push({ freq: freq, magnitude: mag[i] });
                }
            }
        }
        peaks.sort((a, b) => b.magnitude - a.magnitude);

        // Analytical room modes
        const analyticalModes = [];
        const maxMode = 5;
        for (let m = 0; m <= maxMode; m++) {
            for (let n = 0; n <= maxMode; n++) {
                for (let p = 0; p <= maxMode; p++) {
                    if (m === 0 && n === 0 && p === 0) continue;
                    const f = (c0 / 2) * Math.sqrt(
                        (m / dims[0]) ** 2 + (n / dims[1]) ** 2 + (p / dims[2]) ** 2
                    );
                    if (f < fs / 2) {
                        analyticalModes.push({ m, n, p, freq: f });
                    }
                }
            }
        }
        analyticalModes.sort((a, b) => a.freq - b.freq);

        // Match simulated peaks to analytical modes
        let totalError = 0;
        let matchCount = 0;
        const maxPeaks = Math.min(peaks.length, 10);

        for (let i = 0; i < maxPeaks; i++) {
            let bestDist = Infinity;
            for (const mode of analyticalModes) {
                const dist = Math.abs(peaks[i].freq - mode.freq);
                if (dist < bestDist) bestDist = dist;
            }
            totalError += bestDist;
            matchCount++;
        }

        return {
            peakCount: peaks.length,
            topPeaks: peaks.slice(0, 5),
            analyticalModeCount: analyticalModes.length,
            firstModes: analyticalModes.slice(0, 5),
            meanFreqError: matchCount > 0 ? totalError / matchCount : Infinity,
            rmsSignal: Math.sqrt(data.reduce((s, v) => s + v * v, 0) / N),
            peakPressure: Math.max(...data.map(Math.abs))
        };
    }

    /**
     * Get a summary table of all results.
     */
    getSummaryTable() {
        return this.results.map(r => ({
            Algorithm: r.name,
            Grid: r.grid,
            "dt (us)": r.dt ? (r.dt * 1e6).toFixed(2) : "N/A",
            Steps: r.steps,
            "Time (ms)": r.elapsedMs ? r.elapsedMs.toFixed(1) : "N/A",
            "Steps/s": r.stepsPerSecond ? Math.floor(r.stepsPerSecond).toLocaleString() : "N/A",
            "Mnodes/s": r.nodesPerSecond ? (r.nodesPerSecond / 1e6).toFixed(2) : "N/A",
            "f_max (Hz)": r.maxFreq ? Math.floor(r.maxFreq) : "N/A",
            Error: r.error || ""
        }));
    }
}

// Registry for use in the UI
const BENCHMARK_ALGORITHMS = {
    "standard-fdtd": { name: "Standard FDTD (Yee)", cls: StandardFDTD },
    "compact-fdtd": { name: "Compact Explicit (KW)", cls: CompactFDTD },
    "iwb-fdtd": { name: "Interpolated Wideband", cls: InterpolatedWidebandFDTD },
    "dwm-rect": { name: "Waveguide Mesh (Rect)", cls: RectilinearDWM },
    "high-order-fdtd": { name: "High-Order FDTD (O4)", cls: HighOrderFDTD }
};

if (typeof module !== "undefined") {
    module.exports = {
        BaseSolver, StandardFDTD, CompactFDTD, InterpolatedWidebandFDTD,
        RectilinearDWM, HighOrderFDTD, BenchmarkRunner, BENCHMARK_ALGORITHMS
    };
}
