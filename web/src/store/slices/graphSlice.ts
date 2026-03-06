/**
 * Graph initialization slice.
 *
 * Owns: graphLoading, rootId, graph init from IndexedDB/fetch.
 */

import {
  initGraph as fdInitGraph,
  getNode,
  getChildren,
  getParents,
  hasNode,
  getDetail,
  getGraph,
  getPathsToRoot,
} from '../../api/foundationData';
import { type FoundationGraphJson, foundationStore } from '../../api/foundationStore';
import type { GraphMeta } from '../../api/foundationStore';
import type { SetState, GetState } from '../types';

export interface GraphSliceState {
  graphLoading: boolean;
  rootId: string | null;

  // Re-exported foundationData functions (stable references)
  getNode: typeof getNode;
  getChildren: typeof getChildren;
  getParents: typeof getParents;
  hasNode: typeof hasNode;
  getDetail: typeof getDetail;
  getGraph: typeof getGraph;
  getPathsToRoot: typeof getPathsToRoot;
}

export interface GraphSliceActions {
  initGraph: () => Promise<void>;
}

export function createGraphSlice(set: SetState, _get: GetState): GraphSliceState & GraphSliceActions {
  return {
    graphLoading: true,
    rootId: null,

    getNode,
    getChildren,
    getParents,
    hasNode,
    getDetail,
    getGraph,
    getPathsToRoot,

    initGraph: async () => {
      try {
        let data = await foundationStore.getGraph();
        if (!data) {
          console.log('Fetching foundation_graph.json...');
          const resp = await fetch(`${import.meta.env.BASE_URL}foundation_graph.json`);
          if (!resp.ok) throw new Error(`Failed to fetch graph: ${resp.status}`);
          data = await resp.json() as FoundationGraphJson;
          foundationStore.putGraph(data).catch(err =>
            console.warn('Failed to cache graph in IndexedDB:', err)
          );
        } else {
          console.log('Loaded graph from IndexedDB cache');
        }

        const meta = data._meta as GraphMeta | undefined;
        delete data._meta;
        fdInitGraph(data, meta?.release);

        set({
          rootId: 'root',
          expandedPaths: new Set(['root']),
          graphLoading: false,
        });
      } catch (error) {
        console.error('Failed to load Foundation graph:', error);
        set({ graphLoading: false });
      }
    },
  };
}
