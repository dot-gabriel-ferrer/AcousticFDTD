#coding:utf-8
'''
TFG Acoustics Simulations

MICROPHONE CLASS

@author: Elías Gabriel Ferrer Jorge
'''

import numpy as np
import fdtd.datafiles as fl
import os

def read_data_from_file(microphone_number, file_number,folder = 'micro_data'):
	'''
	'''

	return np.load(os.path.join('test_fdtd/data/'+str(folder), 'mic_'+str(microphone_number) + '_' + str(file_number) + '.npy'))

class Microphone:
	'''
	'''
	def __init__(self, samples = 0, micro_label= 'Main Microphone', t0 = 0., sensitivity_dB = 62, snr=1, acoustic_overload= 120 , directionality = None, frequency_response = None, coords = [0.,0.,0.]):
		'''MICROPHONE
			INPUTS
				micro_label: name of microphone (str)

				t0: time for turn on microphone (float) [s]

				adquisition_time: time acquiring data (float) [s]

				sensitivity_dB: value of microphone's response (float) [dB]

				snr: specifies the ratio of a reference signal to the noise level of the microphone output (float) [dB]

				acoustic_overload: maximum noise that can record microphone
								   without distorsion (float) [dB]

				directionality: pattern in which response changes when source
								changes position in space (float) [dB]


			OTHERS
				sensitivity: value of microphone's response (float) [mV/Pa]
				ein: equivalent input noise -> {acoustic_overload - snr}  (float)[dB]
				dynamic_range: range of high quality aquisition's microphone (float)
				thd: total harmonid distorsion is a measurement of the level
					 of distortion on the output signal for a given pure tone
					 input signal (float) [percent%]

		'''

		self.t0                 = t0
		self.sensitivity_dB     = sensitivity_dB
		self.acoustic_overload  = acoustic_overload
		self.directionality     = directionality
		self.frequency_response = frequency_response
		self.coords             = coords
		self.samples            = samples
		self.data               = np.zeros(samples)

	def resample(self):
		'''
		'''
		self.data = np.zeros(self.steps)

	def save_data(self, micro_label, data):
		'''
		'''
		self.data = data
		fl.record(micro_label,self.data)

	def save_data_from_file(self, micro_label, filename):
		'''
		'''
		#VER COMO CONTAR FICHEROS DEL DIRECTORIO
		for ti in range(self.t*self.fs):

			self.data = fl.input(int(ti),folder = 'sim_data')

		fl.record(micro_label,self.data[0,self.coords[0],self.coords[1],self.coords[2]])

	def __str__(self):
		'''
		'''
