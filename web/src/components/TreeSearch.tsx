import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type SearchResult, searchFoundation } from '../api/icd11';
import { searchNodes } from '../api/foundationData';
import { useAppStore } from '../store/appStore';
import './TreeSearch.css';

export type SearchMode = 'search' | 'filter';

interface TreeSearchProps {
  onSelect: (id: string) => void;
}

/** Magnifying glass icon (14×14) */
export const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="6" cy="6" r="4.25" />
    <line x1="9" y1="9" x2="12.5" y2="12.5" />
  </svg>
);

/** Funnel icon (14×14) */
export const FilterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 2.5h11l-4 4.5v4l-3 1.5V7z" />
  </svg>
);

/** Searchable property fields (maps to API's propertiesToBeSearched) */
const SEARCH_FIELDS = [
  { key: 'Title', label: 'Title' },
  { key: 'Synonym', label: 'Synonym' },
  { key: 'NarrowerTerm', label: 'Narrower Term' },
  { key: 'FullySpecifiedName', label: 'Fully Specified Name' },
  { key: 'Definition', label: 'Description' },
  { key: 'Exclusion', label: 'Exclusion' },
] as const;

const STORAGE_KEY_FIELDS = 'icd11-search-fields';

function loadSavedFields(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIELDS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveFields(fields: string[]): void {
  localStorage.setItem(STORAGE_KEY_FIELDS, JSON.stringify(fields));
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

/**
 * Group results hierarchically: if a result's parent is also in the result set,
 * indent it one level. Simple single-level grouping.
 */
function groupResults(
  results: SearchResult[],
  getParents: (id: string) => { id: string }[],
): Array<SearchResult & { indented: boolean }> {
  const resultIds = new Set(results.map(r => r.id));
  return results.map(r => {
    const parents = getParents(r.id);
    const indented = parents.some(p => resultIds.has(p.id));
    return { ...r, indented };
  });
}

export function TreeSearch({ onSelect }: TreeSearchProps) {
  const hasNode = useAppStore(s => s.hasNode);
  const getParents = useAppStore(s => s.getParents);
  const searchQuery = useAppStore(s => s.searchQuery);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);

  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchFields, setSearchFields] = useState<string[]>(loadSavedFields);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheRef = useRef(new Map<string, SearchResult[]>());
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose inputRef for keyboard shortcut focusing
  useEffect(() => {
    const el = inputRef.current;
    if (el) el.dataset.treeSearchInput = 'true';
  }, []);

  // Cache key includes search fields
  const cacheKey = useCallback((q: string) =>
    searchFields.length > 0 ? `${q}||${searchFields.join(',')}` : q,
  [searchFields]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    const key = cacheKey(q);
    const cached = cacheRef.current.get(key);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setShowDropdown(true);
      setSelectedIdx(-1);
      return;
    }

    setLoading(true);
    try {
      const opts = searchFields.length > 0 ? { properties: searchFields } : undefined;
      const apiResults = await searchFoundation(q, hasNode, opts);
      cacheRef.current.set(key, apiResults);
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
      cacheRef.current.set(key, fallbackResults);
      setResults(fallbackResults);
    } finally {
      setLoading(false);
      setShowDropdown(true);
      setSelectedIdx(-1);
    }
  }, [hasNode, searchFields, cacheKey]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setShowDropdown(false);
      setSearchQuery('');
      return;
    }
    debounceRef.current = setTimeout(async () => {
      await doSearch(val);
      setSearchQuery(val);
    }, 300);
  }, [doSearch, setSearchQuery]);

  const selectResult = useCallback((id: string) => {
    onSelect(id);
    setShowDropdown(false);
  }, [onSelect]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showDropdown) {
        setShowDropdown(false);
      } else if (query) {
        clearSearch();
      } else {
        inputRef.current?.blur();
      }
      return;
    }

    if (!showDropdown || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        selectResult(results[selectedIdx].id);
      }
    }
  }, [showDropdown, results, selectedIdx, query, clearSearch, selectResult]);

  // Scroll selected item into view in dropdown
  useEffect(() => {
    if (selectedIdx < 0 || !dropdownRef.current) return;
    const item = dropdownRef.current.children[selectedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Re-open dropdown when focusing input with existing results
  const handleInputFocus = useCallback(() => {
    if (results.length > 0 && query.trim()) {
      setShowDropdown(true);
    }
  }, [results, query]);

  // Sync from external searchQuery changes (undo/redo/session restore)
  useEffect(() => {
    if (searchQuery !== query) {
      setQuery(searchQuery);
      if (searchQuery) {
        doSearch(searchQuery);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    }
    // Only react to searchQuery changes from store, not local query changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Advanced search field toggle
  const toggleField = useCallback((field: string) => {
    setSearchFields(prev => {
      const next = prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field];
      saveFields(next);
      // Clear cache since field selection changed
      cacheRef.current.clear();
      return next;
    });
  }, []);

  // Grouped results for dropdown
  const grouped = useMemo(
    () => groupResults(results, getParents),
    [results, getParents],
  );

  const resultCount = loading ? null
    : !query.trim() ? null
    : `${results.length} result${results.length !== 1 ? 's' : ''}`;

  return (
    <div className="tree-search" ref={containerRef} data-help-id="tree-search">
      <div className="tree-search-bar">
        <SearchIcon />
        <input
          ref={inputRef}
          className="tree-search-input"
          placeholder="Search Foundation..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
        />
        {loading && <span className="tree-search-spinner" />}
        {resultCount && <span className="tree-search-count">{resultCount}</span>}
        {query && (
          <button className="tree-search-clear" onClick={clearSearch} title="Clear search">×</button>
        )}
        <button
          className={`tree-search-advanced-toggle${showAdvanced ? ' active' : ''}`}
          onClick={() => setShowAdvanced(p => !p)}
          title="Advanced search options"
        >
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
      </div>

      {showAdvanced && (
        <div className="tree-search-advanced" data-help-id="tree-search-advanced">
          <span className="tree-search-advanced-label">Search in:</span>
          {SEARCH_FIELDS.map(f => (
            <label key={f.key} className="tree-search-field-checkbox">
              <input
                type="checkbox"
                checked={searchFields.includes(f.key)}
                onChange={() => toggleField(f.key)}
              />
              {f.label}
            </label>
          ))}
          {searchFields.length === 0 && (
            <span className="tree-search-field-hint">All fields (default)</span>
          )}
        </div>
      )}

      {showDropdown && (query.trim() || loading) && (
        <div className="tree-search-dropdown" ref={dropdownRef}>
          {loading && results.length === 0 && (
            <div className="tree-search-dropdown-loading">Searching...</div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="tree-search-dropdown-empty">No results found</div>
          )}
          {grouped.map((r, i) => (
            <div
              key={r.id}
              className={[
                'tree-search-result',
                i === selectedIdx && 'keyboard-selected',
                r.indented && 'indented',
              ].filter(Boolean).join(' ')}
              onMouseDown={(e) => { e.preventDefault(); selectResult(r.id); }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <span
                className="tree-search-result-title"
                dangerouslySetInnerHTML={{ __html: r.highlightedTitle }}
              />
              {r.matchedProperty && (
                <span className="tree-search-result-property">
                  {r.matchedProperty}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
