import atom from './atom';
import cyberCar from './cyberCar';
import solarSystem from './solarSystem';
import flowField from './flowField';
import neuralNetwork from './neuralNetwork';
import custom from './custom';
import type { PresetKind } from '../../../../shared/presentation-types';
import type { BuildContext, BuilderResult } from './types';

export const presets = [atom, cyberCar, solarSystem, flowField, neuralNetwork, custom];
export function builderFor(id: PresetKind): (context: BuildContext) => BuilderResult | Promise<BuilderResult> {
  const preset = presets.find(item => item.id === id);
  if (!preset) throw new Error('Construtor de cena não registrado.');
  return preset.build;
}
