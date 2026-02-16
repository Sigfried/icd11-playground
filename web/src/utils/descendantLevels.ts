/**
 * BFS computation of descendant levels from a root node.
 * Shared between NodeLinkView (NL tooltips) and TreeView (descendant tooltip).
 */

import type { ConceptNode } from '../api/foundationData';

export interface DescendantLevel {
  label: string;
  nodes: ConceptNode[];
  ids: string[];
  cumulative: number;
}

const LEVEL_LABELS = ['Children', 'Grandchildren', 'Great-grandchildren'];

/** Compute descendant levels (BFS) up to a depth limit */
export function computeDescendantLevels(
  rootId: string,
  getChildrenFn: (id: string) => ConceptNode[],
  maxDepth = 5,
): DescendantLevel[] {
  const levels: DescendantLevel[] = [];
  let currentIds = [rootId];
  let cumulativeCount = 0;
  const seen = new Set<string>([rootId]);

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextNodes: ConceptNode[] = [];
    for (const id of currentIds) {
      for (const child of getChildrenFn(id)) {
        if (!seen.has(child.id)) {
          seen.add(child.id);
          nextNodes.push(child);
        }
      }
    }
    if (nextNodes.length === 0) break;
    cumulativeCount += nextNodes.length;
    const label = depth < LEVEL_LABELS.length ? LEVEL_LABELS[depth] : `Depth ${depth + 1}`;
    levels.push({
      label,
      nodes: nextNodes,
      ids: nextNodes.map(n => n.id),
      cumulative: cumulativeCount,
    });
    currentIds = nextNodes.map(n => n.id);
  }
  return levels;
}
