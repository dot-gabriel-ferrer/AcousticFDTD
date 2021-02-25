#coding:utf-8
'''
TFG Acoustics Simulations

Writer of files output data of simulation

@author: Elías Gabriel Ferrer Jorge
'''
import numpy as np
import sys
import os
import csv

import fdtd.sim as si


def output(filename,data, folder='sim_data'):
	'''
	'''
	#sys.path.append('test_fdtd/data/output')
	np.save(os.path.join('test_fdtd/data/'+str(folder), str(filename)),data)

def input(filename, folder = 'sim_data'):
	'''
	'''
	#sys.path.append('test_fdtd/data/input')
	return np.load(os.path.join('test_fdtd/data/'+str(folder), str(filename) + '.npy'))

#def count_files():

def record(microphone_label, data, folder='micro_data'):
	'''
	'''
	np.save(os.path.join('test_fdtd/data/'+str(folder), str(microphone_label)),data)

def save_number(filename,data):
	f = open(str(filename+'.txt'),'wt')
	f.write(str(data))
	f.close()
def read_number(filename):
	f = open(str(filename),'r')
	number = int(f.read())
	f.close()
	return number
