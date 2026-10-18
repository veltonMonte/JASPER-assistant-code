import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { PresentationStep } from '../../../../shared/presentation-types';
import { builderFor } from '../presets/registry';
import type { BuilderResult } from '../presets/types';
import { AdaptiveQuality, QUALITY_PROFILES, type QualityTier } from './quality';
import { createCloud } from './cloud';
import { disposeObject } from './resources';
import { labelLines, limitLabels } from './labels';

export interface SceneStats {
  fps: number; frameMs: number; worstMs: number; tier: QualityTier; points: number; maxPoints: number;
  calls: number; renderedPoints: number; geometries: number; textures: number; contexts: number; generationMs: number; history: string[]; heapMB?: number;
}
let activeContexts = 0;
type Cloud = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

export class SceneRuntime {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, .1, 150);
  private controls: OrbitControls;
  private labelRenderer = new CSS2DRenderer();
  private composer: EffectComposer | null = null;
  private environment = new THREE.Group();
  private rings = new THREE.Group();
  private dust: Cloud | null = null;
  private subject: BuilderResult | null = null;
  private pendingGroup: THREE.Group | null = null;
  private currentStep: PresentationStep | null = null;
  private clouds: Cloud[] = [];
  private labels: Array<{ object: CSS2DObject; world: THREE.Vector3; projected: THREE.Vector3 }> = [];
  private quality: AdaptiveQuality;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private generation = new AbortController();
  private lifetime = new AbortController();
  private frame = 0;
  private disposed = false;
  private visible = true;
  private dirty = true;
  private loading = false;
  private elapsed = 0;
  private lastFrame = 0;
  private windowStart = 0;
  private frameSum = 0;
  private frameCount = 0;
  private worst = 0;
  private generationMs = 0;
  private latestFps = 0;
  private latestFrameMs = 0;
  private latestWorst = 0;

  constructor(private host: HTMLElement, tier: QualityTier, private callbacks: { onStats: (stats: SceneStats) => void; onError: (error: unknown) => void; onLoading: (value: boolean) => void }) {
    if (typeof ResizeObserver === 'undefined' || typeof IntersectionObserver === 'undefined') throw new Error('Este navegador precisa do esquema visual leve.');
    this.quality = new AdaptiveQuality(tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: tier === 'low' ? 'low-power' : 'high-performance' });
    activeContexts++;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    host.append(this.renderer.domElement, this.labelRenderer.domElement);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.scene.fog = new THREE.FogExp2(0x070b10, .018);
    this.scene.add(new THREE.AmbientLight(0x7fcce5, 2.2));
    const key = new THREE.DirectionalLight(0xf2f7ff, 3.4); key.position.set(6, 8, 7);
    const rim = new THREE.DirectionalLight(0x00f3ff, 2.6); rim.position.set(-6, 3, -6); this.scene.add(key, rim);
    this.camera.position.set(5.5, 3.8, 8.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .05;
    this.controls.minDistance = .8; this.controls.maxDistance = 80;
    this.controls.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches; this.controls.autoRotateSpeed = .85;
    this.controls.addEventListener('change', this.invalidate);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.buildEnvironment(); this.configureQuality();
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host);
    this.intersectionObserver = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting !== false; this.lastFrame = 0; if (this.visible) this.invalidate(); else this.pause(); });
    this.intersectionObserver.observe(host); this.resize();
  }

  async setSubject(step: PresentationStep): Promise<void> {
    if (this.disposed) return;
    this.currentStep = step; this.generation.abort(); this.generation = new AbortController();
    const signal = this.generation.signal;
    if (this.subject) { this.scene.remove(this.subject.group); this.subject.dispose(); this.subject = null; }
    if (this.pendingGroup) { this.scene.remove(this.pendingGroup); disposeObject(this.pendingGroup); }
    this.labels = []; this.clouds = [];
    const group = new THREE.Group(); this.pendingGroup = group; this.scene.add(group);
    this.loading = true; this.callbacks.onLoading(true); this.invalidate();
    const start = performance.now();
    try {
      const result = await builderFor(step.preset || 'custom')({ group, config: step.config || {}, quality: QUALITY_PROFILES[this.quality.tier], tier: this.quality.tier, signal, parts: step.parts });
      if (signal.aborted || this.disposed) { result.dispose(); return; }
      this.pendingGroup = null; this.subject = result; this.generationMs = performance.now() - start;
      group.traverse(object => { if (object instanceof THREE.Points && object.material instanceof THREE.ShaderMaterial) this.clouds.push(object as Cloud); });
      for (const label of limitLabels(result.labels, this.quality.tier)) {
        const element = document.createElement('span'); element.className = 'scene-label'; element.textContent = labelLines(label.text).join('\n');
        const object = new CSS2DObject(element); object.position.set(...label.position); (label.anchor || group).add(object);
        this.labels.push({ object, world: new THREE.Vector3(), projected: new THREE.Vector3() });
      }
      const bounds = new THREE.Box3().setFromObject(group), center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(3.8, bounds.getSize(new THREE.Vector3()).length() * .95);
      this.camera.position.copy(center).add(new THREE.Vector3(radius * .85, radius * .45, radius * 1.2)); this.camera.lookAt(center); this.controls.target.copy(center);
      this.applyDrawRange(); this.loading = false; this.callbacks.onLoading(false); this.publishStats(); this.invalidate();
    } catch (error) {
      if (signal.aborted || this.disposed) return;
      this.fail(error);
    }
  }

  setQuality(tier: QualityTier): void {
    if (this.disposed) return;
    this.quality = new AdaptiveQuality(tier); this.configureQuality();
    if (this.currentStep) void this.setSubject(this.currentStep);
  }

  setAutoRotate(value: boolean): void { this.controls.autoRotate = value; this.invalidate(); }

  private buildEnvironment(): void {
    this.environment.add(this.rings); this.scene.add(this.environment);
    const material = new THREE.LineBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending });
    const dashed = new THREE.LineDashedMaterial({ color: 0x5ab3cf, transparent: true, opacity: .28, dashSize: .4, gapSize: .2, blending: THREE.AdditiveBlending });
    for (const radius of [4.8, 5.6]) {
      const positions = new Float32Array(65 * 3);
      for (let i = 0; i <= 64; i++) { const angle = i / 64 * Math.PI * 2; positions[i * 3] = Math.cos(angle) * radius; positions[i * 3 + 1] = -2.6; positions[i * 3 + 2] = Math.sin(angle) * radius; }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const ring = new THREE.Line(geometry, radius === 4.8 ? material : dashed); ring.computeLineDistances(); this.rings.add(ring);
    }
    const brackets = new THREE.Group(); this.rings.add(brackets);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        Math.cos(angle - .08) * 5.8, -2.6, Math.sin(angle - .08) * 5.8,
        Math.cos(angle) * 5.6, -2.6, Math.sin(angle) * 5.6,
        Math.cos(angle + .08) * 5.8, -2.6, Math.sin(angle + .08) * 5.8,
      ], 3));
      brackets.add(new THREE.Line(geometry, material));
    }
    const grid = new THREE.GridHelper(18, 26, 0x00f3ff, 0x163442); grid.position.y = -2.6;
    const gridMaterial = grid.material as THREE.Material; gridMaterial.transparent = true; gridMaterial.opacity = .28; this.environment.add(grid);
    void createCloud('dust', 1800, '#4dd0e1', this.lifetime.signal).then(dust => {
      if (this.disposed) { disposeObject(dust); return; }
      this.dust = dust; this.environment.add(dust); this.applyDrawRange(); this.invalidate();
    }).catch(error => { if (!this.lifetime.signal.aborted) this.fail(error); });
  }

  private disposeComposer(): void {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose(); this.composer = null;
  }

  private configureQuality(): void {
    const profile = QUALITY_PROFILES[this.quality.tier];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, profile.pixelRatio));
    if (!profile.bloomScale) this.disposeComposer();
    else if (!this.composer) {
      try {
        this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 1.15, .4, .82)); this.composer.addPass(new OutputPass());
      } catch (error) { console.error('O brilho avançado falhou; usando a renderização simples.', error); this.disposeComposer(); }
    }
    this.resize();
  }

  private resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    const scale = QUALITY_PROFILES[this.quality.tier].bloomScale;
    this.composer?.setSize(Math.max(1, width * scale), Math.max(1, height * scale)); this.labelRenderer.setSize(width, height); this.invalidate();
  };

  private applyDrawRange(): void {
    for (const cloud of this.clouds) cloud.geometry.setDrawRange(0, Math.floor(cloud.geometry.attributes.position.count * this.quality.ratio));
    this.dust?.geometry.setDrawRange(0, Math.floor(QUALITY_PROFILES[this.quality.tier].dust * this.quality.ratio));
  }

  private tick = (now: number): void => {
    this.frame = 0;
    if (this.disposed || document.hidden || !this.visible) return;
    const budget = 1000 / QUALITY_PROFILES[this.quality.tier].fps;
    const frameMs = this.lastFrame ? now - this.lastFrame : budget;
    if (frameMs < budget - 1) { this.invalidate(); return; }
    this.lastFrame = now; const dt = Math.min(.1, frameMs / 1000); this.elapsed += dt;
    try {
      this.subject?.update(this.elapsed, dt);
      this.rings.children[0].rotation.y = this.elapsed * .15;
      this.rings.children[1].rotation.y = -this.elapsed * .09;
      this.rings.children[2].rotation.y = this.elapsed * .05;
      if (this.dust) this.dust.rotation.y = this.elapsed * .015;
      for (const cloud of this.clouds) cloud.material.uniforms.uTime.value = this.elapsed;
      const changed = this.controls.update(dt);
      if (this.dirty || changed || this.subject?.animated || this.loading || this.controls.autoRotate) {
        this.renderer.info.reset();
        if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
        for (const label of this.labels) {
          label.object.getWorldPosition(label.world); label.projected.copy(label.world).project(this.camera);
          label.object.element.hidden = label.projected.z < -1 || label.projected.z > 1 || label.world.distanceToSquared(this.camera.position) < .64;
        }
        this.labelRenderer.render(this.scene, this.camera); this.dirty = false;
        this.frameCount++; this.frameSum += frameMs; this.worst = Math.max(this.worst, frameMs);
      }
      if (!this.windowStart) this.windowStart = now;
      if (now - this.windowStart >= 2000 && this.frameCount) {
        this.latestFrameMs = this.frameSum / this.frameCount; this.latestFps = 1000 / this.latestFrameMs; this.latestWorst = this.worst;
        const previousTier = this.quality.tier, adjusted = this.quality.observe(this.latestFrameMs);
        this.windowStart = now; this.frameCount = 0; this.frameSum = 0; this.worst = 0;
        if (adjusted) {
          if (previousTier !== this.quality.tier) { this.configureQuality(); if (this.currentStep) void this.setSubject(this.currentStep); }
          else this.applyDrawRange();
        }
        this.publishStats();
      }
      if (this.subject?.animated || this.controls.autoRotate || changed || this.loading) this.invalidate();
    } catch (error) { this.fail(error); }
  };

  private publishStats(): void {
    const memory = (performance as any).memory;
    this.callbacks.onStats({ fps: this.latestFps, frameMs: this.latestFrameMs, worstMs: this.latestWorst, tier: this.quality.tier,
      points: this.clouds.reduce((total, cloud) => total + cloud.geometry.drawRange.count, this.dust?.geometry.drawRange.count || 0),
      maxPoints: QUALITY_PROFILES[this.quality.tier].maxPoints, calls: this.renderer.info.render.calls, renderedPoints: this.renderer.info.render.points,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      contexts: activeContexts, generationMs: this.generationMs, history: [...this.quality.history],
      ...(memory ? { heapMB: memory.usedJSHeapSize / 1024 / 1024 } : {}),
    });
  }

  private invalidate = (): void => { this.dirty = true; if (!this.frame && !this.disposed && !document.hidden && this.visible) this.frame = requestAnimationFrame(this.tick); };
  private pause(): void { cancelAnimationFrame(this.frame); this.frame = 0; }
  private onVisibility = (): void => { this.lastFrame = 0; if (document.hidden) this.pause(); else this.invalidate(); };
  private onContextLost = (event: Event): void => { event.preventDefault(); if (!this.disposed) this.fail(new Error('O contexto gráfico foi perdido.')); };
  private fail(error: unknown): void { console.error('Não foi possível renderizar a cena 3D.', error); this.dispose(); this.callbacks.onError(error); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.pause(); this.generation.abort(); this.lifetime.abort();
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect(); this.controls.dispose();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.disposeComposer();
    if (this.subject) this.subject.dispose();
    if (this.pendingGroup) disposeObject(this.pendingGroup);
    disposeObject(this.environment); this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove(); this.labelRenderer.domElement.remove(); activeContexts--;
  }
}
