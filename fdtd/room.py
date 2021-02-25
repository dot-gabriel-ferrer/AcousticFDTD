#coding:utf-8
'''
TFG Acoustics Simulations

ROOM CLASS

@author Elías Gabriel Ferrer Jorge
'''

import numpy as np
import fdtd.geom as ge
import fdtd.medium as me
#import pickle
from pathlib import Path
#import pandas as pd

__VERSION__       = '0.0.0-alpha'
TITLE             = 'ROOM_FDTD'
ROOM_FILE_PATH    = Path('../data/input/room_input.csv')
OUTPUT_FILE_PATH  = Path('../data/output/room_output.csv')


class Room:
	'''
	Room mesh generator for FDTD Method: Pressure and Velocity mesh and physical
	    parameters in the room.


	'''

	def __init__(self, dims=[1,1,1], dres=0.1, pini=[0,0,0]):
		'''
		INPUTS:

		    dims -> (list of floats) Dimensions of room (x,y,z) [meters]
		            Example: [1.3,1.3,1.3]

		    dres -> (int) Mesh resolution or space between nodes in mesh [meters]
		            Example: 0.1

		    pini -> (list of floats) Initial point in general coordinates (x,y,z) where mesh is created [meters]
		            Example: [0.,0.,0.]
		'''

		self.dims   = np.zeros(len(dims),dtype='int')
		self.dres   = dres
		self.pini   = np.zeros(len(pini),dtype='float')

		for n in range(len(dims)):

			self.dims[n] = int(dims[n]/self.dres)
			self.pini[n] = float(pini[n])

		self.dims_m = self.dims * self.dres #dims in meters
		return

	def __str__(self):
		'''Information of object room
		'''
		cad = '+' + '-'*80 + '+\n'
		cad+= '|'+ ' '*37 + ' Room' + ' '*37 + ' |\n'
		cad+= '+'+'-'*80+'+\n'
		cad+= 'Mesh resolution: %.2f [nodes/m]\n' %(1./self.dres)
		cad+= 'Dimension of mesh: (%.2f x %.2f x %.2f)[m^3]\n' %(self.dims_m[0],self.dims_m[1],self.dims_m[2])
		cad+= 'Total number of nodes: %s\n' %(self.dims[0]*self.dims[1]*self.dims[2])
		cad+= '-'*80 + '\n\n'
		return(cad)

	# def import_blender(self,filename):
	# 	'''
	# 	IN PROCESS...
	#
	# 	Data import from simple parallelogram created in blender with cubic mesh generator
	#
	# 	INPUTS:
	#
	# 	    filename -> (str) Special Export from blender created for this purpose
	# 	'''
	#
	# 	data = ge.mesh(str(self.filename),'3d')
	#
	# 	self.filename = filename
	# 	self.data = data

# ========PENDIENTE DE MIRAR===================================================
#         if np.sum(self.mesh.shape)==0:
#             self.p.append(data[0])
#             self.v.append(data[1])
#         else:
#             raise ValueError('Mesh was created before. Please reset mesh')
# =============================================================================

	# def change_medium(self, medium_name ,c0, cr, ro):
	# 	'''
	# 	Change physical parameters in room
	#
	# 	INPUTS:
	#
	# 		medium_name -> (str) Name of medium defined
	#
	# 		c0     -> (float) Sound velocity in medium [m/s]
	#
	# 		cr     -> (float) Relative velocity Sound [m/s]
	#
	# 		ro     -> (float) Medium density [kg/m3]
	#
	# 	Example:
	# 		change_medium(medium_name = 'water', c0 = 1493 ,cr = 1, ro = 997)
	# 		change_medium(medium_name = 'saltwater', c0 = 1533 ,cr = 1, ro = 1027)
	# 	'''
	#
	# 	if type(medium_name) == str:
	# 		self.medium_name = medium_name
	# 	elif type(medium_name) != str:
	# 		raise ValueError('medium_name type must to be string')
	#
	# 		if c0 == 0:
	# 			raise ValueError('c0 value cannot by 0')
	# 		elif c0 !=0:
	# 			self.c0 = c0
	#
	# 		if type(cr) == int:
	# 			self.cr = cr*np.ones(self.dims, dtype='float')
	# 		else:
	# 			self.cr = cr
	#
	# 	if type(ro) == int:
	# 		self.ro_homogeneous = ro
	# 		self.ro = self.ro_homogeneous * np.ones(self.dims, dtype='float')
	# 	else:
	# 		self.ro_homogeneous = ro
	#
	#
	#
	# 	#Print data of roo,
	# 	#print(self.__str__())
	#
	# def add_wall_density(self, dims_ro, pini_ro, ro):
	# 	'''
	# 	Add Homogeneous density wall
	#
	# 	INPUTS:
	#
	# 		dims_ro -> (list of floats) Dimensions of room (x,y,z) [meters]
	# 			Example: [0.3,0.3,0.3]
	#
	# 		pini_ro -> (list of floats) Initial point in general coordinates (x,y,z) where mesh is created [meters]
	# 			Example: [0.,0.,0.]
	#
	# 		ro      -> ro -> (float or matrix) wall density [kg/m3]
	# 			Example: 150.
	# 	'''
	# 	if ro == 0:
	# 		raise ValueError('ro value cannot by 0')
	# 	else:
	# 		self.dims_ro = np.array(np.array(dims_ro)/self.dres, int)
	# 		self.pini_ro = np.array(np.array(pini_ro)/self.dres, int)
	#
	# 		self.ro[self.pini_ro[0]:self.dims_ro[0]+self.pini_ro[0],self.pini_ro[1]:self.dims_ro[1]+self.pini_ro[1],self.pini_ro[2]:self.dims_ro[2]+self.pini_ro[2]] = ro
