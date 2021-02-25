# -*- coding: utf-8 -*-

# Form implementation generated from reading ui file 'gui_window.ui'
#
# Created by: PyQt5 UI code generator 5.13.1
#
# WARNING! All changes made in this file will be lost!


from PyQt5 import QtCore, QtGui, QtWidgets
import sys

def launch():
	class mywindow(QtWidgets.QMainWindow):

		def __init__(self):

			super(mywindow, self).__init__()
			self.ui = Ui_MainWindow()
			self.ui.setupUi(self)

	app = QtWidgets.QApplication([])

	application = mywindow()

	application.show()

	sys.exit(app.exec())

class Ui_MainWindow(object):
	def setupUi(self, MainWindow):
		MainWindow.setObjectName("MainWindow")
		MainWindow.resize(801, 626)
		MainWindow.setStyleSheet("font: 9pt \"Roboto\";")
		self.centralwidget = QtWidgets.QWidget(MainWindow)
		self.centralwidget.setObjectName("centralwidget")
		self.treeView = QtWidgets.QTreeView(self.centralwidget)
		self.treeView.setGeometry(QtCore.QRect(0, 0, 191, 311))
		self.treeView.setAnimated(True)
		self.treeView.setObjectName("treeView")
		self.openGLWidget = QtWidgets.QOpenGLWidget(self.centralwidget)
		self.openGLWidget.setGeometry(QtCore.QRect(190, 0, 611, 461))
		self.openGLWidget.setObjectName("openGLWidget")
		self.progressBar = QtWidgets.QProgressBar(self.centralwidget)
		self.progressBar.setGeometry(QtCore.QRect(680, 560, 118, 23))
		self.progressBar.setProperty("value", 24)
		self.progressBar.setObjectName("progressBar")
		MainWindow.setCentralWidget(self.centralwidget)
		self.menubar = QtWidgets.QMenuBar(MainWindow)
		self.menubar.setGeometry(QtCore.QRect(0, 0, 801, 22))
		self.menubar.setObjectName("menubar")
		self.menuoptions = QtWidgets.QMenu(self.menubar)
		self.menuoptions.setObjectName("menuoptions")
		self.menuEditar = QtWidgets.QMenu(self.menubar)
		self.menuEditar.setObjectName("menuEditar")
		self.menuConfiguraci_n = QtWidgets.QMenu(self.menubar)
		self.menuConfiguraci_n.setObjectName("menuConfiguraci_n")
		self.menuVentana = QtWidgets.QMenu(self.menubar)
		self.menuVentana.setObjectName("menuVentana")
		MainWindow.setMenuBar(self.menubar)
		self.statusbar = QtWidgets.QStatusBar(MainWindow)
		self.statusbar.setObjectName("statusbar")
		MainWindow.setStatusBar(self.statusbar)
		self.actionNuevo = QtWidgets.QAction(MainWindow)
		self.actionNuevo.setObjectName("actionNuevo")
		self.actionCargar = QtWidgets.QAction(MainWindow)
		self.actionCargar.setObjectName("actionCargar")
		self.actionGuardar = QtWidgets.QAction(MainWindow)
		self.actionGuardar.setObjectName("actionGuardar")
		self.actionRoom = QtWidgets.QAction(MainWindow)
		self.actionRoom.setObjectName("actionRoom")
		self.actionMedium = QtWidgets.QAction(MainWindow)
		self.actionMedium.setObjectName("actionMedium")
		self.actionSource = QtWidgets.QAction(MainWindow)
		self.actionSource.setObjectName("actionSource")
		self.actionLog = QtWidgets.QAction(MainWindow)
		self.actionLog.setObjectName("actionLog")
		self.menuoptions.addSeparator()
		self.menuoptions.addSeparator()
		self.menuoptions.addAction(self.actionNuevo)
		self.menuoptions.addAction(self.actionCargar)
		self.menuoptions.addAction(self.actionGuardar)
		self.menuEditar.addAction(self.actionRoom)
		self.menuEditar.addAction(self.actionMedium)
		self.menuEditar.addAction(self.actionSource)
		self.menuVentana.addAction(self.actionLog)
		self.menubar.addAction(self.menuoptions.menuAction())
		self.menubar.addAction(self.menuEditar.menuAction())
		self.menubar.addAction(self.menuConfiguraci_n.menuAction())
		self.menubar.addAction(self.menuVentana.menuAction())

		self.retranslateUi(MainWindow)
		QtCore.QMetaObject.connectSlotsByName(MainWindow)

	def retranslateUi(self, MainWindow):
		_translate = QtCore.QCoreApplication.translate
		MainWindow.setWindowTitle(_translate("MainWindow", "MainWindow"))
		self.menuoptions.setTitle(_translate("MainWindow", "Simulation"))
		self.menuEditar.setTitle(_translate("MainWindow", "Edit"))
		self.menuConfiguraci_n.setTitle(_translate("MainWindow", "Configuration"))
		self.menuVentana.setTitle(_translate("MainWindow", "View"))
		self.actionNuevo.setText(_translate("MainWindow", "New"))
		self.actionCargar.setText(_translate("MainWindow", "Load"))
		self.actionGuardar.setText(_translate("MainWindow", "Save"))
		self.actionRoom.setText(_translate("MainWindow", "Room"))
		self.actionMedium.setText(_translate("MainWindow", "Medium"))
		self.actionSource.setText(_translate("MainWindow", "Source"))
		self.actionLog.setText(_translate("MainWindow", "Log"))
