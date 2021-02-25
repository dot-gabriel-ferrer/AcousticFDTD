#coding:utf-8
'''
TFG Acoustics Simulations

PLOTI CLASS

@author: Elías Gabriel Ferrer Jorge

NO FUNCIONA---REVISAR

'''
import numpy     as np
import pyqtgraph as pg
from pyqtgraph.Qt import QtCore, QtGui


class Ploti:
    def __init__(self,data):
        '''Interactive graphics plot 2D

        INPUT
            data -> np.array([[data0] ,[data[1] ,... ,data[n]])
        '''
        self.title = None
        self.data = data
        self.curves= []
        self.c = None

    def __call__(self,title):
        self.title = title


        for i in np.arange(len(self.data)):
            self.curves.append(pg.PlotCurveItem(y=self.data[i],clickable=True))


    def plotClicked(self,curve):
        for i,c in enumerate(self.curves):
            if c is curve:
                c.setPen(width=3)
            else:
                c.setPen(width=1)
            self.c = c
    if __name__ == '__main__':
        import sys
        self.w = pg.plot()
        self.w.setWindowTitle(str(self.title))
        for c in self.curves:
            self.w.addItem(c)
            c.sigClicked.connect(plotClicked)
        if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
            QtGui.QApplication.instance().exec_()
