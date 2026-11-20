/**
 * Recall's logo: a closed book lying on its side, rounded spine on the left,
 * curved fore-edge on the right. The name sits across the pages, and the page
 * lines stop just short of it. Colours come from theme tokens, so it
 * follows light and dark mode.
 *
 * Each instance gets its own mask and clip ids. The app renders the logo more
 * than once (sidebar and mobile header), and one copy is always hidden; with
 * shared ids the visible copy would point at the hidden copy's mask and clip,
 * which browsers don't apply, and the page lines would spill out of the book.
 */
import { useId } from 'react';

/** A React id made safe to use inside url(#...). */
function useSvgId(name: string) {
  return `${name}-${useId().replace(/[^\w-]/g, '')}`;
}

const W = 116; // viewBox width; height is 48

const WORD = {
  x: 56, y: 32.2, fontSize: 23, length: 76,
  fontFamily: 'var(--serif)', fontWeight: 700,
} as const;

export function Logo({ height = 44 }: { height?: number }) {
  const gap = useSvgId('logo-word-gap');
  return (
    <svg className="logo" height={height} width={(height * W) / 48} viewBox={`0 0 ${W} 48`} role="img" aria-label="Recall">
      <defs>
        {/* Page lines stop just short of the word; no border is drawn */}
        <mask id={gap} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height="48">
          <rect width={W} height="48" fill="#fff" />
          <rect x={WORD.x - WORD.length / 2 - 3.5} y="14.6" width={WORD.length + 7} height="19.2" fill="#000" />
        </mask>
      </defs>
      <Book mask={`url(#${gap})`} />
      <Word fill="var(--ink)" />
    </svg>
  );
}

function Word(props: { fill: string }) {
  return (
    <text
      x={WORD.x} y={WORD.y} textAnchor="middle" aria-hidden
      fontFamily={WORD.fontFamily} fontWeight={WORD.fontWeight} fontSize={WORD.fontSize}
      textLength={WORD.length} lengthAdjust="spacingAndGlyphs" {...props}
    >
      Recall
    </text>
  );
}

function Book({ mask }: { mask: string }) {
  const pages = useSvgId('logo-pages');
  return (
    <>
      <defs>
        <clipPath id={pages}>
          {/* Pages fill the cover, from just inside the spine's curve to just inside the fore-edge */}
          <path d={`M24 7.5H${W - 11}Q${W - 19} 24 ${W - 11} 40.5H24A16.5 16.5 0 0 1 24 7.5Z`} />
        </clipPath>
      </defs>
      {/* Pages: fine lines that stop at the curved fore-edge */}
      <g mask={mask}>
        <g clipPath={`url(#${pages})`} stroke="var(--muted)" strokeWidth="1.6" opacity="0.75">
          {[9.3, 13.5, 17.7, 21.9, 26.1, 30.3, 34.5, 38.7].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} />)}
        </g>
      </g>
      {/* Covers and spine: one thin C-shaped band */}
      <path
        d={`M${W - 5} 4H24A20 20 0 0 0 24 44H${W - 5}A1 1 0 0 0 ${W - 5} 42H24A18 18 0 0 1 24 6H${W - 5}A1 1 0 0 0 ${W - 5} 4Z`}
        fill="var(--accent)"
      />
      {/* Fore-edge */}
      <path d={`M${W - 8} 7Q${W - 16} 24 ${W - 8} 41`} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />
    </>
  );
}
