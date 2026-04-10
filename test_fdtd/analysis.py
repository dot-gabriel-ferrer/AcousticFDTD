# coding: utf-8
"""
AcousticFDTD - Post-simulation Analysis

Loads simulation field data and computes acoustic parameters:
SPL, impedance, intensity.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np
import fdtd.datafiles as fl
import fdtd.acoustic_param as ap


def analyze_simulation(steps_file='steps.txt', c0=343.0, rho=1.225):
    """Load and analyze saved simulation data.

    Args:
        steps_file: Path to file containing step count.
        c0: Speed of sound [m/s]. Default 343.0 (air).
        rho: Medium density [kg/m³]. Default 1.225 (air).

    Returns:
        Dictionary with computed acoustic fields.
    """
    steps = fl.read_number(steps_file)

    P, VX, VY, VZ = [], [], [], []
    for i in range(1, steps):
        try:
            P.append(fl.input('p_' + str(i)))
            VX.append(fl.input('vx_' + str(i)))
            VY.append(fl.input('vy_' + str(i)))
            VZ.append(fl.input('vz_' + str(i)))
        except FileNotFoundError:
            break

    p = np.array(P)
    vx = np.array(VX)
    vy = np.array(VY)
    vz = np.array(VZ)
    v = ap.velocity_magnitude(vx, vy, vz)

    p_dB = ap.sound_pressure_level(p)
    z_sp = ap.specific_impedance(p, v)
    I_sound = ap.intensity(p, rho, c0)

    return {
        'pressure': p,
        'velocity': v,
        'spl_dB': p_dB,
        'impedance': z_sp,
        'intensity': I_sound,
    }


if __name__ == '__main__':
    results = analyze_simulation()
    print("Analysis complete.")
    print("Pressure field shape:", results['pressure'].shape)
    print("Max SPL: %.2f dB" % np.max(results['spl_dB']))
