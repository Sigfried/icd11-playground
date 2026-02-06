import { useEffect, useRef } from 'react';

/**
 * Hook for syncing selected node with URL search params.
 *
 * Only updates URL on explicit state changes (clicks), not on hover or other
 * transient interactions. Uses pushState for node changes so back/forward works.
 */

interface UrlStateOptions {
  /** Current selected node ID */
  selectedNodeId: string | null;
  /** Callback when URL state should be applied */
  onUrlState: (nodeId: string | null) => void;
}

export function useUrlState({ selectedNodeId, onUrlState }: UrlStateOptions) {
  const initializedRef = useRef(false);
  const isRestoringRef = useRef(false);

  // Read URL state on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get('node');

    if (nodeId) {
      isRestoringRef.current = true;
      onUrlState(nodeId);
    }
  }, [onUrlState]);

  // Sync URL when selected node changes (skip during restoration)
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

    const search = params.toString();
    const newUrl = search ? `?${search}` : window.location.pathname;

    window.history.pushState({}, '', newUrl);
  }, [selectedNodeId]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const nodeId = params.get('node');

      isRestoringRef.current = true;
      onUrlState(nodeId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onUrlState]);
}
