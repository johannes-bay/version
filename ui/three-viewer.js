/**
 * Three.js Viewer
 * Professional rendering setup with PBR, environment mapping, and proper lighting
 */

export class ThreeViewer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.modelMesh = null;

    // Light references
    this.hemiLight = null;
    this.keyLight = null;
    this.fillLight = null;
    this.rimLight = null;

    // Orbit control state - start with isometric view from front
    // phi = angle from top (Math.PI/3 ≈ 60° from vertical = 30° from horizontal)
    // theta = horizontal rotation (3*PI/4 = 135° = front-left isometric view)
    this.spherical = { radius: 500, phi: Math.PI / 3, theta: 3 * Math.PI / 4 };
    this.sphericalTarget = { ...this.spherical };
    this.panOffset = { x: 0, y: 0 };
    this.panTarget = { x: 0, y: 0 };
    this.target = { x: 0, y: 40, z: 0 };
    this.isDragging = false;
    this.isPanning = false;
    this.lastMouse = { x: 0, y: 0 };
    this.damping = 0.1;

    // Ortho settings
    this.orthoSize = 200;
    this.orthoSizeTarget = 200;

    // Material settings
    this.materialSettings = {
      color: 0xf0ece4,
      roughness: 0.6,
      metalness: 0.0
    };

    this.init();
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    // Orthographic Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.orthoSize * aspect,
      this.orthoSize * aspect,
      this.orthoSize,
      -this.orthoSize,
      0.1,
      10000
    );

    // Renderer with anti-aliasing
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;  // Default exposure
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    this.setupLights();

    // Shadow catcher ground
    this.setupGround();

    // Controls
    this.setupControls();

    // Handle resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start animation loop
    this.animate();
  }

  setupLights() {
    // Hemisphere light for ambient fill
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.1);
    this.hemiLight.position.set(0, 200, 0);
    this.scene.add(this.hemiLight);

    // Key light - main directional (front-right, above)
    this.keyLight = new THREE.DirectionalLight(0xfffaf0, 0.2);
    this.keyLight.position.set(200, 400, 200);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 50;
    this.keyLight.shadow.camera.far = 1500;
    this.keyLight.shadow.camera.left = -400;
    this.keyLight.shadow.camera.right = 400;
    this.keyLight.shadow.camera.top = 400;
    this.keyLight.shadow.camera.bottom = -400;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.radius = 4;
    this.scene.add(this.keyLight);

    // Fill light - softer, opposite side (front-left)
    this.fillLight = new THREE.DirectionalLight(0xe6f0ff, 0.5);
    this.fillLight.position.set(-200, 200, 150);
    this.scene.add(this.fillLight);

    // Rim light - back lighting for edge definition
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.rimLight.position.set(0, 150, -300);
    this.scene.add(this.rimLight);
  }

  setupGround() {
    // Shadow receiving ground plane
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  setupControls() {
    const canvas = this.renderer.domElement;

    // Mouse down
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
      } else if (e.button === 2) {
        this.isPanning = true;
      }
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    // Mouse move
    canvas.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };

      if (this.isDragging) {
        // Rotate
        this.sphericalTarget.theta -= dx * 0.005;
        this.sphericalTarget.phi -= dy * 0.005;
        // Clamp phi
        this.sphericalTarget.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.sphericalTarget.phi));
      } else if (this.isPanning) {
        // Pan
        const panScale = this.orthoSize * 0.003;
        this.panTarget.x -= dx * panScale;
        this.panTarget.y += dy * panScale;
      }
    });

    // Mouse up
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isPanning = false;
    });
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.isPanning = false;
    });

    // Context menu (prevent on right-click)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this.orthoSizeTarget *= zoomFactor;
      this.orthoSizeTarget = Math.max(5, Math.min(500, this.orthoSizeTarget));
    });

    // Touch support
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        this.isDragging = false;
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this.isDragging) {
        const dx = e.touches[0].clientX - this.lastMouse.x;
        const dy = e.touches[0].clientY - this.lastMouse.y;
        this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        this.sphericalTarget.theta -= dx * 0.005;
        this.sphericalTarget.phi -= dy * 0.005;
        this.sphericalTarget.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.sphericalTarget.phi));
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
          const zoomFactor = lastTouchDist / dist;
          this.orthoSizeTarget *= zoomFactor;
          this.orthoSizeTarget = Math.max(5, Math.min(500, this.orthoSizeTarget));
        }
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.isDragging = false;
      lastTouchDist = 0;
    });
  }

  updateOrthoFrustum() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.left = -this.orthoSize * aspect;
    this.camera.right = this.orthoSize * aspect;
    this.camera.top = this.orthoSize;
    this.camera.bottom = -this.orthoSize;
    this.camera.updateProjectionMatrix();
  }

  onWindowResize() {
    this.updateOrthoFrustum();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  /**
   * Set a pre-built mesh directly (for shader-driven geometry).
   * The mesh manages its own material and geometry.
   */
  clearMesh() {
    if (this.modelMesh) {
      this.scene.remove(this.modelMesh);
      if (!this.modelMesh.userData.preserveGeometry) {
        this.modelMesh.geometry.dispose();
      }
      this.modelMesh = null;
    }
  }

  setMesh(mesh, fitView = false) {
    if (this.modelMesh) {
      this.scene.remove(this.modelMesh);
      if (!this.modelMesh.userData.preserveGeometry) {
        this.modelMesh.geometry.dispose();
      }
    }
    this.modelMesh = mesh;
    this.modelMesh.userData.preserveGeometry = true; // Don't dispose on next swap
    this.scene.add(this.modelMesh);
    if (fitView) this.fitToModel(true);
  }

  updateModel(geometryData, fitView = true, immediateFit = false) {
    // Remove previous mesh
    if (this.modelMesh) {
      this.scene.remove(this.modelMesh);
      if (!this.modelMesh.userData.preserveGeometry) {
        this.modelMesh.geometry.dispose();
      }
      this.modelMesh = null;
    }

    // Create indexed geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryData.positions, 3));

    if (geometryData.indices && geometryData.indices.length > 0) {
      // Wrap in proper BufferAttribute for Three.js r128 compatibility
      const idxArray = Array.isArray(geometryData.indices)
        ? geometryData.indices
        : Array.from(geometryData.indices);
      geometry.setIndex(idxArray);
    }

    // Use provided normals if available, otherwise compute
    if (geometryData.normals && geometryData.normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(geometryData.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    // PBR Material
    const material = new THREE.MeshStandardMaterial({
      color: this.materialSettings.color,
      roughness: this.materialSettings.roughness,
      metalness: this.materialSettings.metalness,
      side: THREE.FrontSide,
      flatShading: false
    });

    this.modelMesh = new THREE.Mesh(geometry, material);
    this.modelMesh.castShadow = true;
    this.modelMesh.receiveShadow = true;
    this.scene.add(this.modelMesh);

    // Auto-fit camera to model
    if (fitView) {
      this.fitToModel(immediateFit);
    }
  }

  /**
   * Fit camera to show the entire model with padding
   * @param {boolean} immediate - If true, snap immediately; otherwise animate smoothly
   * @param {number} padding - Padding multiplier around the model
   */
  fitToModel(immediate = false, padding = 1.3) {
    if (!this.modelMesh) {
      console.warn('fitToModel: no modelMesh');
      return;
    }

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(this.modelMesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Get the maximum dimension
    const maxDim = Math.max(size.x, size.y, size.z);

    // Set target to center of bounding box
    this.target.x = center.x;
    this.target.y = center.y;
    this.target.z = center.z;

    // Reset pan
    this.panTarget.x = 0;
    this.panTarget.y = 0;

    // Set ortho size to fit model with padding
    this.orthoSizeTarget = (maxDim / 2) * padding;

    if (immediate) {
      // Snap immediately (for design type switches)
      this.panOffset.x = 0;
      this.panOffset.y = 0;
      this.orthoSize = this.orthoSizeTarget;
      // Force immediate camera update
      this.updateOrthoFrustum();
    }

    // Update ground position to be at bottom of model
    if (this.ground) {
      this.ground.position.y = box.min.y - 0.5;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Smooth damping for all controls
    this.spherical.theta += (this.sphericalTarget.theta - this.spherical.theta) * this.damping;
    this.spherical.phi += (this.sphericalTarget.phi - this.spherical.phi) * this.damping;
    this.spherical.radius += (this.sphericalTarget.radius - this.spherical.radius) * this.damping;
    this.panOffset.x += (this.panTarget.x - this.panOffset.x) * this.damping;
    this.panOffset.y += (this.panTarget.y - this.panOffset.y) * this.damping;
    this.orthoSize += (this.orthoSizeTarget - this.orthoSize) * this.damping;

    // Update ortho frustum for smooth zoom
    this.updateOrthoFrustum();

    // Calculate camera position from spherical coordinates
    const sinPhi = Math.sin(this.spherical.phi);
    const cosPhi = Math.cos(this.spherical.phi);
    const sinTheta = Math.sin(this.spherical.theta);
    const cosTheta = Math.cos(this.spherical.theta);

    this.camera.position.x = this.target.x + this.spherical.radius * sinPhi * sinTheta + this.panOffset.x;
    this.camera.position.y = this.target.y + this.spherical.radius * cosPhi + this.panOffset.y;
    this.camera.position.z = this.target.z + this.spherical.radius * sinPhi * cosTheta;

    this.camera.lookAt(
      this.target.x + this.panOffset.x,
      this.target.y + this.panOffset.y,
      this.target.z
    );

    this.renderer.render(this.scene, this.camera);
  }

  // View settings methods
  setMaterialColor(hexColor) {
    this.materialSettings.color = hexColor;
    if (this.modelMesh && this.modelMesh.material) {
      this.modelMesh.material.color.set(hexColor);
    }
  }

  setRoughness(value) {
    this.materialSettings.roughness = value;
    if (this.modelMesh && this.modelMesh.material) {
      this.modelMesh.material.roughness = value;
    }
  }

  setMetalness(value) {
    this.materialSettings.metalness = value;
    if (this.modelMesh && this.modelMesh.material) {
      this.modelMesh.material.metalness = value;
    }
  }

  setKeyLightIntensity(value) {
    if (this.keyLight) {
      this.keyLight.intensity = value;
    }
  }

  setAmbientIntensity(value) {
    if (this.hemiLight) {
      this.hemiLight.intensity = value;
    }
  }

  setExposure(value) {
    this.renderer.toneMappingExposure = value;
  }

  setView(viewName) {
    // Preset camera angles (phi = vertical, theta = horizontal)
    const views = {
      front:  { phi: Math.PI / 2, theta: 0 },
      back:   { phi: Math.PI / 2, theta: Math.PI },
      left:   { phi: Math.PI / 2, theta: -Math.PI / 2 },
      right:  { phi: Math.PI / 2, theta: Math.PI / 2 },
      top:    { phi: 0.01, theta: 0 },
      bottom: { phi: Math.PI - 0.01, theta: 0 },
      iso:    { phi: Math.PI / 3, theta: 3 * Math.PI / 4 }
    };

    const view = views[viewName];
    if (view) {
      this.sphericalTarget.phi = view.phi;
      this.sphericalTarget.theta = view.theta;
      // Reset pan when switching views
      this.panTarget.x = 0;
      this.panTarget.y = 0;
    }
  }

  captureThumbnail(width = 160, height = 120) {
    // Store current size
    const currentWidth = this.container.clientWidth;
    const currentHeight = this.container.clientHeight;

    // Create offscreen canvas for thumbnail
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;

    // Create temporary renderer
    const tempRenderer = new THREE.WebGLRenderer({
      canvas: offscreenCanvas,
      antialias: true,
      preserveDrawingBuffer: true
    });
    tempRenderer.setSize(width, height);
    tempRenderer.setPixelRatio(1);
    tempRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    tempRenderer.toneMappingExposure = this.renderer.toneMappingExposure;
    tempRenderer.outputEncoding = THREE.sRGBEncoding;

    // Create temporary orthographic camera with same view
    const aspect = width / height;
    const tempCamera = new THREE.OrthographicCamera(
      -this.orthoSize * aspect,
      this.orthoSize * aspect,
      this.orthoSize,
      -this.orthoSize,
      0.1,
      10000
    );

    // Copy camera position
    tempCamera.position.copy(this.camera.position);
    tempCamera.lookAt(
      this.target.x + this.panOffset.x,
      this.target.y + this.panOffset.y,
      this.target.z
    );

    // Render
    tempRenderer.render(this.scene, tempCamera);

    // Get data URL
    const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.8);

    // Cleanup
    tempRenderer.dispose();

    return dataUrl;
  }

  dispose() {
    if (this.modelMesh) {
      this.modelMesh.geometry.dispose();
      this.modelMesh.material.dispose();
    }
    this.renderer.dispose();
  }
}

export default ThreeViewer;
