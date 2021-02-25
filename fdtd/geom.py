#coding:utf-8
'''
@author: Elías Gabriel Ferrer Jorge

TFG Acoustics simulations

GEOMETRY GENERATOR

Generación de mallas para la visualización de la presión
y la velocidad

Para presión -> segmentos +1
Para velocidad-> segmentos +1/2
'''
import numpy as np
import fdtd.readfiles as rd
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import pickle
from pathlib import Path


__VERSION__       = '0.0.0-alpha'
TITLE             = 'GEOM_FDTD'
ROOM_FILE_PATH    = Path('../data/input/geom_input.csv')
OUTPUT_FILE_PATH  = Path('../data/output/geom_output.csv')


#Vertices de la malla
def mesh(archivo,dim):
    dat = rd.vertex(archivo)
    vert = dat[0]

    vertp = vert

# =============================================================================
#     l = np.abs(vert[1][0]-vert[0][0])
#     for i in np.arange(0,len(vert)-1):
#         long = np.abs(vert[i+1][0]-vert[i][0])
#         if long<=l and long !=0:
#             l = long
# =============================================================================
    l = 1. #temporal
    vertvx = (vert[:,0] + l/2.).tolist()
    vertvy = (vert[:,1] + l/2.).tolist()
    vertvz = (vert[:,2] + l/2.).tolist()



    if dim=='2d':
        vert[:,0] = vertvx
        vert[:,1] = vertvy
    if dim=='3d':
        vert[:,0] = vertvx
        vert[:,1] = vertvy
        vert[:,2] = vertvz

    vertv = vert

    print('Datos disponibles:\n')
    print('   vertp: vertices de la malla de presion\n   vertv: vertices de la malla de velocidad\n\n')
    print('Representar meshes:\n')
    print('   scatter()')

    return vertp, vertv, dat[0], l
#malla de presion   -> vertp
#malla de velocidad -> vertv
def scatter(vertp,vertv):
    fig = plt.figure()
    ax = fig.add_subplot(111,projection='3d')
    ax.scatter(vertp[:,0],vertp[:,1],vertp[:,2],'bo')
    ax.scatter(vertv[:,0],vertv[:,1],vertv[:,2],'go')
    plt.ion()
    plt.show()
    return
