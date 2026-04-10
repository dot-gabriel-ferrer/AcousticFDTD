# coding: utf-8
"""
AcousticFDTD - Data Files Module

Utility functions for saving and loading simulation data using NumPy's
binary format (.npy). Handles pressure and velocity field snapshots
and microphone recordings.

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np
import os

__VERSION__ = '1.0.0'

DEFAULT_SIM_FOLDER = 'test_fdtd/data/sim_data'
DEFAULT_MIC_FOLDER = 'test_fdtd/data/micro_data'


def ensure_dir(folder):
    """Create directory if it doesn't exist.

    Args:
        folder: Path to directory.
    """
    os.makedirs(folder, exist_ok=True)


def output(filename, data, folder=None):
    """Save simulation data to a .npy file.

    Args:
        filename: Base filename (without extension).
        data: NumPy array to save.
        folder: Target folder path. Default uses sim_data folder.
    """
    if folder is None:
        folder = DEFAULT_SIM_FOLDER
    ensure_dir(folder)
    filepath = os.path.join(folder, str(filename))
    np.save(filepath, data)


def input(filename, folder=None):
    """Load simulation data from a .npy file.

    Args:
        filename: Base filename (without .npy extension).
        folder: Source folder path. Default uses sim_data folder.

    Returns:
        Loaded NumPy array.

    Raises:
        FileNotFoundError: If the file doesn't exist.
    """
    if folder is None:
        folder = DEFAULT_SIM_FOLDER
    filepath = os.path.join(folder, str(filename) + '.npy')
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Data file not found: {filepath}")
    return np.load(filepath)


def record(microphone_label, data, folder=None):
    """Save microphone recording data.

    Args:
        microphone_label: Label/name for the microphone file.
        data: NumPy array of recorded pressure values.
        folder: Target folder path. Default uses micro_data folder.
    """
    if folder is None:
        folder = DEFAULT_MIC_FOLDER
    ensure_dir(folder)
    filepath = os.path.join(folder, str(microphone_label))
    np.save(filepath, data)


def save_number(filename, data):
    """Save a single number to a text file.

    Args:
        filename: Filename (without extension).
        data: Number to save.
    """
    with open(str(filename) + '.txt', 'w') as f:
        f.write(str(data))


def read_number(filename):
    """Read a single number from a text file.

    Args:
        filename: Filename to read from.

    Returns:
        Integer value from file.
    """
    with open(str(filename), 'r') as f:
        return int(f.read().strip())
