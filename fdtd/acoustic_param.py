#coding:utf-8
'''
TFG Acoustics Simulations

Acoustic parameters calculating tools
https://newt.phys.unsw.edu.au/jw/z.html
https://www.animations.physics.unsw.edu.au/jw/sound-impedance-intensity.htm

@author Elías Gabriel Ferrer Jorge
'''
import numpy as np

def v(vx,vy,vz):
	'''Calculate v = sqrt(vx^2 + vy^2 + vz^2)
	'''
	v = np.sqrt(vx,vy,vz)
	return v

def U(type='spherical', area = 0, vx = 0, vy = 0, vz = 0):
	'''Consider a  wave passing through an surface with an area
	then we have a flux U through this surface.
		type of surface can be set as:
			type = 'spherical'
			type = 'cylindrical'

			for example
	'''

	U = A * (vx + vy + vz)

	print('flux through '+type +' surface')

	return U

def intensity(p, rho, c):
	'''Sound intensity
	INPUT
		p
		rho
		c

	OUTPUT
		I : Sound intensity

		*******************************
		I = p^2/(2Z) [W/m^2]

		p: Sound pressure [Pa]
		Z: Sound impedance -> Z = rho * c
			rho = medium density [Kg/m^3]
			c   = sound velocity [m/s]
	'''
	# p = data...
	# rho = data...
	# c = data...

	I = p**2/(rho*c)

	return I

def inst_intensity(p,v):
	'''Instantaneous Intensity
		I_inst = p * v
		where v = sqrt(vx^2 + vy^2 + vz^2)
	'''

	I_inst = p * v

	return I_inst

def lvl_sound_pressure(P1):
	'''
	INPUT
		data -> P1 [Pa]
	OUTPUT
		L_P : level of sound Pressure [dB]

		******************************
		L_P = 20 * log10(P1/P2) [dB]

		P1 : Sound pressure acquired
		P2 : Sound pressure of reference -> P2 = 20 [micro Pa]
	'''
	#P1 = data...
	P2 = 20 * 10**-6

	L_P = 20 * np.log10(P1/P2)

	return L_P

def impedance_z_sp(p,v):
	'''Specific impedance z
		z_sp = p/v
	'''
	z_sp = p/v

	return z_sp

def impedance_z(p,U):
	'''z is the ratio of acoustic pressure p to acoustic volume flow U
		z = p/U
	'''
	z = p/U

	return z

def data_conv_impulse(impulse_response,data):
	'''Convolution of data with impulse response function
	'''
	
