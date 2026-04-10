/**
 * AcousticFDTD — 3D Visualization Module using Three.js
 *
 * Provides interactive 3D visualization of the simulation environment
 * with support for rotation, zoom, pan, and real-time pressure field rendering.
 *
 * @author Elías Gabriel Ferrer Jorge
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
        this.sourceMeshes = [];
        this.microphoneMeshes = [];
        this.pressurePoints = null;
        this.wallMeshes = [];

        this.init();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f0f1a);
        this.scene.fog = new THREE.Fog(0x0f0f1a, 5, 15);

        // Camera setup
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
        this.camera.position.set(2, 2, 2);
        this.camera.lookAt(0, 0, 0);

        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        // Controls setup (OrbitControls)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 10;
        this.controls.maxPolarAngle = Math.PI;

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0x00d4ff, 0.5);
        pointLight.position.set(0, 2, 0);
        this.scene.add(pointLight);

        // Grid helper
        const gridHelper = new THREE.GridHelper(5, 20, 0x00d4ff, 0x2a2a4a);
        gridHelper.position.y = -0.001;
        this.scene.add(gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(1);
        this.scene.add(axesHelper);

        // Handle window resize
        window.addEventListener('resize', () => this.onResize());

        // Start animation loop
        this.animate();
    }

    /**
     * Create or update room boundaries
     * @param {number[]} dims - Room dimensions [x, y, z] in meters
     */
    setRoomDimensions(dims) {
        // Remove old room if exists
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
        }

        // Create wireframe box for room boundaries
        const geometry = new THREE.BoxGeometry(dims[0], dims[2], dims[1]);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({
            color: 0x00d4ff,
            linewidth: 2,
            transparent: true,
            opacity: 0.6
        });

        this.roomMesh = new THREE.LineSegments(edges, material);
        this.roomMesh.position.set(dims[0]/2, dims[2]/2, dims[1]/2);
        this.scene.add(this.roomMesh);

        // Add semi-transparent walls
        const wallMaterial = new THREE.MeshPhongMaterial({
            color: 0x16213e,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        const wallMesh = new THREE.Mesh(geometry, wallMaterial);
        wallMesh.position.copy(this.roomMesh.position);
        this.scene.add(wallMesh);

        // Adjust camera to fit room
        const maxDim = Math.max(...dims);
        this.camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
        this.controls.target.set(dims[0]/2, dims[2]/2, dims[1]/2);
        this.controls.update();
    }

    /**
     * Add or update source markers
     * @param {Array} sources - Array of source objects with position
     */
    setSources(sources) {
        // Remove old source meshes
        this.sourceMeshes.forEach(mesh => this.scene.remove(mesh));
        this.sourceMeshes = [];

        sources.forEach(source => {
            const geometry = new THREE.SphereGeometry(0.05, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color: 0xffd700,
                emissive: 0xffd700,
                emissiveIntensity: 0.5
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(source.position[0], source.position[2], source.position[1]);

            // Add glow effect
            const glowGeometry = new THREE.SphereGeometry(0.08, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 0.3
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            mesh.add(glow);

            this.scene.add(mesh);
            this.sourceMeshes.push(mesh);
        });
    }

    /**
     * Add or update microphone markers
     * @param {Array} microphones - Array of microphone objects with position and orientation
     */
    setMicrophones(microphones) {
        // Remove old microphone meshes
        this.microphoneMeshes.forEach(mesh => this.scene.remove(mesh));
        this.microphoneMeshes = [];

        microphones.forEach(mic => {
            // Create microphone body (cylinder)
            const bodyGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 16);
            const bodyMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ff88,
                metalness: 0.6,
                roughness: 0.4
            });

            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

            // Create microphone head (sphere)
            const headGeometry = new THREE.SphereGeometry(0.03, 16, 16);
            const headMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ff88,
                metalness: 0.8,
                roughness: 0.2
            });

            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 0.05;
            body.add(head);

            // Add directional indicator (cone)
            if (mic.pattern && mic.pattern !== 'omni') {
                const coneGeometry = new THREE.ConeGeometry(0.04, 0.08, 16);
                const coneMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff88,
                    transparent: true,
                    opacity: 0.3
                });
                const cone = new THREE.Mesh(coneGeometry, coneMaterial);
                cone.position.y = 0.09;
                cone.rotation.x = Math.PI;
                body.add(cone);
            }

            body.position.set(mic.position[0], mic.position[2], mic.position[1]);

            // Apply orientation if specified
            if (mic.orientation) {
                body.rotation.set(mic.orientation[0], mic.orientation[1], mic.orientation[2]);
            }

            this.scene.add(body);
            this.microphoneMeshes.push(body);
        });
    }

    /**
     * Add wall/obstacle to the scene
     * @param {Object} wall - Wall specification with position, size, rotation
     */
    addWall(wall) {
        const geometry = new THREE.BoxGeometry(wall.size[0], wall.size[2], wall.size[1]);
        const material = new THREE.MeshPhongMaterial({
            color: 0x8b4513,
            transparent: true,
            opacity: 0.7
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(wall.position[0], wall.position[2], wall.position[1]);

        if (wall.rotation) {
            mesh.rotation.set(wall.rotation[0], wall.rotation[1], wall.rotation[2]);
        }

        // Add edges for better visibility
        const edges = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        mesh.add(edgeLines);

        this.scene.add(mesh);
        this.wallMeshes.push(mesh);

        return mesh;
    }

    /**
     * Remove all walls from the scene
     */
    clearWalls() {
        this.wallMeshes.forEach(mesh => this.scene.remove(mesh));
        this.wallMeshes = [];
    }

    /**
     * Update pressure field visualization
     * @param {Object} slice - Pressure field data
     */
    updatePressureField(slice) {
        // This will be implemented to show pressure as colored particles
        // or as a volumetric rendering in the 3D space
        // For now, we'll skip this as it requires more complex shader work
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();

        // Animate source glow
        this.sourceMeshes.forEach((mesh, index) => {
            if (mesh.children[0]) {
                const time = Date.now() * 0.001;
                mesh.children[0].scale.setScalar(1 + Math.sin(time * 3 + index) * 0.2);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     */
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * Export screenshot
     */
    exportScreenshot(filename = 'acoustic-sim-3d.png') {
        this.renderer.render(this.scene, this.camera);
        const dataURL = this.renderer.domElement.toDataURL('image/png');

        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        link.click();
    }

    /**
     * Cleanup
     */
    dispose() {
        this.renderer.dispose();
        this.controls.dispose();
        window.removeEventListener('resize', () => this.onResize());
    }
}
