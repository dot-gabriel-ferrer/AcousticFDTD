/**
 * AcousticFDTD — Web Application Controller
 *
 * Orchestrates the FDTD solver, visualizer, and audio engine.
 * Manages UI interactions, simulation lifecycle, and rendering loop.
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class App {
    constructor() {
        this.solver = null;
        this.visualizer = null;
        this.visualizer3D = null;
        this.audio = new AudioEngine();
        this.animFrameId = null;
        this.running = false;
        this.stepsPerFrame = 5;
        this.viewPlane = "xy";
        this.viewSlice = 0;
        this.totalSimTime = 0.05; // seconds
        this.maxSteps = 0;

        this._bindUI();
        this._initDefault();
    }

    /** Bind UI elements */
    _bindUI() {
        // Canvases
        this.fieldCanvas = document.getElementById("fieldCanvas");
        this.timeCanvas = document.getElementById("timeCanvas");
        this.fftCanvas = document.getElementById("fftCanvas");

        // Controls
        this.btnStart = document.getElementById("btnStart");
        this.btnPause = document.getElementById("btnPause");
        this.btnReset = document.getElementById("btnReset");
        this.btnPlayAudio = document.getElementById("btnPlayAudio");
        this.btnExportWav = document.getElementById("btnExportWav");

        // Inputs
        this.inpDimX = document.getElementById("dimX");
        this.inpDimY = document.getElementById("dimY");
        this.inpDimZ = document.getElementById("dimZ");
        this.inpDres = document.getElementById("dres");
        this.inpMedium = document.getElementById("medium");
        this.inpBoundary = document.getElementById("boundary");
        this.inpWallRef = document.getElementById("wallReflection");
        this.inpSrcFreq = document.getElementById("srcFreq");
        this.inpSrcAmp = document.getElementById("srcAmp");
        this.inpSrcType = document.getElementById("srcType");
        this.inpSrcX = document.getElementById("srcX");
        this.inpSrcY = document.getElementById("srcY");
        this.inpSrcZ = document.getElementById("srcZ");
        this.inpMicX = document.getElementById("micX");
        this.inpMicY = document.getElementById("micY");
        this.inpMicZ = document.getElementById("micZ");
        this.inpSimTime = document.getElementById("simTime");
        this.inpViewPlane = document.getElementById("viewPlane");
        this.inpViewSlice = document.getElementById("viewSlice");
        this.inpStepsFrame = document.getElementById("stepsPerFrame");
        this.inpColorScale = document.getElementById("colorScale");

        // Info
        this.infoPanel = document.getElementById("infoPanel");
        this.stepDisplay = document.getElementById("stepDisplay");
        this.progressBar = document.getElementById("progressBar");

        // Events
        this.btnStart.addEventListener("click", () => this.start());
        this.btnPause.addEventListener("click", () => this.pause());
        this.btnReset.addEventListener("click", () => this.reset());
        this.btnPlayAudio.addEventListener("click", () => this.playAudio());
        this.btnExportWav.addEventListener("click", () => this.exportWav());

        this.inpViewPlane.addEventListener("change", () => {
            this.viewPlane = this.inpViewPlane.value;
            this._updateSliceMax();
            this._renderFrame();
        });
        this.inpViewSlice.addEventListener("input", () => {
            this.viewSlice = parseInt(this.inpViewSlice.value);
            document.getElementById("sliceVal").textContent = this.viewSlice;
            this._renderFrame();
        });
        this.inpColorScale.addEventListener("input", () => {
            const val = parseFloat(this.inpColorScale.value);
            if (this.visualizer) this.visualizer.setColorScale(val);
            document.getElementById("colorScaleVal").textContent = val.toFixed(1);
            this._renderFrame();
        });
        this.inpStepsFrame.addEventListener("input", () => {
            this.stepsPerFrame = parseInt(this.inpStepsFrame.value);
            document.getElementById("stepsVal").textContent = this.stepsPerFrame;
        });
    }

    /** Initialize with default parameters */
    _initDefault() {
        this._createSolver();
        this.visualizer = new Visualizer(this.fieldCanvas, this.timeCanvas, this.fftCanvas);

        // Initialize 3D visualizer if container exists
        const viewer3DContainer = document.getElementById("viewer3D");
        if (viewer3DContainer && typeof Visualizer3D !== 'undefined') {
            this.visualizer3D = new Visualizer3D(viewer3DContainer);
            this._update3DView();
        }

        this._updateInfo();
        this._renderFrame();
    }

    /** Create a new solver from current UI settings */
    _createSolver() {
        const mediumPresets = {
            air: { c0: 343, rho: 1.225 },
            water: { c0: 1493, rho: 997 },
            saltwater: { c0: 1533, rho: 1027 }
        };

        const med = mediumPresets[this.inpMedium.value] || mediumPresets.air;

        const config = {
            dims: [
                parseFloat(this.inpDimX.value),
                parseFloat(this.inpDimY.value),
                parseFloat(this.inpDimZ.value)
            ],
            dres: parseFloat(this.inpDres.value),
            c0: med.c0,
            rho: med.rho,
            sc: 0.5,
            boundary: this.inpBoundary.value,
            wallReflection: parseFloat(this.inpWallRef.value)
        };

        this.solver = new FDTDSolver(config);

        // Add source
        this.solver.addSource({
            position: [
                parseFloat(this.inpSrcX.value),
                parseFloat(this.inpSrcY.value),
                parseFloat(this.inpSrcZ.value)
            ],
            frequency: parseFloat(this.inpSrcFreq.value),
            amplitude: parseFloat(this.inpSrcAmp.value),
            type: this.inpSrcType.value,
            injection: "soft"
        });

        // Add receiver
        this.solver.addReceiver({
            position: [
                parseFloat(this.inpMicX.value),
                parseFloat(this.inpMicY.value),
                parseFloat(this.inpMicZ.value)
            ],
            label: "Mic 1"
        });

        this.totalSimTime = parseFloat(this.inpSimTime.value);
        this.maxSteps = Math.floor(this.totalSimTime / this.solver.dt);

        this._updateSliceMax();
    }

    _updateSliceMax() {
        let maxSlice;
        if (this.viewPlane === "xy") maxSlice = this.solver.nz - 1;
        else if (this.viewPlane === "xz") maxSlice = this.solver.ny - 1;
        else maxSlice = this.solver.nx - 1;

        this.inpViewSlice.max = maxSlice;
        this.viewSlice = Math.min(this.viewSlice, maxSlice);
        this.viewSlice = Math.max(0, Math.floor(maxSlice / 2));
        this.inpViewSlice.value = this.viewSlice;
        document.getElementById("sliceVal").textContent = this.viewSlice;
    }

    _updateInfo() {
        if (!this.solver) return;
        const info = this.solver.getInfo();
        this.infoPanel.innerHTML =
            `<strong>Grid:</strong> ${info.grid} (${info.totalNodes.toLocaleString()} nodes)<br>` +
            `<strong>dt:</strong> ${(info.dt * 1e6).toFixed(1)} μs | ` +
            `<strong>dx:</strong> ${(info.dres * 100).toFixed(1)} cm<br>` +
            `<strong>c₀:</strong> ${info.c0} m/s | <strong>ρ:</strong> ${info.rho} kg/m³<br>` +
            `<strong>Sc:</strong> ${info.sc} | <strong>f<sub>max</sub>:</strong> ${Math.floor(info.maxFreq)} Hz<br>` +
            `<strong>BC:</strong> ${info.boundary} | <strong>Total steps:</strong> ${this.maxSteps.toLocaleString()}`;
    }

    /** Start / resume simulation */
    start() {
        if (this.running) return;

        // If at start, rebuild
        if (this.solver.step === 0) {
            this._createSolver();
            if (this.visualizer) {
                this.visualizer = new Visualizer(this.fieldCanvas, this.timeCanvas, this.fftCanvas);
            }
            this._updateInfo();
        }

        this.running = true;
        this.btnStart.disabled = true;
        this.btnPause.disabled = false;
        this._disableInputs(true);
        this._loop();
    }

    /** Pause simulation */
    pause() {
        this.running = false;
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    /** Reset simulation */
    reset() {
        this.pause();
        this._createSolver();
        this._update3DView();
        this._updateInfo();
        this._renderFrame();
        this.stepDisplay.textContent = "Step: 0 / " + this.maxSteps;
        this.progressBar.style.width = "0%";
        this._disableInputs(false);
        this.btnStart.disabled = false;
    }

    /** Animation loop */
    _loop() {
        if (!this.running) return;

        for (let i = 0; i < this.stepsPerFrame; i++) {
            if (this.solver.step >= this.maxSteps) {
                this._finish();
                return;
            }
            this.solver.calcStep();
        }

        this._renderFrame();

        // Update UI
        const progress = (this.solver.step / this.maxSteps) * 100;
        this.progressBar.style.width = progress + "%";
        this.stepDisplay.textContent =
            `Step: ${this.solver.step.toLocaleString()} / ${this.maxSteps.toLocaleString()}`;

        this.animFrameId = requestAnimationFrame(() => this._loop());
    }

    /** Render current state */
    _renderFrame() {
        if (!this.solver || !this.visualizer) return;

        const slice = this.solver.getSlice(this.viewPlane, this.viewSlice);

        // Build markers based on current view plane
        const markers = { sources: [], receivers: [] };
        for (const s of this.solver.sources) {
            const m = this._projectToPlane(s.ix, s.iy, s.iz);
            if (m) markers.sources.push(m);
        }
        for (const r of this.solver.receivers) {
            const m = this._projectToPlane(r.ix, r.iy, r.iz);
            if (m) markers.receivers.push(m);
        }

        this.visualizer.renderSlice(slice, markers);

        // Update time and FFT plots
        if (this.solver.receivers.length > 0) {
            const micData = this.solver.receivers[0].data;
            this.visualizer.plotTimeSeries(micData, this.solver.dt);
            if (micData.length > 10) {
                this.visualizer.plotFFT(micData, 1.0 / this.solver.dt);
            }
        }
    }

    /** Project 3D coordinates to 2D based on current view plane */
    _projectToPlane(ix, iy, iz) {
        const s = this.viewSlice;
        const tolerance = 2; // Show markers within ±2 nodes of the slice

        if (this.viewPlane === "xy") {
            if (Math.abs(iz - s) <= tolerance) return { ix, iy };
        } else if (this.viewPlane === "xz") {
            if (Math.abs(iy - s) <= tolerance) return { ix: ix, iy: iz };
        } else {
            if (Math.abs(ix - s) <= tolerance) return { ix: iy, iy: iz };
        }
        return null;
    }

    /** Handle simulation completion */
    _finish() {
        this.running = false;
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        this.btnPlayAudio.disabled = false;
        this.btnExportWav.disabled = false;
        this.progressBar.style.width = "100%";
        this.stepDisplay.textContent =
            `Complete! ${this.solver.step.toLocaleString()} steps`;

        this._renderFrame();
    }

    /** Play recorded mic data as audio */
    playAudio() {
        if (!this.solver || this.solver.receivers.length === 0) return;
        this.audio.play(
            this.solver.receivers[0].data,
            1.0 / this.solver.dt,
            0.8
        );
    }

    /** Export mic data as WAV */
    exportWav() {
        if (!this.solver || this.solver.receivers.length === 0) return;
        this.audio.exportWAV(
            this.solver.receivers[0].data,
            1.0 / this.solver.dt,
            "fdtd_recording.wav"
        );
    }

    /** Disable/enable input fields during simulation */
    _disableInputs(disabled) {
        const inputs = document.querySelectorAll(".sim-input");
        inputs.forEach(inp => { inp.disabled = disabled; });
    }

    /** Update 3D visualization with current solver state */
    _update3DView() {
        if (!this.visualizer3D || !this.solver) return;

        // Update room dimensions
        const dims = [
            parseFloat(this.inpDimX.value),
            parseFloat(this.inpDimY.value),
            parseFloat(this.inpDimZ.value)
        ];
        this.visualizer3D.setRoomDimensions(dims);

        // Update sources
        const sources = this.solver.sources.map(src => ({
            position: [
                parseFloat(this.inpSrcX.value),
                parseFloat(this.inpSrcY.value),
                parseFloat(this.inpSrcZ.value)
            ]
        }));
        this.visualizer3D.setSources(sources);

        // Update microphones
        const microphones = [{
            position: [
                parseFloat(this.inpMicX.value),
                parseFloat(this.inpMicY.value),
                parseFloat(this.inpMicZ.value)
            ],
            pattern: 'omni'
        }];
        this.visualizer3D.setMicrophones(microphones);
    }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    window.app = new App();
});
