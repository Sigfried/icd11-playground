import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type SearchResult, searchFoundation } from '../api/icd11';
import { searchNodes } from '../api/foundationData';
import { useGraph } from '../providers/GraphProvider';
import './TreeSearch.css';

export type SearchMode = 'dropdown' | 'filter' | 'highlight';

interface TreeSearchProps {
  onFilterChange: (matchIds: Set<string> | null, query: string) => void;
  onHighlightChange: (matchIds: Set<string> | null, query: string) => void;
  onNavigateToMatch: (nodeId: string) => void;
}

export function TreeSearch({ onFilterChange, onHighlightChange, onNavigateToMatch }: TreeSearchProps) {
  const { selectNode, hasNode } = useGraph();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('dropdown');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheRef = useRef(new Map<string, SearchResult[]>());
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    setFocusedIndex(-1);
    setCurrentMatchIdx(0);

    clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }
    setDropdownOpen(true);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }, [doSearch]);

  // Push filter/highlight state to TreeView when results or mode change
  useEffect(() => {
    if (!query.trim() || results.length === 0) {
      onFilterChange(null, '');
      onHighlightChange(null, '');
      return;
    }
    const ids = new Set(results.map(r => r.id));
    if (mode === 'filter') {
      onFilterChange(ids, query);
      onHighlightChange(null, '');
    } else if (mode === 'highlight') {
      onFilterChange(null, '');
      onHighlightChange(ids, query);
    } else {
      onFilterChange(null, '');
      onHighlightChange(null, '');
    }
  }, [mode, results, query, onFilterChange, onHighlightChange]);

  const navigateMatch = useCallback((dir: number) => {
    if (results.length === 0) return;
    const next = (currentMatchIdx + dir + results.length) % results.length;
    setCurrentMatchIdx(next);
    onNavigateToMatch(results[next].id);
  }, [results, currentMatchIdx, onNavigateToMatch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setDropdownOpen(false);
    setFocusedIndex(-1);
    setCurrentMatchIdx(0);
  }, []);

  // Dropdown keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mode === 'dropdown' && dropdownOpen && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        selectNode(results[focusedIndex].id);
        setDropdownOpen(false);
      }
    }

    if (mode === 'highlight' && results.length > 0) {
      if (e.key === 'Enter' || e.key === 'F3') {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        navigateMatch(dir);
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        clearSearch();
      } else {
        inputRef.current?.blur();
      }
    }
  }, [mode, dropdownOpen, results, focusedIndex, selectNode, query, clearSearch, navigateMatch]);

  // Scroll focused dropdown item into view
  useEffect(() => {
    if (focusedIndex < 0 || !dropdownRef.current) return;
    const item = dropdownRef.current.children[focusedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const handleModeChange = useCallback((newMode: SearchMode) => {
    setMode(newMode);
    setDropdownOpen(newMode === 'dropdown' && results.length > 0 && query.trim() !== '');
  }, [results.length, query]);

  const handleResultClick = useCallback((id: string) => {
    selectNode(id);
    setDropdownOpen(false);
  }, [selectNode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!target) return;
      const searchEl = inputRef.current?.closest('.tree-search');
      if (searchEl && !searchEl.contains(target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const resultCount = useMemo(() => {
    if (loading) return null;
    if (!query.trim()) return null;
    return `${results.length} result${results.length !== 1 ? 's' : ''}`;
  }, [loading, query, results.length]);

  return (
    <div className="tree-search">
      <div className="tree-search-bar">
        <input
          ref={inputRef}
          className="tree-search-input"
          placeholder="Search Foundation..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (mode === 'dropdown' && results.length > 0 && query.trim()) {
              setDropdownOpen(true);
            }
          }}
        />
        {loading && <span className="tree-search-spinner" />}
        {resultCount && <span className="tree-search-count">{resultCount}</span>}

        <div className="tree-search-modes">
          {(['dropdown', 'filter', 'highlight'] as const).map(m => (
            <button
              key={m}
              className={`tree-search-mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => handleModeChange(m)}
              title={modeLabels[m]}
            >
              {modeIcons[m]}
            </button>
          ))}
        </div>

        {mode === 'highlight' && results.length > 0 && (
          <div className="tree-search-nav">
            <span className="tree-search-pos">
              {currentMatchIdx + 1}/{results.length}
            </span>
            <button className="tree-search-nav-btn" onClick={() => navigateMatch(-1)} title="Previous (Shift+Enter)">&#9650;</button>
            <button className="tree-search-nav-btn" onClick={() => navigateMatch(1)} title="Next (Enter)">&#9660;</button>
          </div>
        )}
      </div>

      {mode === 'dropdown' && dropdownOpen && results.length > 0 && (
        <div className="tree-search-dropdown" ref={dropdownRef}>
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`tree-search-result${i === focusedIndex ? ' focused' : ''}`}
              onClick={() => handleResultClick(r.id)}
              onMouseEnter={() => setFocusedIndex(i)}
            >
              <span
                className="tree-search-result-title"
                dangerouslySetInnerHTML={{ __html: r.highlightedTitle }}
              />
              {r.matchedProperty && (
                <span className="tree-search-result-badge">{r.matchedProperty}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const modeIcons: Record<SearchMode, string> = {
  dropdown: '▾',
  filter: '⊟',
  highlight: '✦',
};

const modeLabels: Record<SearchMode, string> = {
  dropdown: 'Dropdown results',
  filter: 'Filter tree',
  highlight: 'Highlight in tree',
};

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
