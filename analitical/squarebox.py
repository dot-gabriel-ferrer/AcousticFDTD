# coding: utf-8
"""
AcousticFDTD - Analytical Solutions

Provides analytical solutions for wave propagation in a rectangular
box (room) with rigid walls, useful for validating the FDTD solver.

The resonance frequencies of a rectangular room with rigid walls are:
    f_{n_x, n_y, n_z} = (c/2) * sqrt((n_x/L_x)^2 + (n_y/L_y)^2 + (n_z/L_z)^2)

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np


def room_modes(lx, ly, lz, c=343.0, max_order=5):
    """Compute the resonance frequencies of a rectangular room.

    Args:
        lx, ly, lz: Room dimensions in meters.
        c: Speed of sound in m/s. Default 343.0.
        max_order: Maximum mode order to compute. Default 5.

    Returns:
        List of tuples (nx, ny, nz, frequency) sorted by frequency.
    """
    modes = []
    for nx in range(0, max_order + 1):
        for ny in range(0, max_order + 1):
            for nz in range(0, max_order + 1):
                if nx == 0 and ny == 0 and nz == 0:
                    continue  # Skip the DC mode
                f = (c / 2.0) * np.sqrt(
                    (nx / lx) ** 2 + (ny / ly) ** 2 + (nz / lz) ** 2
                )
                modes.append((nx, ny, nz, f))
    modes.sort(key=lambda m: m[3])
    return modes


def pressure_mode(x, y, z, lx, ly, lz, nx, ny, nz, amplitude=1.0):
    """Compute the spatial pressure distribution of a single room mode.

    p(x,y,z) = A * cos(nx*pi*x/Lx) * cos(ny*pi*y/Ly) * cos(nz*pi*z/Lz)

    Args:
        x, y, z: Spatial coordinates (arrays or scalars) in meters.
        lx, ly, lz: Room dimensions in meters.
        nx, ny, nz: Mode indices.
        amplitude: Pressure amplitude. Default 1.0.

    Returns:
        Pressure field value(s) at the given coordinates.
    """
    return amplitude * (
        np.cos(nx * np.pi * x / lx) *
        np.cos(ny * np.pi * y / ly) *
        np.cos(nz * np.pi * z / lz)
    )


def green_function_free_field(r, k):
    """Free-field Green's function for the Helmholtz equation.

    G(r) = exp(ikr) / (4*pi*r)

    Args:
        r: Distance from source in meters.
        k: Wave number (2*pi*f/c).

    Returns:
        Complex Green's function value.
    """
    r = np.maximum(r, 1e-10)  # Avoid division by zero
    return np.exp(1j * k * r) / (4.0 * np.pi * r)
