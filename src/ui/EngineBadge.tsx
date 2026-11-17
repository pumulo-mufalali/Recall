/** Shows which engine did a piece of work, and why it was chosen. */
import type { Route } from '../core/route';
import type { Engine } from '../core/types';

const LABEL: Record<Engine, string> = { 'on-device': 'On this device', cloud: 'Cloud', local: 'Offline marker' };
const ICON: Record<Engine, string> = { 'on-device': '◆', cloud: '☁', local: '≈' };

export function EngineBadge({ engine, route }: { engine: Engine; route?: Route }) {
  return (
    <span className={`badge badge-${engine}`} title={route?.reason}>
      <span aria-hidden>{ICON[engine]}</span> {LABEL[engine]}
      {route && <span className="badge-reason">{route.reason}</span>}
    </span>
  );
}
