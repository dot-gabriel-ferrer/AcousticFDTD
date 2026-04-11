/**
 * AcousticFDTD — JavaScript 3D FDTD Solver
 *
 * Implements the linearised acoustic wave equations using a staggered-grid
 * leapfrog scheme, running entirely in the browser with TypedArrays.
 *
 * Equations solved:
 *   ∂v/∂t = -(1/ρ) ∇p
 *   ∂p/∂t = -ρ c² ∇·v
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class FDTDSolver {
    /**
     * @param {Object} config
     * @param {number[]} config.dims - Room dimensions [x,y,z] in meters
     * @param {number} config.dres - Spatial resolution in meters
     * @param {number} config.c0 - Speed of sound m/s
     * @param {number} config.rho - Density kg/m³
     * @param {number} config.sc - Courant number (0 < sc ≤ 1/√3)
     * @param {string} config.boundary - 'reflective'|'absorbing'|'periodic'
     * @param {number} config.wallReflection - Reflection coefficient 0..1
     */
    constructor(config) {
        this.c0 = config.c0 || 343.0;
        this.rho0 = config.rho || 1.225;
        this.sc = config.sc || 0.5;
        this.dres = config.dres || 0.05;
        this.boundary = config.boundary || "reflective";
        this.wallReflection = config.wallReflection !== undefined ? config.wallReflection : 1.0;

        // Grid dimensions (node counts)
        this.nx = Math.floor((config.dims[0] || 1.0) / this.dres);
        this.ny = Math.floor((config.dims[1] || 1.0) / this.dres);
        this.nz = Math.floor((config.dims[2] || 1.0) / this.dres);

        // Time step from CFL condition
        this.dt = Math.sqrt(3) * this.sc * this.dres / this.c0;

        // Pre-compute coupling constants
        this.alfa = 2.0 * this.sc / this.c0;
        this.cprv = this.rho0 * this.c0 * this.sc;

        // Total node count per 3D field
        this.totalNodes = this.nx * this.ny * this.nz;

        // Allocate typed arrays — two time levels × 4 fields (p, vx, vy, vz)
        // We use flat arrays for performance: index = x + y*nx + z*nx*ny
        this.p    = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vx   = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vy   = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];
        this.vz   = [new Float64Array(this.totalNodes), new Float64Array(this.totalNodes)];

        // Density field (constant for homogeneous)
        this.rho = new Float64Array(this.totalNodes);
        this.rho.fill(this.rho0);

        // Ping-pong indices
        this.n = 0;
        this.n1 = 1;
        this.step = 0;

        // Sources and receivers
        this.sources = [];
        this.receivers = [];

        // Max frequency for anti-aliasing
        this.maxFreq = this.c0 / (2.0 * Math.sqrt(3) * this.dres);
    }

    /** Convert (ix, iy, iz) to flat index */
    idx(ix, iy, iz) {
        return ix + iy * this.nx + iz * this.nx * this.ny;
    }

    /**
     * Add a sound source.
     * @param {Object} src
     * @param {number[]} src.position - [x,y,z] in meters
     * @param {number} src.frequency - Hz
     * @param {number} src.amplitude - Pa
     * @param {string} src.type - 'sine'|'impulse'|'gaussian'|'custom'
     * @param {string} src.injection - 'soft'|'hard'
     * @param {Float64Array} [src.waveformData] - Custom waveform samples (for type='custom')
     */
    addSource(src) {
        const ix = Math.min(Math.floor(src.position[0] / this.dres), this.nx - 1);
        const iy = Math.min(Math.floor(src.position[1] / this.dres), this.ny - 1);
        const iz = Math.min(Math.floor(src.position[2] / this.dres), this.nz - 1);
        this.sources.push({
            ix, iy, iz,
            frequency: src.frequency || 500,
            amplitude: src.amplitude || 1.0,
            type: src.type || "sine",
            injection: src.injection || "soft",
            flatIdx: this.idx(ix, iy, iz),
            waveformData: src.waveformData || null
        });
    }

    /**
     * Add a receiver (microphone).
     * @param {Object} rec
     * @param {number[]} rec.position - [x,y,z] in meters
     * @param {string} rec.label
     */
    addReceiver(rec) {
        const ix = Math.min(Math.floor(rec.position[0] / this.dres), this.nx - 1);
        const iy = Math.min(Math.floor(rec.position[1] / this.dres), this.ny - 1);
        const iz = Math.min(Math.floor(rec.position[2] / this.dres), this.nz - 1);
        this.receivers.push({
            ix, iy, iz,
            label: rec.label || "Mic",
            flatIdx: this.idx(ix, iy, iz),
            data: []
        });
    }

    /** Add a rectangular density wall region */
    addWall(startM, dimsM, wallRho) {
        const sx = Math.floor(startM[0] / this.dres);
        const sy = Math.floor(startM[1] / this.dres);
        const sz = Math.floor(startM[2] / this.dres);
        const dx = Math.floor(dimsM[0] / this.dres);
        const dy = Math.floor(dimsM[1] / this.dres);
        const dz = Math.floor(dimsM[2] / this.dres);
        for (let iz = sz; iz < sz + dz && iz < this.nz; iz++) {
            for (let iy = sy; iy < sy + dy && iy < this.ny; iy++) {
                for (let ix = sx; ix < sx + dx && ix < this.nx; ix++) {
                    this.rho[this.idx(ix, iy, iz)] = wallRho;
                }
            }
        }
    }

    /**
     * Get source signal value at current step.
     * @param {Object} src - Source object
     * @returns {number}
     */
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
            case "custom": {
                // Use pre-loaded waveform data (WAV file, tone, or glottal pulse)
                if (src.waveformData && this.step < src.waveformData.length) {
                    return src.amplitude * src.waveformData[this.step];
                }
                return 0;
            }
            case "sine":
            default:
                return src.amplitude * Math.sin(2 * Math.PI * src.frequency * t);
        }
    }

    /**
     * Apply a binary voxel mask to the density field.
     * Cells marked as 1 in the mask receive the specified wall density.
     * @param {Uint8Array} mask - Binary mask (1=wall, 0=air)
     * @param {number} wallRho - Wall density (default: 2000 kg/m³)
     */
    applyGeometryMask(mask, wallRho) {
        wallRho = wallRho || 2000;
        if (mask.length !== this.totalNodes) {
            console.warn(`Voxel mask size (${mask.length}) != solver grid (${this.totalNodes}). Truncating/padding.`);
        }
        const n = Math.min(mask.length, this.totalNodes);
        for (let i = 0; i < n; i++) {
            if (mask[i] === 1) {
                this.rho[i] = wallRho;
            }
        }
    }

    /** Execute one FDTD time step */
    calcStep() {
        const n = this.n;
        const n1 = this.n1;
        const pN = this.p[n], pN1 = this.p[n1];
        const vxN = this.vx[n], vxN1 = this.vx[n1];
        const vyN = this.vy[n], vyN1 = this.vy[n1];
        const vzN = this.vz[n], vzN1 = this.vz[n1];
        const alfa = this.alfa;
        const cprv = this.cprv;
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const rho = this.rho;

        // --- Inject sources ---
        for (const src of this.sources) {
            const val = this.sourceValue(src);
            if (src.injection === "soft") {
                pN[src.flatIdx] += val;
            } else {
                pN[src.flatIdx] = val;
            }
        }

        // --- Record receivers ---
        for (const rec of this.receivers) {
            rec.data.push(pN[rec.flatIdx]);
        }

        // --- Update velocities ---
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // vx: forward difference in x
                    let ixp = ix + 1;
                    if (ixp >= nx) {
                        ixp = this.boundary === "periodic" ? 0 : nx - 1;
                    }
                    const ip_x = ixp + iy * nx + iz * nx * ny;
                    const rhoSum_x = rho[i] + rho[ip_x];
                    vxN1[i] = vxN[i] - alfa * (pN[ip_x] - pN[i]) / rhoSum_x;

                    // vy: forward difference in y
                    let iyp = iy + 1;
                    if (iyp >= ny) {
                        iyp = this.boundary === "periodic" ? 0 : ny - 1;
                    }
                    const ip_y = ix + iyp * nx + iz * nx * ny;
                    const rhoSum_y = rho[i] + rho[ip_y];
                    vyN1[i] = vyN[i] - alfa * (pN[ip_y] - pN[i]) / rhoSum_y;

                    // vz: forward difference in z
                    let izp = iz + 1;
                    if (izp >= nz) {
                        izp = this.boundary === "periodic" ? 0 : nz - 1;
                    }
                    const ip_z = ix + iy * nx + izp * nx * ny;
                    const rhoSum_z = rho[i] + rho[ip_z];
                    vzN1[i] = vzN[i] - alfa * (pN[ip_z] - pN[i]) / rhoSum_z;
                }
            }
        }

        // --- Update pressure ---
        for (let iz = 0; iz < nz; iz++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const i = ix + iy * nx + iz * nx * ny;

                    // Backward differences for divergence
                    let ixm = ix - 1;
                    if (ixm < 0) {
                        ixm = this.boundary === "periodic" ? nx - 1 : 0;
                    }
                    const im_x = ixm + iy * nx + iz * nx * ny;

                    let iym = iy - 1;
                    if (iym < 0) {
                        iym = this.boundary === "periodic" ? ny - 1 : 0;
                    }
                    const im_y = ix + iym * nx + iz * nx * ny;

                    let izm = iz - 1;
                    if (izm < 0) {
                        izm = this.boundary === "periodic" ? nz - 1 : 0;
                    }
                    const im_z = ix + iy * nx + izm * nx * ny;

                    const divV = (vxN1[i] - vxN1[im_x]) +
                                 (vyN1[i] - vyN1[im_y]) +
                                 (vzN1[i] - vzN1[im_z]);

                    pN1[i] = pN[i] - rho[i] * (this.c0 * this.sc) * divV;
                }
            }
        }

        // --- Apply boundary conditions ---
        this._applyBC(n1);

        // --- Swap buffers ---
        this.n = n1;
        this.n1 = n;
        this.step++;
    }

    /** Apply boundary conditions */
    _applyBC(n1) {
        const nx = this.nx, ny = this.ny, nz = this.nz;
        const r = this.wallReflection;

        if (this.boundary === "reflective") {
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    // x boundaries: zero normal velocity
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
            // Simple absorbing: zero pressure at boundaries
            for (let iz = 0; iz < nz; iz++) {
                for (let iy = 0; iy < ny; iy++) {
                    this.p[n1][this.idx(0, iy, iz)] = 0;
                    this.p[n1][this.idx(nx - 1, iy, iz)] = 0;
                    this.vx[n1][this.idx(0, iy, iz)] = 0;
                    this.vx[n1][this.idx(nx - 1, iy, iz)] = 0;
                }
            }
            for (let iz = 0; iz < nz; iz++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.p[n1][this.idx(ix, 0, iz)] = 0;
                    this.p[n1][this.idx(ix, ny - 1, iz)] = 0;
                    this.vy[n1][this.idx(ix, 0, iz)] = 0;
                    this.vy[n1][this.idx(ix, ny - 1, iz)] = 0;
                }
            }
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    this.p[n1][this.idx(ix, iy, 0)] = 0;
                    this.p[n1][this.idx(ix, iy, nz - 1)] = 0;
                    this.vz[n1][this.idx(ix, iy, 0)] = 0;
                    this.vz[n1][this.idx(ix, iy, nz - 1)] = 0;
                }
            }
        }
        // periodic: no extra action needed (handled in index wrapping)
    }

    /**
     * Get a 2D pressure slice for visualization.
     * @param {string} plane - 'xy'|'xz'|'yz'
     * @param {number} sliceIdx - Index along the normal axis
     * @returns {Float64Array}
     */
    getSlice(plane, sliceIdx) {
        const pCur = this.p[this.n];
        let w, h;
        let data;

        if (plane === "xy") {
            w = this.nx; h = this.ny;
            const iz = Math.min(sliceIdx, this.nz - 1);
            data = new Float64Array(w * h);
            for (let iy = 0; iy < h; iy++) {
                for (let ix = 0; ix < w; ix++) {
                    data[ix + iy * w] = pCur[this.idx(ix, iy, iz)];
                }
            }
        } else if (plane === "xz") {
            w = this.nx; h = this.nz;
            const iy = Math.min(sliceIdx, this.ny - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++) {
                for (let ix = 0; ix < w; ix++) {
                    data[ix + iz * w] = pCur[this.idx(ix, iy, iz)];
                }
            }
        } else { // yz
            w = this.ny; h = this.nz;
            const ix = Math.min(sliceIdx, this.nx - 1);
            data = new Float64Array(w * h);
            for (let iz = 0; iz < h; iz++) {
                for (let iy = 0; iy < w; iy++) {
                    data[iy + iz * w] = pCur[this.idx(ix, iy, iz)];
                }
            }
        }

        return { data, width: w, height: h };
    }

    /** Reset simulation state */
    reset() {
        this.step = 0;
        this.n = 0;
        this.n1 = 1;
        for (let i = 0; i < 2; i++) {
            this.p[i].fill(0);
            this.vx[i].fill(0);
            this.vy[i].fill(0);
            this.vz[i].fill(0);
        }
        for (const rec of this.receivers) {
            rec.data = [];
        }
    }

    /** Get simulation info string */
    getInfo() {
        return {
            grid: `${this.nx}×${this.ny}×${this.nz}`,
            totalNodes: this.totalNodes,
            dt: this.dt,
            dres: this.dres,
            c0: this.c0,
            rho: this.rho0,
            sc: this.sc,
            maxFreq: this.maxFreq,
            boundary: this.boundary
        };
    }
}

// Export for module usage
if (typeof module !== "undefined") {
    module.exports = { FDTDSolver };
}
