import { Icon, type IconName } from './Icon';
import { setTheme, useTheme, type Theme } from './theme';

const OPTIONS: { value: Theme; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

/**
 * Light, dark or system. The full version shows all three; the compact one is a single
 * button that steps through them, for tight headers.
 */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();

  if (compact) {
    const i = OPTIONS.findIndex((o) => o.value === theme);
    const current = OPTIONS[i];
    const next = OPTIONS[(i + 1) % OPTIONS.length];
    return (
      <button
        className="icon-btn"
        onClick={() => setTheme(next.value)}
        title={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`}
        aria-label={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`}
      >
        <Icon name={current.icon} size={18} />
      </button>
    );
  }

  return (
    <div className="seg theme-switch" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          className={theme === o.value ? 'on' : undefined}
          onClick={() => setTheme(o.value)}
          title={o.label}
        >
          <Icon name={o.icon} size={16} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
