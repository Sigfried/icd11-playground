import './Badge.css';

export type BadgeType = 'parents' | 'children' | 'descendants';

const SYMBOLS: Record<BadgeType, string> = {
  parents: '↑',
  children: '↓',
  descendants: '▽',
};

interface BadgeProps {
  type: BadgeType;
  count: number;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

const HELP_IDS: Record<BadgeType, string> = {
  parents: 'parent-badge',
  children: 'child-badge',
  descendants: 'descendant-badge',
};

export function Badge({ type, count, onClick, onMouseEnter, onMouseLeave }: BadgeProps) {
  const interactive = !!(onClick || onMouseEnter);

  return (
    <span
      className={`count-badge count-badge-${type}${interactive ? ' count-badge-interactive' : ''}`}
      title={interactive ? undefined : `${count} ${type}`}
      data-help-id={HELP_IDS[type]}
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
export function renderBadgeHTML(type: BadgeType, count: number, extraClass?: string): string {
  const classes = `count-badge count-badge-${type}${extraClass ? ` ${extraClass}` : ''}`;
  return `<span class="${classes}" data-help-id="${HELP_IDS[type]}">${count}${SYMBOLS[type]}</span>`;
}
