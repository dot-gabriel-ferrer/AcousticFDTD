/**
 * AcousticFDTD -- 3D Visualization Module using Three.js
 *
 * Provides interactive 3D visualization of the simulation environment
 * with support for rotation, zoom, pan, and real-time pressure field rendering.
 *
 * Coordinate mapping: FDTD(X,Y,Z) -> Three.js(X,Z,Y)
 *   FDTD Z (height) maps to Three.js Y (up)
 *   FDTD Y (depth)  maps to Three.js Z (depth)
 *
 * @author Elias Gabriel Ferrer Jorge
 */

"use strict";

class Visualizer3D {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.roomMesh = null;
        this.roomWallMesh = null;
        this.sourceMeshes = [];
        this.microphoneMeshes = [];
        this.pressurePlane = null;
        this.pressureTexture = null;
        this.pressureCanvas = null;
        this.wallMeshes = [];
        this.axisLabels = [];
        this.gridHelper = null;
        this.roomDims = [1, 1, 1];
        this._resizeHandler = null;
        this._animFrameId = null;
        this._initFailed = false;

        this.init();
    }

    init() {
        // Guard against missing Three.js
        if (typeof THREE === 'undefined') {
            this._initFailed = true;
            this._showFallback("Three.js library not loaded. Check network connection.");
            return;
        }

        try {
            // Scene setup
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0a0a14);
            this.scene.fog = new THREE.FogExp2(0x0a0a14, 0.15);

            // Camera setup
            const w = this.container.clientWidth || 600;
            const h = this.container.clientHeight || 400;
            const aspect = w / h;
            this.camera = new THREE.PerspectiveCamera(55, aspect, 0.05, 50);
            this.camera.position.set(2.2, 1.8, 2.2);
            this.camera.lookAt(0.5, 0.5, 0.5);

            // Renderer setup
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                powerPreference: "high-performance"
            });
            this.renderer.setSize(w, h);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.2;
            this.container.appendChild(this.renderer.domElement);

            // Controls setup (OrbitControls)
            if (typeof THREE.OrbitControls === 'undefined') {
                this._showFallback("OrbitControls not loaded. 3D interaction disabled.");
                return;
            }

            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.minDistance = 0.3;
            this.controls.maxDistance = 15;
            this.controls.maxPolarAngle = Math.PI * 0.95;
            this.controls.target.set(0.5, 0.5, 0.5);

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            this.scene.add(ambientLight);

            const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x223344, 0.5);
            this.scene.add(hemiLight);

            const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
            dirLight.position.set(5, 8, 6);
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 1024;
            dirLight.shadow.mapSize.height = 1024;
            this.scene.add(dirLight);

            const fillLight = new THREE.DirectionalLight(0x4488cc, 0.3);
            fillLight.position.set(-3, 2, -4);
            this.scene.add(fillLight);

            // Ground grid
            this.gridHelper = new THREE.GridHelper(6, 30, 0x1a3a5a, 0x111828);
            this.gridHelper.position.y = -0.005;
            this.scene.add(this.gridHelper);

            // Axes helper with labels
            const axesHelper = new THREE.AxesHelper(0.6);
            this.scene.add(axesHelper);
            this._createAxisLabels();

            // Pressure field canvas (for texture)
            this.pressureCanvas = document.createElement('canvas');
            this.pressureCanvas.width = 128;
            this.pressureCanvas.height = 128;

            // Handle window resize (named reference for cleanup)
            this._resizeHandler = () => this.onResize();
            window.addEventListener('resize', this._resizeHandler);

            // Start animation loop
            this.animate();
        } catch (err) {
            this._initFailed = true;
            this._showFallback("3D initialization error: " + err.message);
        }
    }

    _showFallback(message) {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;justify-content:center;' +
            'width:100%;height:100%;color:#667;font-size:0.9rem;text-align:center;padding:2rem;';
        div.textContent = message;
        this.container.appendChild(div);
    }

    _createAxisLabels() {
        const labels = [
            { text: "X", color: 0xff4444, pos: [0.75, 0, 0] },
            { text: "Z", color: 0x44ff44, pos: [0, 0.75, 0] },
            { text: "Y", color: 0x4444ff, pos: [0, 0, 0.75] }
        ];

        labels.forEach(label => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#' + label.color.toString(16).padStart(6, '0');
            ctx.font = 'bold 48px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label.text, 32, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false
            });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(label.pos[0], label.pos[1], label.pos[2]);
            sprite.scale.set(0.2, 0.2, 1);
            this.scene.add(sprite);
            this.axisLabels.push(sprite);
        });
    }

    /**
     * Create or update room boundaries
     * @param {number[]} dims - Room dimensions [x, y, z] in meters (FDTD coords)
     */
    setRoomDimensions(dims) {
        if (this._initFailed) return;

        this.roomDims = dims.slice();

        // Remove old room meshes
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
            this.roomMesh.geometry.dispose();
        }
        if (this.roomWallMesh) {
            this.scene.remove(this.roomWallMesh);
            this.roomWallMesh.geometry.dispose();
            this.roomWallMesh.material.dispose();
        }

        // Map FDTD (X,Y,Z) -> Three.js (X, Z_fdtd, Y_fdtd)
        const gx = dims[0], gy = dims[2], gz = dims[1];

        // Wireframe room box
        const geometry = new THREE.BoxGeometry(gx, gy, gz);
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x00ccee,
            transparent: true,
            opacity: 0.7
        });

        this.roomMesh = new THREE.LineSegments(edges, lineMat);
        this.roomMesh.position.set(gx / 2, gy / 2, gz / 2);
        this.scene.add(this.roomMesh);

        // Semi-transparent walls
        const wallMat = new THREE.MeshPhongMaterial({
            color: 0x0d1b2e,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.roomWallMesh = new THREE.Mesh(geometry.clone(), wallMat);
        this.roomWallMesh.position.copy(this.roomMesh.position);
        this.scene.add(this.roomWallMesh);

        // Add corner markers for visual reference
        this._updateCornerDots(dims);

        // Auto-fit camera if the room changed significantly
        const maxDim = Math.max(gx, gy, gz);
        const camDist = maxDim * 1.6;
        this.camera.position.set(camDist, camDist * 0.8, camDist);
        this.controls.target.set(gx / 2, gy / 2, gz / 2);
        this.controls.update();

        // Update grid size
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }
        const gridSize = Math.ceil(Math.max(gx, gz) * 1.5);
        this.gridHelper = new THREE.GridHelper(gridSize, gridSize * 5, 0x1a3a5a, 0x111828);
        this.gridHelper.position.y = -0.005;
        this.scene.add(this.gridHelper);
    }

    _updateCornerDots(dims) {
        // Small dots at room corners for spatial reference
        // Removed old ones first (tagged by userData)
        this.scene.children
            .filter(c => c.userData && c.userData.isCornerDot)
            .forEach(c => this.scene.remove(c));

        const dotGeo = new THREE.SphereGeometry(0.012, 8, 8);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ccee, transparent: true, opacity: 0.5 });

        const gx = dims[0], gy = dims[2], gz = dims[1];
        const corners = [
            [0, 0, 0], [gx, 0, 0], [0, gy, 0], [0, 0, gz],
            [gx, gy, 0], [gx, 0, gz], [0, gy, gz], [gx, gy, gz]
        ];

        corners.forEach(pos => {
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(pos[0], pos[1], pos[2]);
            dot.userData.isCornerDot = true;
            this.scene.add(dot);
        });
    }

    /**
     * Add or update source markers
     * @param {Array} sources - Array of source objects with position [x,y,z] in FDTD coords
     */
    setSources(sources) {
        if (this._initFailed) return;

        // Remove old source meshes
        this.sourceMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.sourceMeshes = [];

        sources.forEach(source => {
            // Source sphere
            const geometry = new THREE.SphereGeometry(0.04, 24, 24);
            const material = new THREE.MeshPhongMaterial({
                color: 0xffd700,
                emissive: 0xcc8800,
                emissiveIntensity: 0.6,
                shininess: 80
            });

            const mesh = new THREE.Mesh(geometry, material);
            // Map FDTD (x,y,z) -> Three.js (x, z, y)
            mesh.position.set(
                source.position[0],
                source.position[2],
                source.position[1]
            );

            // Glow rings (wave radiation indicator)
            for (let r = 0; r < 3; r++) {
                const ringGeo = new THREE.RingGeometry(0.06 + r * 0.03, 0.065 + r * 0.03, 32);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: 0xffd700,
                    transparent: true,
                    opacity: 0.25 - r * 0.07,
                    side: THREE.DoubleSide
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.userData.ringIndex = r;
                mesh.add(ring);
            }

            // Point light at source position
            const srcLight = new THREE.PointLight(0xffaa00, 0.3, 1.5);
            mesh.add(srcLight);

            this.scene.add(mesh);
            this.sourceMeshes.push(mesh);
        });
    }

    /**
     * Add or update microphone markers
     * @param {Array} microphones - Array of mic objects with position [x,y,z] in FDTD coords
     */
    setMicrophones(microphones) {
        if (this._initFailed) return;

        // Remove old
        this.microphoneMeshes.forEach(mesh => {
            this.scene.remove(mesh);
        });
        this.microphoneMeshes = [];

        microphones.forEach(mic => {
            const group = new THREE.Group();

            // Body (cylinder)
            const bodyGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.1, 16);
            const bodyMat = new THREE.MeshPhongMaterial({
                color: 0x00ee88,
                shininess: 60
            });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            group.add(body);

            // Head (sphere)
            const headGeo = new THREE.SphereGeometry(0.028, 16, 16);
            const headMat = new THREE.MeshPhongMaterial({
                color: 0x00ffaa,
                shininess: 100
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 0.06;
            group.add(head);

            // Base stand ring
            const baseGeo = new THREE.TorusGeometry(0.03, 0.006, 8, 16);
            const baseMat = new THREE.MeshPhongMaterial({ color: 0x00cc66 });
            const base = new THREE.Mesh(baseGeo, baseMat);
            base.rotation.x = Math.PI / 2;
            base.position.y = -0.05;
            group.add(base);

            // Directional cone for non-omni patterns
            if (mic.pattern && mic.pattern !== 'omni') {
                const coneGeo = new THREE.ConeGeometry(0.035, 0.07, 16);
                const coneMat = new THREE.MeshBasicMaterial({
                    color: 0x00ee88,
                    transparent: true,
                    opacity: 0.2,
                    wireframe: true
                });
                const cone = new THREE.Mesh(coneGeo, coneMat);
                cone.position.y = 0.1;
                group.add(cone);
            }

            // Map FDTD (x,y,z) -> Three.js (x, z, y)
            group.position.set(
                mic.position[0],
                mic.position[2],
                mic.position[1]
            );

            this.scene.add(group);
            this.microphoneMeshes.push(group);
        });
    }

    /**
     * Add wall/obstacle to the scene
     * @param {Object} wall - Wall specification with position, size, rotation (FDTD coords)
     */
    addWall(wall) {
        if (this._initFailed) return null;

        const geometry = new THREE.BoxGeometry(wall.size[0], wall.size[2], wall.size[1]);
        const material = new THREE.MeshPhongMaterial({
            color: 0x6b3a1f,
            transparent: true,
            opacity: 0.7,
            shininess: 20
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(wall.position[0], wall.position[2], wall.position[1]);

        if (wall.rotation) {
            mesh.rotation.set(wall.rotation[0], wall.rotation[1], wall.rotation[2]);
        }

        const edges = new THREE.EdgesGeometry(geometry);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xcccccc });
        mesh.add(new THREE.LineSegments(edges, edgeMat));

        this.scene.add(mesh);
        this.wallMeshes.push(mesh);
        return mesh;
    }

    clearWalls() {
        this.wallMeshes.forEach(mesh => this.scene.remove(mesh));
        this.wallMeshes = [];
    }

    /**
     * Update pressure field as a colored plane in the 3D scene.
     * @param {Object} slice - { data: Float64Array, width: number, height: number }
     * @param {string} plane - 'xy' | 'xz' | 'yz'
     * @param {number} sliceIdx - Slice index along the normal axis
     * @param {number[]} dims - Room dimensions [x,y,z] in meters
     * @param {number[]} gridSize - Grid size [nx, ny, nz]
     */
    updatePressureField(slice, plane, sliceIdx, dims, gridSize) {
        if (this._initFailed || !slice || !slice.data) return;

        const { data, width, height } = slice;

        // Size the canvas to match the slice dimensions (clamped)
        const cw = Math.min(width, 256);
        const ch = Math.min(height, 256);

        if (this.pressureCanvas.width !== cw || this.pressureCanvas.height !== ch) {
            this.pressureCanvas.width = cw;
            this.pressureCanvas.height = ch;
        }

        const ctx = this.pressureCanvas.getContext('2d');
        const imgData = ctx.createImageData(cw, ch);

        // Find max for normalization
        let maxVal = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > maxVal) maxVal = a;
        }
        if (maxVal < 1e-20) maxVal = 1e-20;

        // Sample the data onto the canvas
        const scaleX = width / cw;
        const scaleY = height / ch;

        for (let py = 0; py < ch; py++) {
            for (let px = 0; px < cw; px++) {
                const gx = Math.min(Math.floor(px * scaleX), width - 1);
                const gy = Math.min(Math.floor(py * scaleY), height - 1);
                const val = data[gx + gy * width];
                const nv = Math.max(-1, Math.min(1, val / maxVal));

                let r, g, b;
                if (nv >= 0) {
                    r = Math.floor(255 * nv);
                    g = Math.floor(40 * nv);
                    b = Math.floor(15 * (1 - nv));
                } else {
                    r = Math.floor(15 * (1 + nv));
                    g = Math.floor(40 * (-nv));
                    b = Math.floor(255 * (-nv));
                }

                const idx = (py * cw + px) * 4;
                imgData.data[idx] = r;
                imgData.data[idx + 1] = g;
                imgData.data[idx + 2] = b;
                imgData.data[idx + 3] = 180;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        // Create or update texture
        if (!this.pressureTexture) {
            this.pressureTexture = new THREE.CanvasTexture(this.pressureCanvas);
            this.pressureTexture.minFilter = THREE.LinearFilter;
            this.pressureTexture.magFilter = THREE.LinearFilter;
        } else {
            this.pressureTexture.needsUpdate = true;
        }

        // Create or reposition the plane mesh
        if (this.pressurePlane) {
            this.scene.remove(this.pressurePlane);
            this.pressurePlane.geometry.dispose();
            this.pressurePlane.material.dispose();
        }

        // Map the slice to the correct 3D position/orientation
        let planeW, planeH, posX, posY, posZ, rotX, rotY, rotZ;
        const dx = dims[0], dy = dims[1], dz = dims[2];
        const nx = gridSize[0], ny = gridSize[1], nz = gridSize[2];

        if (plane === 'xy') {
            planeW = dx; planeH = dy;
            posX = dx / 2;
            posY = (sliceIdx / Math.max(1, nz - 1)) * dz;
            posZ = dy / 2;
            rotX = -Math.PI / 2;
            rotY = 0;
            rotZ = 0;
        } else if (plane === 'xz') {
            planeW = dx; planeH = dz;
            posX = dx / 2;
            posY = dz / 2;
            posZ = (sliceIdx / Math.max(1, ny - 1)) * dy;
            rotX = 0;
            rotY = 0;
            rotZ = 0;
        } else {
            planeW = dy; planeH = dz;
            posX = (sliceIdx / Math.max(1, nx - 1)) * dx;
            posY = dz / 2;
            posZ = dy / 2;
            rotX = 0;
            rotY = Math.PI / 2;
            rotZ = 0;
        }

        const planeGeo = new THREE.PlaneGeometry(planeW, planeH);
        const planeMat = new THREE.MeshBasicMaterial({
            map: this.pressureTexture,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.pressurePlane = new THREE.Mesh(planeGeo, planeMat);
        this.pressurePlane.position.set(posX, posY, posZ);
        this.pressurePlane.rotation.set(rotX, rotY, rotZ);
        this.scene.add(this.pressurePlane);
    }

    /**
     * Remove the pressure field plane from the scene
     */
    clearPressureField() {
        if (this.pressurePlane) {
            this.scene.remove(this.pressurePlane);
            this.pressurePlane.geometry.dispose();
            this.pressurePlane.material.dispose();
            this.pressurePlane = null;
        }
    }

    /**
     * Animation loop
     */
    animate() {
        this._animFrameId = requestAnimationFrame(() => this.animate());

        if (!this.controls || !this.renderer) return;

        this.controls.update();

        // Animate source markers
        const time = Date.now() * 0.001;
        this.sourceMeshes.forEach((mesh, index) => {
            // Pulse the glow rings
            mesh.children.forEach(child => {
                if (child.userData && child.userData.ringIndex !== undefined) {
                    const ri = child.userData.ringIndex;
                    const phase = time * 4 + index + ri * 0.8;
                    const s = 1 + Math.sin(phase) * 0.3;
                    child.scale.setScalar(s);
                    child.material.opacity = 0.2 + Math.sin(phase) * 0.1;
                }
            });
        });

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     */
    onResize() {
        if (!this.camera || !this.renderer) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Export screenshot
     */
    exportScreenshot(filename) {
        if (!this.renderer) return;
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename || 'acoustic-sim-3d.png';
        link.click();
    }

    /**
     * Cleanup all resources
     */
    dispose() {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.controls) {
            this.controls.dispose();
        }
        if (this.pressureTexture) {
            this.pressureTexture.dispose();
        }
    }
}
