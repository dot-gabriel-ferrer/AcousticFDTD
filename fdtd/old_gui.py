#coding:utf-8
'''
TFG Acoustics Simulations

GUI CLASS

@author: Elías Gabriel Ferrer Jorge

'''
import numpy as np
from pyqtgraph.Qt import QtCore, QtGui
import pyqtgraph.opengl as gl

class Gui:
    def __init__(self,room,sim):
        '''Start GUI

			INPUT:
			from room
				mesh_coords  -> np.array([[x0,y0,z0], [x1,y1,z1], ..., [xn,yn,zn]])
			from sim
				mesh_value   -> np.array([[p0], [p1], ..., [pn]])
        '''
        self.room        = room
        self.mesh_coords = self.room.coords

        self.sim         = sim
        self.p_data      = np.array(self.sim.data_sim_p)
        #self.v_data      = self.sim.data_sim_v/np.abs(np.array(self.sim.data_sim_v)).max()

        self.size        = np.ones((len(self.mesh_coords)))*self.room.dres
        self.color       = np.zeros((len(self.p_data[0]),4),dtype='float')
        self.s = np.arange(len(self.p_data))

        self.i = 0

        self.frame = gl.GLScatterPlotItem(pos=self.mesh_coords*10, size=self.size, pxMode=False)
        self.frame.translate(-10/2.,-10/2.,0)

        w   = gl.GLViewWidget()

        w.opts['distance'] = 20

        w.show()
        w.setWindowTitle('TFG: SIMULATION')#PONER NOMBRE DE SIM

        g = gl.GLGridItem()
        w.addItem(g)

        w.addItem(self.frame)

#UPDATE DATA __CALL__ FUNCTION IN PROCESS...
    def update(self):
        condition1_i = np.mod(self.p_data[self.i],1) > 0
        condition2_i = np.mod(self.p_data[self.i],1) < 0

        p1 = np.extract(self.p_data[self.i]==self.p_data[self.i],self.p_data[self.i])*self.room.dres
        #p2 = np.extract(condition2_i,self.p_data[self.i])

        self.frame.setData(size = self.size+p1)
        #self.frame.setData(size = p2)

        if self.i<len(self.p_data):
            self.i+=1


    t = QtCore.QTimer()
    t.timeout.connect(update)
    t.start(1)

    # def run(self):
    #     app = QtGui.QApplication([])
    #     app.exec_()



    if __name__ == '__main__':
        app = QtGui.QApplication([])
        app.exec_()
        import sys
        if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
            QtGui.QApplication.instance().exec_()
