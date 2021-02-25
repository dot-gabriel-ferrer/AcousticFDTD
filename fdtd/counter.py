#coding:utf-8
'''
TFG Acoustics Simulations

COUNTER CLASS

@author Elías Gabriel Ferrer Jorge
'''

import numpy as np

class Counter:
	'''
	'''
	def __init__(self):
		self.n = 0
		self.n_1 = 1

		self.cont = 0

	def swap(self):
		'''Swap counter values
			n_1 -> n
			n   -> n_1
		'''
		self.n+=1
		self.n_1+=1

		self.n = self.n%2
		self.n_1 = self.n_1%2

		self.cont +=1
