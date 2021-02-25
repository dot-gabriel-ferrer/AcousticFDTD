#coding:utf-8
'''
TFG Acoustics Simulations

FDTD 3D

@author: Elías Gabriel Ferrer Jorge
'''

import numpy as np
import pickle
from pathlib import Path
import time
import fdtd.datafiles as fl
import fdtd.counter as co
__VERSION__       = '0.0.0-alpha'
TITLE             = 'SIM_FDTD'
ROOM_FILE_PATH    = Path('../data/input/sim_input.csv')
OUTPUT_FILE_PATH  = Path('../data/output/sim_output.csv')

SIM_NO_ERR = 0
SIM_ERR_FREQ = 1
SIM_ERR_RES = 2
SIM_ERR_DIMS = 4


class Sim:
	''' Acoustic propagation solver (FDTD Method)
	'''
	def __init__(self, room, medium, sources, micros, t):
		'''Initialite Sim with Source
		INPUTS:

			room   -> fdtd.room.Room object

			source -> fdtd.source.Source object
		'''
		self.SIM_NO_ERR = 0
		self.SIM_ERR_FREQ = 1
		self.SIM_ERR_RES = 2
		self.SIM_ERR_DIMS = 4

		self.room   = room
		self.medium = medium

		self.sources        = sources
		self.sources_coords = (np.array([sources.coords_n for sources in self.sources])/self.room.dres).astype(int)
		self.source_index   = 0

		self.micros           = micros
		self.micros_coords    = (np.array([mics.coords for mics in self.micros])/self.room.dres).astype(int)
		self.microphone_index = 0

		self.t     = t
		self.cadat = 0

		self.sim_duration = 0
		#Parameters. Courant Coefficient = (c0 * dt) * 1/2 / (np.sqrt(3) * dx)
		self.sc = 0.5
		self.dt = np.sqrt(3)*self.sc*self.room.dres / self.medium.c0
		#self.sc = self.room.c0 * self.dt / self.room.dres/np.sqrt(3)

		# if self.t > self.sc:
		# 	self.status = 1 #
		# 	self.t = self.sc

		self.counter = co.Counter()
		self.save_status = 0
		#self.cprv = self.room.ro * self.room.cr**2 * self.room.c0 * self.sc

		#Data p,vx,vy,vz,ro,cprv
		self.pvro = np.zeros((2,6,self.room.dims[0],self.room.dims[1],self.room.dims[2]),dtype=float)

		self.pvro[:,4] = self.medium.ro
		self.pvro[:,5] = self.pvro[:,4] * self.medium.cr**2 * self.medium.c0 * self.sc

		# #Velocities
		# self.vx = room.v
		# self.vy = room.v
		# self.vz = room.v
		#
		# #
		# self.vxbf = room.v
		# self.vybf = room.v
		# self.vzbf = room.v
		#
		# self.pbf = room.p
		#
		# self.n = 0
		# self.n_1 = 1

		# #Simulation output Data
		# self.data_sim_p = []
		# self.data_sim_v = []

		#Check data avoiding aliasing effects
		self.status = SIM_NO_ERR

		self.check_status()

		for mic in micros:
			mic.steps = int(self.t/self.dt)
			mic.resample()

	def initial_cond(self, data):
		'''Set inital conditions of pressure and velocity meshes as final state of
			data file or explicit data ndarray

			INPUT:
				data: filename (str) or (ndarray) with shape (t,6,dims[0],dims[1],dims[2])

				p    = data[-1,0]
				vx   = data[-1,1]
				vy   = data[-1,2]
				vz   = data[-1,3]
				ro   = data[-1,4]
				cprv = data[-1,5]
		'''

		if type(data) == str:
			data = fl.input(data)
		elif type(data)[1] == 6:
			data = data
		#Pressure
		self.pvro[0,0] = data[-1,0]
		#Velocities
		self.pvro[0,1] = data[-1,1]
		self.pvro[0,2] = data[-1,2]
		self.pvro[0,3] = data[-1,3]
		#Density
		self.pvro[:,4] = data[-1,4]
		#Cprv
		self.pvro[:,5] = data[-1,5]

	# def init_sources(self):
	# 	'''Description of position and state of source on each calculus
	#
	# 	INPUT:
	#
	# 		cord_src    -> (list) cord_src contains the coordinates (x,y,z) of source on each moment
	# 			Example: [[x0,y0,z0], [x1,y1,z1], ...]
	# 	_____________________________________________________________
	# 		spwn_src    -> (listlogic, int) It contains the time information about when the source emites
	# 			when int value is 0 source does not emite
	# 			when int value is 1 source emites
	# 			Example: (0,1,1,0,0,0,0,1,.....,0,0,1,0)
	# 			'''
	#
	# 	self.sources_coords =self.sources_coords/self.room.dres
	def save(self, status):
		'''
		INPUT
			status = 0 -> Run simulation doesn't save datafiles
			status = 1 -> Run simulation save datafiles
		'''
		self.save_status = status

	def init__micro(self,coords_micro):
		# self.spwn_src    = np.ones(int(self.source.duration/self.dt))
		# self.coords_src   = np.ones([int(self.source.duration/self.dt),3])
		#
		# for j in np.arange(len(coords_src)):
		# 	self.coords_src[j] = coords_src

		self.coords_micro = coords_micro

	def init_sources(self,sources):
		'''
		'''
		self.sources = sources
	def set_sc(self,sc):
		'''Set value of Sc, Courant's coefficient
		'''
		self.sc = sc

	def calc(self, cadat):
		'''
		'''

		alfa = 2*self.sc/self.medium.c0 #this parameter is constant in general cases

		for i in range(len(self.sources)):
			self.source_index = i
			self.pvro[self.counter.n,0,self.sources_coords[i,0],self.sources_coords[i,1],self.sources_coords[i,2]] = self.sources[i].tone[self.counter.cont]


		for j in range(len(self.micros)):
			self.microphone_index = j
			self.micros[j].data[self.counter.cont-1] = self.pvro[self.counter.n,0,self.micros_coords[j,0],self.micros_coords[j,1],self.micros_coords[j,2]]

		self.pvro[self.counter.n_1,1] =  self.pvro[self.counter.n,1] - alfa*(np.roll(self.pvro[self.counter.n,0],-1,axis=0)-self.pvro[self.counter.n,0])/(self.pvro[self.counter.n,4]+np.roll(self.pvro[self.counter.n,4],-1,axis=0))

		self.pvro[self.counter.n_1,2] =  self.pvro[self.counter.n,2] - alfa*(np.roll(self.pvro[self.counter.n,0],-1,axis=1)-self.pvro[self.counter.n,0])/(self.pvro[self.counter.n,4]+np.roll(self.pvro[self.counter.n,4],-1,axis=1))

		self.pvro[self.counter.n_1,3] =  self.pvro[self.counter.n,3] - alfa*(np.roll(self.pvro[self.counter.n,0],-1,axis=2)-self.pvro[self.counter.n,0])/(self.pvro[self.counter.n,4]+np.roll(self.pvro[self.counter.n,4],-1,axis=2))

		self.pvro[self.counter.n_1,0] =  self.pvro[self.counter.n,0] - self.pvro[self.counter.n,5]*((self.pvro[self.counter.n_1,1]-np.roll(self.pvro[self.counter.n_1,1],1,axis=0))+(self.pvro[self.counter.n_1,2]-np.roll(self.pvro[self.counter.n_1,2],1,axis=1))+(self.pvro[self.counter.n_1,3]-np.roll(self.pvro[self.counter.n_1,3],1,axis=2)))

		self.counter.swap()

		if self.save_status == 1:
			fl.output('p_'+str(self.counter.cont),self.pvro[self.counter.n,0])
			fl.output('vx_'+str(self.counter.cont),self.pvro[self.counter.n,1])
			fl.output('vy_'+str(self.counter.cont),self.pvro[self.counter.n,2])
			fl.output('vz_'+str(self.counter.cont),self.pvro[self.counter.n,3])



	def check_status(self):
		'''Checking aliasing problems that could appear by frequency of source or mesh resolution
		'''
		self.long_wave = self.medium.c0 / np.array([sources.frequency for sources in self.sources])
		self.dres_min_antialising = self.long_wave/(2 * np.sqrt(3))
		self.frequency_min_antialising = self.medium.c0 / (2*np.sqrt(3)*self.room.dres)

		self.status=SIM_NO_ERR-7
		if (np.array([sources.frequency for sources in self.sources]) <= self.frequency_min_antialising).any():
			self.status+=SIM_ERR_FREQ     # SIM_ERR_FREQ
		if (self.room.dres <= self.dres_min_antialising).any():
			self.status+=SIM_ERR_RES
		if (self.room.dims[0] or self.room.dims[1] or self.room.dims[2])  >= 4:
			self.status+=SIM_ERR_DIMS

	def __str__(self):
		'''Information of simulation
		'''
		cad=''

		cad+= self.room.__str__()
		cad+= self.medium.__str__()

		for source in self.sources:
			cad+= source.__str__()

		# Simulation
		cad+= '+' + '-'*80+'+\n'
		cad+= '|' + ' '*30 + 'Simulation parameters' + ' '*29 + '|' + '\n'
		cad+= '+' + '-'*80+'+\n'
		cad+= 'Courant Coefficient: %.2f\n' %(self.sc)
		cad+= 'Time simulated: %.2f [s]\n'%(self.t)
		cad+= 'Time step: %.8f [s]\n' %(self.dt)
		cad+= 'Total steps: %i\n' %(self.t/self.dt)
		cad+= 'Time of simulation: %.2f [s]\n' %(self.sim_duration)
		cad+= '-'*80 + '\n\n'
		return(cad)

	# def check(self):
	# 	'''Checking aliasing problems that could appear by frequency of source or mesh resolution
	# 	'''
	#
	# 	self.long_wave = self.room.c0 / self.source.frequency
	# 	self.dres_min_antialising = self.long_wave/(2 * np.sqrt(3))
	# 	self.frequency_min_antialising = self.room.c0 / (2*np.sqrt(3)*self.room.dres)
	#
	# 	if self.source.frequency <= self.frequency_min_antialising:
	# 		self.securityparameter_freq = True
	# 	elif  self.source.frequency >= self.frequency_min_antialising:
	# 		self.securityparameter_freq = False
	#
	# 	if self.room.dres <= self.dres_min_antialising:
	# 		self.securityparameter_dres = True
	# 	elif self.room.dres >= self.dres_min_antialising:
	# 		self.securityparameter_dres = False
	#
	# 	if (self.room.dims[0] or self.room.dims[1] or self.room.dims[2])  < 4:
	# 		self.security_parametre_dims = False
	# 	elif (self.room.dims[0] or self.room.dims[1] or self.room.dims[2]) >= 4:
	# 		self.security_parametre_dims = True
	#
	#
	#
	# 	if self.securityparameter_freq and self.securityparameter_dres:
	# 		print('#########################')
	# 		print('#Room and source checked#')
	# 		print('#########################')
	# 		print('Frequency of source: %.2f [Hz]' %self.source.frequency)
	# 		print('Room mesh resolution: %.2f [nodes/m]' %self.room.dres)
	# 		print('#########################')
	# 		print('CORRECT VALUES')
	#
	# 	if not(self.securityparameter_freq):
	# 		print('#########################')
	# 		print('#Room and source checked#')
	# 		print('#########################')
	# 		print('Frequency of source: %.2f [Hz]' %self.source.frequency)
	# 		print('Room mesh resolution: %.2f [nodes/m]' %self.room.dres)
	# 		print('#########################')
	# 		print('Minimum Frequency value required to avoid aliasing')
	# 		print('f_min = %.2f [Hz]' %self.frequency_min_antialising)
	#
	# 	if not(self.securityparameter_dres):
	# 		print('#########################')
	# 		print('#Room and source checked#')
	# 		print('#########################')
	# 		print('Frequency of source: %.2f [Hz]' %self.source.frequency)
	# 		print('Room mesh resolution: %.2f [nodes/m]' %self.room.dres)
	# 		print('3########################')
	# 		print('Minimum mesh resolution required to avoid aliasing')
	# 		print('dres_min = %.2f [nodes/m]' %self.dres_min_antialising)
	#
	# 	if not(self.security_parametre_dims):
	# 		print('########################')
	# 		print('Minimum mesh lenght required to complete simulation')
	# 		print('########################')
	# 		print('dims_min = 4 [nodes]')
