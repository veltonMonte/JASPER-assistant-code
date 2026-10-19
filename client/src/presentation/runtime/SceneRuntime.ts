import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { groundSubject, subjectBounds } from '../style/geometry';
import { createStudio } from '../style/studio';
import type { VisualStyle } from '../style/materials';
import { sceneFraming, sceneView } from './framing';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { PresentationStep } from '../../../../shared/presentation-types';
import { compileScene } from '../scene/SceneCompiler';
import { builderFor } from '../presets/registry';
import type { BuilderResult } from '../presets/types';
import { AdaptiveQuality, QUALITY_PROFILES, type QualityTier } from './quality';
import { createCloud } from './cloud';
import { disposeObject } from './resources';
import { labelLines, limitLabels } from './labels';

export interface SceneStats {
  fps: number; frameMs: number; worstMs: number; tier: QualityTier; points: number; maxPoints: number;
  calls: number; triangles: number; renderedPoints: number; geometries: number; textures: number; contexts: number; generationMs: number; history: string[]; heapMB?: number;
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
  private studio: ReturnType<typeof createStudio> | null = null;
  private reflection: THREE.WebGLRenderTarget | null = null;
  private hologramLights = new THREE.Group();
  private style: VisualStyle = 'soft';
  private subjectTime = 0;
  private motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private rings = new THREE.Group();
  private dust: Cloud | null = null;
  private subject: BuilderResult | null = null;
  private pendingGroup: THREE.Group | null = null;
  private currentStep: PresentationStep | null = null;
  private clouds: Cloud[] = [];
  private labels: Array<{ object: CSS2DObject; world: THREE.Vector3; projected: THREE.Vector3; text: HTMLSpanElement }> = [];
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
  private autoRotatePreference = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private publishAfterRender=false;
  private labelNearDistance=.8;
  private labelsVisible=false;

  constructor(private host: HTMLElement, tier: QualityTier, private callbacks: { onStats: (stats: SceneStats) => void; onError: (error: unknown) => void; onLoading: (value: boolean) => void }) {
    if (typeof ResizeObserver === 'undefined' || typeof IntersectionObserver === 'undefined') throw new Error('Este navegador precisa do esquema visual leve.');
    this.quality = new AdaptiveQuality(tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: tier === 'low' ? 'low-power' : 'high-performance' });
    activeContexts++;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    host.append(this.renderer.domElement, this.labelRenderer.domElement);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.scene.fog = new THREE.FogExp2(0x070b10, .018);
    this.hologramLights.add(new THREE.AmbientLight(0x7fcce5, 2.2));
    const key = new THREE.DirectionalLight(0xf2f7ff, 3.4); key.position.set(6, 8, 7);
    const rim = new THREE.DirectionalLight(0x00f3ff, 2.6); rim.position.set(-6, 3, -6); this.hologramLights.add(key, rim); this.scene.add(this.hologramLights);
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
    this.currentStep = step; this.configureQuality(); this.generation.abort(); this.generation = new AbortController();
    const signal = this.generation.signal;
    if (this.pendingGroup) { this.scene.remove(this.pendingGroup); disposeObject(this.pendingGroup); }

    const group = new THREE.Group(); this.pendingGroup = group;
    this.loading = true; this.callbacks.onLoading(true); this.invalidate();
    const start = performance.now();
    try {
      const result = step.scene ? await compileScene(step.scene,{group,quality:QUALITY_PROFILES[this.quality.tier],signal,style:this.style,motion:this.motion}) : await builderFor(step.preset || 'custom')({ group, config: step.config || {}, quality: QUALITY_PROFILES[this.quality.tier], tier: this.quality.tier, signal, parts: step.parts,style:this.style,motion:this.motion });
      if (signal.aborted || this.disposed) { result.dispose(); return; }
      if(this.subject){this.scene.remove(this.subject.group);this.subject.dispose();}
      this.labels=[];this.clouds=[];this.scene.add(group);
      this.subjectTime=0;
      group.traverse(object=>{if(object.userData.labelCallout)object.visible=!this.isStudio()||this.labelsVisible;});
      this.studio?.group.removeFromParent(); this.studio?.dispose(); this.studio=null;
      const styled=this.isStudio();
      this.environment.visible=!styled; this.hologramLights.visible=!styled;
      if(styled){
        const bounds=groundSubject(group);
        this.studio=createStudio(bounds,this.quality.tier);this.scene.add(this.studio.group);
        this.renderer.shadowMap.needsUpdate=true;
      }
      this.pendingGroup = null; this.subject = result; this.generationMs = performance.now() - start;
      group.traverse(object => { if (object instanceof THREE.Points && object.material instanceof THREE.ShaderMaterial) this.clouds.push(object as Cloud); });
      for (const label of limitLabels(result.labels, this.quality.tier)) {
        const element = document.createElement('div'); const text=document.createElement('span'); text.className='scene-label';text.textContent=labelLines(label.text).join('\n');element.append(text);
        const object = new CSS2DObject(element); object.position.set(...label.position); (label.anchor || group).add(object);
        this.labels.push({ object, world: new THREE.Vector3(), projected: new THREE.Vector3(), text });
      }
      const bounds = this.isStudio()?subjectBounds(group):new THREE.Box3().setFromObject(group), center = bounds.getCenter(new THREE.Vector3());
      if(bounds.isEmpty()||!Number.isFinite(bounds.max.length()))throw new Error('A cena não contém geometria visível.');
      const framing=sceneFraming(bounds.getSize(new THREE.Vector3()).length(),this.camera.aspect,this.camera.fov);
      const {radius,distance}=framing;
      this.camera.near=framing.near;this.camera.far=framing.far;this.camera.updateProjectionMatrix();
      this.labelNearDistance=framing.labelNear;
      this.scene.fog=this.isStudio()?null:new THREE.FogExp2(0x070b10,step.scene?framing.fogDensity:.018);
      const view=step.scene?.metadata?.view;
      const viewPlan=sceneView(view,this.isStudio()),direction=new THREE.Vector3(...viewPlan.direction).normalize();
      this.camera.up.set(...viewPlan.up);this.controls.minPolarAngle=viewPlan.minPolar;this.controls.maxPolarAngle=viewPlan.maxPolar;
      this.camera.position.copy(center).addScaledVector(direction,distance);this.camera.lookAt(center);this.controls.target.copy(center);
      this.controls.minDistance=Math.max(1e-7,radius*.1);this.controls.maxDistance=distance*8;
      this.controls.autoRotate=view==='top'?false:this.autoRotatePreference;
      this.publishAfterRender=true;this.windowStart=0;this.frameSum=0;this.frameCount=0;this.worst=0;this.latestFps=0;this.latestFrameMs=0;this.latestWorst=0;
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

  private isStudio(): boolean { return !!this.currentStep && this.style!=='holo' && (!!this.currentStep.scene || !this.currentStep.preset || this.currentStep.preset==='custom'); }

  setStyle(style: VisualStyle): void { this.style=style; if(this.currentStep)void this.setSubject(this.currentStep); }
  replayAssembly(): void { if(!this.currentStep?.scene&&this.currentStep?.preset!=='custom')return;this.subjectTime=0;this.subject?.update(0,0);this.invalidate(); }

  setLabelsVisible(value:boolean): void { this.labelsVisible=value;this.subject?.group.traverse(object=>{if(object.userData.labelCallout)object.visible=value;});this.invalidate(); }

  setAutoRotate(value: boolean): void { this.autoRotatePreference=value; this.controls.autoRotate = value; this.invalidate(); }

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
    const styled=this.isStudio();
    this.renderer.shadowMap.enabled=styled&&this.quality.tier!=='low';
    this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;
    if(styled&&this.quality.tier!=='low'&&!this.reflection){
      const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
      try{this.reflection=pmrem.fromScene(room,.04,.1,100,{size:64});}finally{room.dispose();pmrem.dispose();}
    }
    this.scene.environment=styled&&this.quality.tier!=='low'?(this.reflection?.texture||null):null;
    this.scene.environmentIntensity=.55;
    this.renderer.toneMappingExposure=styled?1.1:1.35;
    if (styled || !profile.bloomScale) this.disposeComposer();
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
      const wasAnimating=!!this.subject?.animated;
      this.subjectTime+=dt;
      if(wasAnimating || !this.isStudio())this.subject?.update(this.subjectTime,dt);
      if(wasAnimating)this.renderer.shadowMap.needsUpdate=true;
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
          label.object.element.hidden = (this.isStudio()&&(!this.labelsVisible||!!this.subject?.animated)) || label.projected.z < -1 || label.projected.z > 1 || label.world.distanceToSquared(this.camera.position) < this.labelNearDistance**2;
        }
        // Afasta rótulos próximos em pixels, preservando a âncora 3D.
        this.labels.sort((a,b)=>b.projected.y-a.projected.y);
        let previousY=-Infinity,previousX=-Infinity;
        for(const label of this.labels){
          if(label.object.element.hidden)continue;
          const x=(label.projected.x+1)*this.host.clientWidth/2,y=(1-label.projected.y)*this.host.clientHeight/2;
          const offset=Math.abs(x-previousX)<150?Math.max(0,previousY+42-y):0;
          label.text.style.transform=`translateY(${Math.min(offset,90)}px)`;
          previousY=y+Math.min(offset,90);previousX=x;
        }
        this.labelRenderer.render(this.scene, this.camera); this.dirty = false;
        if(this.publishAfterRender){this.publishAfterRender=false;this.publishStats();}
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
      maxPoints: QUALITY_PROFILES[this.quality.tier].maxPoints, calls: this.renderer.info.render.calls, triangles:this.renderer.info.render.triangles, renderedPoints: this.renderer.info.render.points,
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
    this.studio?.dispose();this.scene.environment=null;this.reflection?.dispose();
    disposeObject(this.environment); this.scene.clear(); this.renderer.dispose(); this.renderer.forceContextLoss();
    this.renderer.domElement.remove(); this.labelRenderer.domElement.remove(); activeContexts--;
  }
}
