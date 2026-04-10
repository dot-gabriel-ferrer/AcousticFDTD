# coding: utf-8
"""
AcousticFDTD - Counter Module

Manages the ping-pong buffer indices for the FDTD leapfrog time-stepping scheme.
Uses two alternating time slots (n and n_1) to avoid storing the full time history.

Author: Elías Gabriel Ferrer Jorge
"""


class Counter:
    """Ping-pong counter for alternating between two time-level buffers.

    The FDTD scheme needs values at time n and n+1. Instead of allocating
    a full time history, we use two buffer slots and swap indices each step.

    Attributes:
        n (int): Current time-level index (0 or 1).
        n_1 (int): Next time-level index (0 or 1).
        cont (int): Running step count (monotonically increasing).
    """

    def __init__(self):
        self.n = 0
        self.n_1 = 1
        self.cont = 0

    def swap(self):
        """Swap current/next buffer indices and increment step counter.

        After swap: old n_1 becomes new n, old n becomes new n_1.
        """
        self.n = (self.n + 1) % 2
        self.n_1 = (self.n_1 + 1) % 2
        self.cont += 1

    def reset(self):
        """Reset counter to initial state."""
        self.n = 0
        self.n_1 = 1
        self.cont = 0
