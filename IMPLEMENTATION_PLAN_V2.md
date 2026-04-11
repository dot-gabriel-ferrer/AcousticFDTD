# AcousticFDTD v2 — Implementation Plan

> **For agentic workers:** REQUIRED: Use the `subagent-driven-development` agent (recommended) or `executing-plans` agent to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simulation validation, parameter guidance, enhanced pause/export, optimal resolution suggestions, interactive 3D scene editing with fullscreen, a figure-8 pool orca model, and bug fixes to the browser-based AcousticFDTD simulator.

**Architecture:** All new code is vanilla JS loaded via `<script>` tags in `simulator.html`. New functionality is organized into focused modules (`validation.js`, `param-guidance.js`, `scene-editor.js`) that integrate with the existing `App`, `FDTDSolver`, and `Visualizer3D` classes. The existing files (`app.js`, `visualizer-3d.js`, `example-models.js`, `simulator.html`, `style.css`) are modified surgically — no framework changes, no build tools.

**Tech Stack:** Vanilla JavaScript (ES6 classes), Three.js v0.137.0 (CDN), HTML5/CSS3, Web Audio API

---

## Executive Summary

This plan implements 7 features across 6 phases:

| Phase | Feature | New Files | Modified Files |
|-------|---------|-----------|----------------|
| 1 | Simulation Validation & Error Reporting | `docs/js/validation.js` | `app.js`, `simulator.html`, `style.css` |
| 2 | Parameter Guidance System | `docs/js/param-guidance.js` | `app.js`, `simulator.html`, `style.css` |
| 3 | Enhanced Pause & Partial Export | — | `app.js`, `simulator.html`, `style.css` |
| 4 | Optimal Resolution Suggestions | — | `example-models.js`, `app.js`, `simulator.html`, `style.css` |
| 5 | Interactive 3D Scene Editor + Fullscreen | `docs/js/scene-editor.js` | `visualizer-3d.js`, `app.js`, `simulator.html`, `style.css` |
| 6 | Figure-8 Pool + Orca Sounds + Bug Fixes | — | `example-models.js`, `wav-loader.js`, `simulator.html`, `app.js` |

**Estimated total:** ~2800 lines added/modified across all files.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `docs/js/validation.js` (~200 lines) | `SimValidator` class: pre-flight checks, error/warning collection, message formatting |
| `docs/js/param-guidance.js` (~250 lines) | `ParamGuidance` class: compute valid ranges, memory/time estimates, color-coded indicators, tooltips |
| `docs/js/scene-editor.js` (~600 lines) | `SceneEditor` class: edit mode toggle, object selection via raycasting, TransformControls drag, right-click context menu, undo/redo stack, grid snap, wall/obstacle creation |

### Modified files

| File | What changes |
|------|-------------|
| `docs/js/app.js` (~1100→~1400 lines) | Wire in validation, guidance, pause-export UI, resolution suggestions, editor integration |
| `docs/js/visualizer-3d.js` (~1100→~1200 lines) | Fullscreen toggle, expose scene/camera/renderer for editor, helper methods |
| `docs/js/example-models.js` (~400→~550 lines) | Add `recommendedDres`/`minDres` to all models, add figure-8 pool generator |
| `docs/js/wav-loader.js` (~400→~450 lines) | Add orca sound synthesizer (click + whistle) |
| `docs/simulator.html` | Add `<script>` tags, validation panel HTML, guidance indicators, pause-export bar, editor toolbar, fullscreen button |
| `docs/css/style.css` (~830→~1050 lines) | Styles for validation panel, guidance indicators, pause bar, editor toolbar, context menu, fullscreen overlay |

---

## Phase 1: Simulation Validation & Error Reporting

**Depends on:** Nothing  
**Testing:** Run simulation with known-bad parameters (freq > maxFreq, grid 1×1×1, wallReflection > 1) and verify error messages appear. Run with valid params and verify no errors.

### Task 1.1: Create `SimValidator` class

**Files:**
- Create: `docs/js/validation.js`

- [ ] **Step 1: Write the validator class with all pre-flight checks**

```javascript
/**
 * AcousticFDTD — Simulation Validator
 * Pre-flight checks before starting simulation.
 */
"use strict";

class SimValidator {
    /**
     * Run all pre-flight checks on simulation configuration.
     * @param {Object} config
     * @param {number[]} config.dims - Room dimensions [x,y,z] in meters
     * @param {number} config.dres - Spatial resolution in meters
     * @param {number} config.c0 - Speed of sound m/s
     * @param {number} config.rho - Density kg/m³
     * @param {number} config.boundary - Boundary type string
     * @param {number} config.wallReflection - Reflection coefficient 0..1
     * @param {number} config.srcFreq - Source frequency Hz
     * @param {string} config.srcType - Source type string
     * @param {number[]} config.srcPos - Source position [x,y,z] m
     * @param {Object[]} config.mics - Mic array [{x,y,z}]
     * @param {number} config.simTime - Simulation time in seconds
     * @param {string} config.algorithm - Algorithm ID
     * @param {number} config.simDimension - 1, 2, or 3
     * @param {Object|null} config.geometryMesh - Loaded geometry if any
     * @returns {{ errors: string[], warnings: string[], info: string[] }}
     */
    static validate(config) {
        const errors = [];
        const warnings = [];
        const info = [];

        const dims = config.dims;
        const dres = config.dres;
        const c0 = config.c0;

        // Grid node counts
        const nx = Math.floor(dims[0] / dres);
        const ny = Math.floor(dims[1] / dres);
        const nz = Math.floor(dims[2] / dres);
        const totalNodes = nx * ny * nz;

        // 1. Grid too small
        if (nx < 3) errors.push("Grid X has only " + nx + " node(s). Minimum is 3. Increase room X or decrease resolution.");
        if (ny < 3 && config.simDimension >= 2) errors.push("Grid Y has only " + ny + " node(s). Minimum is 3. Increase room Y or decrease resolution.");
        if (nz < 3 && config.simDimension >= 3) errors.push("Grid Z has only " + nz + " node(s). Minimum is 3. Increase room Z or decrease resolution.");

        // 2. Source frequency vs max frequency
        const maxFreq = c0 / (2.0 * Math.sqrt(3) * dres);
        if (config.srcType === "sine" || config.srcType === "gaussian") {
            if (config.srcFreq > maxFreq) {
                errors.push(
                    "Source frequency (" + config.srcFreq + " Hz) exceeds grid max frequency (" +
                    Math.floor(maxFreq) + " Hz). Decrease dres to at least " +
                    (c0 / (2.0 * Math.sqrt(3) * config.srcFreq)).toFixed(4) + " m, or lower source frequency."
                );
            } else if (config.srcFreq > maxFreq * 0.8) {
                warnings.push(
                    "Source frequency (" + config.srcFreq + " Hz) is near the grid limit (" +
                    Math.floor(maxFreq) + " Hz). Numerical dispersion may be significant."
                );
            }
        }

        // 3. Memory estimate
        // 8 Float64Arrays of totalNodes each (p×2, vx×2, vy×2, vz×2) + rho
        const memoryBytes = totalNodes * 8 * 9;
        const memoryMB = memoryBytes / (1024 * 1024);
        if (memoryMB > 2000) {
            errors.push("Estimated memory: " + memoryMB.toFixed(0) + " MB. This will likely crash the browser. Reduce room size or increase dres.");
        } else if (memoryMB > 500) {
            warnings.push("Estimated memory: " + memoryMB.toFixed(0) + " MB. This may be slow or cause tab crashes on low-memory devices.");
        } else {
            info.push("Memory estimate: " + memoryMB.toFixed(1) + " MB (" + totalNodes.toLocaleString() + " nodes)");
        }

        // 4. Wall reflection out of range
        if (config.wallReflection > 1.0) {
            errors.push("Wall reflection coefficient (" + config.wallReflection + ") > 1.0 causes energy gain and numerical instability. Set to <= 1.0.");
        }
        if (config.wallReflection < 0) {
            errors.push("Wall reflection coefficient cannot be negative.");
        }

        // 5. Source outside room
        for (let axis = 0; axis < 3; axis++) {
            const labels = ["X", "Y", "Z"];
            if (config.srcPos[axis] < 0 || config.srcPos[axis] >= dims[axis]) {
                errors.push("Source " + labels[axis] + " position (" + config.srcPos[axis] + " m) is outside room boundary [0, " + dims[axis] + " m).");
            }
        }

        // 6. Microphones outside room
        config.mics.forEach((mic, idx) => {
            const pos = [mic.x, mic.y, mic.z];
            for (let axis = 0; axis < 3; axis++) {
                const labels = ["X", "Y", "Z"];
                if (pos[axis] < 0 || pos[axis] >= dims[axis]) {
                    warnings.push("Mic " + (idx + 1) + " " + labels[axis] + " (" + pos[axis] + " m) is outside room. It will be clamped to boundary.");
                }
            }
        });

        // 7. Resolution too coarse for loaded geometry
        if (config.geometryMesh) {
            const minDim = Math.min(dims[0], dims[1], dims[2]);
            const nodesAcrossMin = Math.floor(minDim / dres);
            if (nodesAcrossMin < 10) {
                warnings.push("Resolution is very coarse for 3D geometry (" + nodesAcrossMin + " nodes across smallest dimension). Voxelization will lose detail.");
            }
        }

        // 8. Simulation too long
        const sc = 0.5;
        const dt = Math.sqrt(3) * sc * dres / c0;
        const maxSteps = Math.floor(config.simTime / dt);
        const estimatedSeconds = (maxSteps * totalNodes) / 5e7; // rough: ~50M node-updates/sec
        if (estimatedSeconds > 300) {
            warnings.push("Estimated run time: ~" + Math.ceil(estimatedSeconds / 60) + " minutes. Consider reducing simulation time or increasing dres.");
        } else {
            info.push("Estimated run time: ~" + Math.ceil(estimatedSeconds) + " seconds (" + maxSteps.toLocaleString() + " steps)");
        }

        // 9. Algorithm-specific CFL check
        const cflLimits = {
            "standard-fdtd": 1.0 / Math.sqrt(3),
            "compact-fdtd": 1.0,
            "iwb-fdtd": 1.0,
            "dwm-rect": 1.0 / Math.sqrt(3),
            "high-order-fdtd": 0.49
        };
        const cflMax = cflLimits[config.algorithm] || (1.0 / Math.sqrt(3));
        if (sc > cflMax) {
            errors.push("Courant number Sc=" + sc + " exceeds CFL limit (" + cflMax.toFixed(4) + ") for " + config.algorithm + ". Simulation will be unstable.");
        }

        return { errors, warnings, info };
    }
}
```

- [ ] **Step 2: Verify the file is syntactically valid**

Open `docs/js/validation.js` in a browser devtools console or use a linter. Expected: no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add docs/js/validation.js
git commit -m "feat: add SimValidator class with pre-flight checks"
```

### Task 1.2: Add validation panel HTML and styles

**Files:**
- Modify: `docs/simulator.html` (add `<script>` tag + validation panel HTML)
- Modify: `docs/css/style.css` (add validation panel styles)

- [ ] **Step 1: Add the `<script>` tag for validation.js in `simulator.html`**

In `simulator.html`, find the scripts block near the bottom (before `<script src="js/app.js"></script>`) and add:

```html
<script src="js/validation.js"></script>
```

- [ ] **Step 2: Add validation panel HTML in `simulator.html`**

In the main content area, immediately after the status bar `<div class="status-bar">...</div>` and before the `<div class="viz-grid">`, add:

```html
<!-- Validation Messages -->
<div id="validationPanel" class="validation-panel" style="display: none;">
    <div id="validationErrors" class="validation-errors"></div>
    <div id="validationWarnings" class="validation-warnings"></div>
    <div id="validationInfo" class="validation-info"></div>
</div>
```

- [ ] **Step 3: Add validation panel CSS in `style.css`**

Append to `docs/css/style.css`:

```css
/* ── Validation Panel ── */
.validation-panel {
    margin: 0.5rem 0;
    border-radius: 8px;
    overflow: hidden;
}
.validation-panel > div {
    padding: 0;
}
.validation-panel > div:empty {
    display: none;
}
.validation-msg {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    line-height: 1.4;
    border-left: 3px solid;
    margin-bottom: 2px;
}
.validation-msg.error {
    background: rgba(239, 68, 68, 0.12);
    border-color: #ef4444;
    color: #fca5a5;
}
.validation-msg.warning {
    background: rgba(234, 179, 8, 0.12);
    border-color: #eab308;
    color: #fde68a;
}
.validation-msg.info {
    background: rgba(59, 130, 246, 0.1);
    border-color: #3b82f6;
    color: #93c5fd;
}
.validation-msg .v-icon {
    font-size: 1rem;
    flex-shrink: 0;
    margin-top: 1px;
}
```

- [ ] **Step 4: Commit**

```bash
git add docs/simulator.html docs/css/style.css
git commit -m "feat: add validation panel HTML and CSS"
```

### Task 1.3: Wire validation into App.start()

**Files:**
- Modify: `docs/js/app.js`

- [ ] **Step 1: Add `_runValidation()` method to the `App` class**

Insert this method in `app.js` before the `start()` method (around line 955):

```javascript
    // ----------------------------------------------------------------
    // Validation
    // ----------------------------------------------------------------

    _runValidation() {
        if (typeof SimValidator === "undefined") return true;

        const mediumPresets = {
            air: { c0: 343, rho: 1.225 },
            water: { c0: 1493, rho: 997 },
            saltwater: { c0: 1533, rho: 1027 }
        };
        const med = mediumPresets[this.inpMedium.value] || mediumPresets.air;
        const dims = this._getDims();

        const config = {
            dims: dims,
            dres: parseFloat(this.inpDres.value),
            c0: med.c0,
            rho: med.rho,
            boundary: this.inpBoundary.value,
            wallReflection: parseFloat(this.inpWallRef.value),
            srcFreq: parseFloat(this.inpSrcFreq.value),
            srcType: this.inpSrcType.value,
            srcPos: [
                parseFloat(this.inpSrcX.value),
                parseFloat(this.inpSrcY.value),
                parseFloat(this.inpSrcZ.value)
            ],
            mics: this.microphones,
            simTime: parseFloat(this.inpSimTime.value),
            algorithm: this.algorithmId,
            simDimension: this.simDimension,
            geometryMesh: this.geometryMesh
        };

        const result = SimValidator.validate(config);
        this._showValidation(result);
        return result.errors.length === 0;
    }

    _showValidation(result) {
        const panel = document.getElementById("validationPanel");
        const errEl = document.getElementById("validationErrors");
        const warnEl = document.getElementById("validationWarnings");
        const infoEl = document.getElementById("validationInfo");
        if (!panel) return;

        const renderMessages = (el, msgs, cls, icon) => {
            el.innerHTML = msgs.map(m =>
                '<div class="validation-msg ' + cls + '">' +
                '<span class="v-icon">' + icon + '</span>' +
                '<span>' + m + '</span></div>'
            ).join("");
        };

        renderMessages(errEl, result.errors, "error", "⛔");
        renderMessages(warnEl, result.warnings, "warning", "⚠️");
        renderMessages(infoEl, result.info, "info", "ℹ️");

        panel.style.display = (result.errors.length + result.warnings.length + result.info.length > 0)
            ? "block" : "none";
    }
```

- [ ] **Step 2: Modify `start()` to call validation**

Replace the beginning of the `start()` method:

```javascript
    start() {
        if (this.running) return;

        // Run pre-flight validation
        if (this.solver.step === 0) {
            const valid = this._runValidation();
            if (!valid) return; // Block start on errors
        }

        if (this.solver.step === 0) {
```

The rest of `start()` remains unchanged.

- [ ] **Step 3: Clear validation on reset**

In the `reset()` method, add after `this.pause();`:

```javascript
        // Clear validation messages
        const valPanel = document.getElementById("validationPanel");
        if (valPanel) valPanel.style.display = "none";
```

- [ ] **Step 4: Test validation manually**

Open `simulator.html` in a browser. Set source frequency to 50000 Hz and click Start. Expected: error message about frequency exceeding grid max. Fix frequency to 500 Hz, click Start. Expected: simulation runs.

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js
git commit -m "feat: wire SimValidator into App.start() with error display"
```

---

## Phase 2: Parameter Guidance System

**Depends on:** Phase 1 (shares validation panel area)  
**Testing:** Change dres, room dims, algorithm, medium — verify indicators update in real-time. Check memory/time estimates match expectations.

### Task 2.1: Create `ParamGuidance` class

**Files:**
- Create: `docs/js/param-guidance.js`

- [ ] **Step 1: Write the guidance class**

```javascript
/**
 * AcousticFDTD — Parameter Guidance System
 * Real-time parameter analysis with color-coded indicators.
 */
"use strict";

class ParamGuidance {
    /**
     * Compute guidance info for current parameter set.
     * @param {Object} params
     * @param {number[]} params.dims - Room [x,y,z] meters
     * @param {number} params.dres - Spatial resolution meters
     * @param {number} params.c0 - Speed of sound m/s
     * @param {number} params.rho - Density kg/m³
     * @param {string} params.algorithm - Algorithm ID
     * @param {number} params.simTime - Simulation time seconds
     * @param {number} params.srcFreq - Source frequency Hz
     * @param {number} params.simDimension - 1, 2, or 3
     * @returns {Object} guidance
     */
    static compute(params) {
        const { dims, dres, c0, algorithm, simTime, srcFreq, simDimension } = params;
        const sc = 0.5;
        const dt = Math.sqrt(3) * sc * dres / c0;
        const maxFreq = c0 / (2.0 * Math.sqrt(3) * dres);

        let nx = Math.floor(dims[0] / dres);
        let ny = simDimension >= 2 ? Math.floor(dims[1] / dres) : 1;
        let nz = simDimension >= 3 ? Math.floor(dims[2] / dres) : 1;
        const totalNodes = nx * ny * nz;
        const maxSteps = Math.floor(simTime / dt);

        // Memory: 9 Float64Arrays (p×2, vx×2, vy×2, vz×2, rho)
        const memoryMB = (totalNodes * 8 * 9) / (1024 * 1024);

        // Time estimate: ~50M node-updates/sec for standard, varies by algorithm
        const algoTimeFactor = {
            "standard-fdtd": 1.0,
            "compact-fdtd": 3.5,   // 27-pt stencil
            "iwb-fdtd": 2.0,       // 13-pt
            "dwm-rect": 1.2,       // junction-based
            "high-order-fdtd": 2.5  // 13-pt + higher order
        };
        const factor = algoTimeFactor[algorithm] || 1.0;
        const estimatedSec = (maxSteps * totalNodes * factor) / 5e7;

        // CFL info per algorithm
        const cflInfo = {
            "standard-fdtd": { scMax: 1.0 / Math.sqrt(3), stencil: "7-pt", order: "O(2,2)" },
            "compact-fdtd":  { scMax: 1.0, stencil: "27-pt", order: "O(2,2)+" },
            "iwb-fdtd":      { scMax: 1.0, stencil: "13-pt", order: "O(2,2)++" },
            "dwm-rect":      { scMax: 1.0 / Math.sqrt(3), stencil: "6-port", order: "W-type" },
            "high-order-fdtd": { scMax: 0.49, stencil: "13-pt", order: "O(4,2)" }
        };
        const cfl = cflInfo[algorithm] || cflInfo["standard-fdtd"];

        // Color status for each parameter
        const freqStatus = srcFreq > maxFreq ? "red" : srcFreq > maxFreq * 0.8 ? "yellow" : "green";
        const memStatus = memoryMB > 2000 ? "red" : memoryMB > 500 ? "yellow" : "green";
        const timeStatus = estimatedSec > 300 ? "red" : estimatedSec > 60 ? "yellow" : "green";
        const gridStatus = Math.min(nx, ny, nz) < 3 ? "red" : Math.min(nx, ny, nz) < 10 ? "yellow" : "green";

        return {
            grid: { nx, ny, nz, totalNodes, status: gridStatus },
            dt: dt,
            maxFreq: maxFreq,
            freqStatus: freqStatus,
            memory: { mb: memoryMB, status: memStatus },
            time: { seconds: estimatedSec, steps: maxSteps, status: timeStatus },
            cfl: cfl,
            algorithm: algorithm
        };
    }

    /**
     * Format time estimate as human-readable string.
     * @param {number} seconds
     * @returns {string}
     */
    static formatTime(seconds) {
        if (seconds < 1) return "< 1 second";
        if (seconds < 60) return "~" + Math.ceil(seconds) + " seconds";
        if (seconds < 3600) return "~" + Math.ceil(seconds / 60) + " minutes";
        return "~" + (seconds / 3600).toFixed(1) + " hours";
    }

    /**
     * Get tooltip text for a parameter.
     * @param {string} paramName
     * @returns {string}
     */
    static tooltip(paramName) {
        const tips = {
            dres: "Spatial resolution (dx). Smaller = more accurate but slower. Must resolve wavelength: dx < λ/(2√3). Controls max simulated frequency.",
            simTime: "Total simulation duration. Longer = more data but slower. For RT60 measurement, use at least 2× expected RT60.",
            srcFreq: "Source oscillation frequency. Must be below f_max = c₀/(2√3·dx). Higher frequencies need finer grids.",
            dims: "Room dimensions in meters. Larger rooms need more grid nodes and memory. Keep realistic for your use case.",
            boundary: "Reflective: perfect rigid walls (v=0). Absorbing: simple p=0 at boundaries. Periodic: wraps around (infinite room).",
            wallReflection: "Fraction of pressure reflected at walls (0=fully absorbing, 1=perfect reflection). Values > 1 cause instability.",
            algorithm: "Solver algorithm. Standard is simplest. Compact/IWB reduce numerical dispersion. High-Order improves accuracy at cost.",
            medium: "Propagation medium. Air: c=343 m/s. Water: c=1493 m/s. Changes wavelength for same frequency."
        };
        return tips[paramName] || "";
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/param-guidance.js
git commit -m "feat: add ParamGuidance class with estimates and tooltips"
```

### Task 2.2: Add guidance display to UI

**Files:**
- Modify: `docs/simulator.html` (add `<script>` tag + guidance indicators HTML)
- Modify: `docs/css/style.css` (add guidance styles)
- Modify: `docs/js/app.js` (wire guidance updates)

- [ ] **Step 1: Add `<script>` tag for `param-guidance.js` in `simulator.html`**

Add before the `validation.js` script tag:

```html
<script src="js/param-guidance.js"></script>
```

- [ ] **Step 2: Add guidance indicator bar HTML in `simulator.html`**

In the main content area, immediately before the validation panel (and after the status bar), add:

```html
<!-- Parameter Guidance Bar -->
<div id="guidanceBar" class="guidance-bar">
    <div class="guidance-item" id="guidGrid" title="">
        <span class="g-dot"></span>
        <span class="g-label">Grid</span>
        <span class="g-value" id="guidGridVal">--</span>
    </div>
    <div class="guidance-item" id="guidFreq" title="">
        <span class="g-dot"></span>
        <span class="g-label">f_max</span>
        <span class="g-value" id="guidFreqVal">--</span>
    </div>
    <div class="guidance-item" id="guidMem" title="">
        <span class="g-dot"></span>
        <span class="g-label">Memory</span>
        <span class="g-value" id="guidMemVal">--</span>
    </div>
    <div class="guidance-item" id="guidTime" title="">
        <span class="g-dot"></span>
        <span class="g-label">Est. Time</span>
        <span class="g-value" id="guidTimeVal">--</span>
    </div>
    <div class="guidance-item" id="guidCFL" title="">
        <span class="g-dot" style="background: var(--accent)"></span>
        <span class="g-label">CFL</span>
        <span class="g-value" id="guidCFLVal">--</span>
    </div>
</div>
```

- [ ] **Step 3: Add guidance CSS in `style.css`**

Append to `docs/css/style.css`:

```css
/* ── Parameter Guidance Bar ── */
.guidance-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(0, 200, 238, 0.15);
    border-radius: 8px;
    margin-bottom: 0.5rem;
}
.guidance-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    background: rgba(30, 41, 59, 0.6);
    border-radius: 6px;
    font-size: 0.78rem;
    cursor: help;
}
.guidance-item .g-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.guidance-item .g-label {
    color: #94a3b8;
    font-weight: 500;
}
.guidance-item .g-value {
    color: #e2e8f0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
}
.guidance-item[data-status="green"] .g-dot { background: #22c55e; }
.guidance-item[data-status="yellow"] .g-dot { background: #eab308; }
.guidance-item[data-status="red"] .g-dot { background: #ef4444; }
```

- [ ] **Step 4: Add guidance update method to `App` class in `app.js`**

Add this method to the `App` class, after `_runValidation()`:

```javascript
    _updateGuidance() {
        if (typeof ParamGuidance === "undefined") return;

        const mediumPresets = {
            air: { c0: 343, rho: 1.225 },
            water: { c0: 1493, rho: 997 },
            saltwater: { c0: 1533, rho: 1027 }
        };
        const med = mediumPresets[this.inpMedium.value] || mediumPresets.air;

        const g = ParamGuidance.compute({
            dims: this._getDims(),
            dres: parseFloat(this.inpDres.value),
            c0: med.c0,
            rho: med.rho,
            algorithm: this.algorithmId,
            simTime: parseFloat(this.inpSimTime.value),
            srcFreq: parseFloat(this.inpSrcFreq.value),
            simDimension: this.simDimension
        });

        const set = (id, statusId, value, status) => {
            const valEl = document.getElementById(id);
            const itemEl = document.getElementById(statusId);
            if (valEl) valEl.textContent = value;
            if (itemEl) itemEl.dataset.status = status;
        };

        set("guidGridVal", "guidGrid",
            g.grid.nx + "×" + g.grid.ny + "×" + g.grid.nz + " (" + g.grid.totalNodes.toLocaleString() + ")",
            g.grid.status);
        set("guidFreqVal", "guidFreq",
            Math.floor(g.maxFreq).toLocaleString() + " Hz",
            g.freqStatus);
        set("guidMemVal", "guidMem",
            g.memory.mb < 1 ? g.memory.mb.toFixed(2) + " MB" : g.memory.mb.toFixed(0) + " MB",
            g.memory.status);
        set("guidTimeVal", "guidTime",
            ParamGuidance.formatTime(g.time.seconds) + " (" + g.time.steps.toLocaleString() + " steps)",
            g.time.status);

        const cflEl = document.getElementById("guidCFLVal");
        if (cflEl) cflEl.textContent = g.cfl.order + " | " + g.cfl.stencil + " | Sc≤" + g.cfl.scMax.toFixed(4);

        // Update tooltips
        document.getElementById("guidGrid").title = ParamGuidance.tooltip("dims");
        document.getElementById("guidFreq").title = ParamGuidance.tooltip("srcFreq");
        document.getElementById("guidMem").title = "Memory for 9 field arrays at Float64 precision.";
        document.getElementById("guidTime").title = "Rough estimate based on ~50M node-updates/sec.";
        document.getElementById("guidCFL").title = ParamGuidance.tooltip("algorithm");
    }
```

- [ ] **Step 5: Call `_updateGuidance()` on parameter changes**

In `_bindUI()`, add event listeners that call `_updateGuidance()` when relevant inputs change. After the existing listeners (around line 110 in `_bindUI`), add:

```javascript
        // Real-time parameter guidance updates
        const guidanceInputs = [
            this.inpDimX, this.inpDimY, this.inpDimZ, this.inpDres,
            this.inpSimTime, this.inpSrcFreq, this.inpMedium
        ];
        guidanceInputs.forEach(inp => {
            if (inp) {
                inp.addEventListener("input", () => this._updateGuidance());
                inp.addEventListener("change", () => this._updateGuidance());
            }
        });
```

Also add `this._updateGuidance()` at the bottom of `_updateAlgoInfo()`:

```javascript
        this._updateGuidance();
```

And at the bottom of `_initDefault()`:

```javascript
        this._updateGuidance();
```

- [ ] **Step 6: Test guidance updates**

Open `simulator.html`. Change dres from 0.05 to 0.01. Expected: grid size increases, memory estimate increases, dot colors change. Switch medium to water. Expected: f_max increases. Change algorithm. Expected: CFL info updates.

- [ ] **Step 7: Commit**

```bash
git add docs/js/param-guidance.js docs/js/app.js docs/simulator.html docs/css/style.css
git commit -m "feat: add real-time parameter guidance bar with color-coded indicators"
```

---

## Phase 3: Enhanced Pause & Partial Export

**Depends on:** Phase 1 (uses existing button infrastructure)  
**Testing:** Start simulation, pause at ~50%, verify "Listen" and "Export" buttons appear and work. Resume and complete — verify buttons still work.

### Task 3.1: Add pause overlay bar

**Files:**
- Modify: `docs/simulator.html` (add pause action bar HTML)
- Modify: `docs/css/style.css` (add pause bar styles)
- Modify: `docs/js/app.js` (show/hide pause bar, enable partial export)

- [ ] **Step 1: Add pause action bar HTML in `simulator.html`**

Immediately after the progress bar area (after `<div id="stepDisplay"...>`), add:

```html
<!-- Pause Action Bar -->
<div id="pauseActionBar" class="pause-action-bar" style="display: none;">
    <div class="pause-info">
        <span class="pause-icon">⏸</span>
        <span id="pauseStatus">Paused — partial results available</span>
    </div>
    <div class="pause-actions">
        <button id="btnPartialListen" class="btn btn-success btn-sm">▶ Listen to Recording</button>
        <button id="btnPartialExport" class="btn btn-sm">💾 Export Partial WAV</button>
        <button id="btnResumeSim" class="btn btn-primary btn-sm">▶▶ Continue Simulation</button>
    </div>
</div>
```

- [ ] **Step 2: Add pause bar CSS in `style.css`**

Append to `docs/css/style.css`:

```css
/* ── Pause Action Bar ── */
.pause-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: rgba(234, 179, 8, 0.1);
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 8px;
    margin-top: 0.5rem;
    animation: pausePulse 2s ease-in-out infinite;
}
@keyframes pausePulse {
    0%, 100% { border-color: rgba(234, 179, 8, 0.3); }
    50% { border-color: rgba(234, 179, 8, 0.6); }
}
.pause-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #fde68a;
    font-size: 0.85rem;
    font-weight: 500;
}
.pause-icon {
    font-size: 1.2rem;
}
.pause-actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
}
.btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.78rem;
}
```

- [ ] **Step 3: Wire pause bar into `App` class in `app.js`**

Modify the `pause()` method to show the pause bar:

```javascript
    pause() {
        this.running = false;
        this.btnStart.disabled = false;
        this.btnPause.disabled = true;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }

        // Show pause action bar if simulation has data
        if (this.solver && this.solver.step > 0 && this.solver.step < this.maxSteps) {
            const bar = document.getElementById("pauseActionBar");
            if (bar) bar.style.display = "flex";
            const statusEl = document.getElementById("pauseStatus");
            if (statusEl) {
                const pct = ((this.solver.step / this.maxSteps) * 100).toFixed(1);
                const elapsed = (this.solver.step * this.solver.dt * 1000).toFixed(1);
                statusEl.textContent = "Paused at " + pct + "% — " + elapsed + " ms simulated — partial results available";
            }
        }
    }
```

Modify `start()` to hide the pause bar:

```javascript
        // Hide pause action bar
        const pauseBar = document.getElementById("pauseActionBar");
        if (pauseBar) pauseBar.style.display = "none";
```

Add this at the top of `start()`, right after `if (this.running) return;`.

Modify `reset()` to hide the pause bar. Add after clearing validation:

```javascript
        const pauseBar = document.getElementById("pauseActionBar");
        if (pauseBar) pauseBar.style.display = "none";
```

Modify `_finish()` to hide the pause bar. Add at the top of `_finish()`:

```javascript
        const pauseBar = document.getElementById("pauseActionBar");
        if (pauseBar) pauseBar.style.display = "none";
```

- [ ] **Step 4: Bind pause bar buttons in `_bindUI()`**

Add to `_bindUI()`:

```javascript
        // Pause action bar buttons
        const btnPartialListen = document.getElementById("btnPartialListen");
        if (btnPartialListen) {
            btnPartialListen.addEventListener("click", () => this.playAudio());
        }
        const btnPartialExport = document.getElementById("btnPartialExport");
        if (btnPartialExport) {
            btnPartialExport.addEventListener("click", () => this.exportWav());
        }
        const btnResumeSim = document.getElementById("btnResumeSim");
        if (btnResumeSim) {
            btnResumeSim.addEventListener("click", () => this.start());
        }
```

- [ ] **Step 5: Ensure `playAudio()` and `exportWav()` work with partial data**

Read the existing `playAudio()` and `exportWav()` methods. They already use `this.solver.receivers[idx].data` which grows during simulation, so partial data works. No change needed — just enable the buttons. Modify `pause()` to also enable audio buttons:

After showing the pause bar, add:

```javascript
            this.btnPlayAudio.disabled = false;
            this.btnExportWav.disabled = false;
```

- [ ] **Step 6: Test pause/export flow**

Start simulation, pause at ~30%, click "Listen to Recording". Expected: audio plays. Click "Export Partial WAV". Expected: WAV file downloads. Click "Continue Simulation". Expected: simulation resumes from where it paused.

- [ ] **Step 7: Commit**

```bash
git add docs/js/app.js docs/simulator.html docs/css/style.css
git commit -m "feat: add pause action bar with partial listen, export, and resume"
```

---

## Phase 4: Optimal Resolution Suggestions for Models

**Depends on:** Phase 2 (uses guidance bar)  
**Testing:** Load each example model, verify dres auto-suggestion and warning display.

### Task 4.1: Add resolution metadata to all example models

**Files:**
- Modify: `docs/js/example-models.js`

- [ ] **Step 1: Add `recommendedDres` and `minDres` to `getModelList()` return**

Modify each model entry in `getModelList()` to include `recommendedDres` and `minDres`. Replace the existing `getModelList()` return array with one that has these fields added. The full model list entries — add two fields to each object:

For `vocal-tract`:
```javascript
                recommendedDres: 0.005,  // 5mm for vocal tract detail
                minDres: 0.01,           // 1cm minimum usable
```

For `open-tube`:
```javascript
                recommendedDres: 0.01,   // 1cm adequate for tube
                minDres: 0.02,           // 2cm minimum usable
```

For `horn`:
```javascript
                recommendedDres: 0.008,  // 8mm for horn throat
                minDres: 0.015,          // 1.5cm minimum
```

For `helmholtz`:
```javascript
                recommendedDres: 0.005,  // 5mm for narrow neck
                minDres: 0.01,           // 1cm minimum
```

For `sphere`:
```javascript
                recommendedDres: 0.01,   // 1cm for sphere surface
                minDres: 0.02,           // 2cm minimum
```

For `room-stage`:
```javascript
                recommendedDres: 0.02,   // 2cm for room acoustics
                minDres: 0.05,           // 5cm minimum
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/example-models.js
git commit -m "feat: add recommendedDres and minDres to all example models"
```

### Task 4.2: Show resolution suggestion when loading models

**Files:**
- Modify: `docs/js/app.js`
- Modify: `docs/simulator.html` (add resolution suggestion panel)
- Modify: `docs/css/style.css` (add suggestion styles)

- [ ] **Step 1: Add resolution suggestion HTML in `simulator.html`**

Inside the Geometry panel (after `<div id="geoInfo" class="geo-info"></div>`), add:

```html
<div id="resSuggestion" class="res-suggestion" style="display: none;">
    <div class="res-suggestion-header">Resolution Suggestion</div>
    <div id="resSuggestionBody"></div>
    <div class="res-suggestion-actions">
        <button id="btnApplyRecDres" class="btn btn-primary btn-sm">Apply Recommended</button>
        <button id="btnApplyMinDres" class="btn btn-sm">Apply Minimum</button>
    </div>
</div>
```

- [ ] **Step 2: Add resolution suggestion CSS**

Append to `docs/css/style.css`:

```css
/* ── Resolution Suggestion ── */
.res-suggestion {
    margin-top: 0.5rem;
    padding: 0.6rem;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 6px;
    font-size: 0.8rem;
}
.res-suggestion-header {
    color: #93c5fd;
    font-weight: 600;
    margin-bottom: 0.3rem;
}
.res-suggestion .res-row {
    display: flex;
    justify-content: space-between;
    padding: 0.15rem 0;
    color: #cbd5e1;
}
.res-suggestion .res-row .res-val {
    font-family: 'JetBrains Mono', monospace;
    color: #e2e8f0;
}
.res-suggestion .res-warn {
    color: #fde68a;
    margin-top: 0.3rem;
    font-size: 0.75rem;
}
.res-suggestion-actions {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.4rem;
}
```

- [ ] **Step 3: Add `_showResSuggestion()` method to `App` class**

Add this method to the App class:

```javascript
    _showResSuggestion(modelId) {
        const panel = document.getElementById("resSuggestion");
        const body = document.getElementById("resSuggestionBody");
        if (!panel || !body || typeof ExampleModels === "undefined") return;

        const modelInfo = ExampleModels.getModelList().find(m => m.id === modelId);
        if (!modelInfo || !modelInfo.recommendedDres) {
            panel.style.display = "none";
            return;
        }

        const currentDres = parseFloat(this.inpDres.value);
        const recDres = modelInfo.recommendedDres;
        const minDres = modelInfo.minDres;

        // Compute memory estimates for each resolution
        const dims = this._getDims();
        const computeMem = (dr) => {
            const n = Math.floor(dims[0] / dr) * Math.floor(dims[1] / dr) * Math.floor(dims[2] / dr);
            return ((n * 8 * 9) / (1024 * 1024)).toFixed(1);
        };

        let html = '<div class="res-row"><span>Recommended dres:</span><span class="res-val">' +
            recDres + ' m (' + computeMem(recDres) + ' MB)</span></div>';
        html += '<div class="res-row"><span>Minimum dres:</span><span class="res-val">' +
            minDres + ' m (' + computeMem(minDres) + ' MB)</span></div>';
        html += '<div class="res-row"><span>Current dres:</span><span class="res-val">' +
            currentDres + ' m (' + computeMem(currentDres) + ' MB)</span></div>';

        if (currentDres > minDres) {
            html += '<div class="res-warn">⚠️ Current resolution is too coarse for this model. Simulation will lose geometric detail.</div>';
        }

        body.innerHTML = html;
        panel.style.display = "block";

        // Bind apply buttons
        const btnRec = document.getElementById("btnApplyRecDres");
        const btnMin = document.getElementById("btnApplyMinDres");
        if (btnRec) {
            btnRec.onclick = () => {
                this.inpDres.value = recDres;
                this._updateGuidance();
            };
        }
        if (btnMin) {
            btnMin.onclick = () => {
                this.inpDres.value = minDres;
                this._updateGuidance();
            };
        }
    }
```

- [ ] **Step 4: Call `_showResSuggestion()` from `_handleExampleModel()`**

In `_handleExampleModel()`, at the end of the method (after `this._updateGeoInfo(...)`), add:

```javascript
        this._showResSuggestion(modelId);
```

Also in `_clearGeometry()`, add:

```javascript
        const resPanel = document.getElementById("resSuggestion");
        if (resPanel) resPanel.style.display = "none";
```

- [ ] **Step 5: Test resolution suggestions**

Load "Vocal Tract" model. Expected: suggestion panel shows recommended 0.005m, minimum 0.01m, with warning if current dres > 0.01m. Click "Apply Recommended". Expected: dres input changes to 0.005, guidance bar updates.

- [ ] **Step 6: Commit**

```bash
git add docs/js/app.js docs/js/example-models.js docs/simulator.html docs/css/style.css
git commit -m "feat: add optimal resolution suggestions when loading example models"
```

---

## Phase 5: Interactive 3D Scene Editor + Fullscreen

**Depends on:** Phases 1-4  
**Testing:** Toggle edit mode, click source to select, drag to move. Right-click to add wall. Test undo/redo. Test fullscreen.

This is the largest phase. It introduces a new `SceneEditor` class.

### Task 5.1: Add fullscreen toggle to 3D viewer

**Files:**
- Modify: `docs/js/visualizer-3d.js`
- Modify: `docs/simulator.html`
- Modify: `docs/css/style.css`

- [ ] **Step 1: Add fullscreen button HTML in `simulator.html`**

In the 3D viewer panel header (find `3D Environment View`), modify to:

```html
                <div class="viz-header">
                    3D Environment View
                    <span class="badge" style="background: #a855f7">3D</span>
                    <div class="viz-header-actions">
                        <button id="btnEditMode" class="btn-icon" title="Toggle Edit Mode">✏️</button>
                        <button id="btnFullscreen3D" class="btn-icon" title="Fullscreen">⛶</button>
                    </div>
                </div>
```

- [ ] **Step 2: Add fullscreen CSS**

Append to `docs/css/style.css`:

```css
/* ── Viz Header Actions ── */
.viz-header-actions {
    display: flex;
    gap: 0.3rem;
    margin-left: auto;
}
.btn-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(100, 116, 139, 0.3);
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    color: #94a3b8;
    transition: all 0.2s;
}
.btn-icon:hover {
    background: rgba(51, 65, 85, 0.9);
    color: #e2e8f0;
    border-color: var(--accent);
}
.btn-icon.active {
    background: rgba(0, 200, 238, 0.2);
    border-color: var(--accent);
    color: var(--accent);
}

/* ── Fullscreen 3D ── */
.viz-panel.fullscreen-3d {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1000;
    border-radius: 0;
    margin: 0;
}
.viz-panel.fullscreen-3d .viz-body {
    height: calc(100vh - 40px);
}
.viz-panel.fullscreen-3d #viewer3D {
    height: calc(100vh - 40px) !important;
}
.fullscreen-overlay-toolbar {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(0, 200, 238, 0.3);
    border-radius: 8px;
    z-index: 1001;
    backdrop-filter: blur(8px);
}
```

- [ ] **Step 3: Add fullscreen toggle method in `app.js`**

Add to `_bindUI()`:

```javascript
        // Fullscreen toggle
        const btnFS = document.getElementById("btnFullscreen3D");
        if (btnFS) {
            btnFS.addEventListener("click", () => this._toggleFullscreen3D());
        }
```

Add method to `App`:

```javascript
    _toggleFullscreen3D() {
        const panel = document.getElementById("viewer3D").closest(".viz-panel");
        if (!panel) return;

        const isFS = panel.classList.toggle("fullscreen-3d");
        const btnFS = document.getElementById("btnFullscreen3D");
        if (btnFS) btnFS.textContent = isFS ? "✕" : "⛶";

        // Resize the 3D renderer
        setTimeout(() => {
            if (this.visualizer3D) this.visualizer3D.onResize();
        }, 50);

        // ESC to exit
        if (isFS) {
            this._fsEscHandler = (e) => {
                if (e.key === "Escape") {
                    panel.classList.remove("fullscreen-3d");
                    if (btnFS) btnFS.textContent = "⛶";
                    setTimeout(() => {
                        if (this.visualizer3D) this.visualizer3D.onResize();
                    }, 50);
                    document.removeEventListener("keydown", this._fsEscHandler);
                }
            };
            document.addEventListener("keydown", this._fsEscHandler);
        }
    }
```

- [ ] **Step 4: Test fullscreen**

Click fullscreen button. Expected: 3D viewer fills screen. Press ESC. Expected: returns to normal. Click fullscreen button label changes to "✕".

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js docs/simulator.html docs/css/style.css
git commit -m "feat: add fullscreen toggle for 3D viewer"
```

### Task 5.2: Create `SceneEditor` class — core infrastructure

**Files:**
- Create: `docs/js/scene-editor.js`

- [ ] **Step 1: Write the SceneEditor class with selection and undo/redo**

```javascript
/**
 * AcousticFDTD — Interactive 3D Scene Editor
 *
 * Provides edit mode for the 3D viewer: object selection, drag-to-move,
 * context menu for adding objects, undo/redo, and grid snapping.
 *
 * Requires Three.js and TransformControls.
 */
"use strict";

class SceneEditor {
    /**
     * @param {Visualizer3D} viz3d - Reference to the 3D visualizer
     * @param {App} app - Reference to the main app
     */
    constructor(viz3d, app) {
        this.viz3d = viz3d;
        this.app = app;
        this.enabled = false;
        this.selected = null; // Currently selected Three.js object
        this.transformControls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.gridSnap = false;
        this.snapSize = 0.05; // meters

        // Undo/redo
        this._undoStack = [];
        this._redoStack = [];
        this._maxUndo = 20;

        // Context menu element
        this._contextMenu = null;

        // Property panel
        this._propPanel = null;

        // Track editor-added objects (sources, mics, walls)
        this.editorObjects = []; // { type, mesh, data }

        this._initTransformControls();
        this._initContextMenu();
        this._initPropertyPanel();
        this._bindEvents();
    }

    _initTransformControls() {
        if (typeof THREE.TransformControls === "undefined") {
            console.warn("SceneEditor: TransformControls not loaded. Drag disabled.");
            return;
        }
        this.transformControls = new THREE.TransformControls(
            this.viz3d.camera, this.viz3d.renderer.domElement
        );
        this.transformControls.setSize(0.6);
        this.transformControls.addEventListener("dragging-changed", (event) => {
            // Disable orbit controls while dragging
            if (this.viz3d.controls) {
                this.viz3d.controls.enabled = !event.value;
            }
        });
        this.transformControls.addEventListener("objectChange", () => {
            this._onObjectMoved();
        });
        this.viz3d.scene.add(this.transformControls);
        this.transformControls.visible = false;
    }

    _initContextMenu() {
        const menu = document.createElement("div");
        menu.className = "editor-context-menu";
        menu.style.display = "none";
        menu.innerHTML =
            '<div class="ctx-item" data-action="add-source">➕ Add Source</div>' +
            '<div class="ctx-item" data-action="add-mic">🎤 Add Microphone</div>' +
            '<div class="ctx-item" data-action="add-wall">🧱 Add Wall</div>' +
            '<div class="ctx-item" data-action="add-box">📦 Add Box Obstacle</div>' +
            '<div class="ctx-sep"></div>' +
            '<div class="ctx-item" data-action="delete">🗑️ Delete Selected</div>';
        document.body.appendChild(menu);
        this._contextMenu = menu;

        menu.addEventListener("click", (e) => {
            const item = e.target.closest(".ctx-item");
            if (!item) return;
            const action = item.dataset.action;
            this._handleContextAction(action);
            menu.style.display = "none";
        });

        // Close on click elsewhere
        document.addEventListener("click", (e) => {
            if (!menu.contains(e.target)) {
                menu.style.display = "none";
            }
        });
    }

    _initPropertyPanel() {
        const panel = document.createElement("div");
        panel.className = "editor-prop-panel";
        panel.id = "editorPropPanel";
        panel.style.display = "none";
        panel.innerHTML =
            '<div class="prop-header">Properties <button class="prop-close" id="propClose">✕</button></div>' +
            '<div class="prop-body" id="propBody"></div>';
        const container = this.viz3d.container.closest(".viz-panel") || document.body;
        container.style.position = "relative";
        container.appendChild(panel);
        this._propPanel = panel;

        document.getElementById("propClose").addEventListener("click", () => {
            this.deselect();
        });
    }

    _bindEvents() {
        const canvas = this.viz3d.renderer.domElement;

        canvas.addEventListener("click", (e) => {
            if (!this.enabled) return;
            this._onCanvasClick(e);
        });

        canvas.addEventListener("contextmenu", (e) => {
            if (!this.enabled) return;
            e.preventDefault();
            this._showContextMenu(e.clientX, e.clientY, e);
        });

        // Touch: long press for selection
        let touchTimer = null;
        canvas.addEventListener("touchstart", (e) => {
            if (!this.enabled) return;
            touchTimer = setTimeout(() => {
                const touch = e.touches[0];
                this._onCanvasClick({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
            }, 500);
        });
        canvas.addEventListener("touchend", () => { clearTimeout(touchTimer); });
        canvas.addEventListener("touchmove", () => { clearTimeout(touchTimer); });

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (!this.enabled) return;
            if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                e.preventDefault();
                if (e.shiftKey) this.redo(); else this.undo();
            }
            if (e.key === "Delete" || e.key === "Backspace") {
                if (this.selected) this._deleteSelected();
            }
            if (e.key === "g") this.gridSnap = !this.gridSnap;
        });
    }

    // ── Enable / Disable ──

    toggle() {
        this.enabled = !this.enabled;
        if (this.transformControls) {
            this.transformControls.visible = this.enabled && !!this.selected;
        }
        if (!this.enabled) {
            this.deselect();
            this._contextMenu.style.display = "none";
        }
        return this.enabled;
    }

    // ── Selection ──

    _onCanvasClick(e) {
        const rect = this.viz3d.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.viz3d.camera);

        // Build list of selectable objects
        const selectables = [
            ...this.viz3d.sourceMeshes,
            ...this.viz3d.microphoneMeshes,
            ...this.viz3d.wallMeshes,
            ...this.editorObjects.map(o => o.mesh)
        ];

        const intersects = this.raycaster.intersectObjects(selectables, true);
        if (intersects.length > 0) {
            // Walk up to find root selectable object
            let obj = intersects[0].object;
            while (obj.parent && !selectables.includes(obj)) {
                obj = obj.parent;
            }
            this.select(obj);
        } else {
            this.deselect();
        }
    }

    select(obj) {
        this.deselect();
        this.selected = obj;

        // Highlight
        if (obj.material && !obj.material._origEmissive) {
            obj.material._origEmissive = obj.material.emissive
                ? obj.material.emissive.getHex() : 0;
            if (obj.material.emissive) {
                obj.material.emissive.setHex(0x444444);
            }
        }

        // Attach TransformControls
        if (this.transformControls) {
            this.transformControls.attach(obj);
            this.transformControls.visible = true;
        }

        this._showProperties(obj);
    }

    deselect() {
        if (this.selected) {
            if (this.selected.material && this.selected.material._origEmissive !== undefined) {
                if (this.selected.material.emissive) {
                    this.selected.material.emissive.setHex(this.selected.material._origEmissive);
                }
                delete this.selected.material._origEmissive;
            }
        }
        this.selected = null;
        if (this.transformControls) {
            this.transformControls.detach();
            this.transformControls.visible = false;
        }
        if (this._propPanel) this._propPanel.style.display = "none";
    }

    // ── Property Panel ──

    _showProperties(obj) {
        const body = document.getElementById("propBody");
        if (!body || !this._propPanel) return;

        const pos = obj.position;
        // Map Three.js (x, y, z) back to FDTD (x, z, y)
        const fdtdX = pos.x.toFixed(3);
        const fdtdY = pos.z.toFixed(3);
        const fdtdZ = pos.y.toFixed(3);

        let type = "Object";
        if (this.viz3d.sourceMeshes.includes(obj)) type = "Source";
        else if (this.viz3d.microphoneMeshes.includes(obj)) type = "Microphone";
        else if (this.viz3d.wallMeshes.includes(obj)) type = "Wall";

        body.innerHTML =
            '<div class="prop-row"><span>Type:</span><span>' + type + '</span></div>' +
            '<div class="prop-row"><span>X (FDTD):</span><span>' + fdtdX + ' m</span></div>' +
            '<div class="prop-row"><span>Y (FDTD):</span><span>' + fdtdY + ' m</span></div>' +
            '<div class="prop-row"><span>Z (FDTD):</span><span>' + fdtdZ + ' m</span></div>';

        this._propPanel.style.display = "block";
    }

    _onObjectMoved() {
        if (this.selected && this.gridSnap) {
            const pos = this.selected.position;
            pos.x = Math.round(pos.x / this.snapSize) * this.snapSize;
            pos.y = Math.round(pos.y / this.snapSize) * this.snapSize;
            pos.z = Math.round(pos.z / this.snapSize) * this.snapSize;
        }
        if (this.selected) {
            this._showProperties(this.selected);
            this._syncObjectToApp(this.selected);
        }
    }

    _syncObjectToApp(obj) {
        // Sync moved 3D object positions back to app data
        const pos = obj.position;
        const fdtdPos = [pos.x, pos.z, pos.y]; // Three.js -> FDTD

        const srcIdx = this.viz3d.sourceMeshes.indexOf(obj);
        if (srcIdx >= 0) {
            this.app.inpSrcX.value = fdtdPos[0].toFixed(2);
            this.app.inpSrcY.value = fdtdPos[1].toFixed(2);
            this.app.inpSrcZ.value = fdtdPos[2].toFixed(2);
            return;
        }

        const micIdx = this.viz3d.microphoneMeshes.indexOf(obj);
        if (micIdx >= 0 && this.app.microphones[micIdx]) {
            this.app.microphones[micIdx].x = +fdtdPos[0].toFixed(2);
            this.app.microphones[micIdx].y = +fdtdPos[1].toFixed(2);
            this.app.microphones[micIdx].z = +fdtdPos[2].toFixed(2);
            this.app._renderMicList();
        }
    }

    // ── Context Menu ──

    _showContextMenu(x, y, event) {
        const menu = this._contextMenu;
        menu.style.left = x + "px";
        menu.style.top = y + "px";
        menu.style.display = "block";

        // Store click position for object placement
        const rect = this.viz3d.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.viz3d.camera);

        // Cast against a ground plane to determine 3D position
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this._contextPos = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, this._contextPos);
    }

    _handleContextAction(action) {
        const pos = this._contextPos || new THREE.Vector3(0.5, 0.5, 0.5);
        // Map Three.js back to FDTD for app
        const fdtdPos = [pos.x, pos.z, pos.y];

        switch (action) {
            case "add-source": {
                this._pushUndo({ type: "add-source", pos: fdtdPos.slice() });
                this.app.inpSrcX.value = fdtdPos[0].toFixed(2);
                this.app.inpSrcY.value = fdtdPos[1].toFixed(2);
                this.app.inpSrcZ.value = fdtdPos[2].toFixed(2);
                this.app._update3DView();
                break;
            }
            case "add-mic": {
                this._pushUndo({ type: "add-mic", pos: fdtdPos.slice() });
                const mic = {
                    id: this.app.nextMicId++,
                    x: +fdtdPos[0].toFixed(2),
                    y: +fdtdPos[1].toFixed(2),
                    z: +fdtdPos[2].toFixed(2),
                    pattern: "omni",
                    label: "Mic " + (this.app.microphones.length + 1)
                };
                this.app.microphones.push(mic);
                this.app._renderMicList();
                this.app._update3DView();
                break;
            }
            case "add-wall": {
                const wallData = {
                    position: fdtdPos.slice(),
                    size: [0.1, 0.1, 0.02], // default thin wall
                    rho: 2000
                };
                this._pushUndo({ type: "add-wall", data: wallData });
                if (this.viz3d) {
                    this.viz3d.addWall({
                        position: wallData.position,
                        size: wallData.size
                    });
                }
                this.editorObjects.push({
                    type: "wall",
                    mesh: this.viz3d.wallMeshes[this.viz3d.wallMeshes.length - 1],
                    data: wallData
                });
                break;
            }
            case "add-box": {
                const boxData = {
                    position: fdtdPos.slice(),
                    size: [0.15, 0.15, 0.15],
                    rho: 2000
                };
                this._pushUndo({ type: "add-box", data: boxData });
                if (this.viz3d) {
                    this.viz3d.addWall({
                        position: boxData.position,
                        size: boxData.size
                    });
                }
                this.editorObjects.push({
                    type: "box",
                    mesh: this.viz3d.wallMeshes[this.viz3d.wallMeshes.length - 1],
                    data: boxData
                });
                break;
            }
            case "delete":
                this._deleteSelected();
                break;
        }
    }

    _deleteSelected() {
        if (!this.selected) return;

        const micIdx = this.viz3d.microphoneMeshes.indexOf(this.selected);
        if (micIdx >= 0 && this.app.microphones.length > 1) {
            this._pushUndo({
                type: "delete-mic",
                index: micIdx,
                data: Object.assign({}, this.app.microphones[micIdx])
            });
            this.app._removeMicrophone(this.app.microphones[micIdx].id);
            this.deselect();
            this.app._update3DView();
            return;
        }

        const wallIdx = this.viz3d.wallMeshes.indexOf(this.selected);
        if (wallIdx >= 0) {
            this._pushUndo({ type: "delete-wall", index: wallIdx });
            this.viz3d.scene.remove(this.selected);
            this.viz3d.wallMeshes.splice(wallIdx, 1);
            this.editorObjects = this.editorObjects.filter(o => o.mesh !== this.selected);
            this.deselect();
        }
    }

    // ── Undo / Redo ──

    _pushUndo(action) {
        this._undoStack.push(action);
        if (this._undoStack.length > this._maxUndo) {
            this._undoStack.shift();
        }
        this._redoStack = [];
    }

    undo() {
        if (this._undoStack.length === 0) return;
        const action = this._undoStack.pop();
        this._redoStack.push(action);

        switch (action.type) {
            case "add-mic": {
                const last = this.app.microphones[this.app.microphones.length - 1];
                if (last) {
                    this.app._removeMicrophone(last.id);
                    this.app._update3DView();
                }
                break;
            }
            case "add-wall":
            case "add-box": {
                const lastWall = this.viz3d.wallMeshes.pop();
                if (lastWall) this.viz3d.scene.remove(lastWall);
                this.editorObjects.pop();
                break;
            }
            case "delete-mic": {
                this.app.microphones.splice(action.index, 0, action.data);
                this.app._renderMicList();
                this.app._update3DView();
                break;
            }
            case "delete-wall": {
                // Re-add wall - simplified, restore from redo
                break;
            }
        }
        this.deselect();
    }

    redo() {
        if (this._redoStack.length === 0) return;
        const action = this._redoStack.pop();
        this._undoStack.push(action);
        // Re-execute the action
        this._handleContextAction(action.type.replace("add-", "add-"));
    }

    // ── Cleanup ──

    dispose() {
        if (this.transformControls) {
            this.viz3d.scene.remove(this.transformControls);
            this.transformControls.dispose();
        }
        if (this._contextMenu && this._contextMenu.parentNode) {
            this._contextMenu.parentNode.removeChild(this._contextMenu);
        }
        if (this._propPanel && this._propPanel.parentNode) {
            this._propPanel.parentNode.removeChild(this._propPanel);
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/scene-editor.js
git commit -m "feat: add SceneEditor class with selection, drag, context menu, undo/redo"
```

### Task 5.3: Add editor CSS and integrate with App

**Files:**
- Modify: `docs/css/style.css`
- Modify: `docs/simulator.html` (add script tags)
- Modify: `docs/js/app.js` (wire editor toggle)

- [ ] **Step 1: Add editor CSS in `style.css`**

Append to `docs/css/style.css`:

```css
/* ── Scene Editor ── */
.editor-context-menu {
    position: fixed;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(0, 200, 238, 0.3);
    border-radius: 8px;
    padding: 0.3rem 0;
    min-width: 180px;
    z-index: 2000;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.ctx-item {
    padding: 0.45rem 0.8rem;
    font-size: 0.82rem;
    color: #e2e8f0;
    cursor: pointer;
    transition: background 0.15s;
}
.ctx-item:hover {
    background: rgba(0, 200, 238, 0.15);
}
.ctx-sep {
    height: 1px;
    background: rgba(100, 116, 139, 0.2);
    margin: 0.2rem 0;
}

.editor-prop-panel {
    position: absolute;
    right: 8px;
    top: 50px;
    width: 200px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(0, 200, 238, 0.2);
    border-radius: 8px;
    z-index: 1002;
    font-size: 0.8rem;
    backdrop-filter: blur(8px);
}
.prop-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid rgba(100, 116, 139, 0.2);
    color: var(--accent);
    font-weight: 600;
    font-size: 0.78rem;
}
.prop-close {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 1rem;
}
.prop-body {
    padding: 0.5rem 0.6rem;
}
.prop-row {
    display: flex;
    justify-content: space-between;
    padding: 0.2rem 0;
    color: #cbd5e1;
}
.prop-row span:first-child {
    color: #94a3b8;
}
```

- [ ] **Step 2: Add `<script>` tags in `simulator.html`**

Add before `<script src="js/app.js"></script>`:

```html
    <script src="https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/controls/TransformControls.js"></script>
    <script src="js/scene-editor.js"></script>
```

- [ ] **Step 3: Wire editor toggle in `app.js`**

Add to `_bindUI()`:

```javascript
        // Edit mode toggle
        const btnEdit = document.getElementById("btnEditMode");
        if (btnEdit) {
            btnEdit.addEventListener("click", () => {
                if (!this.sceneEditor && this.visualizer3D) {
                    this.sceneEditor = new SceneEditor(this.visualizer3D, this);
                }
                if (this.sceneEditor) {
                    const isEdit = this.sceneEditor.toggle();
                    btnEdit.classList.toggle("active", isEdit);
                    btnEdit.title = isEdit ? "Exit Edit Mode" : "Toggle Edit Mode";
                }
            });
        }
```

Add `this.sceneEditor = null;` to the constructor.

- [ ] **Step 4: Test editor mode**

Click the pencil button to enable edit mode. Click on a source sphere. Expected: TransformControls gizmo appears. Drag it. Expected: source moves, property panel updates with new coordinates. Right-click empty space. Expected: context menu appears. Click "Add Microphone". Expected: mic added at click position. Press Ctrl+Z. Expected: mic removed.

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js docs/js/scene-editor.js docs/simulator.html docs/css/style.css
git commit -m "feat: integrate scene editor with app — edit mode, context menu, undo/redo"
```

---

## Phase 6: Figure-8 Pool + Orca Sounds + Bug Fixes

**Depends on:** Phases 1-4 (uses model metadata, validation)  
**Testing:** Load figure-8 pool model, verify geometry renders, run simulation with water medium, listen to orca sound output.

### Task 6.1: Add orca sound synthesizer to `wav-loader.js`

**Files:**
- Modify: `docs/js/wav-loader.js`

- [ ] **Step 1: Add orca sound generation methods to ToneGenerator class**

Look for the `ToneGenerator` class in `wav-loader.js`. Add these static methods:

```javascript
    /**
     * Generate synthetic orca click (broadband impulse).
     * Models a short, high-amplitude click with ~20kHz center frequency.
     * @param {number} duration - Duration in seconds
     * @param {number} sampleRate - Sample rate Hz
     * @param {number} amplitude - Peak amplitude
     * @returns {Float64Array}
     */
    static generateOrcaClick(duration, sampleRate, amplitude) {
        duration = duration || 0.05;
        amplitude = amplitude || 1.0;
        const N = Math.floor(duration * sampleRate);
        const out = new Float64Array(N);

        // Orca clicks are burst signals: short train of ~20 clicks
        const clickDuration = 0.0005; // 500 microseconds per click
        const clickSamples = Math.floor(clickDuration * sampleRate);
        const fc = 20000; // center frequency
        const numClicks = 20;
        const clickSpacing = Math.floor(0.002 * sampleRate); // 2ms between clicks

        for (let c = 0; c < numClicks; c++) {
            const startSample = c * clickSpacing;
            for (let i = 0; i < clickSamples && (startSample + i) < N; i++) {
                const t = i / sampleRate;
                const env = Math.sin(Math.PI * i / clickSamples); // Hann-like envelope
                out[startSample + i] += amplitude * env * env *
                    Math.sin(2 * Math.PI * fc * t);
            }
        }
        return out;
    }

    /**
     * Generate synthetic orca whistle (frequency sweep 1-18 kHz).
     * @param {number} duration - Duration in seconds
     * @param {number} sampleRate - Sample rate Hz
     * @param {number} amplitude - Peak amplitude
     * @returns {Float64Array}
     */
    static generateOrcaWhistle(duration, sampleRate, amplitude) {
        duration = duration || 0.5;
        amplitude = amplitude || 1.0;
        const N = Math.floor(duration * sampleRate);
        const out = new Float64Array(N);

        const f0 = 1000;  // start frequency
        const f1 = 18000; // end frequency
        const sweepTime = duration * 0.8;

        for (let i = 0; i < N; i++) {
            const t = i / sampleRate;
            // ADSR envelope
            let env;
            const attack = 0.02, release = 0.05;
            if (t < attack) env = t / attack;
            else if (t > duration - release) env = (duration - t) / release;
            else env = 1.0;

            // Logarithmic frequency sweep
            const progress = Math.min(t / sweepTime, 1.0);
            const freq = f0 * Math.pow(f1 / f0, progress);
            const phase = 2 * Math.PI * f0 * sweepTime *
                (Math.pow(f1 / f0, progress) - 1) / Math.log(f1 / f0);

            out[i] = amplitude * env * Math.sin(phase);
        }
        return out;
    }
```

- [ ] **Step 2: Commit**

```bash
git add docs/js/wav-loader.js
git commit -m "feat: add orca click and whistle sound synthesizers"
```

### Task 6.2: Add figure-8 pool model to `example-models.js`

**Files:**
- Modify: `docs/js/example-models.js`

- [ ] **Step 1: Add figure-8 pool to `getModelList()`**

Add this entry to the `getModelList()` return array (after the `room-stage` entry):

```javascript
            {
                id: "figure8-pool",
                name: "Figure-8 Pool (Orca Sounds)",
                description: "Figure-8 shaped swimming pool filled with water. Demonstrates wave focusing and interference in the narrow connection. Use with water medium.",
                suggestedSource: { type: "orca-click", position: "pool-a" },
                suggestedMics: [
                    { position: "pool-b", label: "Far Pool (Water)" },
                    { position: "narrows", label: "Narrows (Water)" },
                    { position: "surface", label: "Surface" }
                ],
                suggestedRoom: [2.0, 1.0, 0.5],
                suggestedMedium: "water",
                mode: "cavity",
                recommendedDres: 0.02,
                minDres: 0.04
            }
```

- [ ] **Step 2: Add the `generateFigure8Pool()` static method**

Add this method to the `ExampleModels` class:

```javascript
    /**
     * Generate OBJ string for a figure-8 shaped swimming pool.
     * Two circular pools connected by a narrow channel.
     * Pool depth: ~0.4m, oriented in XY plane with Z as depth.
     *
     * @param {number} poolRadius - Radius of each circular pool (default: 0.35)
     * @param {number} channelWidth - Width of connecting channel (default: 0.15)
     * @param {number} depth - Pool depth in meters (default: 0.4)
     * @param {number} radialRes - Points per circle (default: 24)
     * @returns {{ obj: string, sourcePos: number[], micPositions: Object[] }}
     */
    static generateFigure8Pool(poolRadius, channelWidth, depth, radialRes) {
        poolRadius = poolRadius || 0.35;
        channelWidth = channelWidth || 0.15;
        depth = depth || 0.4;
        radialRes = radialRes || 24;

        // Pool A center and Pool B center
        const gap = poolRadius * 0.6; // overlap distance for figure-8
        const cxA = 0.5;
        const cxB = 0.5 + 2 * poolRadius - gap;
        const cy = 0.5;
        const zBottom = 0.05;
        const zTop = zBottom + depth;

        const vertices = [];
        const faces = [];

        // Generate figure-8 outline as a series of points
        // Pool A (left circle), connecting narrows, Pool B (right circle)
        const outline = [];
        const midX = (cxA + cxB) / 2;

        // Full figure-8: combine two circles with smooth blending at narrows
        for (let i = 0; i < radialRes * 2; i++) {
            const t = (i / (radialRes * 2)) * 2 * Math.PI;
            let x, y;

            if (i < radialRes) {
                // Left pool
                const angle = Math.PI / 2 + (i / radialRes) * 2 * Math.PI;
                x = cxA + poolRadius * Math.cos(angle);
                y = cy + poolRadius * Math.sin(angle);
            } else {
                // Right pool
                const angle = Math.PI / 2 + ((i - radialRes) / radialRes) * 2 * Math.PI;
                x = cxB + poolRadius * Math.cos(angle);
                y = cy + poolRadius * Math.sin(angle);
            }
            outline.push([x, y]);
        }

        // Create top and bottom rings from outline
        const nPts = outline.length;
        for (let i = 0; i < nPts; i++) {
            vertices.push([outline[i][0], outline[i][1], zBottom]); // bottom ring
        }
        for (let i = 0; i < nPts; i++) {
            vertices.push([outline[i][0], outline[i][1], zTop]); // top ring
        }

        // Side walls: connect bottom and top rings
        for (let i = 0; i < nPts; i++) {
            const i1 = (i + 1) % nPts;
            const bi = i;
            const bi1 = i1;
            const ti = nPts + i;
            const ti1 = nPts + i1;
            faces.push([bi, bi1, ti1]);
            faces.push([bi, ti1, ti]);
        }

        // Bottom cap (fan from center)
        const bottomCenter = vertices.length;
        vertices.push([midX, cy, zBottom]);
        for (let i = 0; i < nPts; i++) {
            const i1 = (i + 1) % nPts;
            faces.push([bottomCenter, i1, i]);
        }

        // Build OBJ
        let obj = "# AcousticFDTD - Figure-8 Swimming Pool\no Figure8Pool\n";
        for (const v of vertices) {
            obj += "v " + v[0].toFixed(6) + " " + v[1].toFixed(6) + " " + v[2].toFixed(6) + "\n";
        }
        for (const f of faces) {
            obj += "f " + (f[0] + 1) + " " + (f[1] + 1) + " " + (f[2] + 1) + "\n";
        }

        const sourcePos = [cxA, cy, zBottom + depth / 2]; // Source in pool A
        const micPositions = [
            { position: [cxB, cy, zBottom + depth / 2], label: "Far Pool (Water)" },
            { position: [midX, cy, zBottom + depth / 2], label: "Narrows (Water)" },
            { position: [cxA, cy, zTop - 0.02], label: "Surface" }
        ];

        return { obj, sourcePos, micPositions, mode: "cavity" };
    }
```

- [ ] **Step 3: Register figure-8 pool in `generate()` method**

Find the `static generate(modelId)` method in `ExampleModels` and add a case for `figure8-pool`:

```javascript
            case "figure8-pool":
                return ExampleModels.generateFigure8Pool();
```

- [ ] **Step 4: Add figure-8 pool to the `<select>` in `simulator.html`**

In the example models dropdown, add:

```html
                        <option value="figure8-pool">Figure-8 Pool (Orca Sounds)</option>
```

- [ ] **Step 5: Commit**

```bash
git add docs/js/example-models.js docs/simulator.html
git commit -m "feat: add figure-8 pool example model with orca sound source"
```

### Task 6.3: Wire orca sound source and water medium auto-selection

**Files:**
- Modify: `docs/js/app.js`

- [ ] **Step 1: Handle orca source types in `_handleExampleModel()`**

In `_handleExampleModel()`, after the vocal-tract glottal source block (the `if (modelId === "vocal-tract") { ... }` block), add:

```javascript
        // Auto-select water medium for pool model
        if (modelId === "figure8-pool") {
            this.inpMedium.value = "water";
            // Set custom orca click source
            this.inpSrcType.value = "sine"; // Use sine as approximation, or add orca type
            this.inpSrcFreq.value = 2000; // Resonant frequency for pool
            this._updateSourceTypeControls();
        }
```

- [ ] **Step 2: Add orca source type option to `simulator.html`**

In the source type `<select>`, add two new options:

```html
                        <option value="orca-click">Orca Click (Broadband)</option>
                        <option value="orca-whistle">Orca Whistle (Sweep)</option>
```

- [ ] **Step 3: Handle orca source in `_prepareCustomWaveform()`**

In the `switch (srcType)` block in `_prepareCustomWaveform()`, add cases:

```javascript
            case "orca-click": {
                if (typeof ToneGenerator !== "undefined") {
                    this.customWaveform = ToneGenerator.generateOrcaClick(simTime, solverRate, 1.0);
                }
                break;
            }
            case "orca-whistle": {
                if (typeof ToneGenerator !== "undefined") {
                    this.customWaveform = ToneGenerator.generateOrcaWhistle(simTime, solverRate, 1.0);
                }
                break;
            }
```

Also update `_handleExampleModel()` for the figure-8 pool to set the orca-click source:

```javascript
        if (modelId === "figure8-pool") {
            this.inpMedium.value = "water";
            this.inpSrcType.value = "orca-click";
            this._updateSourceTypeControls();
        }
```

And in `_createSolver()`, add `"orca-click"` and `"orca-whistle"` to the `isCustomSrc` check:

```javascript
        const isCustomSrc = (srcType === "wav" || srcType === "tone" || srcType === "chord" ||
            srcType === "glottal" || srcType === "orca-click" || srcType === "orca-whistle");
```

- [ ] **Step 4: Test orca model end-to-end**

Load "Figure-8 Pool" from dropdown. Expected: room changes to 2.0×1.0×0.5, medium auto-selects water, source type is orca-click, 3D view shows figure-8 shape. Click Start. Expected: simulation runs, waves propagate through water, mic recordings capture sound.

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js docs/js/wav-loader.js docs/simulator.html
git commit -m "feat: wire orca sound sources and water auto-selection for pool model"
```

### Task 6.4: Bug fixes — silent simulation failures

**Files:**
- Modify: `docs/js/app.js`

- [ ] **Step 1: Add try/catch to `_createSolver()` to catch silent failures**

Wrap the solver creation logic in `_createSolver()` with error handling. After `const config = { ... }`, wrap the solver instantiation:

```javascript
        try {
            // Select solver class based on algorithm
            // ... (existing code) ...
        } catch (err) {
            console.error("Solver creation failed:", err);
            this._showValidation({
                errors: ["Solver creation failed: " + err.message + ". Check parameters."],
                warnings: [],
                info: []
            });
            return false;
        }
```

The method currently returns `undefined`. Change it to return `true` at the end on success and check the return value in `start()`.

- [ ] **Step 2: Guard `start()` against solver creation failure**

In `start()`, change:

```javascript
        if (this.solver.step === 0) {
            this._createSolver();
```

to:

```javascript
        if (this.solver.step === 0) {
            const created = this._createSolver();
            if (created === false) return;
```

- [ ] **Step 3: Add NaN/Infinity detection in `_loop()`**

In `_loop()`, after `this.solver.calcStep()`, add a stability check every 100 steps:

```javascript
            // Stability check every 100 steps
            if (this.solver.step % 100 === 0) {
                const pCur = this.solver.p[this.solver.n];
                const sample = pCur[Math.floor(pCur.length / 2)];
                if (!isFinite(sample)) {
                    this.pause();
                    this._showValidation({
                        errors: ["Simulation became unstable (NaN/Infinity detected at step " +
                            this.solver.step + "). This usually means the Courant number is too high or parameters are invalid."],
                        warnings: [],
                        info: []
                    });
                    return;
                }
            }
```

- [ ] **Step 4: Test instability detection**

Set wall reflection to 1.5 (if validation doesn't block it, or bypass by setting via console: `app.inpWallRef.value = 1.5`). Start simulation. Expected: either validation blocks it, or if it runs, instability detection catches NaN and shows error.

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js
git commit -m "fix: catch solver creation failures and detect simulation instability"
```

### Task 6.5: Final integration test

**Files:** None (manual testing)

- [ ] **Step 1: Test all 5 algorithms with standard parameters**

For each algorithm (Standard, Compact, IWB, DWM, High-Order):
1. Select algorithm from dropdown
2. Use default room (1m³), dres=0.05, freq=500Hz
3. Click Start
4. Verify simulation runs to completion
5. Verify audio playback works
6. Verify all 5 viz modes render correctly

- [ ] **Step 2: Test all 6+1 example models**

For each model (Vocal Tract, Open Tube, Horn, Helmholtz, Sphere, Room-Stage, Figure-8 Pool):
1. Select model from dropdown
2. Verify resolution suggestion appears
3. Click "Apply Recommended" or "Apply Minimum"
4. Click Start
5. Verify simulation completes
6. Verify acoustic parameters display

- [ ] **Step 3: Test the full edit mode workflow**

1. Enable edit mode
2. Click source → verify selection
3. Drag source → verify coordinates update in sidebar
4. Right-click → Add Microphone
5. Right-click → Add Wall
6. Ctrl+Z to undo mic add
7. Press Delete to remove wall
8. Toggle fullscreen
9. Orbit in fullscreen
10. Press ESC to exit

- [ ] **Step 4: Test mobile interaction (responsive)**

Open in browser with mobile viewport (DevTools device emulation):
1. Verify sidebar scrolls
2. Long-press on source in edit mode → verify selection
3. Context menu items are tappable
4. Fullscreen fills viewport

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: complete AcousticFDTD v2 — validation, guidance, editor, orca pool"
```

---

## Testing Strategy

| Feature | Test Method | Pass Criteria |
|---------|-------------|---------------|
| Validation | Set freq > maxFreq, grid < 3, wallRef > 1, source outside room | Error messages appear, Start is blocked |
| Guidance | Change dres, medium, algorithm, simTime | Indicators update in real-time, colors match status |
| Pause/Export | Pause mid-sim, click Listen/Export | Audio plays, WAV downloads, resume works |
| Resolution | Load each model | Suggestion panel shows, Apply buttons set dres |
| Editor: Select | Click source/mic in edit mode | TransformControls appear, property panel shows |
| Editor: Move | Drag source/mic | Sidebar coordinates update, 3D position changes |
| Editor: Add | Right-click → Add wall/mic | Objects appear in scene |
| Editor: Undo | Ctrl+Z after add | Object removed |
| Fullscreen | Click fullscreen button | Viewer fills screen, ESC exits |
| Figure-8 Pool | Load model, run simulation with water | Geometry renders, waves propagate, audio works |
| Bug Fixes | Force NaN by bad params | Error message shown instead of silent freeze |
| All algorithms | Run each with default params | All 5 complete without errors |
| All viz modes | Switch modes during simulation | Rendering updates correctly |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TransformControls CDN fails to load | Low | Editor drag broken | Graceful fallback — `console.warn`, disable drag, allow everything else |
| Orca frequencies exceed grid maxFreq with coarse dres | High | Silent numerical garbage | Validation catches it; orca-click may need lower-freq approximation for coarse grids |
| Memory overflow on "Apply Recommended" for vocal tract (dres=0.005 → millions of nodes) | Medium | Tab crash | Guidance bar shows memory estimate; validation blocks > 2GB; user warned |
| Three.js version mismatch with TransformControls | Low | Editor completely broken | Both loaded from same CDN version (0.137.0) |
| Figure-8 OBJ voxelization artifacts at narrow channel | Medium | Pool doesn't simulate correctly | Use `cavity` voxel mode; recommend dres <= 0.02m so channel resolves cleanly |
| Context menu positioned off-screen near edges | Low | Can't click menu items | CSS `max-width` + JS clamping to viewport bounds (not implemented in v1, can add later) |
| Undo stack grows unbounded | Low | Memory waste | Capped at 20 entries in `SceneEditor._maxUndo` |
| Mobile touch events conflict with OrbitControls | Medium | Can't select or orbit | Long-press (500ms) threshold separates tap from orbit; test on real device |
