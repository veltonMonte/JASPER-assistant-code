export type PresentationPart = { shape: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'plane' | 'mesh'; position: [number, number, number]; size: [number, number, number]; rotation: [number, number, number]; color: string; label?: string; vertices?: [number, number, number][]; faces?: [number, number, number][] };
export type PresentationNode = { id: string; label: string; detail?: string; x: number; y: number; color: string };
export type PresentationLink = { from: string; to: string; label?: string };
export type DrawingElement =
  | { type: 'path'; d: string; color: string; fill: string; width: number }
  | { type: 'ellipse'; x: number; y: number; rx: number; ry: number; color: string; fill: string; width: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; radius: number; color: string; fill: string; strokeWidth: number }
  | { type: 'text'; x: number; y: number; text: string; color: string; size: number };
export type PresetKind = 'atom' | 'cyber_car' | 'solar_system' | 'flow_field' | 'neural_network' | 'custom';
export interface PresetConfig {
  element?: 'carbon' | 'hydrogen' | 'oxygen' | 'iron';
  primaryColor?: string;
  accentColor?: string;
  density?: number;
}
export type PresentationStep = {
  title: string;
  narration: string;
  kind: 'model3d' | 'diagram' | 'drawing';
  preset?: PresetKind;
  config?: PresetConfig;
  parts?: PresentationPart[];
  nodes?: PresentationNode[];
  links?: PresentationLink[];
  elements?: DrawingElement[];
};
export type Presentation = { id: string; title: string; subtitle: string; steps: PresentationStep[] };
