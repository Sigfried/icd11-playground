# ICD-11 Visual Maintenance Interface — Design Specification

## Overview

A visual interface to the ICD-11 maintenance platform that helps proposal authors and reviewers understand the neighborhood and potential impacts of proposed changes to the Foundation.

**Key goals:**
- Expose polyhierarchy structure (concepts with multiple parents)
- Facilitate understanding of change impacts
- Support proposal authoring workflow
- Provide hierarchical (not force-directed) visualizations

**Technology stack:** React, TypeScript, D3.js, graphology.js, elkjs, IndexedDB

**Deployment:** GitHub Pages (auto-deploy on push to main); later integration with .NET maintenance platform

---

## Implementation Status

Legend: :green_circle: Done | :red_circle: Bug | :yellow_circle: In progress / needs design | :white_circle: Not started | :black_circle: Future

| Area | Feature | Status |
|------|---------|--------|
| **Tree View** | Expand/collapse, parent/child badges | :green_circle: |
| | Multi-path highlighting | :green_circle: |
| | Descendant count + depth badges in tree | :green_circle: Font-weight badges |
| | First-occurring path expansion via URL | :red_circle: Uses arbitrary parent |
| | Collapse heuristics for large trees | :white_circle: |
| **Node-Link View** | Hierarchical layout (elkjs), click to navigate | :green_circle: |
| | Full ancestor DAG to second level | :green_circle: |
| | Collapsible clusters (threshold: 2) | :green_circle: |
| | Resizable panels | :green_circle: |
| | Foundation ordering of siblings | :yellow_circle: Partially (model order hint) |
| | [Scalability features #3–12](#potential-solutions) | :white_circle: See design section |
| **Detail Panel** | Title, definition (async), browser link | :green_circle: |
| | Collapsible parents/children lists | :green_circle: |
| | Parent/child/descendant badges | :green_circle: |
| | Paths to root | :yellow_circle: |
| **Node-Link View** | Node removal (× button, connectivity pruning) | :white_circle: |
| **State & History** | Unified localStorage history (replaces URL state + manualNodeIds) | :white_circle: |
| | Undo/redo via history pointer | :white_circle: |
| | Session continuity (resume prompt on load) | :white_circle: |
| | History review UI (timeline panel) | :white_circle: |
| | Share button (encode snapshot in URL) | :white_circle: |
| **Data Layer** | Full graph preload + IndexedDB cache | :green_circle: |
| | On-demand entity detail fetch | :green_circle: |
| **Proposal Authoring** | All features | :black_circle: |

---

## Data Model

### ICD-11 Foundation Structure

The Foundation is a polyhierarchy: concepts can have multiple parents. ~69k entities, ~77k edges.

### Canonical vs Linked Parents

> **Investigation needed:** The maintenance platform distinguishes between regular and "linked" parent relationships. Some children appear grayed out in the maintenance platform, suggesting a different relationship type.
>
> **Hypothesis:** The canonical parent may be determined by where the concept appears in the MMS linearization.
>
> **Action:** Verify whether the public API exposes this distinction, or if it must be inferred by cross-referencing Foundation and MMS.

### Internal Representation

<details>
<summary>Types and data flow (click to expand)</summary>

The full Foundation graph is pre-crawled and loaded at startup. graphology.js stores the in-memory structure:

```typescript
// Structural data — available synchronously after init
interface ConceptNode {
  id: string;
  title: string;
  parentCount: number;
  childCount: number;
  childOrder: string[];      // children in Foundation order
  descendantCount: number;   // unique descendants (pre-computed)
  height: number;            // longest downward path to any leaf (leaf=0)
  depth: number;             // shortest path from root (root=0)
  maxDepth: number;          // longest path from root (root=0)
}

// Rich metadata — fetched on-demand from ICD-11 API, cached in IndexedDB
interface EntityDetail {
  definition?: string;
  longDefinition?: string;
  synonyms: string[];
  narrowerTerms: string[];
  inclusions: string[];
  exclusions: Array<{ label: string; foundationReference?: string }>;
  browserUrl?: string;
}
```

Edges are untyped directed edges (parent → child). See `foundationData.ts` for the unified data API.

#### Three-Layer Architecture

1. **`foundationStore.ts`** — IndexedDB cache. Stores/retrieves graph structure and entity details.
2. **`foundationData.ts`** — Unified data API. Owns the graphology instance. Sync reads for structure, async for entity details.
3. **`GraphProvider.tsx`** — React context. UI state (selection, expansion paths) and init. Exposes `foundationData` functions on context.

#### Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant GP as GraphProvider
    participant FD as foundationData
    participant IDB as IndexedDB
    participant API as ICD-11 API

    Note over GP,IDB: Startup
    GP->>IDB: getGraph()
    alt Cached
        IDB-->>GP: graph JSON
    else Not cached
        GP->>GP: fetch foundation_graph.json
        GP->>IDB: putGraph(data)
    end
    GP->>FD: initGraph(data)
    Note over FD: 69k nodes + 77k edges in memory

    Note over U,API: Navigation (all synchronous)
    U->>GP: Expand node
    GP->>FD: getChildren(id)
    FD-->>GP: ConceptNode[] (instant)

    U->>GP: Select node
    GP->>FD: getNode(id), getParents(id), getChildren(id)
    FD-->>GP: Sync results → TreeView, NodeLinkView, DetailPanel

    Note over U,API: Detail fetch (async, on demand)
    U->>GP: View selected node details
    GP->>FD: getDetail(id)
    FD->>IDB: getEntity(id)
    alt Cached
        IDB-->>FD: FoundationEntity
    else Not cached
        FD->>API: GET /icd/entity/{id}
        API-->>FD: FoundationEntity
        FD->>IDB: putEntity(id, entity)
    end
    FD-->>GP: EntityDetail
```

</details>

---

## Views

### 1. Indented Tabular View (Primary)

The main navigation interface. Renders the polyhierarchy as a tree where concepts with multiple parents appear multiple times. All instances reference the same underlying object — selection of one highlights all.

<details>
<summary>Current behavior and mockup (click to expand)</summary>

| Feature | Status |
|---------|--------|
| Same object, multiple appearances (selection syncs all) | :green_circle: |
| Parent count badge `[N↑]` (when > 1) | :green_circle: |
| Child count badge `[N↓]` | :green_circle: |
| Expand on demand (instant, in-memory) | :green_circle: |
| Multi-path highlighting | :green_circle: |

```
┌────────────────────────────────────────────────────┐
│ ▼ Diabetes mellitus                    [1↑] [8↓]   │
│   ▶ Type 1 diabetes mellitus           [1↑] [3↓]   │
│   ▶ Type 2 diabetes mellitus           [1↑] [5↓]   │
│   ▶ Malnutrition-related diabetes      [1↑] [0↓]   │
│   ▷ Diabetes mellitus in pregnancy     [2↑] [2↓]   │  ← muted style (linked?)
│   ▷ Neonatal diabetes mellitus         [2↑] [1↓]   │  ← muted style (linked?)
│   ▶ Acute complications of DM          [1↑] [4↓]   │
└────────────────────────────────────────────────────┘
```

</details>

#### Open design work

- **Descendant stats badges**: Data available on `ConceptNode` (descendantCount, height). Need to design badge placement in tree rows.
- **First-occurring path expansion** :red_circle:: URL navigation (`?node=ID`) uses `parent[0]` which may not be first in Foundation order.
- **Collapse heuristics**: Auto-collapse deep/large subtrees based on depth, subtree size, or user preference.
- **Show all paths to root**: Detail panel or tree-integrated breadcrumbs showing every distinct path from selected node to root.

### 2. Node-Link Diagram (Secondary)

D3-based DAG visualization of the local neighborhood around the selected node.

**Current state:** Hierarchical layout (elkjs), ancestor chain to second level, collapsible clusters for high-degree nodes (threshold: 2 visible children), click to navigate, resizable panels.

#### Scalability & Readability

The core design challenge. High-degree nodes (up to 331 children) make the view unreadable at any zoom level.

#### Potential Solutions

| # | Approach | Status | Notes |
|---|----------|--------|-------|
| 1 | **Ancestors beyond 1-hop** | :green_circle: | Chain to depth 2 (skip root + top-level) |
| 2 | **Collapsible clusters** | :green_circle: | First 2 children shown, rest grouped as "N more..." |
| 3 | **Hover behavior** | :white_circle: | [Full spec below](#hover-behavior) — tooltip, detail panel, tree highlight, transient neighbors |
| 4 | **Right-click/long-click toggle** | :white_circle: | Pin/unpin specific neighbors |
| 5 | **Close individual nodes** | :white_circle: | X button; closed nodes rejoin cluster count |
| 6 | **Area-proportional badges** | :white_circle: | Badge area ∝ count; median = default size; separate medians per type |
| 7 | **Staggered levels** | :white_circle: | Labella.js-style overlap avoidance |
| 8 | **Resizable panels** | :green_circle: | Drag dividers between three panels |
| 9 | **Pop-out window** | :white_circle: | Full-screen node-link in separate window |
| 10 | **Full ancestor DAG** | :green_circle: | BFS through all parents to depth 2; [stress test results](#stress-test-high-parent-count-nodes) |
| 11 | **Scrollable clusters** | :white_circle: | Cluster summary in SVG; hover/click shows HTML child list overlay; pop children out into real nodes |
| 12 | **Full-width bottom panel** | :green_circle: | Two switchable layouts (two-row / two-col); RIGHT direction; native scroll; zoom/pan removed |

#### Feature Compatibility

![Combined features sketch](design-stuff/spec-assets/node-link-features-sketch.svg)

**Works well together:**
- **2+6** (Clusters + Badges): Collapsed clusters show aggregate badge values.
- **3+4** (Hover + Toggle): Hover previews → right-click pins. Natural progression.
- **4+5** (Toggle + Close): Unify as per-node visibility state via context menu + close button.
- **2+3** (Clusters + Hover): Hover over cluster to preview contents.
- **6** (Badges): Orthogonal to all others — renders independently within each node.
- **10+2** (Ancestor DAG + Clusters): Ancestors can have clustered children too.
- **11+2** (Scrollable Clusters replaces current Clusters): Evolution of cluster concept — avoids layout explosion on expand.
- **12+11** (Bottom Panel + Scrollable Clusters): RIGHT layout in wide panel, scrollable clusters for children.

**Needs care:**
- **5+2** (Close + Clusters): Closed nodes rejoin cluster counter, e.g., "2 parents (1 hidden)."
- **3+5** (Hover + Close): Hover temporarily shows closed nodes → three-valued visibility state.
- **9** (Pop-out): Cross-window sync questions. Minimal viable approach: no sync with tree, just allow exploring and selecting a new focal node in the pop-out.
  - **[sg]** maybe just leave the middle panel alone and no communication between pop-out and tree/details, just allow the user to explore the node-link view separately in a wide screen. hmm... after exploring they might want to choose a new focal node, could allow just that
- **12+8** (Bottom Panel + Resizable): Two layout modes — (a) two rows: tree+detail on top, node-link on bottom, or (b) two columns: tree on left, detail+node-link on right. Draggable borders in either mode. Users switch based on whether tree or node-link is their focus.

**Node visibility state model** (for #3, #4, #5):

| State | Meaning | How set |
|-------|---------|---------|
| **default** | Neighborhood algorithm decides | Initial state |
| **pinned** | Always shown | Right-click toggle on |
| **closed** | Hidden unless hovered | Close button or toggle off |

Hover temporarily overrides `closed` → visible. Changing focus resets all to `default`.

#### Design Notes

> **[sg]**
> - Collapsible clusters (#2): good idea. Will have to try some things and see how it works with other techniques
> - Fisheye: good technique for unreadable stuff; try if other approaches don't fully solve the problem. Radial layout: no.
> - Area-proportional badges (#6): don't size the rectangles — size individual badges. Badges on right side of concept name, area ∝ count, median count = default size, separate medians for parent/child/descendant badges
> - Hover (#3): could consider ideas from `../dynamic-model-var-docs/src/components/` (FloatingBoxManager, LayoutManager, TransitoryBox) — prior art for persistent/transitory info display in crowded spaces
> - If there are edge types or other ways of grouping neighboring nodes, show them as groups that can be explored or expanded
> - Staggered levels (#7): see https://twitter.github.io/labella.js/ — try both simple and overlap algorithms. Horizontal flow: see https://twitter.github.io/labella.js/with_text.html
> - Hybrid layout (old #10): L-shaped split (manual vertical ancestors + ELK horizontal children) won't work because ancestor polyhierarchy means ancestors aren't linear, and child expansion on ancestors creates nodes in both sections.
> - Scrollable clusters (#11): scrollable boxes don't work directly in SVG. Cluster node shows summary; hover/click expands to an HTML list overlay (could replace detail panel or float on top). Clicking a child in the list promotes it to a real graph node. Single edge from parent to cluster.
> - Scroll vs zoom: zoom/pan is powerful but awkward. At a given zoom level, if content overflows, enable native scrolling. For RIGHT layout in full-width bottom panel, horizontal scroll is natural.
> - Full ancestor DAG (#10): :green_circle: done. Stress test confirms: orthogonal routing + truncated titles + wide fanout = unreadable for 6+ parent nodes. Layout engine is now the bottleneck.

#### Stress Test: High Parent-Count Nodes

Nodes with the most parents in the Foundation. These are the worst cases for ancestor DAG layout — 9 parents at depth 4–5 produces ~22 nodes with heavily overlapping orthogonal edges, essentially unreadable at default zoom.

| Parents | Depth | Node | ID |
|---------|-------|------|----|
| 9 | 4 | [Injury or harm arising from surgical or medical care, NEC](https://sigfried.github.io/icd11-playground/?node=383104340) | 383104340 |
| 9 | 5 | [Dyskeratosis congenita](https://sigfried.github.io/icd11-playground/?node=1531033936) | 1531033936 |
| 7 | 9 | [DPT-HepB-MenAC vaccines](https://sigfried.github.io/icd11-playground/?node=10241378) | 10241378 |
| 7 | 6 | [Kearns-Sayre syndrome](https://sigfried.github.io/icd11-playground/?node=399100745) | 399100745 |
| 7 | 9 | [DPT-IPV-Hib-HepB vaccines](https://sigfried.github.io/icd11-playground/?node=1234470901) | 1234470901 |
| 7 | 5 | [Ataxia-telangiectasia](https://sigfried.github.io/icd11-playground/?node=2129036552) | 2129036552 |
| 6 | 6 | [Zellweger syndrome](https://sigfried.github.io/icd11-playground/?node=226023718) | 226023718 |
| 6 | 5 | [Bannayan-Riley-Ruvalcaba syndrome](https://sigfried.github.io/icd11-playground/?node=357383447) | 357383447 |
| 6 | 9 | [DPT-IPV-Hib vaccines](https://sigfried.github.io/icd11-playground/?node=675122679) | 675122679 |
| 6 | 6 | [Hereditary haemorrhagic telangiectasia](https://sigfried.github.io/icd11-playground/?node=714406192) | 714406192 |

**Observations:**
- Even single-hop (just direct parents) would be wide and messy for 9-parent nodes — this isn't just a DAG depth problem
- Truncated titles (all "Postprocedural disor...") make the middle layer indistinguishable — hover/tooltip needed
- Orthogonal edge routing creates a dense tangle when many edges converge on one node
- The multi-system syndromes (Dyskeratosis congenita, Kearns-Sayre, Ataxia-telangiectasia) and combination vaccines are natural stress cases

#### Hover Behavior

Hovering a node in the node-link view should do all of the following:

1. **Tooltip with full title** — shows the untruncated concept name (addresses the "Postprocedural disor..." problem) :green_circle:
2. **Detail panel preview** — show the hovered node's details (title, definition, metadata) in the detail panel without changing selection; shows "Preview" badge :green_circle:
3. **Tree highlight** — highlight/scroll-to the hovered node in the tree view (all instances if polyhierarchy)
4. **Transient neighbors** — temporarily show parents and children not already in the view, with a visual distinction (e.g., dashed border, lower opacity) so they're clearly transient. These disappear on mouse-out.

On mouse-out: revert detail panel to selected node, remove tree highlight, remove transient neighbors.

Click remains "select" — it changes the focus node permanently. Hover is purely preview/exploration.

**Interaction with other features:**
- **+Toggle (#4)**: Hover previews → right-click pins a transient neighbor permanently
- **+Clusters (#2)**: Hover over cluster shows its contents (list overlay or transient expansion)
- **+Close (#5)**: Hover temporarily reveals closed nodes

> **[sg]** Prior art for persistent/transitory display in crowded spaces: `../dynamic-model-var-docs/src/components/` (FloatingBoxManager, LayoutManager, TransitoryBox)

#### Cluster Node Behavior

Cluster pseudo-nodes ("7 more children, 194 descendants") represent hidden children. They need their own interaction model:

| Action | Behavior | Status |
|--------|----------|--------|
| **Click** | Expand cluster into real nodes in the graph | :green_circle: |
| **Hover** | Show scrollable list of hidden children (HTML overlay) | :white_circle: |
| **Hover → click child** | Promote child to real graph node (or select it) | :white_circle: |

The hover overlay is related to #11 (Scrollable Clusters) — a lightweight HTML list positioned near the cluster node, showing title + badges for each hidden child. Clicking a child in the list could either:
- **Select it** — changes focus, re-centers the view
- **Promote it** — adds it as a real node in the current view without changing focus

> **[sg]** This connects to the broader question of how to explore without losing context. Promoting a child keeps the current focus but enriches the view. Selecting navigates away. Both are useful.

#### Badge Interactions

Badges are interactive controls. Hovering a badge previews the related nodes; clicking makes that preview persistent and allows further interaction. Badge interactions only add/expand nodes in the current view — they never change the selected (focus) node. Node clicking is for navigation; badge clicking is for expansion.

##### Badge hover → overlay + cross-panel highlighting

Hovering a badge highlights already-visible related nodes across all panels (cyan glow/outline) and shows a **floating interactive overlay** near the badge listing nodes not yet in the graph. The overlay allows selective expansion — click individual items to add just that node, or "Add all" to add everything. The overlay stays open when the mouse moves into it (hover-intent pattern with ~150ms delay).

> **Design note:** Animated layout preview (computing ELK layout on hover and animating nodes in/out) was prototyped but proved infeasible — ELK re-layout repositions existing nodes, moving the hovered badge out from under the cursor and causing flicker loops. Anchoring the hovered node at its pre-layout position prevented flicker but created disjointed layouts. The overlay model is simpler and avoids layout disruption entirely.

| Badge | Hover behavior |
|-------|---------------|
| **N↑ parents** | Highlight parent nodes already visible in NL graph (glow/outline). Show interactive overlay listing parents not yet visible — click to add individually. In tree: highlight all instances of parent nodes. |
| **N↓ children** | Highlight visible children. Show interactive overlay listing children not yet visible. Cluster nodes use the same overlay — hover shows hidden children, click to add individually or expand all. In tree: hover highlights children. |
| **N▽ descendants** | Show descendant stats (children count, grandchildren count, total descendants). Overlay lists children + grandchildren for selective expansion. |

**Cross-panel coordination:** Badge hover in any panel highlights related nodes in all panels. For example, hovering `2↑` in the tree highlights the parent nodes in NL and scrolls to them in the detail panel's parents list. Uses shared `highlightedNodeIds` state in GraphProvider.

##### Badge click → expand

Clicking a badge makes the preview persistent: preview nodes become permanent graph nodes (their distinct style clears), and further badge interactions on the new nodes become available. Badge clicks only add/expand — they never change the focus node or navigate away.

| Badge | Click behavior |
|-------|---------------|
| **N↑ parents** | Add all parents to the graph permanently. |
| **N↓ children** | Add children to the graph (expand cluster if clustered). |
| **N▽ descendants** | Show level-by-level overlay (children, grandchildren, great-grandchildren, etc.) with per-level add buttons and cumulative "add all through depth N". |

**Tree View:**
- `↑` click: Find and expand all paths through this node's parents (expensive for deeply nested polyhierarchy — may need progressive expansion: one level up per click)
- `↓` click: Toggle expand for this tree path (equivalent to clicking the expand arrow)
- `▽` click: Expand recursively (with depth limit — TBD)

**Node-Link View:**
- `↑` click: Add all parents to the NL graph (even those filtered by ANCESTOR_MIN_DEPTH). Animate layout transition.
- `↓` click: Expand cluster if children are clustered; otherwise add children to graph. Animate layout transition.
- `▽` click: Show level-by-level descendant overlay with per-level add buttons. Animate layout transition.

**Detail Panel:**
- `↑` click on a list item: Expand upward within the detail panel — show the item's parents indented above it (inline expansion, not navigation). How upward indentation works visually is an open question — reverse indentation? separate "ancestors" sub-list?
- `↓` click on a list item: Expand downward within the detail panel — show the item's children indented below it (inline expansion). This is more natural than upward expansion.
- `▽` click on a list item: Expand descendants inline (with depth limit).
- Expanding in the NL graph and/or tree simultaneously may also be useful, but could create visual clutter — needs evaluation.

##### Visual feedback

- **Hover cursor:** pointer on badge hover
- **Hover highlight:** badge background lightens or glows to indicate interactivity
- **Active state:** brief press feedback on click
- **Overlay** (hover): floating list near the badge showing nodes not yet visible, with per-item click to add selectively
- **Expanded nodes:** dashed border to distinguish from initial neighborhood nodes
- **Highlighted nodes** (cross-panel): cyan glow/outline on nodes related to the hovered badge
- **Node removal:** `×` button on hover for every node. Clicking removes the node and connectivity-prunes disconnected subgraphs.
- **Reset neighborhood:** click focus node to return NL graph to initial neighborhood (pushed as new snapshot). Undo (Ctrl+Z / back) steps through history.

##### Layout animation

All NL graph changes (from badge click or node selection) animate via D3 data-join (enter/update/exit):
- ELK layout is computed for the new node set
- D3 transitions interpolate from old positions to new positions (position cache tracks last known coordinates)
- Entering nodes scale in from a dot at their target position
- Exiting nodes scale down and fade out
- Edges animate alongside their source/target nodes
- Layout computation is fast enough for typical 10-50 node neighborhoods
- Hover does **not** trigger layout changes — only highlighting and overlay (see design note above)

##### Zoom and fit-to-view

:white_circle: Not started

Current zoom controls: `+` / `−` (step zoom), `↺` (reset to 1×), `⊡` (fit all content), Ctrl+wheel (smooth zoom). Native scroll handles panning.

**Fit-to-view cycling:** The `⊡` button currently does a single fit (scale to show all content). It should cycle through three modes on repeated clicks:

1. **Fit all** — scale so entire graph fits in the viewport (current behavior). Good for orientation but may make nodes too small on wide/tall graphs.
2. **Fit width** — scale so the graph's horizontal extent fills the viewport width. Vertical overflow scrolls. Good for RIGHT-direction layouts where horizontal layers are the primary structure.
3. **Fit height** — scale so the graph's vertical extent fills the viewport height. Horizontal overflow scrolls. Good for tall ancestor chains.

Visual indicator: the button icon or tooltip should reflect the current/next mode. Could cycle the icon: `⊡` → `↔` → `↕` → `⊡`, or show a small label on hover.

Reset (`↺`) always returns to 1× zoom regardless of fit mode.

##### Node removal

:white_circle: Not started

Nodes in the NL view should be removable. An `×` button appears on hover for every node (including the focus node). The removal model is **connectivity-based pruning**: the focus node anchors the graph, and removing any other node cascades to anything that becomes disconnected.

**Algorithm — removing non-focus node X:**
1. Delete X from the displayed node set (and all its edges)
2. Find all connected components in the remaining graph (treated as **undirected** — parent/child direction doesn't matter for connectivity)
3. Keep only the component containing the focus node
4. Everything in other components is pruned

Example: focus is "Acute and transient psychotic disorders", displayed ancestors are ICD Category → Mental behavioural → Schizophrenia → Acute. Removing "Schizophrenia" severs the connection — "Mental behavioural" and "ICD Category" form a disconnected component and are pruned. "Acute" remains because it's the focus node.

**Removing the focus node:**
- Equivalent to resetting the NL neighborhood (same as clicking the panel title or the reset button)

**Badge-triggered removal:**
- Red badge or indicator on groups of nodes added by a badge expansion
- Clicking removes the entry-point node + connectivity-prunes — same algorithm as single-node removal, just triggered from the badge context

**Scope:** Removal only affects the NL view. The tree view is not affected (though tree filtering/search is a separate desired feature — see [Open questions](#open-questions)).

**Implementation notes:**
- The displayed node set is the sole source of truth — see [History & State Model](#history--state-model)
- No distinction between "default" and "manually added" nodes for removal purposes
- No `excludedNodeIds` or refcounting needed — connectivity pruning via NL subgraph (see [implementation notes](#implementation-notes))
- `buildNeighborhood` becomes `buildInitialNeighborhood` — runs once when a focus node is selected to produce the first snapshot, not recomputed on every render
- Each removal pushes a new snapshot to the history stack
- The full 69k-node graphology instance is never mutated — removal operates on the NL subgraph

**Edge cases:**
- Node reachable via two paths: survives removal of one path's intermediary because it stays connected to focus through the other
- Deep pruning could touch many nodes for large expansions — may need to batch the state update

##### Open questions

1. **Tree expand-all-parents** — For a node with 9 parents, expanding all parent paths at once could be overwhelming. Current implementation expands all at once — may need progressive expansion (one level up per click) after user testing.
2. **Toggle behavior** — Tree `↓` badge click = toggle (expand if collapsed, collapse if expanded).
3. **Tree search/filter** — Need a mechanism for searching and filtering in the tree view. Node removal only affects NL view; tree needs its own discoverability story.

##### Implementation status

- :green_circle: Badge component has `onClick`, `onMouseEnter`/`onMouseLeave` wiring
- :green_circle: NL view incrementally adds/removes nodes via D3 data-join (enter/update/exit animation)
- :green_circle: Tree `↑` expand walks up all parent chains and expands each path prefix via `expandParentPaths`
- :green_circle: Cross-panel coordination via shared `highlightedNodeIds` state in GraphProvider
- :green_circle: Detail panel inline expansion via `RelationListItem` component with expandable sub-lists
- :green_circle: NL badge hover overlay is interactive: per-item click to add selectively, "Add all" button, hover-intent keeps tooltip alive
- :green_circle: Cluster nodes reuse the same interactive overlay (hover shows hidden children list)
- :green_circle: Descendant badge shows level-by-level overlay with per-level add buttons
- :green_circle: Tooltip positioning: zone-based vertical alignment (top/center/bottom based on anchor position in panel)
- :green_circle: Escape dismisses tooltips (with suppress flag to prevent re-creation while cursor hovers)
- :white_circle: Node removal (`×` button, connectivity pruning) — see [History & State Model](#history--state-model) for the state architecture
- :white_circle: History/undo system (replaces current `manualNodeIds` + URL state)

#### Implementation Priority

**Phase 1 — High impact, low/medium effort:** :green_circle: Done
- #8 Resizable panels, #2 Collapsible clusters, #1 Ancestors beyond 1-hop

**Phase 2 — Stress test + medium effort features:**
- #10 Full ancestor DAG — :green_circle: done; [stress test results](#stress-test-high-parent-count-nodes) confirm layout is the bottleneck
- #6 Area-proportional badges — :green_circle: done: shared Badge component with per-type count→font-weight bins, consistent colors (parents=cyan, children=green, descendants=orange) across all three panels, aligned columns in tree view, foreignObject in NL SVG
- #3 Badge interactions — :green_circle: done: overlay/highlight hover model (animated preview infeasible), badge click expands in all panels, cross-panel highlighting, undo/reset, URL state. Interactive overlay with per-item add, level-by-level descendant breakdown, cluster overlay unification.
- #12 Full-width bottom panel — :green_circle: done: two switchable layouts, RIGHT direction, viewBox zoom, scroll-to-focus, zoom controls

**Phase 3 — Next up:**
- ~~#11 Scrollable clusters~~ — :green_circle: done: cluster hover shows same interactive overlay listing hidden children for selective expansion
- #3 Tree highlight — highlight hovered node in tree view
- #4+5 Toggle/Close (unified as visibility state)
- #7 Staggered levels — evaluate after clusters; may require replacing elkjs

**Layout engine:**
- Evaluate elkjs vs igraph vs manual layout — edge crossing minimization is poor for complex DAGs
- igraph supports forced vertical layering (nodes assigned to specific layers)

**Rendering refinements (backlog):**
- ~~NL hover positioning refactor~~ — resolved: removed in-place NL hover expansion entirely; full title shown via native SVG `<title>` tooltip
- Selected node vertical positioning — place focus node near top or aligned with tree selection

**Defer:**
- Fisheye — only if the above doesn't suffice
- Fit-to-view cycling — see [Zoom and fit-to-view](#zoom-and-fit-to-view) section above
- Node removal + history/undo system — see [Node removal](#node-removal) and [History & State Model](#history--state-model). Replaces current `manualNodeIds` + URL state approach with unified localStorage history.
- Tooltip/overlay positioning package — current `positionTooltip()` helper is adequate but has a TODO to consider a package if positioning gets more complex

### 3. Detail Panel

Shows concept metadata, parents list, children list. Title appears instantly from graph; definition loads asynchronously from API (cached in IndexedDB).

<details>
<summary>Current state and known issues (click to expand)</summary>

**Implemented:**
- Concept title, definition (async), long definition
- Link to Foundation browser
- Collapsible parents list with badges (click to navigate)
- Collapsible children list with badges (click to navigate)
- Descendant count in metadata
- Parent/child/descendant badges on all relation list items

**Known issues:**
- Parents/children lists largely duplicate the tree. Should show information not visible in tree.

</details>

#### Open design work

- **Paths to root**: Show all distinct paths from selected node to root as clickable breadcrumb trails. Directly addresses the polyhierarchy navigation problem.
  ```
  Paths to Root:
    1. ... > Bacterial intestinal infections > Abdominal actinomycosis
    2. ... > Other bacterial diseases > Actinomycosis > Abdominal actinomycosis
  ```

---

## History & State Model

:white_circle: Not started — replaces current `manualNodeIds` + URL state approach

The app maintains a **unified history** of all user actions in localStorage. This supports undo/redo, session continuity, and sharing — without using browser history or URL parameters during normal use.

### Data structure

```typescript
interface Snapshot {
  focusNodeId: string | null;   // selected node (null = nothing selected)
  displayedNodeIds: Set<string>; // all nodes currently shown in NL view
  timestamp: number;
  description: string;           // human-readable action description
}

// In localStorage:
interface AppHistory {
  snapshots: Snapshot[];  // ordered list of states
  pointer: number;        // index of current state (0-based)
}
```

### Operations

| Action | Effect on history |
|--------|-------------------|
| **Select focus node** | Compute initial neighborhood (`buildInitialNeighborhood`), push snapshot with description e.g. "Selected Cholera" |
| **Expand (badge click)** | Add nodes to displayed set, push snapshot e.g. "Expanded 3 children of X" |
| **Remove node X** | Delete X from displayed set, run connectivity pruning (keep only focus node's connected component), push snapshot e.g. "Removed Schizophrenia (+2 pruned)" |
| **Back / Undo** | Decrement pointer, render `snapshots[pointer]` |
| **Forward / Redo** | Increment pointer (if not at end), render `snapshots[pointer]` |
| **New action from earlier state** | Truncate everything after pointer, push new snapshot |

### URL and browser history

- **No URL parameters** — state lives entirely in IndexedDB
- **No browser history integration** — the ECT widget (icd11ect) manages its own browser history entries, making pushState/popstate-based undo unreliable. Undo/redo is via Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts and toolbar buttons only.
- **Share button** (future) generates a URL encoding the current snapshot's `displayedNodeIds` + `focusNodeId` for small sets. On load, this writes to the recipient's IndexedDB and renders. For large sets: alternative sharing mechanism TBD.

### Session continuity

- On app load, if localStorage contains history, prompt user: "Return to previous session?" with options to resume (restore `snapshots[pointer]`) or start fresh (clear history)
- Auto-clear snapshots older than N days (configurable, e.g. 7 days)

### History UI

A reviewable history panel/dropdown showing the exploration timeline:
- List of snapshots with descriptions and relative timestamps ("2 min ago", "yesterday")
- Current position highlighted
- Click any entry to jump directly (sets pointer, no need to step through)
- Optional scrubber/slider for quick traversal through long histories

### What this replaces

The current state model uses several separate mechanisms that this unifies:

| Current | Replaced by |
|---------|-------------|
| `manualNodeIds` in GraphProvider | `displayedNodeIds` in snapshot — no manual/default distinction |
| `manualHistoryRef` (undo stack) | History array with pointer |
| `excludedNodeIds` (was proposed) | Not needed — connectivity pruning handles removal |
| `buildNeighborhood` (per-render) | `buildInitialNeighborhood` (once per focus selection) |
| `useUrlState` / `?node=ID&expanded=...` | No URL params; state in localStorage |
| Ctrl+Z undo (per-type) | Unified back through history array |
| Click focus node to reset | Click focus node → `buildInitialNeighborhood` pushed as new snapshot |

### Implementation notes

- Snapshot `displayedNodeIds` is typically 10–50 IDs. Even with hundreds of snapshots, localStorage usage is modest.
- **NL subgraph:** Maintain a graphology subgraph derived from `displayedNodeIds` on each change (cheap for 10–50 nodes). The full 69k-node graph is read-only after `initGraph()` — never mutated. The subgraph is a disposable view for NL rendering.
  - Replaces the manual nested-loop edge extraction in `computeLayout` — use `subgraph.forEachEdge()` instead
  - Connectivity pruning on removal: `subgraph.dropNode(id)`, then `connectedComponents(subgraph)` (from `graphology-components`; treats directed edges as undirected), drop any component not containing focus node
  - Available for future graph algorithms (shortest path, centrality, etc.) on the visible neighborhood
- `buildInitialNeighborhood` is the current `buildNeighborhood` logic (ancestor DAG + children + clusters) but only runs once to produce the first snapshot when a focus node is selected.
- Tree view state (expand/collapse) could also be tracked in snapshots if we want unified undo across panels. For now, tree state is separate.

---

## Proposal Authoring

> **Note:** Interface design TBD. Include this capability in the architecture.

<details>
<summary>Requirements and design questions (click to expand)</summary>

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

</details>

---

## Help System

This is a complex UI with non-obvious interactions (badge clicks, cluster expansion, keyboard shortcuts, polyhierarchy indicators, etc.). A help system makes these discoverable without cluttering the interface.

### Help mode

A toggle button (e.g. `?` icon in a corner) activates **help mode**. While active:

- **Visual indicator**: the button stays highlighted and the cursor changes (e.g. `help` cursor) so the user knows they're in help mode
- **Hover/click override**: normal hover/click handlers on interactive elements are replaced with help handlers that show contextual help popovers
- **Element coverage**: every interactive element gets a help handler — tree nodes, NL nodes, badges, cluster nodes, toolbar buttons, panel headers, detail panel sections, etc.
- **Help popovers**: positioned near the element, containing:
  - What the element is
  - What clicking/hovering/dragging does
  - Keyboard shortcuts if applicable (e.g. "Ctrl+Z to undo" on the undo button)
  - Brief context about why (e.g. "Nodes with multiple parents appear at each location in the tree — the count badge shows how many parents exist")
- **Dismissal**: click anywhere outside a popover, or click the `?` button again to exit help mode
- **No side effects**: nothing changes in the app state while help mode is active — no selections, no expansions, no history pushes

### Help content strategy

Help text lives in a single data structure (object or map) keyed by element identifier, making it easy to maintain and update. Each entry contains:

```typescript
interface HelpEntry {
  title: string;           // e.g. "Parent count badge"
  description: string;     // what it is
  interactions: string[];  // what you can do with it
  shortcut?: string;       // keyboard shortcut if applicable
}
```
Source of truth for help content is a **structured markdown file** — easier to read, edit, and include formatting than a TypeScript object. The app parses it at build time (or loads it at runtime) into the `HelpEntry` structure.

### Open design questions

- **First-visit tour**: On first visit, prompt the user to take a guided tour that walks through key UI elements in sequence. Subsequent visits show the `?` button without prompting.
- **Progressive disclosure**: Help popovers link to more detailed documentation where appropriate (e.g. "Learn more about polyhierarchy" → a doc page or section).
- **Keyboard shortcut cheat sheet**: Currently only Ctrl+Z / Ctrl+Shift+Z (undo/redo) and Escape (reset neighborhood). If more shortcuts are added, consider a dedicated shortcut reference modal.

---

## Open Questions / Future Investigation

1. **Canonical/linked distinction**: Does the WHO API expose this or only iCAT?
2. **Integration path**: How will this embed into the .NET maintenance platform?
3. **Depth spread as maintenance signal**: Each node has `depth` (shortest path from root) and `maxDepth` (longest path from root). For polyhierarchy nodes these differ — 11,345 nodes (16%) have spread. Large spread may flag structural anomalies (e.g., a specific concept that's also directly under a high-level chapter). Consider surfacing depth range in the detail panel and/or using it as a filter/highlight for maintenance review. Cf. OHDSI/OMOP approach of storing both min and max path lengths.

---

## References

- ICD-11 Foundation Browser: https://icd.who.int/browse/2025-01/foundation/en
- ICD-11 Maintenance Platform: https://icd.who.int/dev11 (requires login)
- ICD-11 API Documentation: https://icd.who.int/icdapi
- graphology.js: https://graphology.github.io/
- igraph: https://igraph.org/
- elkjs: https://github.com/kieler/elkjs
- Labella.js: https://twitter.github.io/labella.js/

#### Wireframes & Screenshots

Working screenshots and wireframes live in `design-stuff/spec-assets/`.

Naming convention: `{component}-{description}-{date or version}.png`
