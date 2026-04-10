/**
 * AcousticFDTD -- Web Application Controller
 *
 * Orchestrates the FDTD solver, visualizer, and audio engine.
 * Supports multiple algorithms, microphones, visualization modes,
 * and acoustic parameter computation.
 *
 * @author Elias Gabriel Ferrer Jorge
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
        this.totalSimTime = 0.05;
        this.maxSteps = 0;
        this.simDimension = 3;
        this.algorithmId = "standard-fdtd";
        this.vizMode = "single-slice";

        // Mic colors palette
        this.micColors = [
            "#00ff88", "#00d4ff", "#ff6b6b", "#eab308",
            "#a78bfa", "#f97316", "#06b6d4", "#ec4899"
        ];

        // Multi-microphone data
        this.microphones = [{
            id: 0, x: 0.2, y: 0.2, z: 0.5,
            pattern: "omni", label: "Mic 1"
        }];
        this.nextMicId = 1;

        this._bindUI();
        this._initDefault();
    }

    // ----------------------------------------------------------------
    // UI Binding
    // ----------------------------------------------------------------

    _bindUI() {
        // Canvases
        this.fieldCanvas = document.getElementById("fieldCanvas");
        this.timeCanvas = document.getElementById("timeCanvas");
        this.fftCanvas = document.getElementById("fftCanvas");
        this.edcCanvas = document.getElementById("edcCanvas");

        // Controls
        this.btnStart = document.getElementById("btnStart");
        this.btnPause = document.getElementById("btnPause");
        this.btnReset = document.getElementById("btnReset");
        this.btnPlayAudio = document.getElementById("btnPlayAudio");
        this.btnExportWav = document.getElementById("btnExportWav");

        // Room inputs
        this.inpDimX = document.getElementById("dimX");
        this.inpDimY = document.getElementById("dimY");
        this.inpDimZ = document.getElementById("dimZ");
        this.inpDres = document.getElementById("dres");
        this.inpMedium = document.getElementById("medium");
        this.inpBoundary = document.getElementById("boundary");
        this.inpWallRef = document.getElementById("wallReflection");
        this.inpSimTime = document.getElementById("simTime");

        // Source inputs
        this.inpSrcFreq = document.getElementById("srcFreq");
        this.inpSrcAmp = document.getElementById("srcAmp");
        this.inpSrcType = document.getElementById("srcType");
        this.inpSrcX = document.getElementById("srcX");
        this.inpSrcY = document.getElementById("srcY");
        this.inpSrcZ = document.getElementById("srcZ");

        // Algorithm
        this.inpAlgorithm = document.getElementById("algorithm");

        // View controls
        this.inpViewPlane = document.getElementById("viewPlane");
        this.inpViewSlice = document.getElementById("viewSlice");
        this.inpStepsFrame = document.getElementById("stepsPerFrame");
        this.inpColorScale = document.getElementById("colorScale");
        this.inpVizMode = document.getElementById("vizMode");
        this.audioMicSelect = document.getElementById("audioMicSelect");

        // Info
        this.infoPanel = document.getElementById("infoPanel");
        this.stepDisplay = document.getElementById("stepDisplay");
        this.progressBar = document.getElementById("progressBar");

        // Basic events
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

        // Algorithm change
        if (this.inpAlgorithm) {
            this.inpAlgorithm.addEventListener("change", () => {
                this.algorithmId = this.inpAlgorithm.value;
                this._updateAlgoInfo();
            });
        }

        // Dimension toggle
        this._bindDimToggle();

        // Visualization mode
        if (this.inpVizMode) {
            this.inpVizMode.addEventListener("change", () => {
                this.vizMode = this.inpVizMode.value;
                this._updateVizModeControls();
                if (this.visualizer3D) {
                    this.visualizer3D.setVisualizationMode(this.vizMode);
                }
                this._renderFrame();
            });
        }

        // Viz mode-specific controls
        this._bindVizModeControls();

        // Multi-mic
        this._bindMicControls();
    }

    _bindDimToggle() {
        const toggle = document.getElementById("dimToggle");
        if (!toggle) return;
        const btns = toggle.querySelectorAll(".dim-btn");
        btns.forEach(btn => {
            btn.addEventListener("click", () => {
                btns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.simDimension = parseInt(btn.dataset.dim);
                this._updateDimInputs();
            });
        });
    }

    _updateDimInputs() {
        // Disable Z for 1D/2D, disable Y for 1D
        if (this.inpDimY) {
            this.inpDimY.disabled = this.simDimension < 2;
            if (this.simDimension < 2) this.inpDimY.value = this.inpDres.value;
        }
        if (this.inpDimZ) {
            this.inpDimZ.disabled = this.simDimension < 3;
            if (this.simDimension < 3) this.inpDimZ.value = this.inpDres.value;
        }
    }

    _bindVizModeControls() {
        // Triple slice sliders
        ["sliceX", "sliceY", "sliceZ"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", () => {
                    document.getElementById(id + "Val").textContent = el.value;
                    this._renderFrame();
                });
            }
        });

        // Volumetric density
        const ptDensity = document.getElementById("ptDensity");
        if (ptDensity) {
            ptDensity.addEventListener("input", () => {
                document.getElementById("ptDensityVal").textContent = ptDensity.value;
                if (this.visualizer3D) {
                    this.visualizer3D._clearAllModes();
                }
            });
        }

        // Isosurface threshold
        const isoThresh = document.getElementById("isoThresh");
        if (isoThresh) {
            isoThresh.addEventListener("input", () => {
                document.getElementById("isoThreshVal").textContent =
                    parseFloat(isoThresh.value).toFixed(2);
                this._renderFrame();
            });
        }

        // Particle count
        const pCount = document.getElementById("pCount");
        if (pCount) {
            pCount.addEventListener("input", () => {
                document.getElementById("pCountVal").textContent = pCount.value;
                if (this.visualizer3D && this.visualizer3D._particleSystem) {
                    this.visualizer3D._clearAllModes();
                }
            });
        }
    }

    _updateVizModeControls() {
        const modes = {
            "single-slice": [],
            "triple-slice": ["tripleSliceControls"],
            "volumetric": ["volumetricControls"],
            "isosurface": ["isosurfaceControls"],
            "particles": ["particleControls"]
        };

        const allControls = [
            "tripleSliceControls", "volumetricControls",
            "isosurfaceControls", "particleControls"
        ];

        allControls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });

        const show = modes[this.vizMode] || [];
        show.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "block";
        });
    }

    // ----------------------------------------------------------------
    // Multi-Microphone Management
    // ----------------------------------------------------------------

    _bindMicControls() {
        const addBtn = document.getElementById("btnAddMic");
        if (addBtn) {
            addBtn.addEventListener("click", () => this._addMicrophone());
        }
    }

    _addMicrophone() {
        const dims = this._getDims();
        const id = this.nextMicId++;
        const mic = {
            id: id,
            x: +(dims[0] * (0.3 + Math.random() * 0.4)).toFixed(2),
            y: +(dims[1] * (0.3 + Math.random() * 0.4)).toFixed(2),
            z: +(dims[2] * 0.5).toFixed(2),
            pattern: "omni",
            label: "Mic " + (this.microphones.length + 1)
        };
        this.microphones.push(mic);
        this._renderMicList();
    }

    _removeMicrophone(id) {
        if (this.microphones.length <= 1) return;
        this.microphones = this.microphones.filter(m => m.id !== id);
        this._renderMicList();
    }

    _getMicDataFromUI() {
        const list = document.getElementById("micList");
        if (!list) return;
        const items = list.querySelectorAll(".mic-item");
        items.forEach((item, idx) => {
            if (idx < this.microphones.length) {
                const mic = this.microphones[idx];
                const xInp = item.querySelector('[data-field="x"]');
                const yInp = item.querySelector('[data-field="y"]');
                const zInp = item.querySelector('[data-field="z"]');
                const patInp = item.querySelector('[data-field="pattern"]');
                if (xInp) mic.x = parseFloat(xInp.value);
                if (yInp) mic.y = parseFloat(yInp.value);
                if (zInp) mic.z = parseFloat(zInp.value);
                if (patInp) mic.pattern = patInp.value;
            }
        });
    }

    _renderMicList() {
        const list = document.getElementById("micList");
        if (!list) return;
        list.innerHTML = "";

        this.microphones.forEach((mic, idx) => {
            const color = this.micColors[idx % this.micColors.length];
            const canDelete = this.microphones.length > 1;
            const div = document.createElement("div");
            div.className = "mic-item";
            div.dataset.micId = mic.id;
            div.innerHTML =
                '<div class="mic-item-header">' +
                    '<span class="mic-color-dot" style="background: ' + color + '"></span>' +
                    '<span class="mic-label">' + mic.label + '</span>' +
                    '<select class="mic-pattern sim-input" data-field="pattern">' +
                        '<option value="omni"' + (mic.pattern === "omni" ? " selected" : "") + '>Omni</option>' +
                        '<option value="cardioid"' + (mic.pattern === "cardioid" ? " selected" : "") + '>Cardioid</option>' +
                        '<option value="figure8"' + (mic.pattern === "figure8" ? " selected" : "") + '>Figure-8</option>' +
                        '<option value="hypercardioid"' + (mic.pattern === "hypercardioid" ? " selected" : "") + '>Hypercardioid</option>' +
                    '</select>' +
                    (canDelete ? '<button class="btn-del-mic" data-del="' + mic.id + '">X</button>' : '') +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label>X [m]</label>' +
                        '<input type="number" class="sim-input mic-pos" data-field="x" value="' + mic.x + '" min="0" max="5" step="0.05">' +
                    '</div>' +
                    '<div class="form-group"><label>Y [m]</label>' +
                        '<input type="number" class="sim-input mic-pos" data-field="y" value="' + mic.y + '" min="0" max="5" step="0.05">' +
                    '</div>' +
                    '<div class="form-group"><label>Z [m]</label>' +
                        '<input type="number" class="sim-input mic-pos" data-field="z" value="' + mic.z + '" min="0" max="5" step="0.05">' +
                    '</div>' +
                '</div>';
            list.appendChild(div);

            // Delete button handler
            const delBtn = div.querySelector(".btn-del-mic");
            if (delBtn) {
                delBtn.addEventListener("click", () => {
                    this._removeMicrophone(mic.id);
                });
            }
        });

        // Update audio mic selector
        this._updateAudioMicSelector();
    }

    _updateAudioMicSelector() {
        if (!this.audioMicSelect) return;
        this.audioMicSelect.innerHTML = "";
        this.microphones.forEach((mic, idx) => {
            const opt = document.createElement("option");
            opt.value = idx;
            opt.textContent = mic.label;
            this.audioMicSelect.appendChild(opt);
        });
    }

    // ----------------------------------------------------------------
    // Algorithm Info
    // ----------------------------------------------------------------

    _updateAlgoInfo() {
        const info = document.getElementById("algoInfo");
        if (!info) return;
        const algoInfo = {
            "standard-fdtd": "O(2,2) | 7-pt stencil | CFL: Sc <= 1/sqrt(3)",
            "compact-fdtd": "O(2,2)+ | 27-pt stencil | CFL: Sc = 1",
            "iwb-fdtd": "O(2,2)++ | 13-pt | CFL: Sc = 1",
            "dwm-rect": "W-type | 6-port junctions | CFL: Sc = 1/sqrt(3)",
            "high-order-fdtd": "O(4,2) | 13-pt | CFL: Sc <= 0.49"
        };
        info.textContent = algoInfo[this.algorithmId] || "";
    }

    // ----------------------------------------------------------------
    // Solver Creation
    // ----------------------------------------------------------------

    _getDims() {
        return [
            parseFloat(this.inpDimX.value),
            parseFloat(this.inpDimY.value),
            parseFloat(this.inpDimZ.value)
        ];
    }

    _initDefault() {
        this._createSolver();
        this.visualizer = new Visualizer(this.fieldCanvas, this.timeCanvas, this.fftCanvas);

        const viewer3DContainer = document.getElementById("viewer3D");
        if (viewer3DContainer && typeof Visualizer3D !== "undefined") {
            this.visualizer3D = new Visualizer3D(viewer3DContainer);
            this._update3DView();
        }

        this._updateInfo();
        this._updateAlgoInfo();
        this._renderMicList();
        this._renderFrame();
    }

    _createSolver() {
        const mediumPresets = {
            air: { c0: 343, rho: 1.225 },
            water: { c0: 1493, rho: 997 },
            saltwater: { c0: 1533, rho: 1027 }
        };

        const med = mediumPresets[this.inpMedium.value] || mediumPresets.air;
        const dims = this._getDims();

        // For 1D/2D, collapse unused dimensions
        if (this.simDimension < 2) {
            dims[1] = parseFloat(this.inpDres.value);
        }
        if (this.simDimension < 3) {
            dims[2] = parseFloat(this.inpDres.value);
        }

        const config = {
            dims: dims,
            dres: parseFloat(this.inpDres.value),
            c0: med.c0,
            rho: med.rho,
            sc: 0.5,
            boundary: this.inpBoundary.value,
            wallReflection: parseFloat(this.inpWallRef.value)
        };

        // Get mic data from UI before creating solver
        this._getMicDataFromUI();

        // Select solver class based on algorithm
        const algoId = this.algorithmId;
        if (algoId === "standard-fdtd" || typeof BenchmarkRunner === "undefined") {
            this.solver = new FDTDSolver(config);
        } else {
            const algoMap = {
                "compact-fdtd": CompactFDTD,
                "iwb-fdtd": InterpolatedWidebandFDTD,
                "dwm-rect": RectilinearDWM,
                "high-order-fdtd": HighOrderFDTD
            };
            const SolverClass = algoMap[algoId];
            if (SolverClass) {
                this.solver = new SolverClass(config);
            } else {
                this.solver = new FDTDSolver(config);
            }
        }

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

        // Add all microphones
        this.microphones.forEach(mic => {
            this.solver.addReceiver({
                position: [mic.x, mic.y, mic.z],
                label: mic.label
            });
        });

        this.totalSimTime = parseFloat(this.inpSimTime.value);
        this.maxSteps = Math.floor(this.totalSimTime / this.solver.dt);

        this._updateSliceMax();
        this._updateTripleSliceMax();
    }

    _updateSliceMax() {
        if (!this.solver) return;
        let maxSlice;
        const s = this.solver;
        if (this.viewPlane === "xy") maxSlice = s.nz - 1;
        else if (this.viewPlane === "xz") maxSlice = s.ny - 1;
        else maxSlice = s.nx - 1;

        this.inpViewSlice.max = maxSlice;
        this.viewSlice = Math.max(0, Math.floor(maxSlice / 2));
        this.inpViewSlice.value = this.viewSlice;
        document.getElementById("sliceVal").textContent = this.viewSlice;
    }

    _updateTripleSliceMax() {
        if (!this.solver) return;
        const s = this.solver;
        const setMax = (id, max) => {
            const el = document.getElementById(id);
            if (el) {
                el.max = max;
                el.value = Math.floor(max / 2);
                const valEl = document.getElementById(id + "Val");
                if (valEl) valEl.textContent = el.value;
            }
        };
        setMax("sliceX", s.nx - 1);
        setMax("sliceY", s.ny - 1);
        setMax("sliceZ", s.nz - 1);
    }

    _updateInfo() {
        if (!this.solver) return;
        const info = this.solver.getInfo();
        const algoNames = {
            "standard-fdtd": "Standard FDTD",
            "compact-fdtd": "Compact KW",
            "iwb-fdtd": "IWB",
            "dwm-rect": "DWM",
            "high-order-fdtd": "High-Order O(4,2)"
        };
        const dimLabel = this.simDimension + "D";
        this.infoPanel.innerHTML =
            '<strong>Algorithm:</strong> ' + (algoNames[this.algorithmId] || this.algorithmId) +
            ' <strong>(' + dimLabel + ')</strong><br>' +
            '<strong>Grid:</strong> ' + info.grid + ' (' + info.totalNodes.toLocaleString() + ' nodes)<br>' +
            '<strong>dt:</strong> ' + (info.dt * 1e6).toFixed(1) + ' us | ' +
            '<strong>dx:</strong> ' + (info.dres * 100).toFixed(1) + ' cm<br>' +
            '<strong>c0:</strong> ' + info.c0 + ' m/s | <strong>rho:</strong> ' + info.rho + ' kg/m3<br>' +
            '<strong>f_max:</strong> ' + Math.floor(info.maxFreq) + ' Hz | ' +
            '<strong>BC:</strong> ' + info.boundary + ' | ' +
            '<strong>Steps:</strong> ' + this.maxSteps.toLocaleString() + ' | ' +
            '<strong>Mics:</strong> ' + this.microphones.length;
    }

    // ----------------------------------------------------------------
    // Simulation Lifecycle
    // ----------------------------------------------------------------

    start() {
        if (this.running) return;

        if (this.solver.step === 0) {
            this._createSolver();
            if (this.visualizer) {
                this.visualizer = new Visualizer(this.fieldCanvas, this.timeCanvas, this.fftCanvas);
            }
            this._update3DView();
            this._updateInfo();
        }

        this.running = true;
        this.btnStart.disabled = true;
        this.btnPause.disabled = false;
        this._disableInputs(true);
        this._loop();
    }

    pause() {
        this.running = false;
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }

    reset() {
        this.pause();
        this._createSolver();
        this._update3DView();
        if (this.visualizer3D) {
            this.visualizer3D._clearAllModes();
            this.visualizer3D.clearPressureField();
        }
        this._updateInfo();
        this._renderFrame();
        this.stepDisplay.textContent = "Step: 0 / " + this.maxSteps;
        this.progressBar.style.width = "0%";
        this._disableInputs(false);
        this.btnStart.disabled = false;
        this.btnPlayAudio.disabled = true;
        this.btnExportWav.disabled = true;

        // Hide acoustic params panel
        const paramsPanel = document.getElementById("acousticParamsPanel");
        if (paramsPanel) paramsPanel.style.display = "none";
    }

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

        const progress = (this.solver.step / this.maxSteps) * 100;
        this.progressBar.style.width = progress + "%";
        this.stepDisplay.textContent =
            "Step: " + this.solver.step.toLocaleString() + " / " + this.maxSteps.toLocaleString();

        this.animFrameId = requestAnimationFrame(() => this._loop());
    }

    // ----------------------------------------------------------------
    // Rendering
    // ----------------------------------------------------------------

    _renderFrame() {
        if (!this.solver || !this.visualizer) return;

        const slice = this.solver.getSlice(this.viewPlane, this.viewSlice);

        // Build markers
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

        // 3D visualization based on mode
        if (this.visualizer3D && this.solver.step > 0) {
            const dims = this._getDims();
            const gridSize = [this.solver.nx, this.solver.ny, this.solver.nz];

            switch (this.vizMode) {
                case "single-slice":
                    this.visualizer3D.updatePressureField(
                        slice, this.viewPlane, this.viewSlice, dims, gridSize);
                    break;
                case "triple-slice": {
                    const sx = parseInt(document.getElementById("sliceX")?.value || 0);
                    const sy = parseInt(document.getElementById("sliceY")?.value || 0);
                    const sz = parseInt(document.getElementById("sliceZ")?.value || 0);
                    this.visualizer3D.updateTripleSlice(
                        this.solver, sx, sy, sz, dims, gridSize);
                    break;
                }
                case "volumetric": {
                    const density = parseInt(document.getElementById("ptDensity")?.value || 3);
                    this.visualizer3D.updateVolumetricPoints(
                        this.solver, dims, gridSize, density);
                    break;
                }
                case "isosurface": {
                    const thresh = parseFloat(document.getElementById("isoThresh")?.value || 0.3);
                    this.visualizer3D.updateIsosurface(
                        this.solver, dims, gridSize, thresh);
                    break;
                }
                case "particles": {
                    const count = parseInt(document.getElementById("pCount")?.value || 2000);
                    this.visualizer3D.updateParticles(
                        this.solver, dims, gridSize, count);
                    break;
                }
            }
        }

        // Time and FFT plots (overlay all mics)
        if (this.solver.receivers.length > 0) {
            const micData = this.solver.receivers[0].data;
            this.visualizer.plotTimeSeries(micData, this.solver.dt);
            if (micData.length > 10) {
                this.visualizer.plotFFT(micData, 1.0 / this.solver.dt);
            }

            // Overlay additional mic signals on time series
            if (this.solver.receivers.length > 1 && this.timeCanvas) {
                const ctx = this.timeCanvas.getContext("2d");
                const w = this.timeCanvas.width;
                const h = this.timeCanvas.height;
                const plotW = w - 50;
                const plotH = h - 30;
                const midY = 10 + plotH / 2;

                let globalMax = 0;
                for (const rec of this.solver.receivers) {
                    for (let j = 0; j < rec.data.length; j++) {
                        const a = Math.abs(rec.data[j]);
                        if (a > globalMax) globalMax = a;
                    }
                }
                if (globalMax < 1e-20) globalMax = 1e-20;

                for (let mi = 1; mi < this.solver.receivers.length; mi++) {
                    const data = this.solver.receivers[mi].data;
                    if (data.length < 2) continue;
                    const color = this.micColors[mi % this.micColors.length];
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.2;
                    ctx.globalAlpha = 0.7;
                    ctx.beginPath();
                    for (let j = 0; j < data.length; j++) {
                        const x = 45 + (j / data.length) * plotW;
                        const y = midY - (data[j] / globalMax) * (plotH / 2 - 5);
                        if (j === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }

    _projectToPlane(ix, iy, iz) {
        const s = this.viewSlice;
        const tolerance = 2;
        if (this.viewPlane === "xy") {
            if (Math.abs(iz - s) <= tolerance) return { ix, iy };
        } else if (this.viewPlane === "xz") {
            if (Math.abs(iy - s) <= tolerance) return { ix: ix, iy: iz };
        } else {
            if (Math.abs(ix - s) <= tolerance) return { ix: iy, iy: iz };
        }
        return null;
    }

    // ----------------------------------------------------------------
    // Simulation Complete
    // ----------------------------------------------------------------

    _finish() {
        this.running = false;
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        this.btnPlayAudio.disabled = false;
        this.btnExportWav.disabled = false;
        this.progressBar.style.width = "100%";
        this.stepDisplay.textContent =
            "Complete! " + this.solver.step.toLocaleString() + " steps";

        this._renderFrame();
        this._computeAcousticParams();
    }

    // ----------------------------------------------------------------
    // Acoustic Parameters
    // ----------------------------------------------------------------

    _computeAcousticParams() {
        if (typeof AcousticParameters === "undefined") return;
        if (!this.solver || this.solver.receivers.length === 0) return;

        const panel = document.getElementById("acousticParamsPanel");
        if (panel) panel.style.display = "block";

        const fs = 1.0 / this.solver.dt;
        const tabsEl = document.getElementById("paramsMicTabs");

        if (tabsEl) {
            tabsEl.innerHTML = "";
            this.microphones.forEach((mic, idx) => {
                const btn = document.createElement("button");
                btn.className = "params-mic-tab" + (idx === 0 ? " active" : "");
                btn.textContent = mic.label;
                btn.addEventListener("click", () => {
                    tabsEl.querySelectorAll(".params-mic-tab").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    this._displayParams(idx);
                });
                tabsEl.appendChild(btn);
            });
        }

        this._displayParams(0);
    }

    _displayParams(micIdx) {
        if (!this.solver || micIdx >= this.solver.receivers.length) return;

        const data = this.solver.receivers[micIdx].data;
        const fs = 1.0 / this.solver.dt;
        const ap = new AcousticParameters(data, fs);
        const params = ap.computeAll();

        const fmt = (v, dec) => v === -1 || v === Infinity || v === -Infinity || isNaN(v) ? "--" : v.toFixed(dec);

        document.getElementById("paramRT60").textContent = fmt(params.rt60_T30, 3);
        document.getElementById("paramRT20").textContent = fmt(params.rt60_T20, 3);
        document.getElementById("paramEDT").textContent = fmt(params.edt, 3);
        document.getElementById("paramC80").textContent = fmt(params.c80, 1);
        document.getElementById("paramD50").textContent = fmt(params.d50, 1);
        document.getElementById("paramTs").textContent = fmt(params.ts, 1);
        document.getElementById("paramSPL").textContent = fmt(params.spl, 1);

        // Draw EDC
        this._drawEDC(params.edc, fs);
    }

    _drawEDC(edc, fs) {
        if (!this.edcCanvas || !edc || edc.length < 2) return;
        const ctx = this.edcCanvas.getContext("2d");
        const w = this.edcCanvas.width;
        const h = this.edcCanvas.height;

        ctx.fillStyle = "#0e1420";
        ctx.fillRect(0, 0, w, h);

        const margin = { left: 50, right: 15, top: 10, bottom: 25 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;

        // Axes
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + plotH);
        ctx.lineTo(margin.left + plotW, margin.top + plotH);
        ctx.stroke();

        // Y range: 0 to -60 dB
        const minDB = -60;
        ctx.fillStyle = "#4a5568";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        for (let db = 0; db >= minDB; db -= 10) {
            const y = margin.top + ((-db) / (-minDB)) * plotH;
            ctx.fillText(db + " dB", margin.left - 5, y + 3);
            ctx.strokeStyle = "#162032";
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + plotW, y);
            ctx.stroke();
        }

        // Time axis
        const totalTime = edc.length / fs;
        ctx.textAlign = "center";
        ctx.fillText("0", margin.left, margin.top + plotH + 15);
        ctx.fillText(totalTime.toFixed(3) + " s", margin.left + plotW, margin.top + plotH + 15);

        // Plot EDC
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < edc.length; i++) {
            const x = margin.left + (i / edc.length) * plotW;
            const dbVal = Math.max(edc[i], minDB);
            const y = margin.top + ((-dbVal) / (-minDB)) * plotH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Label
        ctx.fillStyle = "#8898aa";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Energy Decay Curve (EDC)", margin.left + 5, margin.top + 12);
    }

    // ----------------------------------------------------------------
    // Audio
    // ----------------------------------------------------------------

    playAudio() {
        if (!this.solver || this.solver.receivers.length === 0) return;
        const idx = this.audioMicSelect ? parseInt(this.audioMicSelect.value) : 0;
        const rec = this.solver.receivers[idx] || this.solver.receivers[0];
        this.audio.play(rec.data, 1.0 / this.solver.dt, 0.8);
    }

    exportWav() {
        if (!this.solver || this.solver.receivers.length === 0) return;
        const idx = this.audioMicSelect ? parseInt(this.audioMicSelect.value) : 0;
        const rec = this.solver.receivers[idx] || this.solver.receivers[0];
        const label = this.microphones[idx] ? this.microphones[idx].label : "mic";
        this.audio.exportWAV(
            rec.data,
            1.0 / this.solver.dt,
            "fdtd_" + label.replace(/\s+/g, "_") + ".wav"
        );
    }

    // ----------------------------------------------------------------
    // UI State
    // ----------------------------------------------------------------

    _disableInputs(disabled) {
        const inputs = document.querySelectorAll(".sim-input");
        inputs.forEach(inp => { inp.disabled = disabled; });
    }

    _update3DView() {
        if (!this.visualizer3D || !this.solver) return;

        const dims = this._getDims();
        this.visualizer3D.setRoomDimensions(dims);

        const sources = this.solver.sources.map(() => ({
            position: [
                parseFloat(this.inpSrcX.value),
                parseFloat(this.inpSrcY.value),
                parseFloat(this.inpSrcZ.value)
            ]
        }));
        this.visualizer3D.setSources(sources);

        const mics = this.microphones.map(mic => ({
            position: [mic.x, mic.y, mic.z],
            pattern: mic.pattern
        }));
        this.visualizer3D.setMicrophones(mics);
    }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    window.app = new App();
});
