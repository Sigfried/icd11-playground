import { useEffect, useRef } from 'react';

/**
 * Hook for syncing selected node and manual expansions with URL search params.
 *
 * Only updates URL on explicit state changes (clicks), not on hover or other
 * transient interactions. Uses pushState for node changes so back/forward works.
 *
 * URL format: ?node=ID&expanded=id1,id2,id3
 */

interface UrlStateOptions {
  /** Current selected node ID */
  selectedNodeId: string | null;
  /** Current manually expanded node IDs */
  manualNodeIds: Set<string>;
  /** Callback when URL state should be applied */
  onUrlState: (nodeId: string | null, expandedIds: string[]) => void;
}

export function useUrlState({ selectedNodeId, manualNodeIds, onUrlState }: UrlStateOptions) {
  const initializedRef = useRef(false);
  const isRestoringRef = useRef(false);

  // Read URL state on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get('node');
    const expanded = params.get('expanded');
    const expandedIds = expanded ? expanded.split(',').filter(Boolean) : [];

    if (nodeId) {
      isRestoringRef.current = true;
      onUrlState(nodeId, expandedIds);
    }
  }, [onUrlState]);

  // Sync URL when selected node or manual expansions change (skip during restoration)
  useEffect(() => {
    if (isRestoringRef.current) {
      // Don't clear URL while we're restoring from it.
      // The flag stays true until selectedNodeId matches the URL target.
      const params = new URLSearchParams(window.location.search);
      const urlNodeId = params.get('node');
      if (selectedNodeId === urlNodeId) {
        isRestoringRef.current = false;
      }
      return;
    }

    const params = new URLSearchParams();
    if (selectedNodeId) {
      params.set('node', selectedNodeId);
    }
    if (manualNodeIds.size > 0) {
      params.set('expanded', [...manualNodeIds].join(','));
    }

    const search = params.toString();
    const newUrl = search ? `?${search}` : window.location.pathname;

    window.history.pushState({}, '', newUrl);
  }, [selectedNodeId, manualNodeIds]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nodeId = params.get('node');
      const expanded = params.get('expanded');
      const expandedIds = expanded ? expanded.split(',').filter(Boolean) : [];

      isRestoringRef.current = true;
      onUrlState(nodeId, expandedIds);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onUrlState]);
}
