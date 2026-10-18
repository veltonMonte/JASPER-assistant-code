import { getPresetDefinition } from '../../../../shared/presentation-presets';
import { particleCount } from '../runtime/quality';
import { createCloud } from '../runtime/cloud';
import { subject, type BuildContext } from './types';

async function build({ group, config, tier, signal }: BuildContext) {
  const points = await createCloud('flow', particleCount(16000, config.density ?? 1, tier), '#00f3ff', signal);
  group.add(points);
  return subject(group, time => {
    points.rotation.y = time * .25;
    points.rotation.z = Math.sin(time * .15) * .2;
  }, [{ text: 'Atrator de Lorenz', position: [0, 3.5, 0] }]);
}
export default { ...getPresetDefinition('flow_field'), build };
