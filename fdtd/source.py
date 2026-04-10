# coding: utf-8
"""
AcousticFDTD - Source Module

Defines punctual isotropic sound sources for the FDTD simulation.
Supports sinusoidal tones, Dirac delta impulses, and custom waveforms.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np
from scipy import signal

__VERSION__ = '1.0.0'


class Source:
    """Punctual isotropic pressure source.

    Generates a time-domain signal (tone) that is injected into the
    FDTD pressure grid at the source coordinates.

    Args:
        amplitude: Peak pressure amplitude in [Pa]. Default 1.0.
        sample_rate: Sample rate in [samples/s]. Default 44100.
        t0: Start time offset in [s]. Default 0.0.
        duration: Duration of the source signal in [s]. Default 1.0.
        frequency: Frequency of the sinusoidal tone in [Hz]. Default 980.
        phase: Phase offset in [rad]. Default 0.0.
        coords_0: Initial position [x, y, z] in [m]. Default [0.5, 0.5, 0.5].
        source_type: Type of source ('soft' or 'hard'). Default 'soft'.
    """

    def __init__(self, amplitude=1.0, sample_rate=44100, t0=0.0,
                 duration=1.0, frequency=980.0, phase=0.0,
                 coords_0=None, source_type='soft'):
        if coords_0 is None:
            coords_0 = [0.5, 0.5, 0.5]

        self.type_source = 'Punctual isotropic source of pressure'
        self.source_type = source_type  # 'soft' (additive) or 'hard' (override)
        self.amplitude = float(amplitude)
        self.sample_rate = int(sample_rate)
        self.frequency = float(frequency)
        self.t0 = float(t0)
        self.duration = float(duration)
        self.phase = float(phase)
        self.coords_0 = np.array(coords_0, dtype=float)
        self.coords_n = np.array(coords_0, dtype=float)

        self._generate_tone()

    def _generate_tone(self):
        """Generate the sinusoidal tone array."""
        self.t = np.arange(0, self.duration, 1.0 / self.sample_rate)
        self.tone = self.amplitude * np.sin(
            2 * np.pi * self.frequency * self.t + self.phase
        )

    def __call__(self, t):
        """Get pressure value at time t.

        Args:
            t: Time in seconds.

        Returns:
            Pressure value at time t.
        """
        return self.amplitude * np.sin(
            2 * np.pi * self.frequency * t + self.phase
        )

    def retone(self, duration, dt):
        """Re-generate tone to match simulation time step.

        Args:
            duration: Total simulation duration in [s].
            dt: Simulation time step in [s].
        """
        self.sample_rate = 1.0 / dt
        self.duration = duration
        self._generate_tone()

    def d_dirac(self, dt):
        """Create a Dirac delta impulse source.

        Args:
            dt: Time step for determining impulse position.

        Returns:
            Unit impulse array.
        """
        n = int(self.t0 / dt) if self.t0 > 0 else 0
        x = len(self.t)
        self.tone = signal.unit_impulse(x, min(n, x - 1))
        return self.tone

    def gaussian_pulse(self, dt, bandwidth=0.5):
        """Create a Gaussian pulse source.

        Args:
            dt: Time step.
            bandwidth: Fractional bandwidth. Default 0.5.

        Returns:
            Gaussian modulated sinusoidal pulse.
        """
        n_steps = len(self.t)
        t_center = n_steps // 2
        sigma = bandwidth / (2 * np.pi * self.frequency)
        t_arr = np.arange(n_steps) * dt
        t_c = t_center * dt
        self.tone = self.amplitude * np.exp(
            -((t_arr - t_c) ** 2) / (2 * sigma ** 2)
        ) * np.sin(2 * np.pi * self.frequency * t_arr + self.phase)
        return self.tone

    def __str__(self):
        """Pretty-print source information."""
        cad = '\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += '|' + ' ' * 37 + 'Source' + ' ' * 37 + '|\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += '%s (%s)\n' % (self.type_source, self.source_type)
        cad += 'Sample rate: %.2f [samples/s]\n' % self.sample_rate
        cad += 'Frequency: %.2f [Hz]\n' % self.frequency
        cad += 'Amplitude: %.6f [Pa]\n' % self.amplitude
        cad += 'Duration: %.4f [s]\n' % self.duration
        cad += 'Phase: %.4f [rad]\n' % self.phase
        cad += 'Position (x,y,z): %s [m]\n' % str(self.coords_0)
        cad += '-' * 80 + '\n\n'
        return cad
