#coding:utf-8
'''
TFG Acoustics Simulations

Analysis of simulation read simulation files in data directory

@author: Elías Gabriel Ferrer Jorge
'''

import fdtd.microphone as mc
import fdtd. datafiles as fl
import fdtd.acoustic_param as ap
import fdtd.medium as me
import matplotlib.pyplot as plt
import numpy as np
#ESTOS DATOS HAY QUE LEERLOS DE FUERA
STEPS = fl.read_number('steps.txt')
RHO   = 340.
C     = 1280.
P = []
VX = []
VY = []
VZ = []
for i in range(1,STEPS):
	p = fl.input('p_' + str(i))
	vx = fl.input('vx_' + str(i))
	vy = fl.input('vy_' + str(i))
	vz = fl.input('vz_' + str(i))
	P.append(p)
	VX.append(vx)
	VY.append(vy)
	VZ.append(vz)

p = np.array(P)
vx = np.array(VX)
vy = np.array(VY)
vz = np.array(VZ)
v = np.sqrt(vx**2 + vy**2 + vz**2)

p_dB = ap.lvl_sound_pressure(np.abs(p))

z_sp = ap.impedance_z_sp(p,v)

I_sound = ap.intensity(p,RHO,C)
