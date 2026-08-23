/**
 * Cognify - NOAH Ultron 3D Particle Swarm Audio Visualizer
 * Powered by Three.js, InstancedMesh, and UnrealBloomPass
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class UltronParticleCore {
    constructor() {
        this.canvas = document.getElementById('ultronCanvas');
        if (!this.canvas) return;
        this.container = this.canvas.parentElement;
        this.mode = 'idle'; // 'idle', 'speaking', 'listening'
        this.COUNT = 16000;
        this.SPEED_MULT = 1.0;

        // State parameters reactive to NOAH audio & voice states
        this.params = {
            scale: 45,
            rotation: 0.8,
            chaos: 0.6,
            targetScale: 45,
            targetChaos: 0.6,
            targetRotation: 0.8
        };

        // Cursor repulsion state — a 3D ray is cast from the camera through the
        // pointer each frame, and particles near that ray are physically pushed
        // away in 3D space (not just hidden), so the swarm visibly parts around
        // the cursor with real depth.
        this.mouse = new THREE.Vector2(0, 0);
        this.mouseActive = false;
        this.raycaster = new THREE.Raycaster();
        this.REPEL_RADIUS_3D = 9;
        this.REPEL_STRENGTH = 11;
        this._closestPoint = new THREE.Vector3();
        this._pushVec = new THREE.Vector3();

        this.initThree();
        this.initSwarm();
        this.bindPointerEvents();
        this.animate();

        // The container is sized by Tailwind's CDN JIT compiler, which can still be
        // applying styles at construction time — re-measure once layout has settled
        // so the camera isn't left with a stale aspect ratio from an unstyled div.
        requestAnimationFrame(() => this.onWindowResize());

        window.addEventListener('resize', () => this.onWindowResize());
    }

    bindPointerEvents() {
        const updateFromClient = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
            this.mouseActive = true;
        };
        const reset = () => { this.mouseActive = false; };

        this.canvas.addEventListener('mousemove', (e) => updateFromClient(e.clientX, e.clientY));
        this.canvas.addEventListener('mouseleave', reset);
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length) updateFromClient(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        this.canvas.addEventListener('touchend', reset);
    }

    initThree() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || 320;

        // 1. Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x080808, 0.008);

        this.camera = new THREE.PerspectiveCamera(this._fovForAspect(width / height), width / height, 0.1, 2000);
        this.camera.position.set(0, 0, 95);

        // 2. Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // 3. OrbitControls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 1.5;
        this.controls.enableZoom = false;

        // 4. Post Processing (UnrealBloomPass)
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            1.8,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.bloomPass.strength = 1.6;
        this.bloomPass.radius = 0.4;
        this.bloomPass.threshold = 0.05;
        this.composer.addPass(this.bloomPass);

        this.clock = new THREE.Clock();
    }

    initSwarm() {
        this.dummy = new THREE.Object3D();
        this.color = new THREE.Color();
        this.target = new THREE.Vector3();

        // Instance Mesh Tetrahedron Geometry
        this.geometry = new THREE.TetrahedronGeometry(0.22);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.COUNT);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.instancedMesh);

        // Positions buffer array
        this.positions = [];
        for (let i = 0; i < this.COUNT; i++) {
            this.positions.push(new THREE.Vector3(
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 80
            ));
            this.instancedMesh.setColorAt(i, this.color.setHex(0x3b82f6));
        }
    }

    moveToContainer(newContainerId) {
        const targetContainer = document.getElementById(newContainerId);
        if (targetContainer && this.canvas) {
            targetContainer.appendChild(this.canvas);
            this.container = targetContainer;
            setTimeout(() => this.onWindowResize(), 100);
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'speaking') {
            this.params.targetScale = 54;
            this.params.targetChaos = 1.3;
            this.params.targetRotation = 1.4;
            this.bloomPass.strength = 2.4;
        } else if (mode === 'listening') {
            this.params.targetScale = 48;
            this.params.targetChaos = 1.0;
            this.params.targetRotation = 1.8;
            this.bloomPass.strength = 2.0;
        } else {
            // Idle state
            this.params.targetScale = 45;
            this.params.targetChaos = 0.6;
            this.params.targetRotation = 0.8;
            this.bloomPass.strength = 1.6;
        }
    }

    // Trigger Hyper-Drive Particle Swarm Expansion on Login / Portal Launch
    triggerHyperDriveExpansion(onComplete) {
        this.params.targetScale = 90;
        this.params.targetChaos = 2.2;
        this.params.targetRotation = 3.2;
        this.bloomPass.strength = 3.5;

        setTimeout(() => {
            this.setMode('idle');
            if (onComplete) onComplete();
        }, 1400);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime() * this.SPEED_MULT;

        // Smooth parameter interpolation
        this.params.scale += (this.params.targetScale - this.params.scale) * 0.06;
        this.params.chaos += (this.params.targetChaos - this.params.chaos) * 0.06;
        this.params.rotation += (this.params.targetRotation - this.params.rotation) * 0.06;

        // Add dynamic vocal pulse if speaking
        let currentScale = this.params.scale;
        if (this.mode === 'speaking') {
            currentScale += Math.sin(time * 8) * 6 + Math.cos(time * 12) * 4;
        } else if (this.mode === 'listening') {
            currentScale += Math.sin(time * 14) * 3;
        }

        this.controls.update();

        // Cast the cursor ray once per frame (not per particle) using the latest camera.
        if (this.mouseActive) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
        }

        // 3D Particle Swarm Mathematics
        const count = this.COUNT;
        const golden = 2.3999632297;
        const t = time * this.params.rotation;

        for (let i = 0; i < count; i++) {
            const u = i / count;
            const theta = i * golden;
            const y = 1 - 2 * u;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            const ring = Math.floor(i % 7);
            const wave = Math.sin(theta * 9 + time * 3 + y * 12) * this.params.chaos;
            const outer = currentScale * (1 + wave * 0.045);

            let px = x * outer;
            let py = y * outer;
            let pz = z * outer;

            const core = Math.exp(-u * 18);
            px *= 1 - core * 0.35;
            py *= 1 - core * 0.35;
            pz *= 1 - core * 0.35;

            const ca = Math.cos(t * 0.7);
            const sa = Math.sin(t * 0.7);

            const rx = px * ca - pz * sa;
            const rz = px * sa + pz * ca;

            this.target.set(rx, py, rz);

            // Color Palette Modulation — monochrome white/grey at rest, the
            // single orange accent (#FF6901, hue ~0.065) only asserts itself
            // while NOAH is actively speaking, matching the "orange used
            // sparingly for critical moments" rule from the design system.
            const pulse = 0.5 + 0.5 * Math.sin(time * 4 + theta * 3);
            if (this.mode === 'listening') {
                const light = 0.55 + pulse * 0.2;
                this.color.setHSL(0.07, 0.2, light);
            } else if (this.mode === 'speaking') {
                const light = 0.45 + pulse * 0.25;
                this.color.setHSL(0.065, 0.85, light);
            } else {
                const light = 0.55 + pulse * 0.2;
                this.color.setHSL(0.06, 0.06, light);
            }

            this.positions[i].lerp(this.target, 0.1);

            // Cursor repulsion: particles near the 3D ray cast through the pointer
            // are physically displaced away from it, so the swarm parts around the
            // cursor with real depth instead of just fading out.
            let px2 = this.positions[i].x;
            let py2 = this.positions[i].y;
            let pz2 = this.positions[i].z;

            if (this.mouseActive) {
                this.raycaster.ray.closestPointToPoint(this.positions[i], this._closestPoint);
                this._pushVec.subVectors(this.positions[i], this._closestPoint);
                const dist = this._pushVec.length();
                if (dist > 0.0001 && dist < this.REPEL_RADIUS_3D) {
                    const force = this._smoothstep(this.REPEL_RADIUS_3D, 0, dist) * this.REPEL_STRENGTH;
                    this._pushVec.normalize().multiplyScalar(force);
                    px2 += this._pushVec.x;
                    py2 += this._pushVec.y;
                    pz2 += this._pushVec.z;
                }
            }

            this.dummy.position.set(px2, py2, pz2);
            this.dummy.updateMatrix();

            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
            this.instancedMesh.setColorAt(i, this.color);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }

        this.composer.render();
    }

    _smoothstep(edge0, edge1, x) {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // The container is only ever half the viewport width (the landing page's
    // left/right split) but full viewport height, so its aspect ratio is much
    // narrower than a typical full-screen view. THREE.PerspectiveCamera's fov
    // is a VERTICAL angle — horizontal field of view shrinks along with a
    // narrowing aspect ratio, so a fixed fov crops the sphere's left/right
    // edges whenever the window (and so the container) isn't wide relative to
    // its height, e.g. a non-maximized browser window. Widening the vertical
    // fov as aspect drops below 1 keeps the horizontal fov — and so the
    // sphere's full width — constant instead of shrinking.
    _fovForAspect(aspect) {
        const BASE_FOV_DEG = 60;
        if (aspect >= 1) return BASE_FOV_DEG;
        const halfBaseFovRad = THREE.MathUtils.degToRad(BASE_FOV_DEG) / 2;
        const halfFovRad = Math.atan(Math.tan(halfBaseFovRad) / aspect);
        return THREE.MathUtils.radToDeg(halfFovRad) * 2;
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || 320;
        const aspect = width / height;

        this.camera.fov = this._fovForAspect(aspect);
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('ultronCanvas')) {
        window.audioVisualizer = new UltronParticleCore();
    }
});
