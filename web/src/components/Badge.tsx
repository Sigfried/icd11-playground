/**
 * Count badge with font-weight proportional to count.
 *
 * Per-type count bins → font-weight mapping:
 *
 * Parents (shown when >1, range 2–9):
 *   300: 2 | 650: 3–4 | 900: 5+
 *
 * Children (range 1–331):
 *   200: 1 | 500: 2–3 | 700: 4–7 | 900: 8+
 *
 * Descendants (shown when > childCount, range 2–69477):
 *   300: 2–4 | 500: 5–11 | 800: 12–45 | 900: 46+
 */

import './Badge.css';

export type BadgeType = 'parents' | 'children' | 'descendants';

const SYMBOLS: Record<BadgeType, string> = {
  parents: '↑',
  children: '↓',
  descendants: '▽',
};

// [upperCountBound, weight] pairs per type. Above last bound → last weight.
const BINS: Record<BadgeType, Array<[number, number]>> = {
  parents:     [[2, 300], [4, 650], [Infinity, 900]],
  children:    [[1, 200], [3, 500], [7, 700], [Infinity, 900]],
  descendants: [[4, 300], [11, 500], [45, 800], [Infinity, 900]],
};

export function badgeWeight(type: BadgeType, count: number): number {
  for (const [upper, weight] of BINS[type]) {
    if (count <= upper) return weight;
  }
  return 400;
}

interface BadgeProps {
  type: BadgeType;
  count: number;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

export function Badge({ type, count, onClick, onMouseEnter, onMouseLeave }: BadgeProps) {
  const weight = badgeWeight(type, count);
  const interactive = !!(onClick || onMouseEnter);

  return (
    <span
      className={`count-badge count-badge-${type}${interactive ? ' count-badge-interactive' : ''}`}
      style={{ fontWeight: weight }}
      title={`${count} ${type}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {count}{SYMBOLS[type]}
    </span>
  );
}

/**
 * Render badge as an HTML string — for D3/foreignObject contexts
 * where we can't use React components directly.
 */
export function renderBadgeHTML(type: BadgeType, count: number): string {
  const weight = badgeWeight(type, count);
  return `<span class="count-badge count-badge-${type}" style="font-weight: ${weight}">${count}${SYMBOLS[type]}</span>`;
}
