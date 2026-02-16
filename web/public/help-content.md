# Help Content
<!--
  Source of truth for the contextual help system.
  Parsed at build/runtime into HelpEntry objects keyed by element identifier.

  Two levels:
  1. **Element entries** (### headings) — shown in help mode popovers when the
     user hovers/clicks a specific UI element. Keyed by element identifier.
  2. **Section articles** (## headings with body text) — longer explanations
     that element popovers link to via "Learn more about..." links.

  Element entry format:
  - **Title:** displayed heading
  - **Description:** what this element is
  - **Interactions:** what you can do (bullet list)
  - **Shortcut:** keyboard shortcut (optional)
  - **Context:** brief "why" explanation (optional)
-->

---

## General

This tool visualizes the ICD-11 Foundation — the ~69,000-concept polyhierarchy that underlies the ICD-11 classification system. Three linked panels let you explore the hierarchy from different angles: a tree for navigating the full structure, a node-link diagram for seeing the neighborhood around a concept, and a detail panel for metadata.

The Foundation is distinct from the MMS (Mortality and Morbidity Statistics) linearization that assigns ICD codes. In the Foundation, a single concept can have multiple parents — for example, a disease might appear under both the body system it affects and the type of pathology it represents. This polyhierarchy is the central structural feature this tool helps you explore.

### about-this-tool

- **Title:** ICD-11 Foundation Explorer
- **Description:** A visual interface for exploring the ICD-11 Foundation — a polyhierarchy of ~69,000 medical concepts where a single concept can have multiple parents.
- **Interactions:**
  - Click any concept in the tree to select it
  - The node-link diagram shows the neighborhood around the selected concept
  - The detail panel shows metadata fetched from the ICD-11 API
- **Context:** The Foundation is the source layer of ICD-11. Unlike the linearized MMS classification (which assigns codes), the Foundation allows concepts to appear under multiple parents — this is called polyhierarchy. This tool helps you see and navigate that structure.

### polyhierarchy

- **Title:** Polyhierarchy
- **Description:** A concept with multiple parents appears in multiple locations in the tree. All instances represent the same concept — selecting one highlights all of them.
- **Context:** For example, "Diabetes mellitus in pregnancy" appears under both "Diabetes mellitus" and "Pregnancy-related conditions." The parent count badge shows how many parents a concept has.

---

## Tree View

The tree is the primary navigation interface. It renders the full Foundation hierarchy — all 69,000 concepts are loaded in memory, so expanding and collapsing is instant. Concepts with multiple parents appear at each location in the tree; selecting any instance highlights all of them and updates the other panels.

The tree supports searching in two modes: **search** (highlights matches in place within the full tree) and **filter** (hides non-matches, showing only results and their ancestors). Search queries are tracked in the undo history.

### tree-node

- **Title:** Tree node
- **Description:** A concept in the ICD-11 Foundation hierarchy. Click the chevron (or bullet) to expand/collapse children. Click the name to select it as the focus concept.
- **Interactions:**
  - Click chevron (▶/▼) to expand or collapse children
  - Click concept name to select it (updates node-link diagram and detail panel)
  - Bullet (·) means the concept has no children
- **Context:** All 69,000 Foundation concepts are loaded in memory — expanding is instant with no network requests.

### tree-search

- **Title:** Tree search
- **Description:** Search for concepts by name in the tree. Two modes available: search (highlight matches in place) and filter (hide non-matches).
- **Interactions:**
  - Type to search — results appear after a brief pause
  - Click the magnifying glass icon for search mode (highlights matches in the full tree)
  - Click the funnel icon for filter mode (hides non-matching nodes, shows only matches and their ancestors)
  - Matching text is highlighted in yellow
  - Result count shown next to the search input
- **Shortcut:** Ctrl+F or / to focus the search input; Escape to clear
- **Context:** Search queries are saved in the undo history — you can undo/redo to restore a previous search.

---

## Interactive Overlays

Badges, tooltips, and hover overlays appear across multiple panels and share common interaction patterns: **hover to preview, click to act, Escape to dismiss**.

**Badges** appear on every concept showing parent count (↑), child count (↓), and descendant count (▽). Their font weight reflects the count — bolder means more. Badge behavior varies by panel: in the tree, clicking a parent badge expands all parent paths; in the node-link diagram, it adds parent nodes to the view; in the detail panel, it expands an inline sub-list. But in all panels, hovering a badge highlights related nodes across every panel simultaneously.

**Hover overlays** appear in the node-link diagram when you hover badges, clusters, or nodes. They show lists of related concepts with per-item add buttons, letting you selectively expand the neighborhood. Overlays use hover-intent (they stay open when you move into them) and can be dismissed with Escape.

**Tooltips** provide quick information — the node hover tooltip shows the full untruncated title and stats, while the descendant tooltip shows a level-by-level breakdown with expand buttons.

### parent-badge

- **Title:** Parent count badge (N↑)
- **Description:** Shows how many parents this concept has. Only appears when a concept has more than one parent (polyhierarchy).
- **Interactions:**
  - **Tree:** Click to expand all parent paths, revealing every location this concept appears in the tree
  - **Node-link:** Hover to see a list of parents not yet in the diagram; click items to add them individually, or click the badge to add all parents. When all parents are shown, the badge turns red — click again to remove them.
  - **Detail panel:** Click on a parent list item's ↑ badge to expand that item's parents inline
  - **All panels:** Hover highlights parent nodes across all panels
- **Context:** Concepts with multiple parents are the heart of polyhierarchy. The badge font weight reflects the count — bolder means more parents.

### child-badge

- **Title:** Child count badge (N↓)
- **Description:** Shows how many children this concept has.
- **Interactions:**
  - **Tree:** Click to expand/collapse children (same as clicking the chevron)
  - **Node-link:** Hover to see children not yet in the diagram; click items to add individually, or click the badge to expand all. When all children are shown, the badge turns red — click again to remove them.
  - **Detail panel:** Click on a child list item's ↓ badge to expand that item's children inline
  - **All panels:** Hover highlights child nodes across all panels
- **Context:** Badge font weight reflects the count — bolder means more children.

### descendant-badge

- **Title:** Descendant count badge (N▽)
- **Description:** Shows the total number of unique descendants (children, grandchildren, etc.) beneath this concept. Only appears when descendants exceed the direct child count.
- **Interactions:**
  - **Tree:** Click to show a level-by-level breakdown tooltip. Each level has an "Expand" button to expand the tree through that depth.
  - **Node-link:** Click to show a level-by-level overlay with per-level add buttons. Add children, grandchildren, etc. incrementally.
  - **Detail panel:** Click on a list item's ▽ badge to expand descendants inline
- **Context:** Large descendant counts (shown by bolder font weight) indicate major branches of the classification. The level-by-level breakdown lets you explore incrementally without overwhelming the view.

### descendant-tooltip

- **Title:** Descendant breakdown tooltip
- **Description:** Shows a level-by-level count of descendants: children, grandchildren, great-grandchildren, etc.
- **Interactions:**
  - Click "Expand" (tree) or "+N" (node-link) to add nodes through that depth
  - Hover over the tooltip to keep it open
  - Click outside or press Escape to dismiss
- **Context:** Helps you understand the size and shape of a subtree before expanding it.

### node-hover-tooltip

- **Title:** Node hover tooltip
- **Description:** Appears when hovering a node in the node-link diagram. Shows the full (untruncated) concept title plus parent count, child count, and descendant count.
- **Interactions:**
  - Hover a node to see the tooltip
  - The detail panel simultaneously shows a preview of the hovered node's metadata
  - Move the mouse away to dismiss
- **Context:** Node labels in the diagram are often truncated for space. The tooltip reveals the full name and key stats without selecting the node. See also: [detail-preview](#detail-preview).

### cluster-overlay

- **Title:** Cluster hover overlay
- **Description:** Appears when hovering a cluster node ("N more...") in the node-link diagram. Shows a scrollable list of the hidden children with their badges.
- **Interactions:**
  - Hover over the cluster to see the list
  - Click an individual child to add just that node to the diagram
  - Click the cluster node itself to expand all hidden children at once
  - Hover into the overlay to keep it open; move away to dismiss
- **Context:** Lets you selectively explore a cluster's contents without expanding everything. See also: [nl-cluster](#nl-cluster).

### badge-hover-overlay

- **Title:** Badge hover overlay
- **Description:** Appears when hovering a parent or child badge in the node-link diagram. Lists nodes not yet visible in the diagram, with per-item add buttons and an "Add all" option.
- **Interactions:**
  - Hover a badge to see the overlay listing related nodes not yet in the diagram
  - Click individual items to add them selectively
  - Click "Add all" to add everything
  - Already-visible nodes are indicated in the count
  - Hover into the overlay to keep it open (hover-intent with ~150ms delay)
- **Context:** Provides selective expansion — you can cherry-pick which parents or children to add to the diagram rather than adding all at once.

---

## Node-Link Diagram

The node-link diagram shows a DAG (directed acyclic graph) of the neighborhood around the selected concept. It's the primary tool for understanding a concept's position in the polyhierarchy — you can see its parents, grandparents, children, and how they connect.

The diagram starts with a default neighborhood: ancestors up to two levels deep (skipping the root and top-level categories) and direct children. Children beyond the first two are grouped into collapsible clusters. From there, you can expand the view by clicking badges (to add parents or children), clicking cluster nodes (to reveal hidden children), or selecting a new focus node (which merges its neighborhood into the current view).

Nodes you add manually can be removed with the × close button. Removal uses connectivity pruning — removing a node also removes anything that becomes disconnected from the focus node. All changes are tracked in the undo history.

### node-link-overview

- **Title:** Node-link diagram
- **Description:** A DAG (directed acyclic graph) showing the neighborhood around the selected concept. Parents are shown above, children below, with edges showing the hierarchy.
- **Interactions:**
  - Click a node to select it as the new focus concept
  - Hover a node to see a tooltip with its title and stats, and preview its details in the detail panel
  - Scroll to pan; Ctrl+scroll to zoom
  - Use the toolbar buttons at the bottom for zoom, fit, undo/redo
- **Context:** The diagram shows ancestors up to two levels deep (skipping root and top-level categories) and direct children. Children beyond the first two are grouped into clusters to keep the view manageable.

### nl-node

- **Title:** Diagram node
- **Description:** A concept in the node-link diagram. Shows the concept name (truncated if long) and badges for parent/child/descendant counts.
- **Interactions:**
  - Click to select as focus (rebuilds neighborhood around this concept)
  - Hover to see full title and stats in a tooltip, plus preview in the detail panel
  - Hover to reveal the × close button
  - Badges are clickable — see badge help entries for details
- **Context:** Clicking a node that's already visible merges its neighborhood into the current view rather than replacing it.

### nl-close-button

- **Title:** Close button (×)
- **Description:** Appears on hover over any node in the diagram. Removes the node and prunes any nodes that become disconnected from the focus.
- **Interactions:**
  - Click to remove this node
  - Disconnected nodes are automatically pruned (connectivity-based removal)
  - The action is recorded in undo history — Ctrl+Z to restore
- **Context:** Removal uses connectivity pruning: the focus node anchors the graph, and anything disconnected from it is removed. This lets you simplify the view without manually removing each node.

### nl-cluster

- **Title:** Cluster node ("N more...")
- **Description:** Groups hidden children to keep the diagram readable. Shows the count of hidden children and their total descendants.
- **Interactions:**
  - Click to expand — adds all hidden children as real nodes in the diagram
  - Hover to see a scrollable list of hidden children with their badges
  - Click individual items in the hover list to add just that child
- **Context:** When a concept has many children, only the first two are shown directly. The rest are grouped into this cluster. You can expand selectively or all at once.

### nl-focus-node

- **Title:** Focus node
- **Description:** The currently selected concept, shown as the central node in the diagram. The neighborhood is built around this node.
- **Interactions:**
  - Click the focus node to reset the neighborhood to its default state (removes all manually added nodes)
  - The reset is recorded in undo history
- **Context:** The focus node anchors the view. All other nodes are shown because of their relationship to it.

### nl-edge

- **Title:** Diagram edge
- **Description:** A directed edge showing a parent-child relationship. Flows from parent (top) to child (bottom).
- **Context:** Edges use orthogonal routing (right angles). In complex polyhierarchies, edges may overlap — hover over nodes to identify connections.

---

## Node-Link Toolbar

Controls at the bottom of the node-link diagram for zoom, fit-to-view, and exploration history (undo/redo). Scroll to pan; Ctrl+scroll (Cmd+scroll on Mac) to zoom smoothly.

### zoom-in

- **Title:** Zoom in (+)
- **Description:** Increases the diagram scale by 1.3×.

### zoom-out

- **Title:** Zoom out (−)
- **Description:** Decreases the diagram scale by 1.3×.

### zoom-reset

- **Title:** Reset zoom (↺)
- **Description:** Returns the diagram to 1× scale, scrolled to the top-left.

### fit-to-view

- **Title:** Fit to view (⊡)
- **Description:** Scales the diagram so all nodes fit within the visible area.

### undo-button

- **Title:** Undo
- **Description:** Steps back through the exploration history. Restores the previous neighborhood state.
- **Shortcut:** Ctrl+Z (Cmd+Z on Mac)
- **Context:** History tracks node selections, expansions, removals, and search queries. Each action is a snapshot that can be undone.

### redo-button

- **Title:** Redo
- **Description:** Steps forward through the exploration history (after an undo).
- **Shortcut:** Ctrl+Shift+Z (Cmd+Shift+Z on Mac)

---

## Detail Panel

The detail panel shows metadata for the currently selected concept: title, definition, parents, and children. The title appears instantly from the in-memory graph; the definition is fetched on demand from the ICD-11 API and cached in your browser for future visits.

Parent and child lists are interactive — click any item to navigate to it, or use the badges to expand sub-lists inline without leaving the current concept. When you hover a node in the node-link diagram, the detail panel temporarily previews that node's information (marked with a "Preview" label) without changing your selection.

### detail-panel-overview

- **Title:** Detail panel
- **Description:** Shows metadata for the selected concept: title, definition, parents, children, and a link to the WHO Foundation browser.
- **Interactions:**
  - Click a parent or child name to select that concept
  - Click section headers (Parents, Children) to expand/collapse the list
  - Badges on list items work the same as in the tree — click to expand inline, hover to highlight
- **Context:** The title appears instantly from the in-memory graph. The definition is fetched on demand from the ICD-11 API and cached locally.

### detail-preview

- **Title:** Preview mode
- **Description:** When you hover a node in the node-link diagram, the detail panel temporarily shows that node's information with a "Preview" label.
- **Interactions:**
  - Move the mouse off the node to return to the selected concept's details
  - Click the node to make it the permanent selection
- **Context:** Lets you explore the neighborhood without committing to a selection.

### detail-browser-link

- **Title:** View in Foundation Browser
- **Description:** Opens the concept in the official WHO ICD-11 Foundation browser in a new tab.
- **Context:** Useful for seeing the full official entry, including classification codes and additional metadata not shown in this tool.

### detail-inline-expansion

- **Title:** Inline list expansion
- **Description:** Badges on parent/child list items can be clicked to expand sub-lists inline within the detail panel.
- **Interactions:**
  - Click ↑ badge on a parent to show that parent's parents above it
  - Click ↓ badge on a child to show that child's children below it
  - Click ▽ badge to expand descendants inline
- **Context:** Lets you explore the hierarchy within the detail panel without changing your focus node or cluttering the diagram.

---

## Layout & Panels

The interface has three panels — tree, detail, and node-link diagram — arranged in one of two switchable layouts. In **two-row layout**, the tree and detail panel sit side by side on top with the diagram full-width below; this works well on wide screens and when the diagram is your focus. In **two-col layout**, the tree takes the left side with the detail panel and diagram stacked on the right; this is better for deep tree exploration.

All panel borders are draggable to resize. Panels have a minimum size to prevent them from being crushed.

### layout-toggle

- **Title:** Layout toggle
- **Description:** Switches between two panel arrangements.
- **Interactions:**
  - Click to toggle between layouts
  - **Two-row layout:** Tree and detail panel side by side on top, node-link diagram full width on bottom. Good for wide screens and when the diagram is your focus.
  - **Two-col layout:** Tree on the left, detail panel and node-link stacked on the right. Good for deep tree exploration.
- **Context:** The icon shows what you'll switch to, not the current layout.

### panel-divider

- **Title:** Panel divider
- **Description:** Drag to resize adjacent panels.
- **Interactions:**
  - Drag horizontally (vertical divider) or vertically (horizontal divider)
  - Panels have a minimum size of 150px
- **Context:** Panel sizes are preserved as you work. The layout adapts to your screen and workflow.

### header-home-link

- **Title:** Title link
- **Description:** Clicking "ICD-11 Foundation Explorer" in the header reloads the app.

---

## Session & History

Every action you take — selecting a node, expanding badges, removing nodes, searching — is recorded as a snapshot in your exploration history. You can step backward and forward through this history with Ctrl+Z / Ctrl+Shift+Z (or the toolbar undo/redo buttons), and if you take a new action after undoing, the undone steps are discarded (standard undo behavior).

Your session is automatically saved in your browser's IndexedDB. When you return to the app, you'll be offered the choice to resume where you left off or start fresh. No account or server is needed — everything is local to your browser.

### resume-modal

- **Title:** Resume previous session
- **Description:** When you return to the app and a previous session exists, this dialog lets you pick up where you left off or start fresh.
- **Interactions:**
  - **Resume:** Restores your previous focus node, displayed neighborhood, and full undo history
  - **Start Fresh:** Clears saved state and starts with an empty view
- **Context:** Session state is saved automatically in your browser's IndexedDB. No account or server needed.

### undo-redo

- **Title:** Undo / Redo
- **Description:** Every exploration action (selecting a node, expanding badges, removing nodes, searching) is recorded as a snapshot. You can step backward and forward through your exploration history.
- **Shortcut:** Ctrl+Z to undo, Ctrl+Shift+Z to redo (Cmd on Mac)
- **Context:** If you undo several steps and then take a new action, the undone steps are discarded (standard undo behavior). History persists across browser sessions.

---

## Keyboard Shortcuts

Quick reference for all keyboard shortcuts. Most shortcuts work globally; Escape behavior depends on context (search input focused → clears search; tooltip open → dismisses tooltip; otherwise → blurs input).

### shortcut-search

- **Title:** Focus search
- **Shortcut:** Ctrl+F or /
- **Description:** Moves keyboard focus to the tree search input.

### shortcut-escape

- **Title:** Escape
- **Shortcut:** Escape
- **Description:** Context-dependent: clears search text, dismisses tooltips, or blurs the search input.

### shortcut-undo

- **Title:** Undo
- **Shortcut:** Ctrl+Z (Cmd+Z on Mac)
- **Description:** Steps back through exploration history.

### shortcut-redo

- **Title:** Redo
- **Shortcut:** Ctrl+Shift+Z (Cmd+Shift+Z on Mac)
- **Description:** Steps forward through exploration history.

---

## Cross-Panel Behavior

The three panels are tightly linked. Selecting a concept anywhere updates all panels simultaneously — the tree expands and scrolls to show it, the diagram rebuilds around it, and the detail panel shows its metadata. Hovering a badge in any panel highlights related nodes across all panels, so you can see at a glance where a concept's parents or children appear in each view.

This coordination is what makes the tool useful for understanding polyhierarchy: you can see the same concept from the tree perspective (where does it sit in the hierarchy?), the diagram perspective (what's its local neighborhood?), and the detail perspective (what does the ICD-11 API say about it?) — all at once.

### cross-panel-highlighting

- **Title:** Cross-panel highlighting
- **Description:** Hovering a badge in any panel highlights related nodes across all three panels — tree, node-link diagram, and detail panel.
- **Context:** This helps you see where a concept's parents or children appear across different views simultaneously.

### cross-panel-selection

- **Title:** Synchronized selection
- **Description:** Selecting a concept in any panel updates all panels: the tree expands and scrolls to show it, the node-link diagram rebuilds around it, and the detail panel shows its metadata.
- **Context:** All panels always reflect the same selected concept. The tree may show the concept in multiple locations (polyhierarchy) — all are highlighted.
