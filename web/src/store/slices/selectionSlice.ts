/**
 * Selection slice — coordinator for selectNode and NL mutation actions.
 *
 * selectNode touches: history (push snapshot), tree (navigate), highlighting (clear).
 * NL actions (expandChildren, removeNode, etc.) touch: history (push snapshot).
 */

import { currentSnapshot } from '../../state/nlHistory';
import { getNode, getChildren, getParents, getGraph } from '../../api/foundationData';
import { buildInitialNeighborhood, getAncestorDAG, type NeighborhoodMode } from '../../state/buildInitialNeighborhood';
import { buildNlSubgraph, removeNodeWithPruning, removeNodesWithPruning } from '../../state/nlSubgraph';
import { computeTreeNav } from './treeSlice';
import type { Snapshot } from '../../state/nlHistory';
import type { SetState, GetState } from '../types';

export type { NeighborhoodMode };

const MODE_LABELS: Record<NeighborhoodMode, string> = {
  1: 'Parents + Children',
  2: 'Ancestors + Children',
  3: 'Ancestors + Children + Child Ancestors',
};

/** BFS descendants of nodeId through `depth` levels. depth=1 = children, depth=2 = children+grandchildren, etc. */
function getDescendantsThrough(nodeId: string, depth: number): string[] {
  const result: string[] = [];
  let frontier = [nodeId];
  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const child of getChildren(id)) {
        result.push(child.id);
        nextFrontier.push(child.id);
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

/** Add IDs to a set, plus ancestor DAGs if mode is 3. */
function addWithMode3Ancestors(ids: string[], existing: Set<string>, mode: NeighborhoodMode): Set<string> {
  const next = new Set(existing);
  for (const id of ids) next.add(id);
  if (mode === 3) {
    for (const id of ids) {
      if (!existing.has(id)) {
        for (const aid of getAncestorDAG(id, getParents, next)) next.add(aid);
      }
    }
  }
  return next;
}

export interface SelectionSliceState {
  hoveredNodeId: string | null;
  highlightedNodeIds: Set<string>;
}

export interface SelectionSliceActions {
  setHoveredNodeId: (id: string | null) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  selectNode: (id: string | null) => void;
  expandNodes: (ids: string[], description: string) => void;
  expandChildren: (nodeId: string) => void;
  expandParents: (nodeId: string) => void;
  expandDescThrough: (nodeId: string, depth: number) => void;
  removeNode: (id: string) => void;
  removeChildren: (nodeId: string) => void;
  removeParents: (nodeId: string) => void;
  resetNeighborhood: () => void;
  setNeighborhoodMode: (mode: NeighborhoodMode) => void;
  setSearchQuery: (query: string) => void;
}

/** Push snapshot via the store's historySlice action (which updates derived state).
 *  Automatically carries forward neighborhoodMode from the previous snapshot
 *  unless the new snapshot explicitly sets it (via a 'mode' op). */
function push(get: GetState, snapshot: Snapshot): void {
  if (snapshot.neighborhoodMode === undefined) {
    const prev = currentSnapshot(get().history);
    snapshot.neighborhoodMode = prev?.neighborhoodMode ?? 2;
  }
  get().pushSnapshot(snapshot);
}

export function createSelectionSlice(set: SetState, get: GetState): SelectionSliceState & SelectionSliceActions {
  return {
    hoveredNodeId: null,
    highlightedNodeIds: new Set<string>(),

    setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
    setHighlightedNodeIds: (ids) => set({ highlightedNodeIds: ids }),

    selectNode: (id) => {
      set({ highlightedNodeIds: new Set() });
      const mode = get().neighborhoodMode;

      if (!id) {
        push(get, {
          focusNodeId: null,
          displayedNodeIds: new Set(),
          timestamp: Date.now(),
          description: 'Deselected',
        });
        return;
      }

      const title = getNode(id)?.title ?? id;
      const snapshot = currentSnapshot(get().history);

      if (snapshot && snapshot.displayedNodeIds.has(id)) {
        const newNeighborhood = buildInitialNeighborhood(id, getParents, getChildren, getNode, mode);
        const merged = new Set(snapshot.displayedNodeIds);
        for (const nid of newNeighborhood) merged.add(nid);
        push(get, {
          focusNodeId: id,
          displayedNodeIds: merged,
          timestamp: Date.now(),
          description: `Selected ${title}`,
          op: { type: 'reselect', nodeId: id },
        });
      } else {
        const nodeIds = buildInitialNeighborhood(id, getParents, getChildren, getNode, mode);
        push(get, {
          focusNodeId: id,
          displayedNodeIds: nodeIds,
          timestamp: Date.now(),
          description: `Selected ${title}`,
          op: { type: 'select', nodeId: id },
        });
      }

      // Navigate tree
      const nav = computeTreeNav(id, get().expandedRows);
      set(nav);
    },

    // Generic add — for single-node adds from overlay
    expandNodes: (ids, description) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot) return;
      const next = addWithMode3Ancestors(ids, snapshot.displayedNodeIds, get().neighborhoodMode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: next,
        timestamp: Date.now(),
        description,
        op: { type: 'add', ids },
      });
    },

    expandChildren: (nodeId) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot) return;
      const childIds = getChildren(nodeId).map(c => c.id);
      const title = getNode(nodeId)?.title ?? nodeId;
      const next = addWithMode3Ancestors(childIds, snapshot.displayedNodeIds, get().neighborhoodMode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: next,
        timestamp: Date.now(),
        description: `Added ${childIds.length} children of ${title}`,
        op: { type: 'addChildren', nodeId },
      });
    },

    expandParents: (nodeId) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot) return;
      const parentIds = getParents(nodeId).map(p => p.id);
      const title = getNode(nodeId)?.title ?? nodeId;
      const next = addWithMode3Ancestors(parentIds, snapshot.displayedNodeIds, get().neighborhoodMode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: next,
        timestamp: Date.now(),
        description: `Added ${parentIds.length} parents of ${title}`,
        op: { type: 'addParents', nodeId },
      });
    },

    expandDescThrough: (nodeId, depth) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot) return;
      const descIds = getDescendantsThrough(nodeId, depth);
      const title = getNode(nodeId)?.title ?? nodeId;
      const next = addWithMode3Ancestors(descIds, snapshot.displayedNodeIds, get().neighborhoodMode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: next,
        timestamp: Date.now(),
        description: `Added descendants of ${title} through depth ${depth}`,
        op: { type: 'addDescThrough', nodeId, depth },
      });
    },

    removeNode: (id) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot || !snapshot.focusNodeId) return;

      if (id === snapshot.focusNodeId) {
        push(get, {
          focusNodeId: null,
          displayedNodeIds: new Set(),
          timestamp: Date.now(),
          description: 'Removed focus node',
        });
        return;
      }

      const mainGraph = getGraph();
      const nlSubgraph = buildNlSubgraph(mainGraph, snapshot.displayedNodeIds);
      const { displayedNodeIds: newIds, prunedCount } = removeNodeWithPruning(
        nlSubgraph, id, snapshot.focusNodeId,
      );
      const title = getNode(id)?.title ?? id;
      const desc = prunedCount > 0
        ? `Removed ${title} (+${prunedCount} pruned)`
        : `Removed ${title}`;

      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: newIds,
        timestamp: Date.now(),
        description: desc,
        op: { type: 'remove', id },
      });
    },

    removeChildren: (nodeId) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot || !snapshot.focusNodeId) return;
      const childIds = getChildren(nodeId).map(c => c.id);

      if (childIds.includes(snapshot.focusNodeId)) {
        push(get, {
          focusNodeId: null,
          displayedNodeIds: new Set(),
          timestamp: Date.now(),
          description: 'Removed focus node',
        });
        return;
      }

      const mainGraph = getGraph();
      const nlSubgraph = buildNlSubgraph(mainGraph, snapshot.displayedNodeIds);
      const { displayedNodeIds: newIds } = removeNodesWithPruning(
        nlSubgraph, childIds, snapshot.focusNodeId,
      );
      const title = getNode(nodeId)?.title ?? nodeId;
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: newIds,
        timestamp: Date.now(),
        description: `Removed children of ${title}`,
        op: { type: 'removeChildren', nodeId },
      });
    },

    removeParents: (nodeId) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot || !snapshot.focusNodeId) return;
      const parentIds = getParents(nodeId).map(p => p.id);

      if (parentIds.includes(snapshot.focusNodeId)) {
        push(get, {
          focusNodeId: null,
          displayedNodeIds: new Set(),
          timestamp: Date.now(),
          description: 'Removed focus node',
        });
        return;
      }

      const mainGraph = getGraph();
      const nlSubgraph = buildNlSubgraph(mainGraph, snapshot.displayedNodeIds);
      const { displayedNodeIds: newIds } = removeNodesWithPruning(
        nlSubgraph, parentIds, snapshot.focusNodeId,
      );
      const title = getNode(nodeId)?.title ?? nodeId;
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: newIds,
        timestamp: Date.now(),
        description: `Removed parents of ${title}`,
        op: { type: 'removeParents', nodeId },
      });
    },

    resetNeighborhood: () => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot?.focusNodeId) return;
      const mode = get().neighborhoodMode;
      const title = getNode(snapshot.focusNodeId)?.title ?? snapshot.focusNodeId;
      const nodeIds = buildInitialNeighborhood(snapshot.focusNodeId, getParents, getChildren, getNode, mode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: nodeIds,
        timestamp: Date.now(),
        description: `Reset neighborhood for ${title}`,
        op: { type: 'reset' },
      });
    },

    setNeighborhoodMode: (mode) => {
      // Re-compute neighborhood with new mode (mode is derived from history via the 'mode' op)
      const snapshot = currentSnapshot(get().history);
      if (!snapshot?.focusNodeId) return;
      const nodeIds = buildInitialNeighborhood(snapshot.focusNodeId, getParents, getChildren, getNode, mode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: nodeIds,
        neighborhoodMode: mode,
        timestamp: Date.now(),
        description: `Mode: ${MODE_LABELS[mode]}`,
        op: { type: 'mode', mode },
      });
    },

    setSearchQuery: (query) => {
      const snapshot = currentSnapshot(get().history);
      const currentQuery = snapshot?.searchQuery ?? '';
      if (query === currentQuery) return;
      push(get, {
        focusNodeId: snapshot?.focusNodeId ?? null,
        displayedNodeIds: snapshot?.displayedNodeIds ?? new Set(),
        timestamp: Date.now(),
        description: query ? `Search: ${query}` : 'Cleared search',
        searchQuery: query || undefined,
      });
    },
  };
}
