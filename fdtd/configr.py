# coding: utf-8
"""
AcousticFDTD - Configuration Reader Module

Reads simulation parameters from XML configuration files.

Author: Elías Gabriel Ferrer Jorge
"""

import xml.etree.ElementTree as ET

__VERSION__ = '1.0.0'


class Configr:
    """XML configuration file reader for FDTD simulation parameters.

    Reads room dimensions, source parameters, and simulation settings
    from an XML config file.

    Args:
        filename: Name of the XML config file. Default 'config.xml'.
        basepath: Base directory containing the config file. Default 'test_fdtd'.
    """

    def __init__(self, filename='config.xml', basepath='test_fdtd'):
        self.filename = filename
        self.basepath = basepath
        filepath = basepath + '/' + filename
        self.tree = ET.parse(filepath)
        self.root = self.tree.getroot()
        self.test_number = None

    def __call__(self, test_number):
        """Load configuration for a specific test case.

        Args:
            test_number: Test number (1-indexed) to load.
        """
        self.test_number = test_number
        test_list = self.root[0]  # <lista_de_tests>
        self.test_x = test_list[test_number - 1]

        # Room parameters
        room_elem = self.test_x.find('room')
        self.dimx = float(room_elem.get('dimx'))
        self.dimy = float(room_elem.get('dimy'))
        self.dimz = float(room_elem.get('dimz'))
        self.dims = [self.dimx, self.dimy, self.dimz]

        dres = room_elem.get('dres')
        self.dres = float(dres) if dres else 0.1

        self.pinix = float(room_elem.get('pinix', '0'))
        self.piniy = float(room_elem.get('piniy', '0'))
        self.piniz = float(room_elem.get('piniz', '0'))
        self.pini = [self.pinix, self.piniy, self.piniz]

        # Source parameters
        source_elem = self.test_x.find('source')
        self.sample_rate = int(source_elem.get('sample_rate'))
        self.source_duration = float(source_elem.get('duration'))
        self.frequency = float(source_elem.get('frequency'))
        self.phase = float(source_elem.get('phase'))

        # Simulation parameters
        sim_elem = self.test_x.find('sim')
        self.sim_time = float(sim_elem.get('duration'))

    def __str__(self):
        """Pretty-print loaded configuration."""
        cad = '+' + '-' * 80 + '+\n'
        cad += 'Config file: %s\n' % self.filename
        if self.test_number is not None:
            cad += 'Test #%d loaded\n' % self.test_number
            cad += 'Room: (%.2f x %.2f x %.2f) m, dres=%.3f m\n' % (
                self.dimx, self.dimy, self.dimz, self.dres)
            cad += 'Source: f=%.1f Hz, duration=%.2f s\n' % (
                self.frequency, self.source_duration)
            cad += 'Simulation time: %.2f s\n' % self.sim_time
        cad += '+' + '-' * 80 + '+\n'
        return cad
