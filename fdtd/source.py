#coding:utf-8
'''
TFG Acoustics Simulations

Sources of sound

@author: Elías Gabriel Ferrer Jorge
'''
import numpy as np
from scipy import signal
from pathlib import Path
import fdtd.room as ro
import fdtd.counter as co

__VERSION__       = '0.0.0-alpha'
TITLE             = 'SOURCE_FDTD'
ROOM_FILE_PATH    = Path('../data/input/source_input.wav')
OUTPUT_FILE_PATH  = Path('../data/output/source_output.wav')

class Source:
	'''
	Punctual isotropic Sources of pressure
	'''
	def __init__(self, amplitude = 20*10**-6, sample_rate=44100, t0 = 0, duration=1, frequency=980, phase=0, coords_0 = [0.5,0.5,0.5], v = [0.,0.,0.]):
		'''
		INPUTS:
			sample_rate -> (int)     Samples per second [samples/s]
			t0          -> (float)   Initial time of source [s]
			duration    -> (float)   Duration of source [s]
			frequency   -> (float)   Frequency of tone [Hz]
			phase       -> (float)   Phase of wave of source [rad]
			coords      -> (ndarray) Coordinates (x,y,z) of source [m]

		'''
		self.type_source   = 'Punctual isotropic Source of pressure'
		self.amplitude     = amplitude
		self.sample_rate   = sample_rate
		self.frequency     = frequency
		self.t0            = t0
		self.duration      = duration
		self.phase         = phase

		self.coords_0      = np.array(coords_0)
		self.coords_n      = np.array(coords_0)

		self.v             = np.array(v)

		self.t             = np.arange(self.t0,self.duration+self.t0,1./self.sample_rate)
		self.tone          = self.amplitude * np.sin(2*np.pi * self.frequency*self.t + self.phase)

	def __call__(self, t):
		''' This obtain pressure of source at its own time t [s]
		'''
		self.coords_n = self.coords_0 + self.v * t
		return self.amplitude * np.sin(2 * np.pi * self.frequency * t + self.phase)

	def retone(self,duration,dt):
		'''
		'''
		self.sample_rate = 1/dt
		self.duration = duration
		self.t             = np.arange(self.t0,self.duration+self.t0,1./self.sample_rate)
		self.tone = self.amplitude * np.sin(2*np.pi * self.frequency*self.t + self.phase)

	def create_v_in_t(self):
		'''
		'''
		if len(np.shape(self.v)) > 1 and len(np.shape(self.t)) > 0:
			if len(self.v)<len(self.t):
				count = len(self.v)*(self.t[1]-self.t[0])
				n = 0
				v_list = []
				for t in self.t:
					if  t<count:
						v_list.append(self.v[n])
					else:
						count += len(self.v)*(self.t[1]-self.t[0])
						if n==len(self.v)-1:
							v_list.append(self.v[n])
						else:
							n+=1
							v_list.append(self.v[n])

				self.v = np.array(v_list)

	def d_dirac(self,dt):
		'''
		Dirac's delta
			d(x-n)
		'''
		n = int(self.t0/dt)
		x = int(self.duration/dt+1)
		self.tone = signal.unit_impulse(x,n)
		return signal.unit_impulse(x,n)

	def __str__(self):
		'''Information of object source
		'''
		cad = '\n'
		cad+= '+' + '-'*80 + '+\n'
		cad+= '|' + ' '*37  + 'Source' + ' '*37 + '|\n'
		cad+= '+'+'-'*80+'+\n'
		cad+= self.type_source + '\n'
		cad+= 'Sample rate: %s [samples/s]\n' %(str(self.sample_rate))
		cad+= 'Frequency of source: %s [Hz]\n' %(str(self.frequency))
		cad+= 'Duration: %s [s]\n' %(str(self.duration))
		cad+= 'Phase: %s [rad]\n' %(str(self.phase))
		cad+= 'Initial coordinates (x,y,z): %s [m]\n' %(str(self.coords_0))
		cad+= '-'*80 + '\n\n'
		return(cad)
