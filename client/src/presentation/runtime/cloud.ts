import * as THREE from 'three';
import { generateSamples, type SampleKind } from './samples';

export async function createCloud(kind: SampleKind, count: number, tint: string, signal: AbortSignal): Promise<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>> {
  const sample = await generateSamples(kind, count, tint, signal);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(sample.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(sample.colors, 3));
  geometry.setDrawRange(0, count);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: kind === 'dust' ? 1.5 : 2.3 }, uOpacity: { value: kind === 'dust' ? .35 : count > 15000 ? .58 : .72 }, uWind: { value: kind === 'wind' ? 1 : 0 } },
    vertexShader: `attribute vec3 color; varying vec3 vColor; uniform float uTime; uniform float uSize; uniform float uWind;
      void main(){ vColor=color; vec3 p=position; if(uWind>0.5) p.x=mod(p.x+4.5-uTime*7.2,9.0)-4.5;
      vec4 viewPosition=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*viewPosition;
      gl_PointSize=clamp(uSize*10.0/max(1.0,-viewPosition.z),1.0,6.0); }`,
    fragmentShader: `varying vec3 vColor; uniform float uOpacity;
      void main(){ float d=length(gl_PointCoord-vec2(0.5))*2.0; if(d>1.0)discard;
      gl_FragColor=vec4(vColor,(1.0-smoothstep(0.15,1.0,d))*uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.userData.generatedMs = sample.generationMs; cloud.userData.cached = sample.cached;
  cloud.userData.maxSliceMs = sample.maxSliceMs;
  cloud.frustumCulled = kind !== 'wind';
  return cloud;
}
