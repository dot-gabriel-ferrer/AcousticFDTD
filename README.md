# Acoustic FDTD Simulator in 3D

The **Acoustic FDTD (Finite-Difference Time-Domain) Simulator in 3D** is a powerful tool for simulating the propagation of sound waves in a three-dimensional room. The simulator can model acoustic behavior in different media, including air and water, and compute the room's **transfer function** via **impulse response**. This simulation is particularly useful for acoustic analysis, sound system design, and research in architectural acoustics.

## Features

- **3D Room Simulation**: Create custom 3D rooms with configurable dimensions and boundaries.
- **Acoustic Propagation in Different Media**: Simulate sound propagation in air and water, allowing for flexible acoustic analysis across different environments.
- **Impulse Response Calculation**: Compute the room's acoustic impulse response, enabling the evaluation of the room's **transfer function**.
- **High Accuracy**: Uses the Finite-Difference Time-Domain (FDTD) method for high precision in modeling sound wave propagation.
- **Customizable Sources and Receivers**: Place sound sources and receivers anywhere in the room to study sound distribution and wave propagation.
  
## Getting Started

### Prerequisites

To run the simulator, you will need:

- Python 3.x
- NumPy
- SciPy
- Matplotlib (for visualization)
- Optional: PyRoomAcoustics (for comparison)

Install the required dependencies by running:

```bash
pip install numpy scipy matplotlib
