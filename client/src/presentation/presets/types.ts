import * as THREE from 'three';
import type { PresetConfig, PresentationPart } from '../../../../shared/presentation-types';
import type { QualityProfile, QualityTier } from '../runtime/quality';
import { disposeObject } from '../runtime/resources';

export interface LabelSpec { text: string; position: [number, number, number]; anchor?: THREE.Object3D }
export interface BuildContext { group: THREE.Group; config: PresetConfig; quality: QualityProfile; tier: QualityTier; signal: AbortSignal; parts?: PresentationPart[]; style?: import('../style/materials').VisualStyle; motion?: boolean }
export interface BuilderResult {
  group: THREE.Group; animated: boolean; labels: LabelSpec[];
  update(time: number, dt: number): void; dispose(): void;
}
export function subject(group: THREE.Group, update: (time: number, dt: number) => void, labels: LabelSpec[] = [], animated = true): BuilderResult {
  return { group, animated, labels, update, dispose: () => disposeObject(group) };
}
