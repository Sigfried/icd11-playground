import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import Graph from 'graphology';

/**
 * Graph context for ICD-11 Foundation data
 *
 * Uses graphology.js to store the Foundation polyhierarchy.
 * Provides lazy loading of nodes as the user navigates.
 *
 * NOTE: Layout is currently handled by elkjs, but we may switch to
 * Python/igraph backend for better control over hierarchical layouts
 * (forced vertical layering). See icd11-visual-interface-spec.md.
 */

interface ConceptNode {
  id: string;
  title: string;
  definition?: string;
  parentCount: number;
  childCount: number;
  loaded: boolean; // whether children have been fetched
}

interface GraphContextValue {
  graph: Graph<ConceptNode>;
  selectedNodeId: string | null;
  expandedNodes: Set<string>;
  selectNode: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  loadNode: (id: string) => Promise<void>;
  loadChildren: (id: string) => Promise<void>;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function useGraph() {
  const context = useContext(GraphContext);
  if (!context) {
    throw new Error('useGraph must be used within a GraphProvider');
  }
  return context;
}

interface GraphProviderProps {
  children: ReactNode;
}

export function GraphProvider({ children }: GraphProviderProps) {
  const [graph] = useState(() => new Graph<ConceptNode>());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const loadNode = useCallback(async (id: string) => {
    // TODO: Fetch from ICD-11 API
    // For now, this is a stub
    console.log('loadNode:', id);
  }, []);

  const loadChildren = useCallback(async (id: string) => {
    // TODO: Fetch children from ICD-11 API
    // For now, this is a stub
    console.log('loadChildren:', id);
  }, []);

  const value: GraphContextValue = {
    graph,
    selectedNodeId,
    expandedNodes,
    selectNode,
    toggleExpand,
    loadNode,
    loadChildren,
  };

  return (
    <GraphContext.Provider value={value}>
      {children}
    </GraphContext.Provider>
  );
}
