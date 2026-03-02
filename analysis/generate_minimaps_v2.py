"""
Generate minimap overview images for the ICD-11 Foundation hierarchy.

Two sets:
  SET 1 -- Tree minimap (fully-expanded DFS with duplicated multi-parent nodes)
    - tree_strip.png: polyhierarchy-colored vertical strip (60x600)
    - tree_strip_plain.png: single-color density strip (60x600)

  SET 2 -- DAG minimap (no duplication, actual topology)
    - dag_topology.png: layout with multi-parent edges (600x600)
    - dag_topology_simple.png: nodes colored by depth, no edges (600x600)
    - dag_depth_compact.png: height-based Y, parent-count coloring, edges (600x600)

All images use dark backgrounds for the web app's dark theme.
"""

import json
import sys
import math
import os
from collections import Counter, defaultdict

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BG = (26, 26, 46)             # #1a1a2e
STRIP_W, STRIP_H = 60, 600
DAG_SZ = 600
MARGIN = 10

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "minimaps")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Distinct saturated hues for the top polyhierarchy subtrees
POLY_HUES = [
    (255, 80, 80),    # red
    (80, 180, 255),   # blue
    (100, 230, 100),  # green
    (255, 180, 50),   # orange
    (200, 100, 255),  # purple
    (255, 255, 80),   # yellow
    (80, 255, 220),   # cyan
    (255, 100, 180),  # pink
    (180, 255, 130),  # lime
    (255, 140, 140),  # salmon
]

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
print("Loading graph data...")
with open(os.path.join(os.path.dirname(__file__), "foundation_graph.json")) as f:
    DATA = json.load(f)

ALL_IDS = [k for k in DATA if k != "_meta"]
N_TOTAL = len(ALL_IDS)
print(f"  {N_TOTAL} nodes loaded")

# ---------------------------------------------------------------------------
# Identify top multi-parent nodes by descendant count
# ---------------------------------------------------------------------------
multi_parent_nodes = sorted(
    [(k, DATA[k]) for k in ALL_IDS if len(DATA[k]["parents"]) > 1],
    key=lambda x: x[1]["descendantCount"],
    reverse=True,
)
TOP_POLY = multi_parent_nodes[:10]
POLY_COLOR_MAP = {nid: i for i, (nid, _) in enumerate(TOP_POLY)}

print(f"  {len(multi_parent_nodes)} multi-parent nodes; top {len(TOP_POLY)} colored:")
for nid, nd in TOP_POLY:
    print(f"    {nd['title'][:55]}  desc={nd['descendantCount']} par={len(nd['parents'])}")


# ===================================================================
# SET 1: Tree Minimap (fully-expanded DFS)
# ===================================================================

def build_tree_rows():
    """DFS of the fully-expanded tree. Returns list of (depth, poly_color_idx | None)."""
    sys.setrecursionlimit(300_000)
    rows = []

    def dfs(node_id, depth, active_color):
        color = POLY_COLOR_MAP.get(node_id, active_color)
        rows.append((depth, color))
        node = DATA.get(node_id)
        if node:
            for cid in node.get("children", []):
                dfs(cid, depth + 1, color)

    dfs("root", 0, None)
    return rows


print("\nBuilding tree rows (full DFS)...")
tree_rows = build_tree_rows()
TOTAL_ROWS = len(tree_rows)
max_depth = max(d for d, _ in tree_rows)
print(f"  {TOTAL_ROWS} rows, max depth {max_depth}")


def make_strip_data(tree_rows, img_h):
    """For each pixel row, collect depth histogram and color histogram."""
    rows_per_px = TOTAL_ROWS / img_h
    bands = []
    for py in range(img_h):
        lo = int(py * rows_per_px)
        hi = min(int((py + 1) * rows_per_px), TOTAL_ROWS)
        band = tree_rows[lo:hi]
        if not band:
            bands.append((Counter(), Counter(), 0))
            continue
        depth_hist = Counter(d for d, _ in band)
        color_hist = Counter(c for _, c in band)
        bands.append((depth_hist, color_hist, len(band)))
    return bands


bands = make_strip_data(tree_rows, STRIP_H)

# ---------------------------------------------------------------------------
# tree_strip.png  (polyhierarchy colored)
# ---------------------------------------------------------------------------
print("Generating tree_strip.png...")
img = Image.new("RGB", (STRIP_W, STRIP_H), BG)
draw = ImageDraw.Draw(img)

for py, (depth_hist, color_hist, count) in enumerate(bands):
    if count == 0:
        continue

    dmin = min(depth_hist.keys())
    dmax = max(depth_hist.keys())
    x_left = 2 + int(dmin / max_depth * (STRIP_W - 5))
    x_right = 2 + int(dmax / max_depth * (STRIP_W - 5))
    x_left = max(0, min(x_left, STRIP_W - 1))
    x_right = max(x_left + 1, min(x_right, STRIP_W - 1))

    # Pick dominant poly color (ignoring None)
    poly_colors = {k: v for k, v in color_hist.items() if k is not None}
    if poly_colors:
        dom_idx = max(poly_colors, key=poly_colors.get)
        poly_frac = sum(poly_colors.values()) / count
        base_rgb = POLY_HUES[dom_idx]
        brightness = 0.35 + 0.65 * poly_frac
    else:
        base_rgb = (130, 145, 170)   # neutral blue-gray
        brightness = 0.7

    color = tuple(min(255, int(c * brightness)) for c in base_rgb)
    draw.line([(x_left, py), (x_right, py)], fill=color)

img.save(os.path.join(OUTPUT_DIR, "tree_strip.png"))
print("  Saved tree_strip.png")

# ---------------------------------------------------------------------------
# tree_strip_plain.png  (single teal color, bar from dmin to dmax, brightness
# proportional to density of rows in band)
# ---------------------------------------------------------------------------
print("Generating tree_strip_plain.png...")
img2 = Image.new("RGB", (STRIP_W, STRIP_H), BG)
draw2 = ImageDraw.Draw(img2)

rows_per_px = TOTAL_ROWS / STRIP_H

for py, (depth_hist, _, count) in enumerate(bands):
    if count == 0:
        continue
    dmin = min(depth_hist.keys())
    dmax = max(depth_hist.keys())
    x_left = 2 + int(dmin / max_depth * (STRIP_W - 5))
    x_right = 2 + int(dmax / max_depth * (STRIP_W - 5))
    x_left = max(0, min(x_left, STRIP_W - 1))
    x_right = max(x_left + 1, min(x_right, STRIP_W - 1))
    # Brightness from density (ratio of filled rows to expected rows)
    density = count / rows_per_px
    brightness = 0.3 + 0.7 * min(1.0, density)
    teal = (0, int(200 * brightness), int(190 * brightness))
    draw2.line([(x_left, py), (x_right, py)], fill=teal)

img2.save(os.path.join(OUTPUT_DIR, "tree_strip_plain.png"))
print("  Saved tree_strip_plain.png")

del tree_rows, bands


# ===================================================================
# SET 2: DAG Minimap (69K nodes, no duplication)
# ===================================================================

print("\nPreparing DAG layout...")

node_ids = list(ALL_IDS)
id_to_idx = {k: i for i, k in enumerate(node_ids)}
N = len(node_ids)

depths_arr = np.array([DATA[k]["depth"] for k in node_ids], dtype=np.float32)
heights_arr = np.array([DATA[k]["height"] for k in node_ids], dtype=np.float32)
desc_arr = np.array([DATA[k]["descendantCount"] for k in node_ids], dtype=np.float32)
pc_arr = np.array([len(DATA[k]["parents"]) for k in node_ids], dtype=np.int32)
max_depth_val = float(depths_arr.max())
max_height_val = float(heights_arr.max())


# ---------------------------------------------------------------------------
# DFS order for X positioning (keeps subtrees clustered)
# ---------------------------------------------------------------------------
def compute_dfs_order():
    """Assign each node an ordinal from a DFS of the DAG (first-parent tree).
    Nodes that share a parent subtree end up adjacent in X."""
    sys.setrecursionlimit(300_000)
    order = np.full(N, -1, dtype=np.int32)
    visited = set()
    counter = [0]

    def dfs(nid):
        if nid in visited:
            return
        visited.add(nid)
        idx = id_to_idx.get(nid)
        if idx is None:
            return
        order[idx] = counter[0]
        counter[0] += 1
        node = DATA.get(nid)
        if node:
            for cid in node.get("children", []):
                dfs(cid)

    dfs("root")
    # Handle any disconnected nodes
    for i in range(N):
        if order[i] < 0:
            order[i] = counter[0]
            counter[0] += 1
    return order


print("  Computing DFS order for X clustering...")
dfs_order = compute_dfs_order()


# ---------------------------------------------------------------------------
# Layout function: depth-based Y, DFS-order X
# Uses sqrt-scaled Y so dense middle depths don't crowd too much
# ---------------------------------------------------------------------------
def layout_depth_based():
    """Y from depth (root at top, deepest at bottom), X from DFS order."""
    usable = DAG_SZ - 2 * MARGIN
    x_pos = np.zeros(N, dtype=np.float32)
    y_pos = np.zeros(N, dtype=np.float32)

    # Y: depth -> pixel.  Use sqrt scaling to spread out sparse upper layers.
    max_d = max_depth_val
    for i in range(N):
        t = depths_arr[i] / max_d if max_d > 0 else 0
        y_pos[i] = MARGIN + math.sqrt(t) * usable

    # X: DFS order mapped to pixel range
    max_ord = dfs_order.max()
    if max_ord > 0:
        x_pos = MARGIN + (dfs_order.astype(np.float32) / max_ord) * usable
    else:
        x_pos[:] = MARGIN + usable / 2

    return x_pos, y_pos


# ---------------------------------------------------------------------------
# Layout function: height-based Y (leaves at bottom, root at top)
# ---------------------------------------------------------------------------
def layout_height_based():
    """Y from height (root at top, leaves at bottom), X from DFS order.
    Uses log-ish scaling so the 53K leaves don't all sit on one pixel row."""
    usable = DAG_SZ - 2 * MARGIN
    x_pos = np.zeros(N, dtype=np.float32)
    y_pos = np.zeros(N, dtype=np.float32)

    max_h = max_height_val

    # Assign vertical bands proportional to node count at each height level.
    # This distributes vertical space according to how many nodes are at each
    # height, preventing the 53K leaves from collapsing into one row.
    height_groups = defaultdict(list)
    for i in range(N):
        height_groups[int(heights_arr[i])].append(i)

    # Sort height levels descending (root-side first)
    h_levels = sorted(height_groups.keys(), reverse=True)
    level_counts = [len(height_groups[h]) for h in h_levels]
    total_nodes = sum(level_counts)

    # Give each level vertical space proportional to sqrt(count) for balance
    weights = [math.sqrt(c) for c in level_counts]
    total_weight = sum(weights)
    cum = 0.0
    for li, h in enumerate(h_levels):
        band_h = (weights[li] / total_weight) * usable
        y_center = MARGIN + cum + band_h / 2
        indices = height_groups[h]
        n_in_band = len(indices)
        # Spread within band vertically (jitter) if needed
        for j, idx in enumerate(indices):
            if n_in_band <= 1:
                y_pos[idx] = y_center
            else:
                # Spread across the band height
                y_pos[idx] = MARGIN + cum + (j / (n_in_band - 1)) * band_h
        cum += band_h

    # X from DFS order
    max_ord = float(dfs_order.max())
    if max_ord > 0:
        x_pos = MARGIN + (dfs_order.astype(np.float32) / max_ord) * usable
    else:
        x_pos[:] = MARGIN + usable / 2

    return x_pos, y_pos


# ---------------------------------------------------------------------------
# Identify multi-parent edges to draw (top 50 by descendant count)
# ---------------------------------------------------------------------------
TOP_POLY_EDGE_COUNT = 50
mp_sorted = multi_parent_nodes[:TOP_POLY_EDGE_COUNT]
poly_edges = []
for nid, nd in mp_sorted:
    if nid not in id_to_idx:
        continue
    ci = id_to_idx[nid]
    for pid in nd["parents"]:
        if pid in id_to_idx:
            poly_edges.append((id_to_idx[pid], ci))


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------
def clamp_px(x, y, sz=DAG_SZ):
    return max(0, min(int(x), sz - 1)), max(0, min(int(y), sz - 1))


def node_size(desc_count):
    if desc_count > 5000:
        return 3
    if desc_count > 500:
        return 2
    if desc_count > 50:
        return 1
    return 0


def parent_count_color(pc, dc):
    """Color by parent count: 1=neutral, 2+=warm."""
    if pc <= 1:
        g = 70 + min(50, int(math.log1p(dc) * 6))
        return (g, g, min(255, int(g * 1.3)))
    # 2+ parents: orange -> red -> magenta
    t = min(1.0, (pc - 1) / 5.0)
    r = int(200 + 55 * t)
    g = int(140 * (1 - t) + 50 * t)
    b = int(40 + 160 * t)
    return (min(255, r), g, b)


def draw_node(draw_ctx, img_obj, x, y, size, color, sz=DAG_SZ):
    px, py = clamp_px(x, y, sz)
    if size <= 0:
        img_obj.putpixel((px, py), color)
    else:
        draw_ctx.ellipse(
            [max(0, px - size), max(0, py - size),
             min(sz - 1, px + size), min(sz - 1, py + size)],
            fill=color,
        )


def draw_edges(draw_ctx, edges, x_pos, y_pos, color, width=1):
    for pi, ci in edges:
        x1, y1 = int(x_pos[pi]), int(y_pos[pi])
        x2, y2 = int(x_pos[ci]), int(y_pos[ci])
        draw_ctx.line([(x1, y1), (x2, y2)], fill=color, width=width)


def viridis(t):
    """Simple viridis approximation, t in [0,1]."""
    t = max(0.0, min(1.0, t))
    if t < 0.25:
        s = t / 0.25
        return (int(68 + (33 - 68) * s), int(1 + (145 - 1) * s), int(84 + (140 - 84) * s))
    if t < 0.5:
        s = (t - 0.25) / 0.25
        return (int(33 + (53 - 33) * s), int(145 + (183 - 145) * s), int(140 + (121 - 140) * s))
    if t < 0.75:
        s = (t - 0.5) / 0.25
        return (int(53 + (143 - 53) * s), int(183 + (215 - 183) * s), int(121 + (68 - 121) * s))
    s = (t - 0.75) / 0.25
    return (int(143 + (253 - 143) * s), int(215 + (231 - 215) * s), int(68 + (37 - 68) * s))


# ---------------------------------------------------------------------------
# dag_topology.png -- depth-based Y, DFS-order X, multi-parent edges
# ---------------------------------------------------------------------------
print("Computing depth-based layout...")
xd, yd = layout_depth_based()

print("Generating dag_topology.png...")
img_topo = Image.new("RGB", (DAG_SZ, DAG_SZ), BG)
draw_topo = ImageDraw.Draw(img_topo)

# Edges first (behind)
draw_edges(draw_topo, poly_edges, xd, yd, (255, 110, 55), width=1)

# Nodes
for i in range(N):
    sz = node_size(desc_arr[i])
    col = parent_count_color(pc_arr[i], desc_arr[i])
    draw_node(draw_topo, img_topo, xd[i], yd[i], sz, col)

img_topo.save(os.path.join(OUTPUT_DIR, "dag_topology.png"))
print("  Saved dag_topology.png")


# ---------------------------------------------------------------------------
# dag_topology_simple.png -- depth-based layout, viridis by depth, no edges
# ---------------------------------------------------------------------------
print("Generating dag_topology_simple.png...")
img_simp = Image.new("RGB", (DAG_SZ, DAG_SZ), BG)
draw_simp = ImageDraw.Draw(img_simp)

for i in range(N):
    t = depths_arr[i] / max_depth_val if max_depth_val > 0 else 0
    col = viridis(t)
    sz = node_size(desc_arr[i])
    draw_node(draw_simp, img_simp, xd[i], yd[i], sz, col)

img_simp.save(os.path.join(OUTPUT_DIR, "dag_topology_simple.png"))
print("  Saved dag_topology_simple.png")


# ---------------------------------------------------------------------------
# dag_depth_compact.png -- height-based Y, parent-count colors, poly edges
# ---------------------------------------------------------------------------
print("Computing height-based layout...")
xh, yh = layout_height_based()

print("Generating dag_depth_compact.png...")
img_comp = Image.new("RGB", (DAG_SZ, DAG_SZ), BG)
draw_comp = ImageDraw.Draw(img_comp)

# Edges
draw_edges(draw_comp, poly_edges, xh, yh, (110, 75, 200), width=1)

# Nodes
for i in range(N):
    sz = node_size(desc_arr[i])
    col = parent_count_color(pc_arr[i], desc_arr[i])
    draw_node(draw_comp, img_comp, xh[i], yh[i], sz, col)

img_comp.save(os.path.join(OUTPUT_DIR, "dag_depth_compact.png"))
print("  Saved dag_depth_compact.png")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("\nAll images generated in:", OUTPUT_DIR)
new_files = ["tree_strip.png", "tree_strip_plain.png",
             "dag_topology.png", "dag_topology_simple.png", "dag_depth_compact.png"]
for fname in sorted(os.listdir(OUTPUT_DIR)):
    fpath = os.path.join(OUTPUT_DIR, fname)
    if os.path.isfile(fpath):
        kb = os.path.getsize(fpath) / 1024
        marker = " <-- NEW" if fname in new_files else ""
        print(f"  {fname:30s}  {kb:7.1f} KB{marker}")
