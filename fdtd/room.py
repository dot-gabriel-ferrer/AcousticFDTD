# coding: utf-8
"""
AcousticFDTD - Room Module

Defines the 3D simulation domain (room) with configurable dimensions
and spatial resolution for the FDTD mesh.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np

__VERSION__ = '1.0.0'


class Room:
    """3D rectangular room mesh for FDTD acoustic simulation.

    The room is discretized into a uniform Cartesian grid with spacing ``dres``.
    Dimensions are specified in meters and converted to grid node counts.

    Args:
        dims: Room dimensions [x, y, z] in meters. Default [1, 1, 1].
        dres: Spatial resolution (distance between nodes) in meters. Default 0.1.
        pini: Origin point [x, y, z] in meters. Default [0, 0, 0].
    """

    def __init__(self, dims=None, dres=0.1, pini=None):
        if dims is None:
            dims = [1.0, 1.0, 1.0]
        if pini is None:
            pini = [0.0, 0.0, 0.0]

        self.dres = float(dres)
        self.pini = np.array(pini, dtype=float)

        # Convert physical dimensions to grid node counts
        self.dims = np.array([int(d / self.dres) for d in dims], dtype=int)
        self.dims_m = self.dims * self.dres  # Dimensions in meters

    @property
    def total_nodes(self):
        """Total number of grid nodes."""
        return int(np.prod(self.dims))

    def __str__(self):
        """Pretty-print room information."""
        cad = '+' + '-' * 80 + '+\n'
        cad += '|' + ' ' * 37 + ' Room' + ' ' * 37 + ' |\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += 'Mesh resolution: %.2f [nodes/m]\n' % (1.0 / self.dres)
        cad += 'Spatial step: %.4f [m]\n' % self.dres
        cad += 'Dimension of mesh: (%.2f x %.2f x %.2f) [m^3]\n' % (
            self.dims_m[0], self.dims_m[1], self.dims_m[2])
        cad += 'Grid nodes: (%d x %d x %d) = %d\n' % (
            self.dims[0], self.dims[1], self.dims[2], self.total_nodes)
        cad += '-' * 80 + '\n\n'
        return cad
