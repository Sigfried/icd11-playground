# Minimap Explorations

Prototype overview images for "where am I" navigation in the ICD-11 tool.
Two goals: (1) tree minimap for the fully-expanded indented list, (2) DAG
minimap showing actual topology without node duplication.

---

## Tree Strips (SET 1)

The fully-expanded tree has **~200K rows** (nodes with N parents appear N
times, each with its full subtree). The strips compress this into a 60x600
vertical image.

### `tree_strip_plain.png` (60x600)

- **Y position** = row position in the fully-expanded DFS tree
- **X extent** = depth range — each pixel row represents ~333 tree rows;
  the horizontal bar spans from the min depth to max depth in that band
- **Color** = single teal, brightness proportional to density (how many of
  the ~333 rows actually exist in that band)

### `tree_strip.png` (60x600)

Same layout, but color encodes **polyhierarchy subtrees**. The top 10
multi-parent nodes by descendant count each get a distinct hue. When a row
is inside one of these subtrees (its ancestor chain passes through the
colored node), it gets that color. Matching colored bands at different
vertical positions = the same subtree appearing under different parents.

**Known issue:** The first visible indent starts too far to the right.
The bars go from `dmin` to `dmax` of each pixel band rather than being
anchored at x=0. Should be fixed so every bar starts at the left edge and
extends rightward to the max depth, matching the look of an indented list.

---

## DAG Views (SET 2)

The DAG has **69,478 nodes** and **77,510 edges**. No node duplication.

### `dag_topology.png` (600x600)

- **Y** = depth from root, **sqrt-scaled** so the sparse upper levels
  (root, chapters) get more vertical space and the dense middle depths
  (6-9, where 60K+ nodes live) are compressed
- **X** = DFS traversal order, which keeps sibling subtrees clustered
  horizontally
- **Dot color** = parent count: gray = 1 parent, orange-to-magenta =
  2-9 parents (brighter = more parents)
- **Dot size** = descendant count (log scale) — important nodes are
  slightly larger
- **Orange lines** = parent edges for the top 50 polyhierarchy nodes by
  descendant count — these are the structurally important cross-links

The upper half is very sparse (few nodes at shallow depths). The lower
half is dense horizontal bands (depths 6-9 have most nodes). At 600px,
individual nodes in the dense bands are indistinguishable.

### `dag_topology_simple.png` (600x600)

Same layout (depth-based Y, DFS-order X) but:
- **Color** = depth via viridis colormap (purple=shallow, green=mid,
  yellow=deep)
- **No edges**

Shows the density gradient — the hierarchy widens dramatically at
mid-depths and narrows again toward the leaves.

### `dag_depth_compact.png` (600x600)

Alternative layout using **height** (distance to furthest leaf) instead of
depth:
- **Y** = height, flipped so root is at top and all leaves cluster at
  bottom — avoids wasting bottom space on sparse deep layers
- Vertical space per height band is **sqrt-weighted** by node count, so
  the 53K leaves get ~40% of vertical space rather than 1 pixel row
- **Purple lines** = polyhierarchy edges for top 50 nodes
- **Color** = parent count (same gray-to-magenta scale)

The top section shows visible branching structure; the bottom is the
dense leaf mass. Multi-parent nodes (orange/magenta dots) cluster in the
upper-middle region.

**Overall DAG assessment:** At 600x600 with 69K nodes, individual node
plotting produces mostly noise in the dense bands. A better approach
would be aggregation — heatmaps or density plots showing distributions
within each depth/height band rather than individual dots.

---

## Pareto Charts

Analysis of polyhierarchy duplication cost. Useful for understanding what
the minimap needs to visually convey: how many large vs small duplicated
subtrees exist, and how parent count relates to subtree size.

### `poly_pareto.png` (800x500)

- **X axis** = subtree size bins (log-scale, ascending: 1, 2-5, ..., 5K+)
- **Y axis (left, orange, log scale)** = number of multi-parent nodes in
  that bin
- **Bars** stacked by parent count (2=orange through 9=magenta)
- **Cumulative line (right, blue)** = ascending fraction of total extra
  tree rows accumulated left-to-right. Shows what % of duplication cost
  comes from subtrees of that size *or smaller*. The line stays low on
  the left (many small subtrees but little duplication cost each) and
  jumps steeply on the right (few large subtrees drive most cost).

Key finding: most polyhierarchy nodes are leaves (5,172 of 7,132), but
the duplication cost is driven by the few large-subtree nodes on the
right — 50% of extra rows come from nodes with subtrees of 51+.

### `poly_pareto_multi_only.png` (800x500)

Same format, filtered to **3+ parents only** (666 nodes). Higher parent
counts cluster in the small-subtree bins. Very few nodes have both many
parents AND large subtrees.

### `poly_pareto_all.png` (800x500)

**All 69K nodes** (including single-parent), same format. Puts
polyhierarchy in context — multi-parent nodes (orange slivers) are a
small fraction at every size bin. 53K of 69K are leaves.

The 5K+ bin differs across charts: 0 (3+ parents — no large-subtree node
has 3+ parents), 2 (all multi-parent — two 2-parent nodes), 13 (all
nodes — adds 11 single-parent chapter-level nodes).

### `poly_summary.png` (1000x500)

Left: horizontal bar chart, one bar per parent count (2-9), showing node
count and extra tree rows.

Right: **sparkline column** — each row has a mini bar chart showing the
distribution of descendant counts for nodes with that parent count. Bins
are log-scale: 0, 1-5, 6-50, 51-500, 501-5K, 5K+. Counts labeled above
each bar.

Key insight for minimap design: the 2-parent row has a long tail (6 nodes
at 501-5K, 2 at 5K+) — these are the nodes that create the *visually
large* colored bands in the tree strip. Higher parent-count rows are
almost entirely leaves/small subtrees — they produce many small
duplications, not individually visible at minimap scale.

Summary stats:
- 7,132 polyhierarchy nodes (10.3%)
- 82,439 extra tree rows
- 2-parent nodes = 90.7% of polyhierarchy, 86.7% of extra rows
- Top 10 nodes = 47% of extra rows

---

## Old (v1) Images

First-round explorations in `old/`: depth histogram, treemap, icicle,
sunburst, minimap strip, hilbert curve, edge density. See those images
directly — most were interesting but didn't serve the "where am I" goal.
The icicle was the most structurally honest but didn't convey polyhierarchy.


```mermaid
graph TD
  L1A[Root] --> L2A
  L1A --> L2B
  L1A --> L2C
  L2A[Grandparent 1; subtree 8] --> L3A
  L2A --> L3B
  L2B[Grandparent 2; subtree 7] --> L3B
  L3B --> L4A
  L3B[Parent 1; subtree 6 * 2 parents: adds 12] --> L4B
  L2C[Parent 2; subtree 5 * 1 parent: adds 5] --> L4B
  
  subgraph Main 4 nodes appears twice * 2 parents: adds 8
    L4B[Main] --> L5A
    L4B --> L5B
    L4B --> L5C
  end
