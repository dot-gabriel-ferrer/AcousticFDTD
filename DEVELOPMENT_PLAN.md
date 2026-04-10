# AcousticFDTD -- Professional Development Plan

**Date:** 2026-04-10
**Author:** Development Audit Report
**Status:** Approved for implementation

---

## Part I: Repository Audit

### 1. Critical Bugs (Must Fix Before New Features)

| ID  | File                | Issue                                             | Severity |
|-----|---------------------|---------------------------------------------------|----------|
| B01 | benchmark.html      | `drawBarChart()` Y-axis grid lines inverted        | CRITICAL |
| B02 | benchmark.html      | `drawBarChart()` divisor applied AFTER max calc     | CRITICAL |
| B03 | benchmark.html      | `drawFFTChart()` frequency axis off by factor of 2  | CRITICAL |
| B04 | benchmark.html      | Bar chart labels cut off at bottom                  | HIGH     |
| B05 | benchmark.html      | Signal chart zero-line always at midpoint           | HIGH     |
| B06 | benchmark.html      | Canvas DPR scaling vs font size mismatch            | MEDIUM   |
| B07 | visualizer.js       | `colorScale` multiplication inverted (line 58)      | CRITICAL |
| B08 | visualizer.js       | Pixel gaps between pressure cells (rounding)        | MEDIUM   |
| B09 | visualizer-3d.js    | Pressure texture leak (new texture every frame)     | MEDIUM   |
| B10 | benchmark.js        | HighOrderFDTD boundary uses index clipping not ghosts | HIGH   |
| B11 | benchmark.js        | DWM periodic boundary indexing risk (out-of-bounds) | MEDIUM   |
| B12 | benchmark.js        | Peak detection misses small modes / false positives | MEDIUM   |

### 2. Documentation vs Implementation Gaps

| Documented Feature                    | Actual Status                                    |
|---------------------------------------|--------------------------------------------------|
| RT60, EDT, C80, D50 computation       | NOT IMPLEMENTED (acoustic_param.py has SPL only) |
| Microphone directivity patterns       | NOT IMPLEMENTED (always omnidirectional)          |
| Multiple microphones                  | NOT IMPLEMENTED (single receiver hardcoded)       |
| 5 simulation algorithms               | Only standard FDTD in simulator (5 in benchmark)  |
| Volumetric 3D visualization           | Only 2D slice rendered inside 3D view             |
| Impedance boundaries                  | NOT IMPLEMENTED (marked "future work")            |
| PML absorbing boundaries              | NOT IMPLEMENTED (absorbing BC is just p=0)        |
| Microphone sensitivity                | Stored but never applied to recordings            |

### 3. What Works Correctly

- Standard FDTD leapfrog solver (both Python and JS) -- correct staggered grid
- 5 benchmark solver algorithms (Standard, Compact KW, IWB, DWM, High-Order) -- real implementations
- 3 boundary conditions (reflective with wall absorption, absorbing, periodic)
- 3 source types (sinusoidal, Gaussian pulse, Dirac impulse) with soft/hard injection
- 2D pressure slice visualization with colormap
- 3D Three.js scene (room wireframe, source/mic markers, interactive orbit)
- Time series plot and FFT spectrum
- Web Audio playback + 16-bit WAV export
- Python package with Room, Medium, Source, Microphone, Sim classes

---

## Part II: Development Phases

### Phase 1 -- Bug Fixes and Benchmark Repair
**Priority: CRITICAL -- Must complete first**
**Estimated scope: ~400 lines changed**

#### 1.1 Fix benchmark.html chart rendering (B01-B06)

- **B01:** Fix Y-axis grid line calculation in `drawBarChart()`:
  Change `plotH - (plotH * t / 4)` to `(plotH * t / 4)` for correct ascending grid.

- **B02:** Fix divisor application order:
  Apply divisor inside `map()` before `Math.max()` so the Y-axis scale is correct.

- **B03:** Fix FFT frequency axis:
  Correct formula from `fs / (halfN * 2)` to `fs / fftSize` for proper Hz labels.

- **B04:** Increase bottom margin for rotated bar labels, or reduce rotation angle.

- **B05:** Compute signal zero-line from data range instead of hardcoded midpoint.

- **B06:** Use CSS pixels for canvas font sizes: multiply by `1/dpr` when setting font.

#### 1.2 Fix visualizer.js (B07-B08)

- **B07:** Fix colorScale: change `maxVal *= this.colorScale` to
  `maxVal /= this.colorScale` (or equivalently divide pressure by colorScale during mapping).

- **B08:** Use `Math.ceil()` for cell dimensions and `Math.floor()`/`Math.ceil()` for
  pixel boundaries to eliminate gaps.

#### 1.3 Fix visualizer-3d.js (B09)

- **B09:** Cache and reuse pressure texture/material. Dispose old texture before creating new one.
  Store reference in `this._pressureTexture` and call `.dispose()` before replacement.

#### 1.4 Fix benchmark.js solver issues (B10-B12)

- **B10:** Add 2-cell ghost zone padding to HighOrderFDTD grid. Start inner loop at `i=2`
  and end at `nx-3` instead of clipping with `Math.min/max`.

- **B11:** Add bounds checking for DWM periodic propagation indices.

- **B12:** Improve peak detection: use prominence-based peak finding with a minimum
  prominence threshold (e.g., 10% of max magnitude).

---

### Phase 2 -- Multi-Microphone Editor
**Priority: HIGH**
**Estimated scope: ~600 lines new/changed**

#### 2.1 Data model changes

- **fdtd-solver.js**: `addReceiver()` already supports multiple receivers.
  No solver changes needed -- only UI is limited to 1 mic.

- **app.js**: Change from single `micX/micY/micZ` to a `microphones[]` array.
  Each mic stores: `{ id, x, y, z, pattern, label }`.

#### 2.2 Microphone panel UI (simulator.html)

Replace the single mic section with a dynamic list:

```
+--------------------------------------------------+
| MICROPHONES                          [+ Add Mic] |
|--------------------------------------------------|
| Mic 1: (0.20, 0.20, 0.50) Omni           [Edit] |
| Mic 2: (0.80, 0.80, 0.50) Cardioid       [Edit] |
| Mic 3: (0.50, 0.20, 0.50) Figure-8       [Edit] |
+--------------------------------------------------+
```

Each mic editor (modal or inline expandable):
- Position: X, Y, Z sliders (clamped to room dims)
- Pattern: dropdown (Omnidirectional, Cardioid, Figure-8, Hypercardioid)
- Orientation: azimuth + elevation angles (for directional mics)
- Color: auto-assigned from palette for plot differentiation
- Delete button (minimum 1 mic)

#### 2.3 Directivity implementation

Add directivity post-processing to `fdtd-solver.js`:

```
Omni:         D(theta) = 1.0
Cardioid:     D(theta) = (1 + cos(theta)) / 2
Figure-8:     D(theta) = |cos(theta)|
Hypercardioid: D(theta) = (1 + 3*cos(theta)) / 4
```

Compute angle from pressure gradient at receiver position.
Apply `D(theta)` as a multiplicative weight on the recorded sample.

#### 2.4 Multi-mic visualization

- **Time series canvas**: Overlay all mic signals with unique colors + legend.
- **FFT canvas**: Overlay all mic spectra with unique colors + legend.
- **3D view**: Render each mic as a distinct colored model with directional cone if non-omni.
- **Audio**: Dropdown to select which mic to play/export.

---

### Phase 3 -- Algorithm Selection in Simulator
**Priority: HIGH**
**Estimated scope: ~300 lines changed**

#### 3.1 Integrate benchmark solvers into simulator

Move the 5 solver classes from `benchmark.js` into a shared module:

```
docs/js/
  solvers/
    base-solver.js        -- BaseSolver class (shared interface)
    standard-fdtd.js      -- StandardFDTD (current fdtd-solver.js)
    compact-fdtd.js       -- CompactFDTD (27-point KW)
    iwb-fdtd.js           -- InterpolatedWidebandFDTD
    dwm-solver.js         -- RectilinearDWM
    high-order-fdtd.js    -- HighOrderFDTD (4th-order spatial)
    solver-registry.js    -- Algorithm registry and factory
```

OR (simpler): keep all solvers in a single `solvers.js` file and import in both
simulator and benchmark pages.

#### 3.2 Algorithm selector UI

Add dropdown to simulator.html above the room parameters:

```
Algorithm: [Standard FDTD (Yee) v]
           | Standard FDTD (Yee)        |
           | Compact FDTD (KW 27-point) |
           | Interpolated Wideband      |
           | Digital Waveguide Mesh     |
           | High-Order O(4,2)          |
```

Show algorithm info box below dropdown: stencil type, CFL limit, memory per node,
recommended use case.

#### 3.3 Dimension selector (1D, 2D, 3D)

Add dimension toggle:

```
Simulation: [1D] [2D] [3D]
```

- **1D mode**: Only X dimension active. Y=Z=1 node.
  Useful for: tube acoustics, waveguide demonstration.
  Visualization: single horizontal pressure waveform plot.

- **2D mode**: X and Y active. Z=1 node.
  Useful for: room cross-section, membrane vibration.
  Visualization: full 2D pressure field (no slice needed).
  3D view: flat plane with pressure colors.

- **3D mode**: Full X, Y, Z (current behavior).

Each solver must handle 1D/2D/3D. The `BaseSolver` already uses `nx*ny*nz` indexing,
so setting `ny=1` or `nz=1` naturally reduces dimensions. Boundary conditions need
adjustment for collapsed dimensions.

---

### Phase 4 -- Advanced 3D Visualization Modes
**Priority: HIGH**
**Estimated scope: ~800 lines new**

#### 4.1 Visualization mode selector

Add mode selector to 3D visualization panel:

```
3D Visualization Mode: [Single Slice     v]
                       | Single Slice       |
                       | Triple Slice       |
                       | Volumetric Points  |
                       | Isosurface         |
                       | Particle Cloud     |
                       | Animated Wavefront |
```

#### 4.2 Mode: Single Slice (current -- fix and polish)

- Already implemented. Fix texture leak (B09).
- Add draggable slice handle in 3D view to interactively change slice position.

#### 4.3 Mode: Triple Slice (Orthogonal Cross-Sections)

Render three simultaneous slices (one per plane: XY, XZ, YZ) at user-defined
positions. Each slice is a semi-transparent textured plane:

```
Three.js scene:
  - XY slice at z = sliceZ  (horizontal plane)
  - XZ slice at y = sliceY  (coronal plane)
  - YZ slice at x = sliceX  (sagittal plane)
```

Controls: three independent slice position sliders.
Opacity: user-adjustable (0.3 -- 0.9).
Useful for: understanding 3D pressure distribution from three orthogonal views.

#### 4.4 Mode: Volumetric Points (3D Particle Grid)

Render pressure at every N-th grid node as a colored sphere/point:

- Sample every 2nd or 3rd node (adjustable density slider) to keep point count manageable.
- Color: blue-white-red colormap (same as 2D slice).
- Size: proportional to |pressure| (or fixed size with color-only encoding).
- Opacity: proportional to |pressure| (near-zero pressure = invisible).
- Use Three.js `Points` with `BufferGeometry` and `PointsMaterial` for performance.

Implementation:
```javascript
// Create point cloud (once)
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(numPoints * 3);
const colors = new Float32Array(numPoints * 3);
const sizes = new Float32Array(numPoints);
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
// ... update colors/sizes each frame from pressure data
```

Performance target: up to 50,000 points at 30 fps.

#### 4.5 Mode: Isosurface

Render surfaces of constant pressure (positive and negative):

- Marching cubes algorithm on the 3D pressure grid.
- Two surfaces: one for `+threshold` (red, semi-transparent) and one for
  `-threshold` (blue, semi-transparent).
- Threshold slider: user selects the pressure level (0.01 -- 1.0 of max).
- Update each frame (or every N frames for performance).
- Use Three.js `MarchingCubes` or a custom implementation.

Useful for: visualizing wave fronts, standing wave node/antinode surfaces.

#### 4.6 Mode: Particle Cloud (Velocity-Driven)

Render particles that move with the acoustic velocity field:

- N particles (500--5000) seeded randomly in the volume.
- Each frame: update particle position by `pos += v * dt * scale`.
- Color particles by local pressure.
- Reset particles that exit the domain.
- Use Three.js `Points` with animated positions.

Useful for: intuitive visualization of how sound "moves" through space.
Similar to flow visualization in CFD (computational fluid dynamics).

#### 4.7 Mode: Animated Wavefront

Render the expanding wavefront as a semi-transparent shell:

- Detect the leading edge of the pressure pulse (threshold crossing).
- Render as an expanding sphere/surface mesh.
- Trail: render previous N wavefront positions with decreasing opacity.

Useful for: visualizing reflection, diffraction, and interference patterns.

---

### Phase 5 -- Acoustic Parameter Computation
**Priority: HIGH**
**Estimated scope: ~500 lines new**

#### 5.1 Implement acoustic parameters in JavaScript

Create `docs/js/acoustic-params.js`:

```javascript
class AcousticParameters {
    // Input: impulse response h(t), sample rate fs
    constructor(impulseResponse, sampleRate) { ... }

    // Schroeder backward integration
    computeEDC() { ... }

    // Reverberation time (T20, T30, T60)
    computeRT60(method = 'T30') { ... }

    // Early Decay Time
    computeEDT() { ... }

    // Clarity C80
    computeC80() { ... }

    // Definition D50
    computeD50() { ... }

    // Centre Time Ts
    computeTs() { ... }

    // Sound Strength G (relative to free field)
    computeG(referencePower) { ... }

    // SPL
    computeSPL() { ... }

    // Octave-band analysis (optional, advanced)
    computeOctaveBand(centerFreq) { ... }
}
```

#### 5.2 Acoustic parameters panel in simulator

After simulation completes (or on demand with a "Compute Parameters" button),
display a results panel:

```
+----------------------------------------------+
| ACOUSTIC PARAMETERS                          |
|----------------------------------------------|
| RT60 (T30):     0.45 s                       |
| EDT:            0.38 s                       |
| C80:            +3.2 dB                      |
| D50:            62.4%                        |
| Centre Time:    52 ms                        |
| Peak SPL:       94.2 dB                      |
|----------------------------------------------|
| EDC Plot:  [=========---------] (canvas)     |
+----------------------------------------------+
```

- Show parameters per microphone (if multiple mics).
- EDC plot: energy decay curve with regression lines for T20, T30.
- Compare against Sabine/Eyring predictions.
- Export parameters as CSV.

#### 5.3 Update Python acoustic_param.py

Add the missing functions to match the JS implementation:

```python
def compute_edc(impulse_response):
    """Schroeder backward integration."""

def compute_rt60(impulse_response, fs, method='T30'):
    """Reverberation time via T20 or T30 method."""

def compute_edt(impulse_response, fs):
    """Early Decay Time from first 10 dB."""

def compute_c80(impulse_response, fs):
    """Clarity index C80."""

def compute_d50(impulse_response, fs):
    """Definition D50."""
```

---

### Phase 6 -- Benchmark Page Improvements
**Priority: MEDIUM**
**Estimated scope: ~400 lines changed**

#### 6.1 Complete chart rewrite

Replace the current manual canvas rendering with a clean chart module:

- Fix all 6 chart bugs identified in audit (B01-B06).
- Proper axis scaling with tick marks.
- Responsive canvas sizing.
- Legend that doesn't overlap with chart area.
- Consistent color palette across all charts.
- Add chart titles.

#### 6.2 Add algorithm cards to benchmark

Link each benchmark algorithm card to its simulator configuration:

```
[Run in Simulator -->]  (opens simulator with this algorithm pre-selected)
```

#### 6.3 Add 1D/2D/3D benchmark modes

Benchmark selector:

```
Dimensions: [1D] [2D] [3D]
```

Run solvers in 1D (analytical comparison with tube modes), 2D (membrane modes),
and 3D (room modes). Display performance scaling across dimensions.

#### 6.4 Add exportable benchmark report

"Export Results" button that generates a CSV or JSON file with all benchmark data.

---

## Part III: Implementation Order and Dependencies

```
Phase 1 (Bug Fixes)
  |
  +---> Phase 2 (Multi-Mic)
  |       |
  +---> Phase 3 (Algorithm Selector)
  |       |
  |       +---> Phase 6 (Benchmark Improvements)
  |
  +---> Phase 4 (3D Visualization)
  |
  +---> Phase 5 (Acoustic Parameters)
```

**Phases 2, 3, 4, 5 can proceed in parallel** after Phase 1 is complete.
Phase 6 depends on Phase 3 (shared solver module).

---

## Part IV: File Changes Summary

### New Files

| File                         | Purpose                              | Phase |
|------------------------------|--------------------------------------|-------|
| docs/js/acoustic-params.js   | Acoustic parameter computation (JS)  | 5     |
| docs/js/solvers.js           | Unified solver module (all 5 algos)  | 3     |

### Modified Files

| File                    | Changes                                               | Phase |
|-------------------------|-------------------------------------------------------|-------|
| docs/benchmark.html     | Fix all 6 chart bugs, add dim selector, export         | 1, 6  |
| docs/js/benchmark.js    | Fix HighOrder boundary, DWM indexing, peak detection   | 1     |
| docs/js/visualizer.js   | Fix colorScale, pixel gaps                             | 1     |
| docs/js/visualizer-3d.js| Fix texture leak, add 6 visualization modes            | 1, 4  |
| docs/js/fdtd-solver.js  | Add directivity, ensure multi-mic support              | 2     |
| docs/js/app.js          | Multi-mic UI, algorithm selector, dimension toggle,    | 2,3,5 |
|                         | acoustic params panel, visualization mode switcher     |       |
| docs/simulator.html     | Multi-mic editor, algorithm dropdown, dim toggle,      | 2,3,4 |
|                         | visualization mode selector, acoustic params panel,    | 5     |
|                         | 3D viz mode controls                                   |       |
| docs/css/style.css      | Styles for new panels and controls                     | 2-6   |
| fdtd/acoustic_param.py  | Add RT60, EDT, C80, D50 functions                      | 5     |

### Files Unchanged

| File                    | Reason                        |
|-------------------------|-------------------------------|
| docs/documentation.html | Already paper-quality          |
| docs/index.html         | Landing page is complete       |
| fdtd/sim.py             | Python solver is correct       |
| fdtd/room.py            | No changes needed              |
| fdtd/medium.py          | No changes needed              |
| fdtd/source.py          | No changes needed              |
| fdtd/microphone.py      | Add pattern field (minor)      |
| fdtd/configr.py         | No changes needed              |
| fdtd/datafiles.py       | No changes needed              |

---

## Part V: Quality Checklist

Before marking any phase complete, verify:

- [ ] All existing tests still pass
- [ ] No JavaScript console errors in browser
- [ ] 3D view loads without WebGL errors
- [ ] CFL condition enforced for all algorithms
- [ ] Simulation runs to completion without NaN/Infinity
- [ ] Audio playback produces audible, correct-sounding output
- [ ] WAV export opens in external audio editors
- [ ] All UI controls respond to input
- [ ] Mobile/responsive layout not broken
- [ ] Benchmark charts render correctly with real data
- [ ] Documented equations match implementation
- [ ] No regression in existing features
