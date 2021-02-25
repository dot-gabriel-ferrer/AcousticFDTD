#coding:utf-8
'''
TFG Acoustics Simulations

MEDIUM CLASS

@author Elías Gabriel Ferrer Jorge
'''

import numpy as np


class Medium:
	'''
	Medium functions:

	    change_medium(co,cr,co)

	    add_wall_density(dims_ro, pini_ro, ro)

	    add_ wall_medium(dims_med, pini_med, c0,cr,ro,) -> In process


	'''
	def __init__(self,room, medium='Air', c0=340., cr0=1., r0h=1.280):
		'''
		Physical parameters:

		    c0 -> (float) Sound velocity in medium

		    cr -> (np.ndarray) Relative velocity Sound mesh

		    ro -> (np.ndarray) Medium density mesh

		    Inital physical parametes in room:

		        Homogeneous medium: Air
		            co = 340.
		            cr = 1 * np.ones(dims, dtype='float')
		            ro = 1.280 * np.ones(dims, dtype='float')
		'''
		self.room = room

		self.medium_name = medium
		self.c0 = c0
		self.cr = cr0*np.ones(self.room.dims, dtype='float')
		self.ro_homogeneous = r0h
		self.ro = self.ro_homogeneous * np.ones(self.room.dims, dtype='float')

	def change_medium(self, medium_name ,c0, cr, ro):
		'''
		Change physical parameters pf medium

		INPUTS:

			medium_name -> (str) Name of medium defined

			c0     -> (float) Sound velocity in medium [m/s]

			cr     -> (float) Relative velocity Sound [m/s]

			ro     -> (float) Medium density [kg/m3]

		Example:
			change_medium(medium_name = 'water', c0 = 1493 ,cr = 1, ro = 997)
			change_medium(medium_name = 'saltwater', c0 = 1533 ,cr = 1, ro = 1027)
		'''

		if type(medium_name) == str:
			self.medium_name = medium_name
		elif type(medium_name) != str:
			raise ValueError('medium_name type must to be string')

			if c0 == 0:
				raise ValueError('c0 value cannot by 0')
			elif c0 !=0:
				self.c0 = c0

			if type(cr) == int:
				self.cr = cr*np.ones(self.room.dims, dtype='float')
			else:
				self.cr = cr

		if type(ro) == int:
			self.ro_homogeneous = ro
			self.ro = self.ro_homogeneous * np.ones(self.room.dims, dtype='float')
		else:
			self.ro_homogeneous = ro

	def add_wall_density(self, dims_ro, pini_ro, ro):
		'''
		Add Homogeneous density wall

		INPUTS:

			dims_ro -> (list of floats) Dimensions of room (x,y,z) [meters]
				Example: [0.3,0.3,0.3]

			pini_ro -> (list of floats) Initial point in general coordinates (x,y,z) where mesh is created [meters]
				Example: [0.,0.,0.]

			ro      -> ro -> (float or matrix) wall density [kg/m3]
				Example: 150.
		'''
		if ro == 0:
			raise ValueError('ro value cannot by 0')
		else:
			self.dims_ro = np.array(np.array(dims_ro)/self.room.dres, int)
			self.pini_ro = np.array(np.array(pini_ro)/self.room.dres, int)

			self.ro[self.pini_ro[0]:self.dims_ro[0]+self.pini_ro[0],self.pini_ro[1]:self.dims_ro[1]+self.pini_ro[1],self.pini_ro[2]:self.dims_ro[2]+self.pini_ro[2]] = ro
	def __str__(self):
		'''Information of medium object
		'''
		cad = '+' + '-'*80 + '+\n'
		cad+= '|'+ ' '*38 + ' Medium' + ' '*38 + ' |\n'
		cad = '+' + '-'*80 + '+\n'
		cad+= 'Medium: %10s\n'%(self.medium_name)
		cad+= 'Sound velocity: co = %.2f [m/s]\n' %(self.c0)
		cad+= 'Homogeneous density: ro = %.2f [Kg/m3]\n' %(self.ro_homogeneous)
		return(cad)
