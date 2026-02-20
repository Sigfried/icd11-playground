# ICD-11 Visual Maintenance Interface — Design Specification

**Remaining work only.** For implemented feature documentation, see [help-content.md](web/public/help-content.md). For architecture and setup, see [CLAUDE.md](CLAUDE.md).

---

## Remaining Work

Legend: :yellow_circle: Needs design | :white_circle: Not started | :black_circle: Future

| Area | Feature | Status |
|------|---------|--------|
| **Scalability** | Collapse heuristics for tree + NL | :white_circle: |
| | Staggered levels (Labella.js-style) | :white_circle: |
| | Layout engine evaluation (elkjs vs igraph) | :white_circle: |
| | Focus node vertical positioning | :white_circle: |
| | Fit-to-view cycling (fit all / fit width / fit height) | :white_circle: |
| | Pop-out NL window | :white_circle: |
| **NL Diagram** | Foundation ordering of siblings | :yellow_circle: Partially (model order hint) |
| | NL hover → tree highlight (cross-panel) | :white_circle: |
| | Force-directed layout toggle | :white_circle: |
| **Tree View** | Polyhierarchy occurrence navigation | :white_circle: |
| | Advanced search options | :white_circle: |
| **Detail Panel** | Paths to root | :yellow_circle: |
| | Detail panel differentiation from tree | :yellow_circle: |
| **Data Model** | Foundation cross-references (maternal, perinatal, impairment) | :white_circle: |
| | Canonical vs linked parents | :white_circle: Investigation |
| **State & History** | History review UI (timeline panel) | :white_circle: |
| | Share button (encode snapshot in URL) | :white_check_mark: |
| | Auto-clear old snapshots | :white_circle: |
| | Tree & detail state in history | :white_circle: |
| **Infrastructure** | Cloudflare Worker proxy 500 errors on entity detail fetch | :white_circle: Bug |
| | Multi-tab IndexedDB history conflict (last-write-wins overwrites other tabs) | :white_circle: Bug |
| **Search** | Advanced search field options | :white_circle: |
| **Help System** | First-visit guided tour | :white_circle: |
| | Stakeholder feedback mechanism | :white_circle: |
| **Proposal Authoring** | All features | :black_circle: |

---

## Scalability & Readability

The core ongoing design challenge. High-degree nodes (up to 331 children) and complex polyhierarchies (up to 9 parents) make views unreadable.

### What's been done

Ancestors to depth 2, collapsible clusters (threshold: 2), font-weight badges, interactive overlays (hover to preview, click to expand), connectivity-based node removal, merge-on-reselect. These are all documented in [help-content.md](web/public/help-content.md).

### Remaining approaches

- **Collapse heuristics**: Auto-collapse deep/large subtrees in both tree and NL view based on depth, subtree size, or user preference. Tree side: when expanding a node with hundreds of children, consider paginating or progressive expansion. NL side: smarter default neighborhoods that show fewer nodes for high-degree cases.

- **Staggered levels**: [Labella.js](https://twitter.github.io/labella.js/)-style overlap avoidance for node labels. Try both simple and overlap algorithms. Horizontal flow variant: https://twitter.github.io/labella.js/with_text.html. May require replacing elkjs.

- **Layout engine**: Evaluate elkjs vs igraph vs manual layout. Current issues:
  - Edge crossing minimization is poor for complex DAGs
  - igraph supports forced vertical layering (nodes assigned to specific layers)
  - Better control over complex polyhierarchy layouts

- **Focus node vertical positioning**: Place focus node near top or aligned with tree selection, rather than wherever ELK puts it.

- **Fit-to-view cycling**: The `⊡` button should cycle through three modes:
  1. **Fit all** — current behavior
  2. **Fit width** — horizontal extent fills viewport, vertical scrolls
  3. **Fit height** — vertical extent fills viewport, horizontal scrolls
  Visual indicator: cycle icon `⊡` → `↔` → `↕` → `⊡`.

- **Pop-out window**: Full-screen NL in a separate window. No sync with tree/details — just allow exploring and selecting a new focal node in the pop-out.

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

## NL Hover → Tree Highlight

Cross-panel: hovering a node in the NL diagram should highlight and scroll to that node in the tree view (all instances if polyhierarchy). This is the remaining piece of hover behavior — tooltip and detail preview are done.

---

## Polyhierarchy Occurrence Navigation

For concepts with multiple parents, users need ways to find and navigate between all occurrences in the tree:

- **Paths to root**: Show all distinct paths from selected node to root as clickable breadcrumb trails in the detail panel. Clicking a path scrolls the tree to that occurrence.
  ```
  Paths to Root:
    1. ... > Bacterial intestinal infections > Abdominal actinomycosis
    2. ... > Other bacterial diseases > Actinomycosis > Abdominal actinomycosis
  ```

- **Go-to-next-occurrence**: An affordance (button or keyboard shortcut) to cycle through the tree locations where the selected concept appears.

- **Filter view for occurrences**: "View other occurrences" could activate filter mode showing only the paths containing the selected concept — leveraging the existing search/filter infrastructure.

### Detail panel differentiation

The parents/children lists in the detail panel largely duplicate what's visible in the tree. The detail panel should show information *not* available in the tree — paths to root, relationship types, and cross-references would address this.

---

## Advanced Search

Extend tree search with field-specific options, similar to the ICD-11 Maintenance Platform's advanced search:

- **Searchable fields**: Index Term, Title, Synonym, Narrower Term, Fully Specified Name, Description Term, Exclusion
- **UI**: Expandable "Advanced" panel below the search input with checkboxes for each field
- **Default**: Search Index Terms only (current behavior)

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

## Force-Directed Layout Toggle

Add a toolbar button to the NL view to toggle between the current hierarchical (ELK) layout and a force-directed layout.

### Motivation

Hierarchical layout (top-down DAG) is ideal for understanding parent-child structure, but force-directed layout better reveals clusters, communities, and non-tree connectivity patterns — useful for understanding the neighborhood around a concept at a glance.

### Design

- **Toggle button** in the NL toolbar, next to the existing layout controls
- **Two modes**: Hierarchical (current, default) and Force-directed
- **Same subgraph** — the displayed nodes and edges don't change, only the layout algorithm
- **Same interactions** — zoom, pan, hover, click, expand/collapse badges all work in both modes
- **Animated transition** between layouts (nodes interpolate to new positions)
- **Force-directed specifics**:
  - Use D3-force (`d3-force` or `d3-force-3d`) since D3 is already a dependency
  - Directed edges: arrowheads still indicate parent→child direction
  - Focus node visually distinguished (same styling as hierarchical mode)
  - Collision avoidance to prevent node overlap
  - Link distance could vary by relationship (shorter for parent-child, longer for cross-refs if added later)

### Open questions

- Should the force simulation run continuously (interactive/springy) or settle to a static layout?
- Should the toggle state persist across node selections, or reset to hierarchical on reselect?
- Edge rendering: curved edges (better for force-directed) vs orthogonal routing (current hierarchical)?

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

The snapshot-based history system is implemented (see [help-content.md](web/public/help-content.md#session--history)). Remaining:

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

The contextual help system is implemented: `?` toggle activates help mode with capture-phase click interception, contextual popovers sourced from [help-content.md](web/public/help-content.md), native tooltip replacement showing entry names on hover, cursor differentiation (help cursor on tagged elements, not-allowed elsewhere), and keyboard shortcuts (? to toggle, Escape to dismiss/exit).

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

---

## Known Bugs / Tech Debt

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
- igraph: https://igraph.org/

Wireframes and screenshots: `design-stuff/spec-assets/`

[sg] -- add to tasks somewhere. low priority for now
Foundation has released version that changes infrequently. The backoffice version
changes frequently.  We will probably want ability to switch versions in app


