#coding:utf-8
'''
28 Marzo 2019
----------------------------------------
@author: Elías Gabriel Ferrer Jorge

TFG - Geometría

Lectura de fichero 'Vertices.txt' creado con script de blender
para la obtención de Vertices del modelado.

Input:
        Fichero.txt -> lists

Output:
        Vertexlist -> array / float

Nota: hay que multiplicar los datos que se van a usar
    por la escala escogida en blender.
'''
import numpy as np


def vertex(archivo):
    lineas = open("meshes/"+ archivo +".txt").readlines()
    l = [[m.strip() for m in n] for n in [linea.split(" ") for linea in lineas]]
    vertexlist = []
    for i in np.arange(2,len(l),2):
        vertexlist.append(l[i])

    for i in np.arange(0,len(vertexlist)):
        for j in np.arange(0,3):
            vertexlist[i][j] = float(vertexlist[i][j])

    vertexlist= np.array(vertexlist)
    n = 0
    for i in np.arange(0,len(vertexlist)-1):
        if i>=1:
            if all(vertexlist[i][0:2] == vertexlist[i+1][0:2]):
                n+= 1
        if n ==0:
            n = 1
    return vertexlist, n
