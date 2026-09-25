Implement the search dropdown rewrite from search-rewrite-plan.md (in Claude memory).

Summary: Replace inline tree search (highlight/filter modes feeding into tree
rendering) with a WHO Foundation Browser-style dropdown. Type → results appear
in a dropdown below the input → click to selectNode(). Tree/Filter modes become
purely about how the selected node's context is displayed, no longer interact
with search results.

Key changes:
- TreeSearch.tsx: major rewrite — input + dropdown + keyboard nav. Props change
  from onFilterChange/onHighlightChange to onSelect(id).
- TreeView.tsx: remove SearchContext, filterMatchIds, highlightMatchIds,
  highlightQuery, auto-expand-on-search effect, highlightTitle(). The
  effectiveFilterMatchIds simplifies to just the selected node in filter mode.
  TreeNode loses isSearchMatch, search-match class. Also fix the filter button
  title (use "Filtered to..." when active, context-dependent text — details in
  search-rewrite-plan.md under "Known issues to fix during rewrite").
- TreeSearch.css: new dropdown styles, remove .search-match and mark styles.
- Advanced search: expandable panel with field checkboxes (Title, Synonym,
  Narrower Term, etc.) → propertiesToBeSearched param. Persist to localStorage.

The plan has full details including dropdown behavior, grouping (indent results
whose parent is also a result), keyboard handling, and file-by-file changes.
