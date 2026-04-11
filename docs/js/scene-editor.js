// scene-editor.js — Interactive 3D scene editing for AcousticFDTD
// Part of AcousticFDTD Web Simulator

class SceneEditor {
  /**
   * @param {Visualizer3D} viz3d - The 3D visualizer instance
   * @param {App} app - The main App instance
   */
  constructor(viz3d, app) {
    this.viz3d = viz3d;
    this.app = app;
    this.enabled = false;
    this.selected = null;
    this.transformControls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.gridSnap = false;
    this.snapSize = 0.05;
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = 20;
    this._contextMenu = null;
    this._propPanel = null;
    this.editorObjects = [];
    this._contextPos3D = new THREE.Vector3();
    this._longPressTimer = null;

    this._boundOnCanvasClick = this._onCanvasClick.bind(this);
    this._boundOnContextMenu = this._onContextMenu.bind(this);
    this._boundOnKeyDown = this._onKeyDown.bind(this);
    this._boundOnTouchStart = this._onTouchStart.bind(this);
    this._boundOnTouchEnd = this._onTouchEnd.bind(this);
    this._boundHideContext = this._hideContextMenu.bind(this);

    this._initTransformControls();
    this._initContextMenu();
    this._initPropertyPanel();
    this._bindEvents();
  }

  // --- Initialization ---

  _initTransformControls() {
    if (typeof THREE.TransformControls === 'undefined') {
      console.warn('SceneEditor: THREE.TransformControls not available. Drag editing disabled.');
      return;
    }
    this.transformControls = new THREE.TransformControls(
      this.viz3d.camera, this.viz3d.renderer.domElement
    );
    this.transformControls.setSize(0.6);
    this.transformControls.addEventListener('dragging-changed', (e) => {
      if (this.viz3d.controls) {
        this.viz3d.controls.enabled = !e.value;
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      this._onObjectMoved();
    });
    this.viz3d.scene.add(this.transformControls);
    this.transformControls.visible = false;
  }

  _initContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'editor-context-menu';
    menu.style.display = 'none';
    menu.innerHTML = `
      <div class="ctx-item" data-action="add-source">Add Source</div>
      <div class="ctx-item" data-action="add-mic">Add Microphone</div>
      <div class="ctx-item" data-action="add-wall">Add Wall</div>
      <div class="ctx-item" data-action="add-box">Add Box Obstacle</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" data-action="delete">Delete Selected</div>
    `;
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.ctx-item');
      if (item) {
        this._handleContextAction(item.dataset.action);
        this._hideContextMenu();
      }
    });
    document.body.appendChild(menu);
    this._contextMenu = menu;
  }

  _initPropertyPanel() {
    const panel = document.createElement('div');
    panel.className = 'editor-prop-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="prop-header">
        <span>Properties</span>
        <button class="prop-close">&times;</button>
      </div>
      <div class="prop-body"></div>
    `;
    panel.querySelector('.prop-close').addEventListener('click', () => {
      this.deselect();
    });
    // Append to viz panel container
    const vizContainer = this.viz3d.container;
    const parent = vizContainer.closest('.viz-panel') || vizContainer.parentElement;
    if (parent) {
      if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    this._propPanel = panel;
  }

  _bindEvents() {
    const canvas = this.viz3d.renderer.domElement;
    canvas.addEventListener('click', this._boundOnCanvasClick);
    canvas.addEventListener('contextmenu', this._boundOnContextMenu);
    canvas.addEventListener('touchstart', this._boundOnTouchStart, { passive: false });
    canvas.addEventListener('touchend', this._boundOnTouchEnd);
    document.addEventListener('keydown', this._boundOnKeyDown);
    document.addEventListener('click', this._boundHideContext);
  }

  // --- Toggle ---

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.deselect();
      if (this.transformControls) this.transformControls.visible = false;
      this._hideContextMenu();
    }
    return this.enabled;
  }

  // --- Selection ---

  get selectableObjects() {
    // TODO: Ensure Visualizer3D sets userData.isSource, .isMicrophone, .isWall on meshes.
    // If not set, these filters will return empty arrays until integration is done.
    return this.viz3d.scene.children.filter(c =>
      c.userData.isSource || c.userData.isMicrophone ||
      c.userData.isWall || c.userData.isEditorObject
    );
  }

  _onCanvasClick(e) {
    if (!this.enabled) return;
    const rect = this.viz3d.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.viz3d.camera);
    const selectables = this.selectableObjects;
    const intersects = this.raycaster.intersectObjects(selectables, true);

    if (intersects.length > 0) {
      // Walk up to find root selectable
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isSource && !obj.userData.isMicrophone &&
             !obj.userData.isWall && !obj.userData.isEditorObject) {
        obj = obj.parent;
      }
      this.select(obj);
    } else {
      this.deselect();
    }
  }

  select(obj) {
    if (!obj) return;
    this.deselect();
    this.selected = obj;
    // Highlight
    if (obj.material) {
      obj._prevEmissive = obj.material.emissive ? obj.material.emissive.getHex() : 0;
      if (obj.material.emissive) {
        obj.material.emissive.setHex(0x444444);
      }
    }
    // Attach transform controls
    if (this.transformControls) {
      this.transformControls.attach(obj);
      this.transformControls.visible = true;
    }
    this._showProperties(obj);
  }

  deselect() {
    if (this.selected) {
      if (this.selected.material && this.selected.material.emissive) {
        this.selected.material.emissive.setHex(this.selected._prevEmissive || 0);
      }
      this.selected = null;
    }
    if (this.transformControls) {
      this.transformControls.detach();
      this.transformControls.visible = false;
    }
    if (this._propPanel) this._propPanel.style.display = 'none';
  }

  // --- Properties Panel ---

  _showProperties(obj) {
    if (!this._propPanel) return;
    const body = this._propPanel.querySelector('.prop-body');
    let type = 'Object';
    if (obj.userData.isSource) type = 'Source';
    else if (obj.userData.isMicrophone) type = 'Microphone';
    else if (obj.userData.isWall) type = 'Wall';
    else if (obj.userData.isEditorObject) type = 'Editor Object';

    // Three.js → FDTD coordinate mapping: FDTD(x,y,z) = Three(x,z,y)
    const pos = obj.position;
    const fdtdX = pos.x.toFixed(3);
    const fdtdY = pos.z.toFixed(3);
    const fdtdZ = pos.y.toFixed(3);

    body.innerHTML = `
      <div class="prop-row"><span>Type</span><span>${type}</span></div>
      <div class="prop-row"><span>FDTD X</span><span>${fdtdX} m</span></div>
      <div class="prop-row"><span>FDTD Y</span><span>${fdtdY} m</span></div>
      <div class="prop-row"><span>FDTD Z</span><span>${fdtdZ} m</span></div>
    `;
    if (obj.userData.isSource && obj.userData.sourceIndex != null) {
      body.innerHTML += `<div class="prop-row"><span>Index</span><span>${obj.userData.sourceIndex}</span></div>`;
    }
    if (obj.userData.isMicrophone && obj.userData.micIndex != null) {
      body.innerHTML += `<div class="prop-row"><span>Mic #</span><span>${obj.userData.micIndex + 1}</span></div>`;
    }
    this._propPanel.style.display = 'block';
  }

  // --- Object Movement ---

  _onObjectMoved() {
    if (!this.selected) return;
    // Grid snap
    if (this.gridSnap) {
      const p = this.selected.position;
      p.x = Math.round(p.x / this.snapSize) * this.snapSize;
      p.y = Math.round(p.y / this.snapSize) * this.snapSize;
      p.z = Math.round(p.z / this.snapSize) * this.snapSize;
    }
    this._showProperties(this.selected);
    this._syncObjectToApp(this.selected);
  }

  _syncObjectToApp(obj) {
    const pos = obj.position;
    // FDTD coords: x = Three.x, y = Three.z, z = Three.y
    const fdtdPos = [pos.x, pos.z, pos.y];

    if (obj.userData.isSource) {
      // Update source position inputs
      const srcX = document.getElementById('srcX');
      const srcY = document.getElementById('srcY');
      const srcZ = document.getElementById('srcZ');
      if (srcX) srcX.value = fdtdPos[0].toFixed(3);
      if (srcY) srcY.value = fdtdPos[1].toFixed(3);
      if (srcZ) srcZ.value = fdtdPos[2].toFixed(3);
    } else if (obj.userData.isMicrophone && this.app.microphones) {
      const idx = obj.userData.micIndex;
      if (idx != null && this.app.microphones[idx]) {
        this.app.microphones[idx].x = fdtdPos[0];
        this.app.microphones[idx].y = fdtdPos[1];
        this.app.microphones[idx].z = fdtdPos[2];
        if (typeof this.app._renderMicList === 'function') {
          this.app._renderMicList();
        }
      }
    }
  }

  // --- Context Menu ---

  _onContextMenu(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    // Cast ray against ground plane to get 3D position
    const rect = this.viz3d.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.viz3d.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.raycaster.ray.intersectPlane(plane, this._contextPos3D);
    this._showContextMenu(e.clientX, e.clientY);
  }

  _showContextMenu(x, y) {
    if (!this._contextMenu) return;
    this._contextMenu.style.left = x + 'px';
    this._contextMenu.style.top = y + 'px';
    this._contextMenu.style.display = 'block';
    // Enable/disable delete
    const delItem = this._contextMenu.querySelector('[data-action="delete"]');
    if (delItem) {
      delItem.style.opacity = this.selected ? '1' : '0.4';
      delItem.style.pointerEvents = this.selected ? 'auto' : 'none';
    }
  }

  _hideContextMenu() {
    if (this._contextMenu) this._contextMenu.style.display = 'none';
  }

  _handleContextAction(action) {
    const p = this._contextPos3D;
    switch (action) {
      case 'add-source': {
        this._pushUndo({ type: 'add-source' });
        // Update source inputs with new position (FDTD: x=Three.x, y=Three.z, z=Three.y)
        const srcX = document.getElementById('srcX');
        const srcY = document.getElementById('srcY');
        const srcZ = document.getElementById('srcZ');
        if (srcX) srcX.value = p.x.toFixed(3);
        if (srcY) srcY.value = p.z.toFixed(3);
        if (srcZ) srcZ.value = Math.max(p.y, 0).toFixed(3);
        if (typeof this.app._update3DView === 'function') {
          this.app._update3DView();
        }
        break;
      }
      case 'add-mic': {
        this._pushUndo({ type: 'add-mic' });
        if (this.app.microphones && typeof this.app._renderMicList === 'function') {
          const id = this.app.nextMicId != null ? this.app.nextMicId++ : this.app.microphones.length + 1;
          this.app.microphones.push({
            id, x: +p.x.toFixed(3), y: +p.z.toFixed(3), z: +Math.max(p.y, 0).toFixed(3)
          });
          this.app._renderMicList();
          if (typeof this.app._update3DView === 'function') {
            this.app._update3DView();
          }
        }
        break;
      }
      case 'add-wall': {
        this._pushUndo({ type: 'add-wall' });
        if (typeof this.viz3d.addWall === 'function') {
          const wall = this.viz3d.addWall({
            position: { x: p.x, y: Math.max(p.y, 0.05), z: p.z },
            size: [0.1, 0.1, 0.02]
          });
          this.editorObjects.push({ type: 'wall', mesh: wall, data: {} });
        }
        break;
      }
      case 'add-box': {
        this._pushUndo({ type: 'add-box' });
        if (typeof this.viz3d.addWall === 'function') {
          const box = this.viz3d.addWall({
            position: { x: p.x, y: Math.max(p.y, 0.075), z: p.z },
            size: [0.15, 0.15, 0.15]
          });
          this.editorObjects.push({ type: 'box', mesh: box, data: {} });
        }
        break;
      }
      case 'delete': {
        this._deleteSelected();
        break;
      }
    }
  }

  // --- Delete ---

  _deleteSelected() {
    if (!this.selected) return;
    const obj = this.selected;

    if (obj.userData.isMicrophone) {
      if (this.app.microphones && this.app.microphones.length > 1) {
        const idx = obj.userData.micIndex;
        this._pushUndo({ type: 'delete-mic', data: { ...this.app.microphones[idx] }, index: idx });
        this.app.microphones.splice(idx, 1);
        if (typeof this.app._renderMicList === 'function') this.app._renderMicList();
      }
    } else if (obj.userData.isWall || obj.userData.isEditorObject) {
      this._pushUndo({ type: 'delete-wall', mesh: obj });
      this.viz3d.scene.remove(obj);
      if (this.viz3d.wallMeshes) {
        const wi = this.viz3d.wallMeshes.indexOf(obj);
        if (wi >= 0) this.viz3d.wallMeshes.splice(wi, 1);
      }
      const ei = this.editorObjects.findIndex(e => e.mesh === obj);
      if (ei >= 0) this.editorObjects.splice(ei, 1);
    }

    this.deselect();
    if (typeof this.app._update3DView === 'function') this.app._update3DView();
  }

  // --- Undo / Redo ---

  _pushUndo(action) {
    this._undoStack.push(action);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return;
    const action = this._undoStack.pop();
    this._redoStack.push(action);
    // Reverse the action
    switch (action.type) {
      case 'add-mic':
        if (this.app.microphones && this.app.microphones.length > 1) {
          this.app.microphones.pop();
          if (typeof this.app._renderMicList === 'function') this.app._renderMicList();
        }
        break;
      case 'delete-mic':
        if (this.app.microphones) {
          this.app.microphones.splice(action.index, 0, action.data);
          if (typeof this.app._renderMicList === 'function') this.app._renderMicList();
        }
        break;
      case 'add-wall':
      case 'add-box': {
        const last = this.editorObjects.pop();
        if (last && last.mesh) {
          this.viz3d.scene.remove(last.mesh);
          if (this.viz3d.wallMeshes) {
            const idx = this.viz3d.wallMeshes.indexOf(last.mesh);
            if (idx >= 0) this.viz3d.wallMeshes.splice(idx, 1);
          }
        }
        break;
      }
      case 'delete-wall':
        if (action.mesh) {
          this.viz3d.scene.add(action.mesh);
          if (this.viz3d.wallMeshes) this.viz3d.wallMeshes.push(action.mesh);
          this.editorObjects.push({ type: 'wall', mesh: action.mesh, data: {} });
        }
        break;
    }
    this.deselect();
    if (typeof this.app._update3DView === 'function') this.app._update3DView();
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const action = this._redoStack.pop();
    this._undoStack.push(action);
    switch (action.type) {
      case 'add-mic':
        // Re-add mic — approximate by adding default at origin
        if (this.app.microphones && typeof this.app._renderMicList === 'function') {
          const id = this.app.nextMicId != null ? this.app.nextMicId++ : this.app.microphones.length + 1;
          this.app.microphones.push({ id, x: 0.5, y: 0.5, z: 0.1 });
          this.app._renderMicList();
        }
        break;
      case 'delete-mic':
        if (this.app.microphones && action.index < this.app.microphones.length) {
          this.app.microphones.splice(action.index, 1);
          if (typeof this.app._renderMicList === 'function') this.app._renderMicList();
        }
        break;
      case 'delete-wall':
        if (action.mesh) {
          this.viz3d.scene.remove(action.mesh);
          if (this.viz3d.wallMeshes) {
            const idx = this.viz3d.wallMeshes.indexOf(action.mesh);
            if (idx >= 0) this.viz3d.wallMeshes.splice(idx, 1);
          }
        }
        break;
    }
    this.deselect();
    if (typeof this.app._update3DView === 'function') this.app._update3DView();
  }

  // --- Touch ---

  _onTouchStart(e) {
    if (!this.enabled) return;
    this._longPressTimer = setTimeout(() => {
      if (e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        // Simulate click for selection
        this._onCanvasClick({ clientX: t.clientX, clientY: t.clientY });
      }
    }, 500);
  }

  _onTouchEnd() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  // --- Keyboard ---

  _onKeyDown(e) {
    if (!this.enabled) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      this.redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Z') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selected && !e.target.closest('input, textarea, select')) {
        e.preventDefault();
        this._deleteSelected();
      }
    } else if (e.key === 'g' && !e.target.closest('input, textarea, select')) {
      this.gridSnap = !this.gridSnap;
      console.log('Grid snap:', this.gridSnap ? 'ON' : 'OFF');
    }
  }

  // --- Dispose ---

  dispose() {
    const canvas = this.viz3d.renderer.domElement;
    canvas.removeEventListener('click', this._boundOnCanvasClick);
    canvas.removeEventListener('contextmenu', this._boundOnContextMenu);
    canvas.removeEventListener('touchstart', this._boundOnTouchStart);
    canvas.removeEventListener('touchend', this._boundOnTouchEnd);
    document.removeEventListener('keydown', this._boundOnKeyDown);
    document.removeEventListener('click', this._boundHideContext);

    if (this.transformControls) {
      this.viz3d.scene.remove(this.transformControls);
      this.transformControls.dispose();
      this.transformControls = null;
    }
    if (this._contextMenu && this._contextMenu.parentElement) {
      this._contextMenu.parentElement.removeChild(this._contextMenu);
    }
    if (this._propPanel && this._propPanel.parentElement) {
      this._propPanel.parentElement.removeChild(this._propPanel);
    }
    this.editorObjects = [];
    this.selected = null;
  }
}
