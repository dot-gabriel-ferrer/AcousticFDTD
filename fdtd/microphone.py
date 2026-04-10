# coding: utf-8
"""
AcousticFDTD - Microphone Module

Defines microphone (receiver) objects that record pressure values
at specific positions during the FDTD simulation.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np

__VERSION__ = '1.0.0'


class Microphone:
    """Virtual microphone (pressure receiver) for the FDTD simulation.

    Records the acoustic pressure at a given spatial position over time.

    Args:
        micro_label: Name/label for this microphone. Default 'Microphone'.
        coords: Position [x, y, z] in meters. Default [0.0, 0.0, 0.0].
        sensitivity_dB: Sensitivity in dB. Default 62.
    """

    def __init__(self, micro_label='Microphone', coords=None,
                 sensitivity_dB=62):
        if coords is None:
            coords = [0.0, 0.0, 0.0]

        self.micro_label = micro_label
        self.coords = np.array(coords, dtype=float)
        self.sensitivity_dB = sensitivity_dB
        self.steps = 0
        self.data = np.array([])

    def resample(self):
        """Resize the data buffer to match the simulation step count."""
        self.data = np.zeros(self.steps, dtype=float)

    def get_data(self):
        """Return the recorded pressure data.

        Returns:
            numpy array of recorded pressure values.
        """
        return self.data.copy()

    def __str__(self):
        """Pretty-print microphone information."""
        cad = '\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += '|' + ' ' * 34 + 'Microphone' + ' ' * 36 + '|\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += 'Label: %s\n' % self.micro_label
        cad += 'Position (x,y,z): %s [m]\n' % str(self.coords)
        cad += 'Sensitivity: %d [dB]\n' % self.sensitivity_dB
        cad += 'Recorded samples: %d\n' % len(self.data)
        cad += '-' * 80 + '\n\n'
        return cad
