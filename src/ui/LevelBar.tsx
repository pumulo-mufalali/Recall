/** The learner's level, title and progress to the next level (see core/gauntlet.ts). */
import { levelOf } from '../core/gauntlet';

export function LevelBar({ xp }: { xp: number }) {
  const lvl = levelOf(xp);
  return (
    <div className="level">
      <span className="level-badge" aria-hidden>{lvl.level}</span>
      <div className="level-body">
        <strong>Level {lvl.level} · {lvl.title}</strong>
        <span className="level-track"><span style={{ width: `${(lvl.into / lvl.need) * 100}%` }} /></span>
        <span className="muted small">{lvl.into} / {lvl.need} XP to level {lvl.level + 1}</span>
      </div>
    </div>
  );
}
