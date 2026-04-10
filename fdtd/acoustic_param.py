# coding: utf-8
"""
AcousticFDTD - Acoustic Parameters Module

Utility functions for computing acoustic quantities from simulation data:
sound pressure level, impedance, intensity, and convolution with impulse response.

References:
    https://newt.phys.unsw.edu.au/jw/z.html
    https://www.animations.physics.unsw.edu.au/jw/sound-impedance-intensity.htm

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np
from scipy.fft import fft, fftfreq

__VERSION__ = '1.0.0'

# Reference pressure for SPL (threshold of hearing)
P_REF = 20e-6  # [Pa]


def velocity_magnitude(vx, vy, vz):
    """Compute the magnitude of the velocity vector field.

    Args:
        vx: x-component of velocity field.
        vy: y-component of velocity field.
        vz: z-component of velocity field.

    Returns:
        |v| = sqrt(vx² + vy² + vz²)
    """
    return np.sqrt(vx ** 2 + vy ** 2 + vz ** 2)


# Backward-compatibility aliases
v = velocity_magnitude


def acoustic_flux(area, vx, vy, vz):
    """Compute acoustic volume flux through a surface.

    Args:
        area: Surface area [m²].
        vx, vy, vz: Velocity components [m/s].

    Returns:
        Volume flux U = area × |v| [m³/s].
    """
    return area * velocity_magnitude(vx, vy, vz)


def intensity(p, rho, c):
    """Compute time-averaged sound intensity.

    I = p² / (2 × Z) where Z = ρ × c is the acoustic impedance.

    Args:
        p: Sound pressure [Pa].
        rho: Medium density [kg/m³].
        c: Speed of sound [m/s].

    Returns:
        Sound intensity [W/m²].
    """
    z = rho * c
    return p ** 2 / (2.0 * z)


def instantaneous_intensity(p, v):
    """Compute instantaneous sound intensity.

    Args:
        p: Instantaneous pressure [Pa].
        v: Instantaneous velocity magnitude [m/s].

    Returns:
        Instantaneous intensity I = p × v [W/m²].
    """
    return p * v


def sound_pressure_level(p):
    """Compute sound pressure level in decibels.

    L_p = 20 × log10(|p| / p_ref) where p_ref = 20 μPa.

    Args:
        p: Sound pressure [Pa] (array or scalar).

    Returns:
        SPL in [dB].
    """
    p_abs = np.abs(p)
    # Avoid log(0) by clamping
    p_abs = np.maximum(p_abs, 1e-20)
    return 20.0 * np.log10(p_abs / P_REF)


def specific_impedance(p, v):
    """Compute specific acoustic impedance z_sp = p / v.

    Args:
        p: Sound pressure [Pa].
        v: Particle velocity magnitude [m/s].

    Returns:
        Specific impedance [Pa·s/m].
    """
    v_safe = np.where(np.abs(v) < 1e-30, 1e-30, v)
    return p / v_safe


def acoustic_impedance(p, flux):
    """Compute acoustic impedance z = p / U.

    Args:
        p: Sound pressure [Pa].
        flux: Acoustic volume flux [m³/s].

    Returns:
        Acoustic impedance [Pa·s/m³].
    """
    flux_safe = np.where(np.abs(flux) < 1e-30, 1e-30, flux)
    return p / flux_safe


def convolve_impulse_response(impulse_response, data):
    """Convolve a signal with an impulse response.

    Args:
        impulse_response: Room impulse response array.
        data: Input signal array.

    Returns:
        Convolved signal.
    """
    return np.convolve(data, impulse_response, mode='full')


def compute_fft(data, sample_rate):
    """Compute the FFT of a time-domain signal.

    Args:
        data: Time-domain signal array.
        sample_rate: Sample rate in Hz.

    Returns:
        Tuple of (frequencies, magnitude_spectrum).
    """
    n = len(data)
    yf = fft(data)
    xf = fftfreq(n, 1.0 / sample_rate)
    # Return only positive frequencies
    pos = xf >= 0
    return xf[pos], np.abs(yf[pos]) * 2.0 / n


def transfer_function(impulse_response, sample_rate):
    """Compute the frequency-domain transfer function from an impulse response.

    Args:
        impulse_response: Time-domain impulse response.
        sample_rate: Sample rate in Hz.

    Returns:
        Tuple of (frequencies, magnitude_dB).
    """
    freqs, magnitude = compute_fft(impulse_response, sample_rate)
    magnitude_db = 20.0 * np.log10(np.maximum(magnitude, 1e-20) / np.max(magnitude))
    return freqs, magnitude_db
