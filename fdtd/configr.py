#coding:utf-8
'''
TFG Acoustics simulations

CLASS XML_CONFIG_READER

@author: Elías Gabriel Ferrer Jorge
'''

import xml.etree.cElementTree as ET

class Configr:
	'''Config file reader from test_fdtd folder in path.
	'''
	def __init__(self,filename='config.xml'):
		'''
		'''
		self.filename = filename
		self.tree = ET.ElementTree(file='test_fdtd/' + self.filename)
		self.root = self.tree.getroot()

	def experiment(self,filename='experiments.xml'):
		'''Read data of experiments.xml

		    Example:

		    If you want load test_1 data input test_number = 1
		'''
		self.test_number = test_number
		self.test_x = self.root[self.test_number-1]

		self.dimx = float(self.test_x.find('room').get('dimx'))
		self.dimy = float(self.test_x.find('room').get('dimy'))
		self.dimz = float(self.test_x.find('room').get('dimz'))
		self.dims = [self.dimx,self.dimy,self.dimz]

		self.pinix = float(self.test_x.find('room').get('pinix'))
		self.piniy = float(self.test_x.find('room').get('piniy'))
		self.piniz = float(self.test_x.find('room').get('piniz'))
		self.pini = [self.pinix,self.piniy,self.piniz]

		self.sample_rate = int(self.test_x.find('source').get('sample_rate'))
		self.source_duration = float(self.test_x.find('source').get('duration'))
		self.frequency = float(self.test_x.find('source').get('frequency'))
		self.phase = float(self.test_x.find('source').get('phase'))
		self.sim_time = float(self.test_x.find('sim').get('duration'))

	def __call__(self,test_number):
		'''Read data of config.xml

		    Example:

		    If you want load test_1 data input test_number = 1
		'''
		
		self.test_number = test_number
		self.test_x = self.root[self.test_number-1]

		self.dimx = float(self.test_x.find('room').get('dimx'))
		self.dimy = float(self.test_x.find('room').get('dimy'))
		self.dimz = float(self.test_x.find('room').get('dimz'))
		self.dims = [self.dimx,self.dimy,self.dimz]

		self.pinix = float(self.test_x.find('room').get('pinix'))
		self.piniy = float(self.test_x.find('room').get('piniy'))
		self.piniz = float(self.test_x.find('room').get('piniz'))
		self.pini = [self.pinix,self.piniy,self.piniz]

		self.sample_rate = int(self.test_x.find('source').get('sample_rate'))
		self.source_duration = float(self.test_x.find('source').get('duration'))
		self.frequency = float(self.test_x.find('source').get('frequency'))
		self.phase = float(self.test_x.find('source').get('phase'))
		self.sim_time = float(self.test_x.find('sim').get('duration'))

		#print(self.__str__())

	def __str__(self):
		cad = '+' + '-'*80 + '+'
		cad+= 'Readed: ' + self.filename
		cad+= 'Test_%s loaded' %(self.test_number)
		cad+= '+' + '-'*80 + '+'
