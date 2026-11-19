/** Shows which engine did a piece of work, and why it was chosen. */
import type { Route } from '../core/route';
import type { Engine } from '../core/types';
import { Icon, type IconName } from './Icon';

export const ENGINE_LABEL: Record<Engine, string> = { 'on-device': 'On this device', cloud: 'Cloud', local: 'Offline marker' };
export const ENGINE_ICON: Record<Engine, IconName> = { 'on-device': 'device', cloud: 'cloud', local: 'local' };

export function EngineBadge({ engine, route }: { engine: Engine; route?: Route }) {
  return (
    <span className="engine-note">
      <span className={`badge badge-${engine}`} title={route?.reason}>
        <Icon name={ENGINE_ICON[engine]} size={13} /> {ENGINE_LABEL[engine]}
      </span>
      {route && <span className="badge-reason">{route.reason}</span>}
    </span>
  );
}
