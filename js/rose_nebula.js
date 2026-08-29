/**
 * Cognify - NOAH "Who Is NOAH" Rose Nebula Visualizer
 * Powered by Three.js, InstancedMesh, and UnrealBloomPass.
 *
 * Shape math ported from a standalone particle-swarm export (rose_nebula.html)
 * the same way the landing sphere in audio_visualizer.js was ported from its
 * own export — recolored here from the export's full rainbow HSL palette to
 * the site's monochrome + single-orange-accent system, and with the export
 * tool's dead control-panel stubs (addControl/setInfo/annotate/PARAMS)
 * stripped out in favor of plain inlined constants.
 *
 * Not auto-instantiated on load — app.js constructs this lazily the first
 * time the "Who Is NOAH" section scrolls into view, so the page doesn't pay
 * for a second full WebGL scene before anyone has scrolled to it.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class RoseNebulaCore {
    constructor() {
        this.canvas = document.getElementById('roseNebulaCanvas');
        if (!this.canvas) return;
        this.container = this.canvas.parentElement;
        this.COUNT = 16000;

        // Same reduced-motion contract as the sphere: freeze the continuous
        // rotation/turbulence/pulse (all vestibular-trigger-prone) instead of
        // skipping the visual outright.
        this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        // Paused while off-screen — running this bloom pass at the same time
        // as the landing hero's own bloom pass (both persistent WebGL scenes)
        // overwhelms constrained/software GPU renderers badly enough to
        // corrupt the whole page's frame, besides the wasted cost of
        // rendering a canvas nobody can see.
        this.visible = true;
        this.visibilityObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) this.visible = entry.isIntersecting;
        }, { threshold: 0.01 });
        this.visibilityObserver.observe(this.canvas);

        this.initThree();
        this.initSwarm();
        this.animate();

        requestAnimationFrame(() => this.onWindowResize());
        window.addEventListener('resize', () => this.onWindowResize());
    }

    initThree() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || 480;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x080808, 0.006);

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
        this.camera.position.set(0, 0, 95);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // The swarm spins as a rigid body (baked into the per-particle target
        // math below) rather than via user-draggable OrbitControls — this
        // stays a background visual, not an interactive toy, consistent with
        // the sphere's own "no free orbit" convention.
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.4, 0.4, 0.85);
        this.bloomPass.strength = 1.4;
        this.bloomPass.radius = 0.4;
        this.bloomPass.threshold = 0.05;
        this.composer.addPass(this.bloomPass);

        this.clock = new THREE.Clock();
    }

    initSwarm() {
        this.dummy = new THREE.Object3D();
        this.color = new THREE.Color();
        this.target = new THREE.Vector3();

        this.geometry = new THREE.TetrahedronGeometry(0.22);
        this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.COUNT);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(this.instancedMesh);

        this.positions = [];
        for (let i = 0; i < this.COUNT; i++) {
            this.positions.push(new THREE.Vector3(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 60
            ));
            this.instancedMesh.setColorAt(i, this.color.setHex(0xffffff));
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.visible) return;

        const time = this.reducedMotion ? 0 : this.clock.getElapsedTime();
        const count = this.COUNT;

        // Shape constants — from the export's PARAMS defaults, inlined
        // directly instead of routed through its addControl() indirection
        // (that indirection only existed to feed the export tool's own,
        // now-absent, control-panel sliders).
        const nebulaSize = 30.0;
        const petalCurl = 1.15;
        const rotationRate = this.reducedMotion ? 0 : 0.32;
        const cloudDepth = 3.4;
        const corePulse = this.reducedMotion ? 0 : 0.75;
        const turbulence = this.reducedMotion ? 0 : 0.7;

        if (!this.reducedMotion) {
            this.group.rotation.y = time * 0.06;
        }

        const tau = Math.PI * 2.0;
        const goldenAngle = 2.399963229728653;
        const phaseTime = time * rotationRate;

        for (let i = 0; i < count; i++) {
            const safeCount = Math.max(1.0, count);
            const unitIndex = i / safeCount;

            // Deterministic pseudo-random values — stable between frames so
            // the nebula doesn't flicker like particles seeded with Math.random().
            const hashA = Math.sin((i + 1.0) * 12.9898) * 43758.5453;
            const hashB = Math.sin((i + 1.0) * 78.233) * 24634.6345;
            const hashC = Math.sin((i + 1.0) * 39.425) * 15731.7431;

            const randA = hashA - Math.floor(hashA);
            const randB = hashB - Math.floor(hashB);
            const randC = hashC - Math.floor(hashC);

            const signedA = randA * 2.0 - 1.0;
            const signedB = randB * 2.0 - 1.0;
            const signedC = randC * 2.0 - 1.0;

            let px = 0.0, py = 0.0, pz = 0.0;

            // Recolored from the export's full rainbow HSL to the site's
            // monochrome + single-orange-accent (~0.065) system — the shape
            // math below (petal/core/halo/star placement) is unchanged.
            let hue = 0.065;
            let saturation = 0.15;
            let lightness = 0.5;

            // 70%: layered rose-shaped petals.
            if (unitIndex < 0.70) {
                const local = unitIndex / 0.70;
                const layerPosition = local * 7.0;
                const layer = Math.min(6.0, Math.floor(layerPosition));
                const layerFraction = layerPosition - layer;

                const petalCount = 7.0 + layer;
                const petalPosition = layerFraction * petalCount;
                const petal = Math.floor(petalPosition);
                const along = petalPosition - petal;

                const petalArc = Math.sin(Math.PI * along);
                const layerScale = layer / 6.0;

                const breathing = 1.0 + 0.035 * Math.sin(time * corePulse + layer * 0.9);
                const baseAngle = (petal / petalCount) * tau + layer * goldenAngle * 0.34;
                const curlAngle = baseAngle + phaseTime * (0.34 - layerScale * 0.18) +
                    petalCurl * (along - 0.18) * (0.75 + layerScale * 0.85) +
                    signedC * 0.045 * turbulence;

                const radialStart = nebulaSize * (0.08 + layerScale * 0.43);
                const radialGrowth = nebulaSize * (0.20 + layerScale * 0.22) * along;
                const radialRipple = nebulaSize * 0.018 * turbulence * Math.sin(along * 13.0 + layer * 2.1 + time * 0.42);
                const radius = (radialStart + radialGrowth + radialRipple) * breathing;

                const petalWidth = nebulaSize * (0.025 + layerScale * 0.055) * petalArc * (0.35 + 0.65 * randB);
                const sideOffset = signedA * petalWidth;

                const ca = Math.cos(curlAngle);
                const sa = Math.sin(curlAngle);
                const tangentAngle = curlAngle + Math.PI * 0.5;
                const ct = Math.cos(tangentAngle);
                const st = Math.sin(tangentAngle);

                px = ca * radius + ct * sideOffset;
                pz = sa * radius + st * sideOffset;
                py = signedB * cloudDepth * petalArc * (0.35 + layerScale * 0.95) +
                    Math.sin(curlAngle * 3.0 - time * 0.28 + layer) * cloudDepth * 0.12 * turbulence;

                const dustLane = 0.5 + 0.5 * Math.sin(petal * 2.7 + along * 18.0 + layer * 1.3);
                const edgeGlow = Math.pow(petalArc, 0.45);

                saturation = 0.12 + edgeGlow * 0.30;
                lightness = 0.14 + edgeGlow * 0.55 + (1.0 - layerScale) * 0.10 - dustLane * 0.10;
            }
            // 14%: dense central cluster — the "hot" accent core.
            else if (unitIndex < 0.84) {
                const local = (unitIndex - 0.70) / 0.14;
                const coreRadius = nebulaSize * 0.16 * Math.pow(local, 0.36);
                const coreTheta = i * goldenAngle + phaseTime * 0.8;
                const coreY = 1.0 - 2.0 * randB;
                const coreRing = Math.sqrt(Math.max(0.0, 1.0 - coreY * coreY));
                const pulse = 1.0 + 0.13 * Math.sin(time * corePulse * 2.0 + i * 0.013);

                px = Math.cos(coreTheta) * coreRing * coreRadius * pulse;
                py = coreY * coreRadius * pulse;
                pz = Math.sin(coreTheta) * coreRing * coreRadius * pulse;

                saturation = 0.65 + randA * 0.3;
                lightness = 0.5 + (1.0 - local) * 0.4;
            }
            // 12%: diffuse outer halo — kept near-neutral grey.
            else if (unitIndex < 0.96) {
                const local = (unitIndex - 0.84) / 0.12;
                const haloAngle = i * goldenAngle + phaseTime * 0.12;
                const haloRadius = nebulaSize * (0.72 + local * 0.66 + signedA * 0.08);
                const haloWarp = 1.0 + 0.10 * Math.sin(haloAngle * 5.0 + time * 0.25) +
                    0.05 * turbulence * Math.sin(haloAngle * 11.0 - time * 0.17);

                px = Math.cos(haloAngle) * haloRadius * haloWarp;
                pz = Math.sin(haloAngle) * haloRadius * haloWarp;
                py = signedB * cloudDepth * (1.2 + local * 1.8) +
                    Math.sin(haloAngle * 2.0 + time * 0.2) * cloudDepth * 0.35;

                saturation = 0.03;
                lightness = 0.10 + (1.0 - local) * 0.18 + randB * 0.10;
            }
            // 4%: sparse background stars — plain white twinkle.
            else {
                const local = (unitIndex - 0.96) / 0.04;
                const starAngle = i * goldenAngle;
                const starY = signedB;
                const starRing = Math.sqrt(Math.max(0.0, 1.0 - starY * starY));
                const starRadius = nebulaSize * (1.25 + local * 1.10 + randA * 0.55);
                const twinkle = this.reducedMotion ? 0.75 : 0.5 + 0.5 * Math.sin(time * (1.2 + randC * 2.2) + i * 0.17);

                px = Math.cos(starAngle) * starRing * starRadius;
                py = starY * starRadius * 0.72;
                pz = Math.sin(starAngle) * starRing * starRadius;

                saturation = 0.0;
                lightness = 0.32 + twinkle * 0.5;
            }

            lightness = Math.max(0.02, Math.min(0.98, lightness));
            saturation = Math.max(0.0, Math.min(1.0, saturation));

            this.target.set(px, py, pz);
            this.color.setHSL(hue, saturation, lightness);

            this.positions[i].lerp(this.target, 0.1);
            this.dummy.position.copy(this.positions[i]);
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

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || 480;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }
}

window.RoseNebulaCore = RoseNebulaCore;
