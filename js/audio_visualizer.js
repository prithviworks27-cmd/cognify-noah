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

        // prefers-reduced-motion: freezes the idle wave/breathing/spin and the
        // cursor-repulsion physics (both continuous, vestibular-trigger-prone
        // motion) while still letting mode changes (idle/listening/speaking)
        // settle into a new static shape, so the swarm keeps signaling NOAH's
        // state without the ceaseless ambient motion.
        this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        // Follows the same light/dark tokens as the rest of the page —
        // CSS can't reach into a WebGL canvas, so this is done here.
        // Lightness gets inverted per theme (_themedLightness) so bright
        // particles-on-dark become dark particles-on-light, same contrast
        // either way. Bloom is SKIPPED entirely in light mode rather than
        // just recolored: bloom extracts and glows anything above a
        // brightness threshold, and a bright page background exceeds that
        // threshold just as much as a bright particle would, blowing the
        // whole canvas out to solid white. Dark particles don't want a
        // glow anyway — bloom simulates emitted light, which only reads
        // as "glowing" against a dark backdrop.
        this.lightModeQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
        this.isLightMode = !!(this.lightModeQuery && this.lightModeQuery.matches);
        if (this.lightModeQuery) {
            this.lightModeQuery.addEventListener('change', (e) => {
                this.isLightMode = e.matches;
                const themeColor = this.isLightMode ? 0xf5f5f3 : 0x080808;
                if (this.scene) {
                    if (this.scene.fog) this.scene.fog.color.set(themeColor);
                    if (this.scene.background) this.scene.background.set(themeColor);
                }
            });
        }

        // State parameters reactive to NOAH audio & voice states
        this.params = {
            scale: 48,
            rotation: 0.8,
            chaos: 0.6,
            targetScale: 48,
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

        // The canvas is full-page/ambient again rather than confined to a
        // right-hand column, but NOAH should still read as "present on the
        // right" — so the swarm's own center is offset in world space
        // (baked into each particle's target, not the mesh transform, so the
        // cursor raycast — which compares world-space ray against these same
        // local-as-world positions — stays correctly aligned with what's
        // visually under the pointer).
        this.centerOffsetX = 0;

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
        this.scene.fog = new THREE.FogExp2(this.isLightMode ? 0xf5f5f3 : 0x080808, 0.008);
        // Explicit opaque background rather than relying on the canvas's own
        // alpha: true — the bloom composite (dark-mode render path) flattens
        // alpha to opaque black regardless, so an unset background already
        // silently painted black; naming it explicitly keeps light mode
        // (which skips the composite) painting the right color too.
        this.scene.background = new THREE.Color(this.isLightMode ? 0xf5f5f3 : 0x080808);

        this.camera = new THREE.PerspectiveCamera(this._fovForAspect(width / height), width / height, 0.1, 2000);
        // Pulled back further than the original boxed layout (was 95) — the
        // canvas is full-page now, so the sphere needs to read as a smaller
        // ambient presence with room to breathe, not a shape that dominates
        // the frame and crowds the text.
        this.camera.position.set(0, 0, 140);
        this._updateCenterOffset();

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
        // Deliberately off: this orbits the CAMERA around the world origin,
        // but the sphere itself sits off-center at (centerOffsetX, 0, 0) — a
        // different point — so over time it would drag the sphere's on-screen
        // position around instead of keeping it fixed on the right. The
        // sphere's own spin (in the per-particle target math) already makes
        // it feel alive without moving where it sits on screen.
        this.controls.autoRotate = false;
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

        // The last slice of particles are ambient "mist" — scattered once
        // across a volume spanning the whole page (not biased toward the
        // core's right-anchored position), so NOAH's presence reads as
        // atmosphere behind the text too, not just the one sphere shape.
        this.DUST_START = Math.floor(this.COUNT * 0.82);
        this.dustBase = [];
        this.dustSeed = [];
        // Mist is kept out of the sphere's own volume so NOAH reads as one
        // clean, independent shape rather than blending into the ambient
        // particles around it — the two systems share a mesh for efficiency
        // but never actually occupy the same space.
        const sphereExclusionRadius = this.params.targetScale * 1.4;
        for (let i = this.DUST_START; i < this.COUNT; i++) {
            let bx, by, bz, tries = 0;
            do {
                bx = (Math.random() - 0.5) * 300;
                by = (Math.random() - 0.5) * 140;
                bz = (Math.random() - 0.5) * 120;
                tries++;
            } while (
                tries < 20 &&
                Math.hypot(bx - this.centerOffsetX, by, bz) < sphereExclusionRadius
            );
            this.dustBase.push(new THREE.Vector3(bx, by, bz));
            this.dustSeed.push(Math.random() * Math.PI * 2);
        }

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
        if (this.reducedMotion) {
            this.setMode('idle');
            if (onComplete) onComplete();
            return;
        }
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
        const time = this.reducedMotion ? 0 : this.clock.getElapsedTime() * this.SPEED_MULT;

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
        // Skipped under reduced motion — cursor repulsion is exactly the kind
        // of magnetic-physics interaction that must collapse to static.
        if (this.mouseActive && !this.reducedMotion) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
        }

        // 3D Particle Swarm Mathematics
        const count = this.COUNT;
        const golden = 2.3999632297;
        const t = time * this.params.rotation;

        for (let i = 0; i < count; i++) {
            const isDust = i >= this.DUST_START;
            const theta = i * golden;

            if (isDust) {
                // Ambient mist: a slow, tiny wander around its fixed scattered
                // base point — alive, but not organizing into the sphere.
                const base = this.dustBase[i - this.DUST_START];
                const seed = this.dustSeed[i - this.DUST_START];
                this.target.set(
                    base.x + Math.sin(time * 0.15 + seed) * 4,
                    base.y + Math.cos(time * 0.12 + seed) * 4,
                    base.z + Math.sin(time * 0.1 + seed * 2) * 4
                );
                // Dim, quiet grey — background texture, not the main figure.
                this.color.setHSL(0.06, 0.04, this._themedLightness(0.32 + 0.08 * Math.sin(time * 0.5 + seed)));
            } else {
                // NOAH's neural core — a Fibonacci-lattice shell that breathes,
                // ripples with a signal wave, and turns as a rigid body, ported
                // from the brain particle swarm export (brainn.html) onto the
                // same reactive scale/chaos/rotation params driving the rest of
                // this visualizer.
                const u = (i + 0.5) / this.DUST_START;
                const phi = Math.acos(1 - 2 * u);

                const activity = this.params.chaos;
                const complexity = 2.0;
                const turbulence = 1.52;

                const shellRadius = currentScale * (0.65 + 0.35 * Math.sin(theta * complexity + time * activity));

                const x0 = shellRadius * Math.sin(phi) * Math.cos(theta);
                const y0 = shellRadius * Math.cos(phi);
                const z0 = shellRadius * Math.sin(phi) * Math.sin(theta);

                const signal = Math.sin(theta * complexity - time * activity * 6.0) *
                    Math.cos(phi * 5.0 + time * 2.0);
                const wave = 1.0 + 0.12 * signal;

                let px = x0 * wave;
                let py = y0 * wave;
                let pz = z0 * wave;

                px += currentScale * 0.05 * Math.sin(py * 0.08 + time * turbulence);
                py += currentScale * 0.03 * Math.cos(pz * 0.08 - time * turbulence);
                pz += currentScale * 0.05 * Math.sin(px * 0.08 + time * turbulence);

                const ca = Math.cos(t * 0.7);
                const sa = Math.sin(t * 0.7);

                const rx = px * ca - pz * sa;
                const rz = px * sa + pz * ca;

                this.target.set(rx + this.centerOffsetX, py, rz);

                // Color Palette Modulation — monochrome white/grey at rest, the
                // single orange accent (#FF6901, hue ~0.065) only asserts itself
                // while NOAH is actively speaking, matching the "orange used
                // sparingly for critical moments" rule from the design system.
                // (A wide firing-driven hue swing was tried here — swinging
                // blue-to-warm at high saturation — but combined with bloom it
                // read as a muddy multi-color haze rather than a clean glow.)
                const pulse = 0.5 + 0.5 * Math.sin(time * 4 + theta * 3);
                if (this.mode === 'listening') {
                    const light = 0.55 + pulse * 0.2;
                    this.color.setHSL(0.07, 0.2, this._themedLightness(light));
                } else if (this.mode === 'speaking') {
                    const light = 0.45 + pulse * 0.25;
                    this.color.setHSL(0.065, 0.85, this._themedLightness(light));
                } else {
                    const light = 0.55 + pulse * 0.2;
                    this.color.setHSL(0.06, 0.06, this._themedLightness(light));
                }
            }

            this.positions[i].lerp(this.target, 0.1);

            // Cursor repulsion: particles near the 3D ray cast through the pointer
            // are physically displaced away from it, so the swarm parts around the
            // cursor with real depth instead of just fading out.
            let px2 = this.positions[i].x;
            let py2 = this.positions[i].y;
            let pz2 = this.positions[i].z;

            if (this.mouseActive && !this.reducedMotion) {
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

        // Bloom is skipped in light mode — see the constructor comment on
        // isLightMode for why (a bright background exceeds the bloom
        // threshold just as much as a bright particle would).
        if (this.isLightMode) {
            this.renderer.render(this.scene, this.camera);
        } else {
            this.composer.render();
        }
    }

    _smoothstep(edge0, edge1, x) {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // Every particle lightness value in animate() is authored for the dark
    // theme (bright particles on a near-black page). Flipping it around the
    // midpoint for light mode preserves the same contrast against the
    // near-white page instead of the particles washing out against it.
    _themedLightness(l) {
        return this.isLightMode ? 1 - l : l;
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

    // How far right of dead-center the swarm sits, in world units, at the
    // camera's current fov/aspect. Anchored to the visible edge minus the
    // sphere's own radius (plus a margin), not a raw fraction of the visible
    // width — a fraction pushed the sphere far enough that its far edge went
    // past the frame boundary and got clipped. Anchoring to the edge instead
    // guarantees the whole sphere stays in frame at any window size while
    // still sitting as far right as it safely can.
    _updateCenterOffset() {
        // Only the full-page landing background is biased right — the exam
        // kiosk's own small bounded viewport should stay centered in itself.
        if (!this.container || this.container.id !== 'ultronCanvasContainer') {
            this.centerOffsetX = 0;
            return;
        }
        // OrbitControls' autoRotate continuously orbits the camera around the
        // origin, so .position.z alone isn't a stable "distance" (it drifts
        // toward 0 and even negative as the camera swings around) — the true,
        // rotation-independent distance is the camera's radial length.
        const distance = this.camera.position.length();
        const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov) / 2;
        const halfHeightWorld = distance * Math.tan(halfFovRad);
        const halfWidthWorld = halfHeightWorld * this.camera.aspect;

        // Sphere radius at its largest breathing extent (outer = scale * up to
        // 1.045), plus a margin so it never touches the very edge.
        const sphereRadius = this.params.targetScale * 1.05;
        const margin = 15;
        this.centerOffsetX = Math.max(0, halfWidthWorld - sphereRadius - margin);
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || 320;
        const aspect = width / height;

        this.camera.fov = this._fovForAspect(aspect);
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this._updateCenterOffset();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('ultronCanvas')) {
        window.audioVisualizer = new UltronParticleCore();
    }
});
