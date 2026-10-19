import * as THREE from 'three';
import type { SceneMaterialDef } from '../../../../shared/scene-types';

export type VisualStyle = 'soft' | 'cartoon' | 'holo';
export type MaterialKind = 'wood_light' | 'wood_dark' | 'plastic_matte' | 'plastic_gloss' | 'metal_brushed' | 'fabric' | 'rubber' | 'glass' | 'screen';
const settings: Record<MaterialKind, { roughness: number; metalness: number }> = {
  wood_light: { roughness: .72, metalness: 0 }, wood_dark: { roughness: .78, metalness: 0 },
  plastic_matte: { roughness: .62, metalness: 0 }, plastic_gloss: { roughness: .28, metalness: 0 },
  metal_brushed: { roughness: .4, metalness: .72 }, fabric: { roughness: .95, metalness: 0 },
  rubber: { roughness: .9, metalness: 0 }, glass: { roughness: .18, metalness: .12 }, screen: { roughness: .35, metalness: 0 },
};

/** Mantém a identidade das cores, inclusive branco/cinza, sem preto invisível. */
export function normalizePalette(hex: string, style: VisualStyle = 'soft'): string {
  if (style === 'holo') return hex;
  const color = new THREE.Color(/^#[\da-f]{6}$/i.test(hex) ? hex : '#a9cbd9');
  const hsl = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  color.setHSL(hsl.h, hsl.s < .08 ? hsl.s : Math.max(style === 'cartoon' ? .4 : .25, hsl.s), Math.min(.85, Math.max(.35, hsl.l)), THREE.SRGBColorSpace);
  return `#${color.getHexString(THREE.SRGBColorSpace)}`;
}

export function inferMaterial(name: string, def: SceneMaterialDef): MaterialKind {
  const label = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const kind of Object.keys(settings) as MaterialKind[]) if (label.includes(kind)) return kind;
  if ((def.opacity ?? 1) < 1 || /vidro|lente|glass/.test(label)) return 'glass';
  if (/tela|display|screen/.test(label)) return 'screen';
  if (/madeira|wood/.test(label)) return 'wood_light';
  if (/tecido|almofada|estofad|fabric/.test(label)) return 'fabric';
  if (/pneu|borracha|rubber/.test(label)) return 'rubber';
  if ((def.metalness ?? 0) > .6 || /metal|aco|alumin/.test(label)) return 'metal_brushed';
  return 'plastic_matte';
}

/** Cache por compilação: descarte junto da cena, sem acumular materiais entre pedidos. */
export class MaterialLibrary {
  readonly materials = new Map<string, THREE.MeshStandardMaterial | THREE.MeshToonMaterial>();
  private wood?: THREE.DataTexture;
  private tones?: THREE.DataTexture;
  constructor(private style: VisualStyle = 'soft', private lightweight = false) {}

  get(def: SceneMaterialDef, name = ''): THREE.MeshStandardMaterial | THREE.MeshToonMaterial {
    const kind = inferMaterial(name, def);
    const color = normalizePalette(def.color, this.style);
    const key = JSON.stringify([kind, color, def]);
    const cached = this.materials.get(key); if (cached) return cached;
    const opacity = def.opacity ?? (kind === 'glass' ? .35 : 1);
    const common = {
      color, opacity, transparent: opacity < 1 || def.transparent === true, depthWrite: opacity >= 1,
      side: THREE.DoubleSide, wireframe: def.wireframe ?? false,
      emissive: def.emissive || (kind === 'screen' ? color : '#000000'),
      emissiveIntensity: def.emissiveIntensity ?? (kind === 'screen' ? .3 : 0),
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    };
    let material: THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
    if (this.style === 'cartoon') {
      this.tones ||= new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
      this.tones.minFilter = this.tones.magFilter = THREE.NearestFilter; this.tones.needsUpdate = true;
      material = new THREE.MeshToonMaterial({ ...common, gradientMap: this.tones });
    } else {
      material = new THREE.MeshStandardMaterial({ ...common,
        roughness: def.roughness ?? settings[kind].roughness,
        // Sem ambiente no perfil leve, metal puro ficaria quase preto.
        metalness: Math.min(this.lightweight ? .35 : 1, def.metalness ?? settings[kind].metalness),
      });
      if (kind.startsWith('wood_')) {
        if (!this.wood) {
          const size = 64, data = new Uint8Array(size * size * 4);
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const value = Math.round(230 + 18 * Math.sin(x * .7 + Math.sin(y * .12) * .8));
            const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
          }
          this.wood = new THREE.DataTexture(data, size, size); this.wood.colorSpace = THREE.SRGBColorSpace;
          this.wood.wrapS = this.wood.wrapT = THREE.RepeatWrapping;
          this.wood.magFilter = this.wood.minFilter = THREE.LinearFilter; this.wood.needsUpdate = true;
        }
        material.map = this.wood;
      }
    }
    this.materials.set(key, material); return material;
  }
}
