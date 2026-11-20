/**
 * Recall's logo: a closed book lying on its side, rounded spine on the left,
 * curved fore-edge on the right. The name sits across the pages, and the page
 * lines stop just short of it. Colours come from theme tokens, so it
 * follows light and dark mode.
 *
 * The word is drawn as outlines (Nunito ExtraBold, a rounded sans), not as
 * live text, so it looks the same on every device and needs no font file.
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

/** The word's bounds in the viewBox: x 18 to 94, y 14.7 to 33.3. */
const WORD_BOX = { x: 18, y: 14.7, width: 76, height: 18.6 };

/** "Recall" in Nunito ExtraBold, as outlines fitted to WORD_BOX. */
const WORD_PATH =
  'M20.01 33.29L20.01 33.29Q19.03 33.29 18.52 32.75Q18 32.21 18 31.23L18 31.23L18 16.93Q18 15.92 18.53 15.41Q19.06 14.89 20.04 14.89L20.04 14.89L26.3 14.89Q29.34 14.89 30.99 16.36Q32.64 17.83 32.64 20.46L32.64 20.46Q32.64 22.16 31.89 23.39Q31.14 24.63 29.75 25.3L29.75 25.3Q29.24 25.53 28.67 25.69L28.67 25.69Q29.08 25.82 29.47 26.05L29.47 26.05Q30.27 26.59 30.86 27.67L30.86 27.67L32.46 30.64Q32.82 31.28 32.79 31.9Q32.77 32.52 32.33 32.9Q31.89 33.29 31.04 33.29Q30.19 33.29 29.66 32.93Q29.13 32.57 28.72 31.82L28.72 31.82L26.25 27.26Q25.86 26.54 25.31 26.28Q24.75 26.02 23.95 26.02L23.95 26.02L21.99 26.02L21.99 31.23Q21.99 32.21 21.49 32.75Q20.99 33.29 20.01 33.29ZM21.99 18.01L21.99 23.14L25.58 23.14Q27.17 23.14 27.99 22.49Q28.8 21.85 28.8 20.56L28.8 20.56Q28.8 19.3 27.99 18.65Q27.17 18.01 25.58 18.01L25.58 18.01L21.99 18.01ZM42.56 33.34L42.56 33.34Q40.32 33.34 38.71 32.53Q37.1 31.72 36.23 30.24Q35.37 28.75 35.37 26.74L35.37 26.74Q35.37 24.79 36.19 23.3Q37.02 21.82 38.5 20.98Q39.98 20.15 41.86 20.15L41.86 20.15Q43.23 20.15 44.34 20.6Q45.45 21.05 46.25 21.89Q47.04 22.72 47.46 23.92Q47.87 25.12 47.87 26.59L47.87 26.59Q47.87 27.08 47.56 27.32Q47.25 27.57 46.66 27.57L46.66 27.57L39.06 27.57Q39.24 28.81 39.93 29.5L39.93 29.5Q40.83 30.43 42.64 30.43L42.64 30.43Q43.26 30.43 44.05 30.28Q44.85 30.12 45.55 29.79L45.55 29.79Q46.14 29.5 46.61 29.59Q47.07 29.68 47.33 30.02Q47.59 30.35 47.62 30.79Q47.66 31.23 47.43 31.65Q47.2 32.08 46.66 32.36L46.66 32.36Q45.78 32.85 44.69 33.1Q43.59 33.34 42.56 33.34ZM39.06 25.56L39.06 25.56L44.65 25.56Q44.6 24.73 44.34 24.14L44.34 24.14Q44.03 23.45 43.45 23.09Q42.87 22.72 42.02 22.72L42.02 22.72Q41.07 22.72 40.4 23.16Q39.73 23.6 39.36 24.43L39.36 24.43Q39.13 24.94 39.06 25.56ZM56.68 33.34L56.68 33.34Q54.62 33.34 53.09 32.53Q51.55 31.72 50.73 30.22Q49.91 28.73 49.91 26.69L49.91 26.69Q49.91 25.17 50.37 23.96Q50.83 22.75 51.72 21.9Q52.61 21.05 53.87 20.6Q55.14 20.15 56.68 20.15L56.68 20.15Q57.48 20.15 58.38 20.34Q59.29 20.53 60.16 21L60.16 21Q60.68 21.23 60.87 21.65Q61.06 22.08 61.01 22.53Q60.96 22.98 60.69 23.33Q60.42 23.68 60.01 23.79Q59.6 23.91 59.08 23.65L59.08 23.65Q58.59 23.37 58.06 23.24Q57.53 23.11 57.07 23.11L57.07 23.11Q56.3 23.11 55.7 23.36Q55.11 23.6 54.71 24.05Q54.31 24.5 54.09 25.17Q53.87 25.84 53.87 26.72L53.87 26.72Q53.87 28.42 54.71 29.39Q55.55 30.35 57.07 30.35L57.07 30.35Q57.53 30.35 58.05 30.24Q58.56 30.12 59.08 29.84L59.08 29.84Q59.6 29.58 60.01 29.71Q60.42 29.84 60.66 30.19Q60.91 30.53 60.95 30.98Q60.99 31.44 60.79 31.86Q60.6 32.29 60.11 32.52L60.11 32.52Q59.23 32.96 58.36 33.15Q57.48 33.34 56.68 33.34ZM67.51 33.34L67.51 33.34Q66.12 33.34 65.01 32.8Q63.9 32.26 63.28 31.33Q62.66 30.4 62.66 29.24L62.66 29.24Q62.66 27.85 63.38 27.04Q64.11 26.23 65.73 25.88Q67.35 25.53 70.03 25.53L70.03 25.53L70.96 25.53L70.96 25.1Q70.96 23.96 70.44 23.48Q69.93 23.01 68.69 23.01L68.69 23.01Q68 23.01 67.18 23.18Q66.37 23.34 65.39 23.73L65.39 23.73Q64.83 23.99 64.39 23.85Q63.95 23.7 63.72 23.33Q63.49 22.96 63.49 22.51Q63.49 22.05 63.74 21.63Q64 21.2 64.59 21L64.59 21Q65.81 20.51 66.88 20.33Q67.95 20.15 68.85 20.15L68.85 20.15Q70.83 20.15 72.11 20.73Q73.38 21.31 74.03 22.51Q74.67 23.7 74.67 25.58L74.67 25.58L74.67 31.31Q74.67 32.26 74.21 32.78Q73.74 33.29 72.87 33.29Q71.99 33.29 71.51 32.78Q71.04 32.26 71.04 31.31L71.04 31.31L71.04 31.18Q70.86 31.64 70.57 32L70.57 32Q70.06 32.65 69.29 32.99Q68.51 33.34 67.51 33.34ZM70.96 28.06L70.96 27.54L70.06 27.54Q68.74 27.54 67.93 27.69Q67.12 27.83 66.77 28.16Q66.42 28.5 66.42 29.09L66.42 29.09Q66.42 29.81 66.93 30.28Q67.43 30.74 68.38 30.74L68.38 30.74Q69.13 30.74 69.71 30.39Q70.29 30.04 70.63 29.44Q70.96 28.83 70.96 28.06L70.96 28.06ZM82.53 33.34L82.53 33.34Q80.24 33.34 79.1 32.07Q77.97 30.79 77.97 28.27L77.97 28.27L77.97 16.64Q77.97 15.66 78.47 15.16Q78.98 14.66 79.93 14.66L79.93 14.66Q80.86 14.66 81.36 15.16Q81.86 15.66 81.86 16.64L81.86 16.64L81.86 28.11Q81.86 29.17 82.31 29.67Q82.76 30.17 83.51 30.17L83.51 30.17Q83.72 30.17 83.9 30.15Q84.08 30.12 84.28 30.12L84.28 30.12Q84.7 30.07 84.86 30.37Q85.03 30.66 85.03 31.54L85.03 31.54Q85.03 32.31 84.72 32.71Q84.41 33.11 83.77 33.24L83.77 33.24Q83.51 33.26 83.18 33.3Q82.84 33.34 82.53 33.34ZM91.5 33.34L91.5 33.34Q89.21 33.34 88.07 32.07Q86.94 30.79 86.94 28.27L86.94 28.27L86.94 16.64Q86.94 15.66 87.44 15.16Q87.94 14.66 88.9 14.66L88.9 14.66Q89.83 14.66 90.33 15.16Q90.83 15.66 90.83 16.64L90.83 16.64L90.83 28.11Q90.83 29.17 91.28 29.67Q91.73 30.17 92.48 30.17L92.48 30.17Q92.69 30.17 92.87 30.15Q93.05 30.12 93.25 30.12L93.25 30.12Q93.66 30.07 93.83 30.37Q94 30.66 94 31.54L94 31.54Q94 32.31 93.69 32.71Q93.38 33.11 92.74 33.24L92.74 33.24Q92.48 33.26 92.14 33.3Q91.81 33.34 91.5 33.34Z';

/** Page lines: one above and one below the word run the full width; the rest stop at it. */
const PAGE_LINES = [9.6, 16.8, 24, 31.2, 38.4];

export function Logo({ height = 44 }: { height?: number }) {
  const gap = useSvgId('logo-word-gap');
  return (
    <svg className="logo" height={height} width={(height * W) / 48} viewBox={`0 0 ${W} 48`} role="img" aria-label="Recall">
      <defs>
        {/* Page lines stop just short of the word; no border is drawn */}
        <mask id={gap} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height="48">
          <rect width={W} height="48" fill="#fff" />
          <rect x={WORD_BOX.x - 3} y={WORD_BOX.y - 1.2} width={WORD_BOX.width + 6} height={WORD_BOX.height + 2.4} fill="#000" />
        </mask>
      </defs>
      <Book mask={`url(#${gap})`} />
      <path d={WORD_PATH} fill="var(--accent)" />
    </svg>
  );
}

function Book({ mask }: { mask: string }) {
  const pages = useSvgId('logo-pages');
  return (
    <>
      <defs>
        <clipPath id={pages}>
          {/* Pages fill the cover, from just inside the spine's curve to just inside the fore-edge */}
          <path d={`M14 8.5H${W - 11}Q${W - 19} 24 ${W - 11} 39.5H14Q10.5 39.5 10.5 36Q9.8 24 10.5 12Q10.5 8.5 14 8.5Z`} />
        </clipPath>
      </defs>
      {/* Pages: fine lines that stop at the curved fore-edge */}
      <g mask={mask}>
        <g clipPath={`url(#${pages})`} stroke="var(--subtle)" strokeWidth="1.5" strokeLinecap="round" opacity="0.75">
          {PAGE_LINES.map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} />)}
        </g>
      </g>
      {/* Covers and spine: one band, twice as thick as a page line. The spine is nearly flat, with a slight bow and rounded corners. */}
      <path
        d={`M${W - 5} 4H13Q6 4 6 11Q4.6 24 6 37Q6 44 13 44H${W - 5}A1.5 1.5 0 0 0 ${W - 5} 41H13Q9 41 9 37Q7.8 24 9 11Q9 7 13 7H${W - 5}A1.5 1.5 0 0 0 ${W - 5} 4Z`}
        fill="var(--ink)"
      />
      {/* Fore-edge */}
      <path d={`M${W - 8} 7.8Q${W - 16} 24 ${W - 8} 40.2`} fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" />
    </>
  );
}
