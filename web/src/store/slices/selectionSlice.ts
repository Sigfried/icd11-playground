/**
 * Selection slice — coordinator for selectNode and NL mutation actions.
 *
 * selectNode touches: history (push snapshot), tree (navigate), highlighting (clear).
 * NL actions (expandNodes, removeNode, etc.) touch: history (push snapshot).
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

const STORAGE_KEY_MODE = 'icd11-neighborhood-mode';

function loadMode(): NeighborhoodMode {
  const raw = localStorage.getItem(STORAGE_KEY_MODE);
  if (raw === '1' || raw === '2' || raw === '3') return Number(raw) as NeighborhoodMode;
  return 2;
}

export interface SelectionSliceState {
  hoveredNodeId: string | null;
  highlightedNodeIds: Set<string>;
  neighborhoodMode: NeighborhoodMode;
}

export interface SelectionSliceActions {
  setHoveredNodeId: (id: string | null) => void;
  setHighlightedNodeIds: (ids: Set<string>) => void;
  selectNode: (id: string | null) => void;
  expandNodes: (ids: string[], description: string) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[], description: string) => void;
  resetNeighborhood: () => void;
  setNeighborhoodMode: (mode: NeighborhoodMode) => void;
  setSearchQuery: (query: string) => void;
}

/** Push snapshot via the store's historySlice action (which updates derived state). */
function push(get: GetState, snapshot: Snapshot): void {
  get().pushSnapshot(snapshot);
}

export function createSelectionSlice(set: SetState, get: GetState): SelectionSliceState & SelectionSliceActions {
  return {
    hoveredNodeId: null,
    highlightedNodeIds: new Set<string>(),
    neighborhoodMode: loadMode(),

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

    expandNodes: (ids, description) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot) return;
      const next = new Set(snapshot.displayedNodeIds);
      for (const id of ids) next.add(id);

      // Mode 3: also add ancestor DAGs for newly added nodes
      if (get().neighborhoodMode === 3) {
        for (const id of ids) {
          if (!snapshot.displayedNodeIds.has(id)) {
            const ancestors = getAncestorDAG(id, getParents, next);
            for (const aid of ancestors) next.add(aid);
          }
        }
      }

      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: next,
        timestamp: Date.now(),
        description,
        op: { type: 'add', ids },
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

    removeNodes: (ids, description) => {
      const snapshot = currentSnapshot(get().history);
      if (!snapshot || !snapshot.focusNodeId) return;

      if (ids.includes(snapshot.focusNodeId)) {
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
        nlSubgraph, ids, snapshot.focusNodeId,
      );

      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: newIds,
        timestamp: Date.now(),
        description,
        op: { type: 'removeBatch', ids },
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
      localStorage.setItem(STORAGE_KEY_MODE, String(mode));
      set({ neighborhoodMode: mode });

      // Re-compute neighborhood with new mode
      const snapshot = currentSnapshot(get().history);
      if (!snapshot?.focusNodeId) return;
      const nodeIds = buildInitialNeighborhood(snapshot.focusNodeId, getParents, getChildren, getNode, mode);
      push(get, {
        focusNodeId: snapshot.focusNodeId,
        displayedNodeIds: nodeIds,
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
