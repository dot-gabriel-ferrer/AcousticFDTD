# coding: utf-8
"""
AcousticFDTD - 3D Acoustic FDTD Simulator

A Python package for simulating acoustic wave propagation in 3D rooms
using the Finite-Difference Time-Domain (FDTD) method.

Author: Elías Gabriel Ferrer Jorge
"""

__VERSION__ = '1.0.0'

from fdtd.room import Room
from fdtd.medium import Medium
from fdtd.source import Source
from fdtd.microphone import Microphone
from fdtd.sim import Sim
from fdtd.counter import Counter
from fdtd import acoustic_param
from fdtd import datafiles

__all__ = [
    'Room', 'Medium', 'Source', 'Microphone', 'Sim', 'Counter',
    'acoustic_param', 'datafiles'
]