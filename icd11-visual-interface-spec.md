# ICD-11 Visual Maintenance Interface — Design Specification

**Remaining work only.** For implemented feature documentation, see [help-content.md](web/src/assets/help-content.md). For architecture and setup, see [CLAUDE.md](CLAUDE.md).

---

## Remaining Work

Legend: :yellow_circle: Needs design | :white_circle: Not started | :black_circle: Future

| Area | Feature | Status |
|------|---------|--------|
| **Scalability** | Collapse heuristics for tree | :white_circle: |
| | Adaptive NL node sizing | :white_circle: |
| | L-shape ancestor layout | :white_circle: |
| | Staggered levels (Labella.js-style) | :white_circle: |
| | Layout engine evaluation (elkjs vs igraph) | :white_circle: |
| | ELK partitioning experiments | :white_circle: |
| | Alternative ELK algorithms | :white_circle: |
| | Layout comparison infrastructure | :white_circle: |
| | Focus node vertical positioning | :white_circle: |
| | Fit-to-view cycling (fit all / fit width / fit height) | :white_circle: |
| **NL Diagram** | Foundation ordering of siblings | :yellow_circle: Partially (model order hint) |
| | NL hover → tree highlight (cross-panel) | :white_circle: |
| | Subgraph Shape View (drillable icicle/sunburst) | :yellow_circle: |
| **Tree View** | Polyhierarchy occurrence navigation | :white_circle: |
| | Search rewrite: dropdown results + advanced search | :yellow_circle: Plan in Claude memory |
| | ~~Filter mode: show expanded children of matches~~ | :green_circle: Done |
| | Filter button: context-dependent title text | :yellow_circle: Deferred to search rewrite |
| | Ancestor path hover: scroll + highlight target only | :yellow_circle: |
| **Detail Panel** | ~~Display `fullySpecifiedName`~~ | :green_circle: Done |
| | Paths to root / Ancestors section redesign | :yellow_circle: |
| | Detail panel differentiation from tree | :yellow_circle: |
| **Data Model** | Foundation cross-references (maternal, perinatal, impairment) | :white_circle: |
| | Canonical vs linked parents | :white_circle: Investigation |
| **State & History** | History review UI (timeline panel) | :white_circle: |
| | Auto-clear old snapshots | :white_circle: |
| | Tree & detail state in history | :white_circle: |
| **Architecture** | ~~GraphProvider refactor → Zustand store + materialized tree~~ | :green_circle: Done |
| **Infrastructure** | Multi-tab IndexedDB history conflict (last-write-wins overwrites other tabs) | :white_circle: Bug |
| | Foundation version switching | :white_circle: |
| **Help System** | First-visit guided tour | :white_circle: |
| | Stakeholder feedback mechanism | :white_circle: |
| **Proposal Authoring** | All features | :black_circle: |

---

## Scalability & Readability

The core ongoing design challenge. High-degree nodes (up to 331 children) and complex polyhierarchies (up to 9 parents) make views unreadable.

### Graph stats reference

- **Nodes:** 69,478 | **Edges:** 77,510
- **Max children:** 331 ("Syndromic conditions with disorders of intellectual development as a relevant clinical feature")
- **Max parents:** 9
- **Longest path:** 13 edges (e.g., root → ... → Proximal interphalangeal joint of index finger)
- **Polyhierarchy nodes:** 11,345 (16%) have depth ≠ maxDepth

### What's been done

Ancestors to depth 2, collapsible clusters (threshold: 2), font-weight badges, interactive overlays (hover to preview, click to expand), connectivity-based node removal, merge-on-reselect. These are all documented in [help-content.md](web/src/assets/help-content.md). NL collapse heuristics are currently handled by cluster nodes, but other approaches should be explored.

### Remaining approaches

- **Tree collapse heuristics**: When expanding a node with hundreds of children, consider paginating or progressive expansion. Auto-collapse deep/large subtrees based on depth, subtree size, or user preference.

- **Adaptive NL node sizing**: Reduce node heights and vertical spacing between nodes when the layout exceeds the NL view height. Could be automatic (measure total layout height vs viewport) or manual (density slider).

- **L-shape ancestor layout**: When more than ~2 ancestor nodes are shown, arrange ancestors in a top-to-bottom group (vertical stack) while descendants continue cascading to the right. This keeps ancestor clutter from widening the layout horizontally.

- **Staggered levels**: [Labella.js](https://twitter.github.io/labella.js/)-style overlap avoidance for node labels. Try both simple and overlap algorithms. Horizontal flow variant: https://twitter.github.io/labella.js/with_text.html. May require replacing elkjs.

- **Layout engine**: Evaluate elkjs vs igraph vs manual layout. See [dedicated section](#layout-engine-evaluation--igraph-vs-elk).

- **ELK partitioning**: Experiment with [ELK partitioning](https://rtsys.informatik.uni-kiel.de/elklive/examples.html?e=user-hints%2Flayered%2Fpartitioning) to group nodes by depth or distance from focus node. This could visually separate "upstream ancestors" from "downstream descendants" without changing the algorithm.

- **Alternative ELK algorithms**: The current layout uses `elk.layered`. Other ELK algorithms worth trying:
  - `org.eclipse.elk.graphviz.dot` — Graphviz dot integration (if available)
  - `org.eclipse.elk.mrtree` — Mr. Tree algorithm, designed for trees
  - `org.eclipse.elk.force` — ELK's own force-directed
  - `org.eclipse.elk.stress` — Stress-based layout
  - See [ELK algorithm reference](https://eclipse.dev/elk/reference/algorithms.html)

- **Layout comparison infrastructure**: Need a way to experiment with layout approaches and compare them side by side. Could be as simple as a dropdown/toggle that switches algorithms and preserves the same subgraph, or a split view showing two layouts simultaneously. Essential for evaluating all the above experiments.

- **Focus node vertical positioning**: Place focus node near top or aligned with tree selection, rather than wherever ELK puts it.

- **Fit-to-view cycling**: The `⊡` button should cycle through three modes:
  1. **Fit all** — current behavior
  2. **Fit width** — horizontal extent fills viewport, vertical scrolls
  3. **Fit height** — vertical extent fills viewport, horizontal scrolls
  Visual indicator: cycle icon `⊡` → `↔` → `↕` → `⊡`.

- **Fisheye**: Defer unless the above approaches don't suffice.

### Stress test reference

Nodes with the most parents in the Foundation — worst cases for layout readability:

| Parents | Depth | Node | ID |
|---------|-------|------|----|
| 9 | 4 | [Injury or harm arising from surgical or medical care, NEC](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMzgzMTA0MzQwIl1dfQ) | 383104340 |
| 9 | 5 | [Dyskeratosis congenita](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMTUzMTAzMzkzNiJdXX0) | 1531033936 |
| 7 | 9 | [DPT-HepB-MenAC vaccines](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMTAyNDEzNzgiXV19) | 10241378 |
| 7 | 6 | [Kearns-Sayre syndrome](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMzk5MTAwNzQ1Il1dfQ) | 399100745 |
| 7 | 9 | [DPT-IPV-Hib-HepB vaccines](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMTIzNDQ3MDkwMSJdXX0) | 1234470901 |
| 7 | 5 | [Ataxia-telangiectasia](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMjEyOTAzNjU1MiJdXX0) | 2129036552 |
| 6 | 6 | [Zellweger syndrome](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMjI2MDIzNzE4Il1dfQ) | 226023718 |
| 6 | 5 | [Bannayan-Riley-Ruvalcaba syndrome](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiMzU3MzgzNDQ3Il1dfQ) | 357383447 |
| 6 | 9 | [DPT-IPV-Hib vaccines](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiNjc1MTIyNjc5Il1dfQ) | 675122679 |
| 6 | 6 | [Hereditary haemorrhagic telangiectasia](https://sigfried.github.io/icd11-playground/?s=eyJ2IjoiMjAyNC0wMSIsIm9wcyI6W1sic2VsZWN0IiwiNzE0NDA2MTkyIl1dfQ) | 714406192 |

Nodes with the most children — worst cases for vertical space:

| Children | Node | ID |
|----------|------|----|
| 331 | Syndromic conditions with disorders of intellectual development... | 426937915 |
| 300 | Other local antifungal, anti-infective and anti-inflammatory drugs | 2063870164 |
| 199 | Nerve | 519578830 |
| 193 | Adenomas and adenocarcinomas- ICD-O3 view | 2063258813 |
| 182 | Syndromes with multiple structural anomalies, not of environmental origin | 1106405864 |

**Observations:**
- Even single-hop (just direct parents) would be wide and messy for 9-parent nodes — this isn't just a DAG depth problem
- Truncated titles (all "Postprocedural disor...") make the middle layer indistinguishable — tooltip helps but doesn't solve layout density
- Orthogonal edge routing creates a dense tangle when many edges converge on one node
- Multi-system syndromes and combination vaccines are natural stress cases

### Open UX question

**Badge removal overlap** — Expanding descendants adds children + grandchildren, which turns the *child* badge red (all children now displayed). The descendant badge stays normal. Clicking descendant again is a no-op (nodes already there). This is technically correct but potentially confusing. Options:
- Descendant badge turns red when its expansion is fully visible
- Track provenance of which badge added which nodes
- Second click on descendant undoes only the descendant expansion
- Rely on help system to explain the behavior

---

## Layout Engine Evaluation — igraph vs ELK

### Current state

ELK (elkjs) runs in-browser via a Web Worker. The `elk.layered` (Sugiyama-family) algorithm handles DAG layout with configurable crossing minimization, edge routing, and model order preservation. It has 130+ options and supports compound/nested graphs, port-aware layout, and multiple edge routing styles (orthogonal, splines, straight).

### What igraph offers

igraph (Python, C core) provides `layout_sugiyama` — a Sugiyama hierarchical layout with one key advantage: a **first-class `layers` parameter** where you pass a list assigning each vertex to a specific layer. This is simpler than ELK's equivalent (`layerChoiceConstraint`, which requires enabling interactive mode).

Other igraph layouts relevant to DAGs:
- `layout_reingold_tilford` — tree layout (converts DAGs to spanning trees, losing polyhierarchy edges)
- `layout_fruchterman_reingold`, `layout_kamada_kawai` — force-directed (already have D3-force in-browser)
- `layout_umap` — good for clustered graphs, probabilistic nonlinear dimensionality reduction
- `layout_davidson_harel` — simulated annealing with multi-component energy function including edge crossing minimization

igraph also excels at **graph analysis** (centrality, community detection, paths) which could inform layout decisions even if ELK does the actual layout.

### Comparison

| Dimension | igraph | ELK |
|-----------|--------|-----|
| Forced layer assignment | First-class `layers` param | `layerChoiceConstraint` (advanced/interactive mode) |
| Crossing minimization | Barycenter heuristic only | Multiple strategies, fine-grained tuning |
| Edge routing | Returns coordinates only | Orthogonal, spline, straight routing built in |
| Compound/nested graphs | No | Yes |
| Constraint system | Layers only | Layers, positions, ordering, ports, routing |
| Graph analysis | Exceptional | None (layout only) |
| Runtime | Needs Python backend or pre-computation | Already runs in-browser via Web Worker |
| Interactivity | Batch only | Supports incremental updates |

### Other Python layout libraries

- **Graphviz `dot`** — The original Sugiyama implementation. High-quality hierarchical layout, but requires system binary. Could pre-compute layouts offline.
- **graph-tool** — Fast C++ core, but no built-in Sugiyama (delegates to Graphviz).
- **grandalf** — Pure Python, lightweight Sugiyama implementation. Good for prototyping.
- **NetworkX** — Too slow for 69k nodes. No Sugiyama.

### Recommended approach

A **hybrid** strategy: use igraph/Python offline (in `analysis/`) to pre-compute layer assignments, community groupings, or other structural analysis, then feed those as constraints into ELK's in-browser layout. This gets igraph's analysis strengths without needing a live Python backend.

For forced layering specifically, try ELK's `layerChoiceConstraint` first — if it's too cumbersome, the hybrid approach is the fallback.

---

## NL Hover → Tree Highlight

Cross-panel: hovering a node in the NL diagram should highlight and scroll to that node in the tree view (all instances if polyhierarchy). This is the remaining piece of hover behavior — tooltip and detail preview are done.

---

## ~~Tree View — Filter Mode Fix~~ Done

Hover-based filtering removed (was causing cascade crashes). Expanded children of filter matches now visible (muted styling). Context-dependent filter button titles implemented.

Behavior summary:
- **Tree mode, no query:** Full tree, no filtering
- **Tree mode, with query:** Full tree, matches highlighted in place (orange)
- **Filter mode, no query:** Selected node + ancestors + expanded descendants. If nothing selected, full tree shown.
- **Filter mode, with query:** Search matches + ancestors + expanded descendants

Context-dependent filter button title deferred to search dropdown rewrite (race condition in dual highlight/filter callback pattern).

---

## Tree View — Ancestor Path Hover Behavior

### Problem

When hovering an ancestor path segment in the detail panel, the tree highlights all intermediate ancestor nodes with blue highlighting scattered across multiple tree locations. This is disorienting — the user loses track of where they were looking.

### Fix

Change ancestor path hover to:
1. **Scroll the tree** to the specific path occurrence being hovered
2. **Highlight only the target concept** (the node at the end of the path), not intermediates

This provides orientation ("where is this path in the tree?") without visual noise.

---

## Tree View — Stats Popover

A tree info popover (triggered from an icon in the tree title bar) showing structural statistics:

- **Total concepts:** 69,478 (root descendant count)
- **Total tree rows (fully expanded):** Precalculated count of all paths-to-root across all nodes — this number reflects polyhierarchy inflation since nodes with N parents appear N times
- **Visible rows:** Count of currently rendered tree rows
- **Visible unique concepts:** Deduplicated count of distinct concepts among visible rows
- **Filter note** (when active): "Filtered to ancestors of [concept name]" or "Filtered to N search matches"

The contrast between total tree rows and total concepts quantifies the polyhierarchy's structural complexity. The visible rows vs unique concepts shows how much duplication is in the current view.

---

## Detail Panel — Preview Mode Non-Interactivity

The detail panel in preview mode (triggered by hovering a node in the NL diagram) cannot be interacted with — moving the cursor into the panel ends the preview and returns to the selected concept's details. This means clickable elements (parent/child links, badges) in the preview are unreachable.

This is acceptable as-is: the preview is for quick information glance, not interaction. Not rendering interactive affordances during preview could reduce unnecessary state computation during hover and would be more honest UI. Low priority — note for future cleanup.

---

## Detail Panel — Ancestors Section Redesign

### Current state

The Ancestors section shows horizontal breadcrumb trails (one per path to root) with truncated concept names, prev/next cycle buttons, and hover highlighting. Issues:
- Horizontal paths are hard to read when long
- Truncated names in the middle are indistinguishable
- Hover highlights scatter across multiple tree locations (see [Ancestor Path Hover](#tree-view--ancestor-path-hover-behavior))

### Proposed redesign

1. **Expand/collapse per ancestor row.** Each path shown as a single summary line (collapsed) or an indented vertical list (expanded). Summary line shows first/last few concepts with ellipsis.

2. **Indented list when expanded.** Each concept on its own line, indented by depth. Hovering a concept scrolls the tree to that concept and highlights only it.

3. **Concept name in detail title bar.** Move the target concept's name out of the Ancestors section header and into the detail panel's title bar (always visible, not scrolled away).

4. **Section reorder.** Detail panel shows, in order:
   - Title bar with concept name (fixed, not scrollable)
   - Ancestors section (collapsible)
   - Concept metadata (ID, descendant count, definition, browser link)
   - Children section (collapsible)

This restructures the detail panel around the question "where does this concept sit in the hierarchy?" (ancestors above, details in the middle, children below).

---

## Subgraph Shape View

A second NL-style view focused on **subgraph structure exploration** rather than neighborhood display. Where the current NL view shows a node's immediate parents/children/grandchildren, this view helps users understand the *shape* of the DAG rooted at any given node.

### Interaction model

Inspired by drillable sunburst/icicle charts:

- **Drill down**: Click any descendant node to make it the new root (re-renders the view from that node's perspective)
- **Drill up**: If the root has exactly one parent, clicking the root drills up to that parent. If the root has **multiple parents**, they're shown as nodes *above* the root — click any parent to drill up through that lineage.
- **Back navigation**: After drilling into a child whose parent has many siblings, it may be hard to find the previous root among those siblings. Solution TBD — breadcrumb trail, explicit back button, or history stack.

### What each summary node should convey

For each visible node (or aggregated group), display:
- **Children count / Descendant count** (already computed in graph data)
- **Repeated nodes**: count of nodes that appear in multiple places within this subgraph, or shared with other subgraphs elsewhere in the Foundation
- **Leaf node count**: descendants with no children (terminal concepts)
- **Depth from here**: max depth of the subtree rooted at this node

### Layout direction

Horizontal (left → right) is preferred — matches the tree's top-down with a rotated icicle feel, and better uses wide screens.

### Visualization approach — needs design

The challenge: representing polyhierarchy in a space-partitioning chart. Standard icicle/sunburst assumes a tree (each node has exactly one parent). Options under consideration:

1. **Modified icicle** (left → right): Size segments by descendant count. Nodes with multiple parents could appear multiple times (like the tree), or could be visually marked (e.g., dashed border, shared-node icon) and only appear once with a visual indicator of their other parents.

2. **Aggregated summary nodes**: Instead of showing individual nodes at every level, show summary statistics per level (like the descendant level popover, but as a visual chart). Click a level segment to drill into it.

3. **Hybrid**: Show individual nodes for the first 2–3 levels (direct children, grandchildren), then aggregate deeper levels into summary segments.

### Example test case

**Histopathology** (ID: 411368752) — 50 children, 3,225 descendants, max depth 5, 2 parents. URL: `http://localhost:5173/?s=eyJ2IjoidW5rbm93biIsIm9wcyI6W1sic2VsZWN0IiwiNDExMzY4NzUyIl1dfQ`

This is a mid-complexity subtree where the shape should be displayable. Good for prototyping because it's large enough to need aggregation but not so large as to be overwhelming.

### Open questions

- Should this replace the current NL view, be a toggle/tab alongside it, or live in a separate panel?
- How to visually encode polyhierarchy — repeated nodes, shared segments, edge indicators?
- At what descendant count should individual nodes give way to aggregation?
- Should the view link to the tree (click a node in shape view → select in tree)?

---

## Polyhierarchy Occurrence Navigation

For concepts with multiple parents, users need ways to find and navigate between all occurrences in the tree.

### What's implemented

- **Ancestors section** in detail panel shows all paths to root as horizontal breadcrumb trails, sorted by path length. Paths truncate the first 3 levels with "..." prefix. Clicking a path scrolls the tree to that occurrence.
- **Prev/next cycle buttons** (`◁` / `▷`) in the Ancestors header cycle through tree occurrences of the selected concept, scrolling the tree to each one.
- **Path highlighting**: hovering a path highlights intermediate nodes. (Slated for simplification — see [Ancestor Path Hover Behavior](#tree-view--ancestor-path-hover-behavior).)
- **Filter mode**: with no search query, collapses the tree to the selected node's ancestor paths. (Slated to remove hover-based filtering — see [Filter Mode Fix](#tree-view--filter-mode-fix).)

### Remaining

- **Filter view for occurrences**: "View other occurrences" could activate filter mode showing only the paths containing the selected concept — leveraging the existing search/filter infrastructure.
- **Ancestors section redesign** — see [dedicated section](#detail-panel--ancestors-section-redesign).

### Detail panel differentiation

The parents/children lists in the detail panel largely duplicate what's visible in the tree. The detail panel should show information *not* available in the tree — paths to root, relationship types, cross-references, and `fullySpecifiedName` would address this. The [Ancestors section redesign](#detail-panel--ancestors-section-redesign) and moving concept name to the title bar are steps in this direction.

---

## ~~Detail Panel — `fullySpecifiedName`~~ Done

Displayed below the title in the detail panel in muted style. Only shown when it differs from the node title (many are identical).

---

## Search Rewrite — Dropdown + Advanced Search

**Full plan in Claude memory:** `search-rewrite-plan.md`

Replace inline tree search (highlight/filter modes) with WHO Foundation Browser-style dropdown: type → results appear in dropdown → click to select/navigate. Tree and Filter modes become purely about selected node display. Also adds advanced search with field-specific checkboxes (API already supports `propertiesToBeSearched`).

GraphProvider refactor is complete (Zustand store + materialized tree). Ready to implement.

---

## Foundation Cross-References (Non-Is-A Relationships)

### Investigation results

The Foundation API exposes only 3 non-is-a relationship fields (surveyed 1,000 entities):

| Field | Prevalence | Estimated total |
|-------|-----------|-----------------|
| `relatedEntitiesInPerinatalChapter` | 4.0% | ~2,800 entities |
| `relatedEntitiesInMaternalChapter` | 2.6% | ~1,800 entities |
| `relatedImpairment` | 0.2% | ~140 entities |

All three are arrays of Foundation entity URIs referencing concepts already in our graph (verified). Example: Cholera → "Infections of the fetus or newborn" (perinatal), Tuberculous meningitis → "Tuberculosis complicating pregnancy..." (maternal) and "Congenital tuberculosis" (perinatal).

### Postcoordination is NOT a relationship type

MMS postcoordination axes (infectiousAgent, specificAnatomy, hasSeverity, laterality, hasManifestation, etc.) define which extension code dimensions are *allowed* when coding — they're coding affordances, not ontological relationships. A coder could postcoordinate pneumonia with "left lower lobe" but equally with "right foot." There's no inherent link between a disease and a body site in the Foundation.

### Plan

Crawl the 3 cross-reference fields into `foundation_graph.json` as typed edges. Visualize as dashed/colored edges in the NL diagram, distinct from is-a edges. Low priority — the ~4,700 cross-references are modest in scope and only relevant when viewing entities that have them

---

## Canonical vs Linked Parents

> **Investigation needed:** The maintenance platform distinguishes between regular and "linked" parent relationships. Some children appear grayed out in the maintenance platform, suggesting a different relationship type.
>
> **Hypothesis:** The canonical parent may be determined by where the concept appears in the MMS linearization.
>
> **Action:** Verify whether the public API exposes this distinction, or if it must be inferred by cross-referencing Foundation and MMS.

If confirmed, this affects tree rendering (muted style for linked children) and the NL diagram (edge styling to distinguish canonical from linked parents).

---

## History & State — Remaining Work

The snapshot-based history system is implemented (see [help-content.md](web/src/assets/help-content.md#session--history)). Remaining:

### History review UI

A reviewable history panel/dropdown showing the exploration timeline:
- List of snapshots with descriptions and relative timestamps ("2 min ago", "yesterday")
- Current position highlighted
- Click any entry to jump directly (sets pointer, no need to step through)
- Optional scrubber/slider for quick traversal through long histories

### ~~Share button~~ (Implemented)

Uses an instruction-replay encoding: the share URL captures the sequence of operations (select, reselect, add, remove, removeBatch, reset) that produced the view. The decoder replays them step-by-step, reconstructing the exact state and giving the recipient full undo/redo history. Ops are the single source of truth — `displayedNodeIds` is always computed by replaying ops, never persisted. URLs include a graph release version (`v`) for staleness detection. If the encoded URL exceeds ~2KB, the share fails with a user-facing error (server-side state storage planned for future). Opening a share URL restores the full exploration history, bypassing the resume modal.

### Synthetic instruction sequences

Given an arbitrary `displayedNodeIds` set, compute the *shortest* instruction sequence that produces it — not the user's actual history, but a minimal recipe. E.g., "this state is `select(X)` + `add([a,b,c])` - `remove(d)`". Could enable: compact URLs independent of history length, "explain this view" feature, diffing two views as instruction sequences. Discuss further before implementing.

[sg] In my value set work I often thought it would be useful to be able to generate a "most parsimonious" definition for any given value set, i.e., (using the OHDSI/ATLAS definition format) the smallest set of concept ids, includeDescendants, isExcluded, and includeMapped possible for recreating a given value/concept set. Though the current project is a different use case than generating value sets for use in electronic phenotype definitions, this algorithm might end up similar to what I would have wanted. There might be other features of this project that might also be useful in some future rewrite of TermHub/VS-Hub.

### Auto-clear old snapshots

Auto-clear snapshots older than N days (configurable, e.g. 7 days).

### Tree & detail state in history

Currently only NL view state and search query are tracked. A fuller model would include tree expand/collapse paths, search mode (search vs filter), detail panel scroll position, and tree scroll position. This would enable true unified undo across all panels. Trade-off: snapshot size grows (expand paths can be large sets), and some state (scroll offsets) is fragile across window resizes. Consider optional fields so old snapshots remain compatible.

---

## Help System — Remaining Work

The contextual help system is implemented: `?` toggle activates help mode with capture-phase click interception, contextual popovers sourced from [help-content.md](web/src/assets/help-content.md), native tooltip replacement showing entry names on hover, cursor differentiation (help cursor on tagged elements, not-allowed elsewhere), and keyboard shortcuts (? to toggle, Escape to dismiss/exit).

An **About panel** auto-shows on first visit and is reopenable via the `ⓘ` header button. It renders help-content.md section articles as an overview plus a "Coming Soon" list. A "Don't show on startup" checkbox persists via localStorage. Remaining:

### First-visit guided tour

A step-by-step tour that highlights specific UI elements in sequence with explanations — distinct from the About panel's static overview. Could use a lightweight tour library or custom implementation.

### Stakeholder feedback mechanism

Special help entries or annotations for items needing stakeholder input (e.g., canonical/linked parents, relationship types). Could be a "feedback needed" tag on certain help entries that links to an issue tracker or feedback form.

---

## Proposal Authoring

> **Note:** Interface design TBD. Requires understanding the .NET Maintenance Platform first.

### Requirements

1. **View existing proposals** affecting a concept or its neighborhood
2. **Author new proposals** for adding, modifying, moving, or deprecating concepts (including multi-concept changes)
3. **Visualize proposal impact** — what would change if this proposal is implemented?

### Open Design Questions

| Question | Options |
|----------|---------|
| **Authoring location** | In-place editing on the tree? Separate form panel? Modal dialog? |
| **Diff visualization** | Side-by-side trees? Overlay with color-coded changes? Animated transition? |
| **Draft management** | Local storage? Backend persistence? Export as JSON? Will need to understand .NET Maintenance Platform before deciding. |

Color coding for diffs: green = added, red = removed, yellow = modified, gray = unchanged.

---

## Open Questions / Future Investigation

1. **Canonical/linked distinction**: Does the WHO API expose this or only iCAT? (See [dedicated section](#canonical-vs-linked-parents))
2. **Integration path**: How will this embed into the .NET maintenance platform?
3. **Depth spread as maintenance signal**: Each node has `depth` (shortest from root) and `maxDepth` (longest from root). For polyhierarchy nodes these differ — 11,345 nodes (16%) have spread. Large spread may flag structural anomalies. Consider surfacing depth range in detail panel and/or using it as a filter/highlight for maintenance review.
4. **Foundation cross-references**: Low priority — 3 cross-ref fields (~4,700 entities) could be crawled and visualized as typed edges. (See [dedicated section](#foundation-cross-references-non-is-a-relationships))
5. **Foundation version switching**: The released Foundation version changes infrequently; the backoffice version changes frequently. Will want ability to switch versions in the app. Low priority for now.

---

## Known Bugs / Tech Debt

- **White screen crash (partially fixed)**: Several JS-level causes fixed: (1) `navigateTreeToNode` removed from hover path — was triggering expansion cascades on every NL hover. (2) `hoveredNodeId` removed from filter set — was causing filter recomputation on every hover. (3) `applyHoverEmphasis` rAF-throttled. (4) Unused ECT library removed. (5) Path-key string expansion (`Set<string>`) replaced with row-index expansion (`Set<number>`) — eliminates string allocation/hashing overhead on every expand/collapse. Remaining crash: Chrome renderer "Aw, Snap!" (STATUS_ACCESS_VIOLATION) triggered only by unrealistic rapid hovering (~30s). Not our JS — not reproducible during normal use.
- ~~**Filter mode hides expanded children**~~: Fixed — expanded descendants of filter matches now show with muted styling.
- **Divider drag stops at header**: Dragging a panel divider upward stops at the bottom edge of the app header instead of continuing past it. The header does disappear on mouseup (horz < 0.05 threshold), but the drag itself is clipped during the gesture.
- **Parent badges missing after close**: In the NL view, when a node's parents have been removed/closed, the node no longer shows parent badges — so there's no easy way to bring the parents back into view.
- **Escape tooltip suppress**: The suppress-on-Escape mechanism (prevents tooltip re-creation while cursor hovers) may not be working correctly. Needs investigation and possibly a test.
- **Foundation ordering**: Sibling order in NL diagram only partially matches Foundation order (uses model order hint). Full ordering would require changes to the layout engine or manual node positioning.

---

## References

- ICD-11 Foundation Browser: https://icd.who.int/browse/2025-01/foundation/en
- ICD-11 Maintenance Platform: https://icd.who.int/dev11 (requires login)
- ICD-11 API Documentation: https://icd.who.int/icdapi
- Labella.js: https://twitter.github.io/labella.js/
- elkjs: https://github.com/kieler/elkjs
- ELK algorithm reference: https://eclipse.dev/elk/reference/algorithms.html
- ELK partitioning example: https://rtsys.informatik.uni-kiel.de/elklive/examples.html?e=user-hints%2Flayered%2Fpartitioning
- igraph: https://igraph.org/
- igraph layout docs: https://python.igraph.org/en/main/visualisation.html

Wireframes and screenshots: `design-stuff/spec-assets/`
