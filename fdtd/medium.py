# coding: utf-8
"""
AcousticFDTD - Medium Module

Defines the physical medium (air, water, etc.) for acoustic propagation,
including speed of sound, density, and relative velocity fields.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np

__VERSION__ = '1.0.0'

# Preset media constants
MEDIA_PRESETS = {
    'air': {'c0': 343.0, 'cr0': 1.0, 'r0h': 1.225},
    'water': {'c0': 1493.0, 'cr0': 1.0, 'r0h': 997.0},
    'saltwater': {'c0': 1533.0, 'cr0': 1.0, 'r0h': 1027.0},
}


class Medium:
    """Physical medium properties for the simulation domain.

    Stores spatially varying density and relative velocity fields on the
    FDTD grid, plus the scalar base speed of sound.

    Args:
        room: Room object defining the grid dimensions.
        medium: Medium name ('air', 'water', 'saltwater', or custom). Default 'air'.
        c0: Speed of sound in [m/s]. Default 343.0 (air at 20°C).
        cr0: Relative speed of sound (scalar). Default 1.0.
        r0h: Homogeneous density in [kg/m³]. Default 1.225 (air at 20°C).
    """

    def __init__(self, room, medium='air', c0=343.0, cr0=1.0, r0h=1.225):
        self.room = room

        # Apply preset if available
        if medium.lower() in MEDIA_PRESETS:
            preset = MEDIA_PRESETS[medium.lower()]
            c0 = preset['c0']
            cr0 = preset['cr0']
            r0h = preset['r0h']

        self.medium_name = medium
        self.c0 = float(c0)
        self.cr = cr0 * np.ones(self.room.dims, dtype=float)
        self.ro_homogeneous = float(r0h)
        self.ro = self.ro_homogeneous * np.ones(self.room.dims, dtype=float)

    def change_medium(self, medium_name, c0=None, cr=None, ro=None):
        """Change the medium properties.

        Args:
            medium_name: Name of the new medium.
            c0: Speed of sound [m/s]. If None, keeps current.
            cr: Relative speed of sound. If None, keeps current.
            ro: Density [kg/m³]. If None, keeps current.
        """
        if not isinstance(medium_name, str):
            raise ValueError('medium_name must be a string')

        self.medium_name = medium_name

        if medium_name.lower() in MEDIA_PRESETS:
            preset = MEDIA_PRESETS[medium_name.lower()]
            c0 = c0 if c0 is not None else preset['c0']
            cr = cr if cr is not None else preset['cr0']
            ro = ro if ro is not None else preset['r0h']

        if c0 is not None:
            if c0 <= 0:
                raise ValueError('Speed of sound c0 must be positive')
            self.c0 = float(c0)

        if cr is not None:
            if isinstance(cr, (int, float)):
                self.cr = float(cr) * np.ones(self.room.dims, dtype=float)
            else:
                self.cr = np.array(cr, dtype=float)

        if ro is not None:
            if isinstance(ro, (int, float)):
                if ro <= 0:
                    raise ValueError('Density must be positive')
                self.ro_homogeneous = float(ro)
                self.ro = self.ro_homogeneous * np.ones(self.room.dims, dtype=float)
            else:
                self.ro = np.array(ro, dtype=float)
                self.ro_homogeneous = float(np.mean(self.ro))

    def add_wall_density(self, dims_wall, pini_wall, ro):
        """Add a rectangular region with different density (e.g., a wall).

        Args:
            dims_wall: Dimensions of wall region [x, y, z] in meters.
            pini_wall: Starting position of wall [x, y, z] in meters.
            ro: Wall density in [kg/m³].

        Raises:
            ValueError: If density is non-positive.
        """
        if ro <= 0:
            raise ValueError('Wall density must be positive')

        dims_n = np.array(np.array(dims_wall) / self.room.dres, dtype=int)
        pini_n = np.array(np.array(pini_wall) / self.room.dres, dtype=int)

        self.ro[
            pini_n[0]:dims_n[0] + pini_n[0],
            pini_n[1]:dims_n[1] + pini_n[1],
            pini_n[2]:dims_n[2] + pini_n[2]
        ] = ro

    def __str__(self):
        """Pretty-print medium information."""
        cad = '+' + '-' * 80 + '+\n'
        cad += '|' + ' ' * 36 + ' Medium' + ' ' * 36 + ' |\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += 'Medium: %s\n' % self.medium_name
        cad += 'Speed of sound: c0 = %.2f [m/s]\n' % self.c0
        cad += 'Homogeneous density: ro = %.3f [kg/m³]\n' % self.ro_homogeneous
        cad += '-' * 80 + '\n\n'
        return cad
