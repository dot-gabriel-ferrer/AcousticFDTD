# coding: utf-8
"""
AcousticFDTD - Simulation Module

Core FDTD (Finite-Difference Time-Domain) solver for 3D acoustic wave
propagation. Implements the leapfrog staggered-grid scheme with support
for reflective and absorbing (PML-like) boundary conditions.

The linearised acoustic equations solved are:
    ∂v/∂t = -(1/ρ) ∇p
    ∂p/∂t = -ρ c² ∇·v

Author: Elías Gabriel Ferrer Jorge
"""

import numpy as np
import time as timer_module
from fdtd.counter import Counter

__VERSION__ = '1.0.0'

# Status codes
SIM_NO_ERR = 0
SIM_ERR_FREQ = 1
SIM_ERR_RES = 2
SIM_ERR_DIMS = 4

# Boundary condition types
BC_REFLECTIVE = 'reflective'
BC_ABSORBING = 'absorbing'
BC_PERIODIC = 'periodic'


class Sim:
    """Acoustic FDTD solver in 3D.

    Solves the linearised acoustic wave equations on a staggered Cartesian
    grid using the leapfrog time-stepping scheme. Supports multiple sources,
    multiple microphones, and configurable boundary conditions.

    Args:
        room: Room object defining the simulation domain.
        medium: Medium object with material properties.
        sources: List of Source objects.
        micros: List of Microphone objects.
        t: Total simulation time in seconds.
        sc: Courant number (stability coefficient). Default 0.5.
        boundary: Boundary condition type. Default 'reflective'.
            - 'reflective': Perfect rigid walls (v_normal = 0).
            - 'absorbing': Simple absorbing boundaries.
            - 'periodic': Periodic (wrap-around) boundaries.
        wall_reflection: Wall reflection coefficient (0 to 1). Default 1.0.
            1.0 = perfect reflection, 0.0 = full absorption.
    """

    def __init__(self, room, medium, sources, micros, t, sc=0.5,
                 boundary=BC_REFLECTIVE, wall_reflection=1.0):
        self.SIM_NO_ERR = SIM_NO_ERR
        self.SIM_ERR_FREQ = SIM_ERR_FREQ
        self.SIM_ERR_RES = SIM_ERR_RES
        self.SIM_ERR_DIMS = SIM_ERR_DIMS

        self.room = room
        self.medium = medium
        self.boundary = boundary
        self.wall_reflection = float(wall_reflection)

        self.sources = sources
        self.sources_coords = np.array([
            (np.array(s.coords_n) / self.room.dres).astype(int)
            for s in self.sources
        ])

        self.micros = micros
        self.micros_coords = np.array([
            (np.array(m.coords) / self.room.dres).astype(int)
            for m in self.micros
        ])

        self.t = float(t)
        self.cadat = 0.0
        self.sim_duration = 0.0

        # Courant coefficient and time step
        # CFL condition: sc = c0 * dt / (dx * sqrt(3)) <= 1/sqrt(3)
        self.sc = float(sc)
        self.dt = np.sqrt(3) * self.sc * self.room.dres / self.medium.c0

        self.counter = Counter()
        self.save_status = 0

        # Allocate field arrays: pvro[2_time_levels, 6_fields, Nx, Ny, Nz]
        # Fields: [p, vx, vy, vz, rho, cprv]
        nx, ny, nz = self.room.dims
        self.pvro = np.zeros((2, 6, nx, ny, nz), dtype=float)

        # Initialize density and coupling coefficient
        self.pvro[:, 4] = self.medium.ro
        self.pvro[:, 5] = (
            self.pvro[:, 4] * self.medium.cr ** 2 * self.medium.c0 * self.sc
        )

        # Check simulation validity
        self.status = SIM_NO_ERR
        self.check_status()

        # Initialize microphone buffers
        for mic in self.micros:
            mic.steps = int(self.t / self.dt)
            mic.resample()

    def init_sources(self, sources):
        """Re-initialize the source list (e.g., after retone).

        Args:
            sources: List of Source objects.
        """
        self.sources = sources
        self.sources_coords = np.array([
            (np.array(s.coords_n) / self.room.dres).astype(int)
            for s in self.sources
        ])

    def set_sc(self, sc):
        """Set the Courant coefficient.

        Args:
            sc: New Courant number.
        """
        self.sc = float(sc)
        self.dt = np.sqrt(3) * self.sc * self.room.dres / self.medium.c0

    def save(self, status):
        """Enable or disable saving field data to files.

        Args:
            status: 0 = don't save, 1 = save each step.
        """
        self.save_status = status

    def _apply_boundary_conditions(self, n_1):
        """Apply boundary conditions to the velocity and pressure fields.

        Args:
            n_1: Next time-level index in the ping-pong buffer.
        """
        if self.boundary == BC_REFLECTIVE:
            r = self.wall_reflection
            # Zero normal velocity at boundaries (rigid wall condition)
            # x boundaries
            self.pvro[n_1, 1, 0, :, :] = 0.0
            self.pvro[n_1, 1, -1, :, :] = 0.0
            # y boundaries
            self.pvro[n_1, 2, :, 0, :] = 0.0
            self.pvro[n_1, 2, :, -1, :] = 0.0
            # z boundaries
            self.pvro[n_1, 3, :, :, 0] = 0.0
            self.pvro[n_1, 3, :, :, -1] = 0.0

            # Pressure reflection at walls
            if r < 1.0:
                self.pvro[n_1, 0, 0, :, :] *= r
                self.pvro[n_1, 0, -1, :, :] *= r
                self.pvro[n_1, 0, :, 0, :] *= r
                self.pvro[n_1, 0, :, -1, :] *= r
                self.pvro[n_1, 0, :, :, 0] *= r
                self.pvro[n_1, 0, :, :, -1] *= r

        elif self.boundary == BC_ABSORBING:
            # Simple first-order absorbing (Mur-like)
            # Set boundary pressure to zero (anechoic approximation)
            self.pvro[n_1, 0, 0, :, :] = 0.0
            self.pvro[n_1, 0, -1, :, :] = 0.0
            self.pvro[n_1, 0, :, 0, :] = 0.0
            self.pvro[n_1, 0, :, -1, :] = 0.0
            self.pvro[n_1, 0, :, :, 0] = 0.0
            self.pvro[n_1, 0, :, :, -1] = 0.0
            # Zero velocity at edges
            self.pvro[n_1, 1, 0, :, :] = 0.0
            self.pvro[n_1, 1, -1, :, :] = 0.0
            self.pvro[n_1, 2, :, 0, :] = 0.0
            self.pvro[n_1, 2, :, -1, :] = 0.0
            self.pvro[n_1, 3, :, :, 0] = 0.0
            self.pvro[n_1, 3, :, :, -1] = 0.0

        # BC_PERIODIC: np.roll already handles wrap-around, nothing extra needed

    def calc(self, cadat):
        """Execute one FDTD time step.

        Updates velocity then pressure fields using the leapfrog scheme:
            v^{n+1} = v^n - (2·sc/c0) · ∇p^n / (ρ_i + ρ_{i+1})
            p^{n+1} = p^n - cprv · ∇·v^{n+1}

        Args:
            cadat: Current simulation time (for logging).
        """
        n = self.counter.n
        n_1 = self.counter.n_1
        alfa = 2.0 * self.sc / self.medium.c0

        # --- Inject sources (soft = additive, hard = overwrite) ---
        for i, src in enumerate(self.sources):
            sx, sy, sz = self.sources_coords[i]
            if self.counter.cont < len(src.tone):
                if src.source_type == 'soft':
                    self.pvro[n, 0, sx, sy, sz] += src.tone[self.counter.cont]
                else:
                    self.pvro[n, 0, sx, sy, sz] = src.tone[self.counter.cont]

        # --- Record microphone data ---
        for j, mic in enumerate(self.micros):
            mx, my, mz = self.micros_coords[j]
            if self.counter.cont < len(mic.data):
                mic.data[self.counter.cont] = self.pvro[n, 0, mx, my, mz]

        # --- Update velocity fields (leapfrog) ---
        # vx: forward difference in x
        ro_sum_x = self.pvro[n, 4] + np.roll(self.pvro[n, 4], -1, axis=0)
        self.pvro[n_1, 1] = self.pvro[n, 1] - alfa * (
            np.roll(self.pvro[n, 0], -1, axis=0) - self.pvro[n, 0]
        ) / ro_sum_x

        # vy: forward difference in y
        ro_sum_y = self.pvro[n, 4] + np.roll(self.pvro[n, 4], -1, axis=1)
        self.pvro[n_1, 2] = self.pvro[n, 2] - alfa * (
            np.roll(self.pvro[n, 0], -1, axis=1) - self.pvro[n, 0]
        ) / ro_sum_y

        # vz: forward difference in z
        ro_sum_z = self.pvro[n, 4] + np.roll(self.pvro[n, 4], -1, axis=2)
        self.pvro[n_1, 3] = self.pvro[n, 3] - alfa * (
            np.roll(self.pvro[n, 0], -1, axis=2) - self.pvro[n, 0]
        ) / ro_sum_z

        # --- Update pressure field ---
        div_v = (
            (self.pvro[n_1, 1] - np.roll(self.pvro[n_1, 1], 1, axis=0)) +
            (self.pvro[n_1, 2] - np.roll(self.pvro[n_1, 2], 1, axis=1)) +
            (self.pvro[n_1, 3] - np.roll(self.pvro[n_1, 3], 1, axis=2))
        )
        self.pvro[n_1, 0] = self.pvro[n, 0] - self.pvro[n, 5] * div_v

        # --- Apply boundary conditions ---
        self._apply_boundary_conditions(n_1)

        # --- Advance counter ---
        self.counter.swap()

    def run(self, callback=None):
        """Run the full simulation.

        Args:
            callback: Optional function called each step with (step, total_steps, sim).

        Returns:
            Simulation duration in seconds.
        """
        total_steps = int(self.t / self.dt)
        start = timer_module.time()

        for step in range(total_steps):
            cadat = step * self.dt
            self.cadat = cadat
            self.calc(cadat)
            if callback is not None:
                callback(step, total_steps, self)

        self.sim_duration = timer_module.time() - start
        self.counter.reset()
        return self.sim_duration

    def get_pressure_field(self):
        """Return current pressure field snapshot.

        Returns:
            3D numpy array of pressure values.
        """
        return self.pvro[self.counter.n, 0].copy()

    def check_status(self):
        """Check for aliasing and resolution problems.

        Verifies that the source frequencies and grid resolution satisfy
        the Nyquist/CFL conditions for accurate simulation.
        """
        freqs = np.array([s.frequency for s in self.sources])
        self.long_wave = self.medium.c0 / freqs
        self.dres_min_antialising = self.long_wave / (2.0 * np.sqrt(3))
        self.frequency_max = self.medium.c0 / (2.0 * np.sqrt(3) * self.room.dres)

        self.status = SIM_NO_ERR

        # Check frequency limit
        if np.any(freqs > self.frequency_max):
            self.status |= SIM_ERR_FREQ

        # Check spatial resolution
        if np.any(self.room.dres > self.dres_min_antialising):
            self.status |= SIM_ERR_RES

        # Check minimum grid size
        if (self.room.dims[0] < 4 or self.room.dims[1] < 4 or
                self.room.dims[2] < 4):
            self.status |= SIM_ERR_DIMS

    @property
    def total_steps(self):
        """Total number of time steps."""
        return int(self.t / self.dt)

    def __str__(self):
        """Pretty-print simulation information."""
        cad = ''
        cad += self.room.__str__()
        cad += self.medium.__str__()

        for source in self.sources:
            cad += source.__str__()

        for mic in self.micros:
            cad += mic.__str__()

        cad += '+' + '-' * 80 + '+\n'
        cad += '|' + ' ' * 30 + 'Simulation parameters' + ' ' * 29 + '|\n'
        cad += '+' + '-' * 80 + '+\n'
        cad += 'Boundary condition: %s\n' % self.boundary
        cad += 'Wall reflection: %.2f\n' % self.wall_reflection
        cad += 'Courant coefficient: %.4f\n' % self.sc
        cad += 'Time simulated: %.4f [s]\n' % self.t
        cad += 'Time step: %.8f [s]\n' % self.dt
        cad += 'Total steps: %d\n' % self.total_steps
        cad += 'Max frequency (anti-aliasing): %.2f [Hz]\n' % self.frequency_max
        cad += 'Simulation wall-clock time: %.2f [s]\n' % self.sim_duration
        cad += 'Status: %s\n' % (
            'OK' if self.status == SIM_NO_ERR else 'ERROR (code %d)' % self.status)
        cad += '-' * 80 + '\n\n'
        return cad
