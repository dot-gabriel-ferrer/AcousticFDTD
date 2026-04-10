# AcousticFDTD — 3D Acoustic FDTD Simulator

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://dot-gabriel-ferrer.github.io/AcousticFDTD/)

A professional 3D acoustic wave propagation simulator using the **Finite-Difference Time-Domain (FDTD)** method. Includes both a Python simulation engine and an interactive web-based demo.

## Live Demo

**[Launch Web Simulator](https://dot-gabriel-ferrer.github.io/AcousticFDTD/)**

The web version runs entirely in your browser with no installation required.

## Features

- **3D Room Simulation**: Configurable rectangular rooms with adjustable dimensions and resolution
- **Multiple Boundary Conditions**: Reflective walls, absorbing boundaries, or periodic
- **Multiple Media**: Air, water, saltwater, or custom material properties
- **Impulse Response**: Compute room transfer functions via Dirac delta excitation
- **Multiple Sources & Receivers**: Place sound sources and microphones anywhere
- **Soft & Hard Sources**: Additive (physically correct) or override source injection
- **Anti-aliasing Checks**: Automatic CFL/Nyquist validation before simulation
- **Post-processing**: SPL, acoustic impedance, intensity, FFT analysis
- **Analytical Validation**: Room mode calculations for verification

## Quick Start (Python)

### Prerequisites

- Python 3.8+
- NumPy, SciPy, Matplotlib

```bash
pip install numpy scipy matplotlib
```

### Basic Usage

```python
from fdtd import Room, Medium, Source, Microphone, Sim

# Create a 1m × 1m × 1m room with 5cm resolution
room = Room(dims=[1, 1, 1], dres=0.05)
medium = Medium(room, medium='air')

# Add a 500Hz source at center
src = Source(frequency=500, coords_0=[0.5, 0.5, 0.5])
mic = Microphone(coords=[0.2, 0.2, 0.2])

# Create and run simulation (0.01s)
sim = Sim(room, medium, [src], [mic], t=0.01, boundary='reflective')
src.retone(sim.t, sim.dt)
sim.init_sources([src])

if sim.status == 0:
    sim.run()
    print("Done! Recorded", len(mic.data), "samples")
```

### Impulse Response

```python
from fdtd import Room, Medium, Source, Microphone, Sim

room = Room(dims=[2, 2, 2], dres=0.1)
medium = Medium(room)
src = Source(coords_0=[1.0, 1.0, 1.0])
mic = Microphone(coords=[0.5, 0.5, 0.5])

sim = Sim(room, medium, [src], [mic], t=0.05)
src.retone(sim.t, sim.dt)
src.d_dirac(sim.dt)
sim.init_sources([src])
sim.run()

# mic.data now contains the impulse response
```

## Project Structure

```
AcousticFDTD/
├── fdtd/                    # Python simulation engine
│   ├── __init__.py          # Package exports
│   ├── sim.py               # Core FDTD solver
│   ├── room.py              # Room/domain definition
│   ├── medium.py            # Material properties
│   ├── source.py            # Sound sources
│   ├── microphone.py        # Pressure receivers
│   ├── counter.py           # Ping-pong buffer manager
│   ├── acoustic_param.py    # Post-processing utilities
│   ├── configr.py           # XML config reader
│   └── datafiles.py         # File I/O utilities
├── analitical/              # Analytical validation
│   └── squarebox.py         # Room mode calculations
├── test_fdtd/               # Test configurations
│   ├── config.xml           # XML test cases
│   └── analysis.py          # Post-analysis script
├── docs/                    # Web application (GitHub Pages)
│   ├── index.html           # Main web UI
│   ├── css/style.css        # Styling
│   └── js/
│       ├── fdtd-solver.js   # JavaScript FDTD engine
│       ├── visualizer.js    # Canvas/WebGL visualization
│       ├── audio-engine.js  # Web Audio API integration
│       └── app.js           # Application controller
└── README.md
```

## Mathematical Background

The FDTD method solves the linearised acoustic wave equations:

$$\frac{\partial \mathbf{v}}{\partial t} = -\frac{1}{\rho} \nabla p$$

$$\frac{\partial p}{\partial t} = -\rho c^2 \nabla \cdot \mathbf{v}$$

using a staggered-grid leapfrog scheme with Courant stability condition:

$$S_c = \frac{c_0 \Delta t}{\Delta x \sqrt{3}} \leq \frac{1}{\sqrt{3}}$$

## Author

**Elías Gabriel Ferrer Jorge** — TFG Acoustic Simulations

## License

MIT License
