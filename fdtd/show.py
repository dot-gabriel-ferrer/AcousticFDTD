#coding:utf-8
'''
TFG Acoustics Simulations

Show data with matplotlib in 3d and 2d

@author: Elías Gabriel Ferrer Jorge
'''
import numpy as np
import pickle
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib import cm
from matplotlib.colors import LogNorm
from mpl_toolkits.mplot3d import Axes3D
import fdtd.sim as sm
import fdtd.datafiles as fl
###



__VERSION__       = '0.0.0-alpha'
TITLE             = 'SHOW_FDTD'
ROOM_FILE_PATH    = Path('../data/input/show_input.csv')#-> show input is sim output
#OUTPUT_FILE_PATH  = Path('../data/output/show_output.png') -> tengo dudas con el formato de salida

class Show:
	def __init__(self):
		'''
		'''
		self.count_control = 0
		self.data = None

		self.fig  = None
		self.axes = {}
		self.step = 1
		self.mx  = 0
		self.my  = 0
		self.mz  = 0

		self.fps = 0

	def read_data(self):
		'''
		'''
		fl.input('1')

	def layers(self):
		'''
		'''

		plt.close()

		self.fig = plt.figure()

		self.ax2 = self.fig.add_subplot(332)
		self.ax3 = self.fig.add_subplot(333)
		self.ax4 = self.fig.add_subplot(336)
		self.ax5 = self.fig.add_subplot(313)
		#plot 2D
		self.im2 = self.ax2.imshow(self.data[0,:,:,self.mz], vmin=-0.9, vmax = 0.9, origin='lower')
		self.im3 = self.ax3.imshow(self.data[0,self.mx,:,:], vmin=-0.9, vmax = 0.9, origin='lower')
		self.im4 = self.ax4.imshow(self.data[0,:,self.my,:], vmin=-0.9, vmax = 0.9, origin='lower')
		self.ax2.title.set_text('XY')
		self.ax3.title.set_text('YZ')
		self.ax4.title.set_text('XZ')

		self.count_control+=1

	def sources(self):
		'''
		'''

		self.fig = plt.figure()

		for i in range(len(self.sim.sources.source_label)):
			self.axes



	def set_mx(self,mx = 0):
		'''
		'''
		self.mx = mx

	def set_my(self,my = 0):
		'''
		'''
		self.my = my

	def set_mz(self,mz = 0):
		'''
		'''
		self.mz = mz

		#plot 3D
		#self.ax1.clear()
	def __call__(self):
		'''
		'''
		self.ax2.set_title("XY:%f"%self.step)
		#plot 2D
		self.im3.set_data(self.data[0,:,:,self.mz])
		self.im4.set_data(self.data[0,self.mx,:,:])

		self.fig.canvas.draw()



	# 
	# def set_time(self,t_0):
	# 	'''
	# 	'''
	# 	self.step = t_0 / self.dt
	# 	self.data = fl.input(str(self.step))
	# 	#time_step = 0.1 PENDIENTE DE GENERALIZACION
	#
	# 	#plot 2D
	# 	self.im3.set_data(self.data[0,:,:,self.mz])
	# 	self.im4.set_data(self.data[0,self.mx,:,:])
	# 	self.fig.canvas.draw()
	#
	# def start_anim(self, fps):
	# 	'''
	# 	'''
	# 	self.fps = fps
	# 	self.ax1.clear()
	# 	#plot 2D
	# 	for ti in np.arange(self.step,self.total_n_data):
	# 		self.data = fl.input(str(ti))
	# 		self.ax2.set_title("XY:%d"%ti)
	# 		self.im3.set_data(self.data[0,:,:,self.mz])
	# 		self.im4.set_data(self.data[0,self.mx,:,:])
	# 		self.fig.canvas.draw()
	# 		self.step+=1
	# 		#FALTA GENERALIZAR FPS
	# 		plt.pause(1./fps)
