import { useCallback, useEffect, useRef, useState } from 'react';
import { type SearchResult, searchFoundation } from '../api/icd11';
import { searchNodes } from '../api/foundationData';
import { useGraph } from '../providers/GraphProvider';
import './TreeSearch.css';

export type SearchMode = 'search' | 'filter';

interface TreeSearchProps {
  onFilterChange: (matchIds: Set<string> | null, query: string) => void;
  onHighlightChange: (matchIds: Set<string> | null, query: string) => void;
}

/** Magnifying glass icon (14×14) */
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="6" cy="6" r="4.25" />
    <line x1="9" y1="9" x2="12.5" y2="12.5" />
  </svg>
);

/** Funnel icon (14×14) */
const FilterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 2.5h11l-4 4.5v4l-3 1.5V7z" />
  </svg>
);

export function TreeSearch({ onFilterChange, onHighlightChange }: TreeSearchProps) {
  const { hasNode, searchQuery, setSearchQuery } = useGraph();
  const [query, setQuery] = useState(searchQuery);
  const [mode, setMode] = useState<SearchMode>('search');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheRef = useRef(new Map<string, SearchResult[]>());
  // Track whether the current search was triggered externally (undo/redo)
  const externalUpdateRef = useRef(false);

  // Expose inputRef for keyboard shortcut focusing
  useEffect(() => {
    const el = inputRef.current;
    if (el) el.dataset.treeSearchInput = 'true';
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(q);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const apiResults = await searchFoundation(q, hasNode);
      cacheRef.current.set(q, apiResults);
      setResults(apiResults);
    } catch {
      // API unavailable — fall back to in-memory search
      const nodes = searchNodes(q);
      const fallbackResults: SearchResult[] = nodes.map(n => ({
        id: n.id,
        title: n.title,
        highlightedTitle: highlightText(n.title, q),
        score: 1,
      }));
      cacheRef.current.set(q, fallbackResults);
      setResults(fallbackResults);
    } finally {
      setLoading(false);
    }
  }, [hasNode]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setSearchQuery('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      await doSearch(val);
      setSearchQuery(val);
    }, 300);
  }, [doSearch, setSearchQuery]);

  // Push filter/highlight state to TreeView when results or mode change.
  // Use refs for callbacks to avoid re-triggering the effect when parent re-renders.
  const onFilterChangeRef = useRef(onFilterChange);
  const onHighlightChangeRef = useRef(onHighlightChange);
  onFilterChangeRef.current = onFilterChange;
  onHighlightChangeRef.current = onHighlightChange;

  useEffect(() => {
    if (!query.trim() || results.length === 0) {
      onFilterChangeRef.current(null, '');
      onHighlightChangeRef.current(null, '');
      return;
    }
    const ids = new Set(results.map(r => r.id));
    if (mode === 'filter') {
      onFilterChangeRef.current(ids, query);
      onHighlightChangeRef.current(null, '');
    } else {
      onFilterChangeRef.current(null, '');
      onHighlightChangeRef.current(ids, query);
    }
  }, [mode, results, query]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        clearSearch();
      } else {
        inputRef.current?.blur();
      }
    }
  }, [query, clearSearch]);

  // Sync from external searchQuery changes (undo/redo/session restore)
  useEffect(() => {
    if (searchQuery !== query) {
      externalUpdateRef.current = true;
      setQuery(searchQuery);
      if (searchQuery) {
        doSearch(searchQuery);
      } else {
        setResults([]);
      }
    }
    // Only react to searchQuery changes from context, not local query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const resultCount = loading ? null
    : !query.trim() ? null
    : `${results.length} result${results.length !== 1 ? 's' : ''}`;

  return (
    <div className="tree-search" data-help-id="tree-search">
      <div className="tree-search-bar">
        <input
          ref={inputRef}
          className="tree-search-input"
          placeholder="Search Foundation..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className="tree-search-spinner" />}
        {resultCount && <span className="tree-search-count">{resultCount}</span>}

        <div className="tree-search-modes">
          <button
            className={`tree-search-mode-btn${mode === 'search' ? ' active' : ''}`}
            onClick={() => setMode('search')}
            title="Highlight matches in tree"
          >
            <SearchIcon />
          </button>
          <button
            className={`tree-search-mode-btn${mode === 'filter' ? ' active' : ''}`}
            onClick={() => setMode('filter')}
            title="Filter tree to matches"
          >
            <FilterIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Client-side highlight for fallback search — wraps matches in <em> */
function highlightText(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeRegex(query);
  const re = new RegExp(`(${escaped})`, 'gi');
  return text.replace(re, '<em>$1</em>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
