"""Generate 300x300 minimap overview images of the ICD-11 Foundation graph."""

import json
import math
import os
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.colors as mcolors
import numpy as np
import squarify
from PIL import Image, ImageDraw, ImageFont

# ── Config ──────────────────────────────────────────────────────────────────
OUT_DIR = Path(__file__).parent / "minimaps"
GRAPH_PATH = Path(__file__).parent / "foundation_graph.json"
SIZE = 300
BG_COLOR = "#1a1a2e"
BG_RGB = (26, 26, 46)
TITLE_COLOR = "white"
CMAP = plt.cm.plasma  # type: ignore[attr-defined]
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial.ttf"

OUT_DIR.mkdir(exist_ok=True)


# ── Load graph ──────────────────────────────────────────────────────────────
def load_graph() -> dict:
    with open(GRAPH_PATH) as f:
        data = json.load(f)
    data.pop("_meta", None)
    return data


def dark_fig(figsize: tuple[float, float] = (3, 3), dpi: int = 100) -> tuple[plt.Figure, plt.Axes]:
    """Create a matplotlib figure with dark background."""
    fig, ax = plt.subplots(figsize=figsize, dpi=dpi)
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor(BG_COLOR)
    return fig, ax


def save_fig(fig: plt.Figure, name: str, tight: bool = True) -> None:
    path = OUT_DIR / name
    if tight:
        fig.savefig(path, facecolor=fig.get_facecolor(), bbox_inches='tight',
                    pad_inches=0.05, dpi=100)
    else:
        fig.savefig(path, facecolor=fig.get_facecolor(), dpi=100)
    plt.close(fig)
    # Resize to exact target dimensions
    img = Image.open(path)
    target = (40, SIZE) if "strip" in name else (SIZE, SIZE)
    img = img.resize(target, Image.LANCZOS)
    img.save(path)
    print(f"  Saved {path} ({os.path.getsize(path)} bytes)")


# ── 1. Depth Histogram ─────────────────────────────────────────────────────
def depth_histogram(graph: dict) -> None:
    print("Generating depth_histogram.png...")
    depths = Counter(v["depth"] for v in graph.values())
    max_d = max(depths)
    levels = list(range(max_d + 1))
    counts = [depths.get(d, 0) for d in levels]

    fig, ax = dark_fig()
    colors = [CMAP(d / max_d) for d in levels]
    ax.barh(levels, counts, color=colors, edgecolor='none', height=0.8)
    ax.set_yticks(levels)
    ax.set_ylabel("Depth", color=TITLE_COLOR, fontsize=8)
    ax.set_xlabel("Node count", color=TITLE_COLOR, fontsize=8)
    ax.set_title("Depth Distribution", color=TITLE_COLOR, fontsize=10, pad=4)
    ax.tick_params(colors=TITLE_COLOR, labelsize=6)
    ax.invert_yaxis()
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.grid(axis='x', alpha=0.15, color='white')
    save_fig(fig, "depth_histogram.png")


# ── 2. Treemap ──────────────────────────────────────────────────────────────
def treemap(graph: dict) -> None:
    print("Generating treemap.png...")
    # Get top ~3 levels: children of root's grandchildren (depth 2-3)
    # Use depth-2 nodes (ICD Category, ICD Extension Code, ICF Category, ICF Qualifier)
    # and their children (depth 3)
    items: list[dict] = []
    for node in graph.values():
        if node["depth"] == 3 and node["descendantCount"] > 0:
            items.append({
                "title": node["title"],
                "size": node["descendantCount"],
            })
    # Sort by size descending, take top entries for readability
    items.sort(key=lambda x: x["size"], reverse=True)
    # Keep top 30 for labels, group rest as "Other"
    top_n = 30
    top_items = items[:top_n]
    other_size = sum(it["size"] for it in items[top_n:])
    if other_size > 0:
        top_items.append({"title": "Other", "size": other_size})

    sizes = [it["size"] for it in top_items]
    labels = [it["title"] for it in top_items]

    fig, ax = dark_fig()
    ax.set_xlim(0, SIZE)
    ax.set_ylim(0, SIZE)
    ax.set_axis_off()

    norm = mcolors.Normalize(vmin=0, vmax=len(sizes))
    colors = [CMAP(norm(i)) for i in range(len(sizes))]

    rects = squarify.squarify(squarify.normalize_sizes(sizes, SIZE, SIZE), 0, 0, SIZE, SIZE)

    for i, (r, label) in enumerate(zip(rects, labels)):
        rect = mpatches.FancyBboxPatch(
            (r["x"] + 0.5, r["y"] + 0.5), r["dx"] - 1, r["dy"] - 1,
            boxstyle="round,pad=0.5", facecolor=colors[i], edgecolor=BG_COLOR,
            linewidth=1.0, alpha=0.85
        )
        ax.add_patch(rect)
        # Only label if rectangle is large enough
        if r["dx"] > 25 and r["dy"] > 15:
            # Truncate label to fit
            max_chars = max(3, int(r["dx"] / 5))
            display = label[:max_chars] + ("..." if len(label) > max_chars else "")
            fontsize = min(7, max(3.5, r["dx"] / 12))
            ax.text(r["x"] + r["dx"] / 2, r["y"] + r["dy"] / 2, display,
                    ha='center', va='center', color='white', fontsize=fontsize,
                    fontweight='bold', wrap=True)

    ax.set_title("Treemap (by descendants)", color=TITLE_COLOR, fontsize=9, pad=4)
    save_fig(fig, "treemap.png")


# ── 3. Icicle Diagram ──────────────────────────────────────────────────────
def icicle(graph: dict) -> None:
    print("Generating icicle.png...")
    max_levels = 5  # show depth 0-4

    fig, ax = dark_fig()
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_axis_off()

    level_height = 1.0 / max_levels
    norm_depth = mcolors.Normalize(vmin=0, vmax=max_levels - 1)

    def draw_node(node_id: str, x_start: float, x_width: float, depth: int) -> None:
        if depth >= max_levels or x_width < 0.001:
            return
        node = graph[node_id]
        y = 1.0 - (depth + 1) * level_height
        color = CMAP(norm_depth(depth))
        rect = mpatches.Rectangle((x_start, y), x_width, level_height * 0.92,
                                   facecolor=color, edgecolor=BG_COLOR, linewidth=0.5,
                                   alpha=0.9)
        ax.add_patch(rect)
        # Label if wide enough
        if x_width > 0.08 and depth > 0:
            title = node["title"]
            max_chars = max(3, int(x_width * 60))
            display = title[:max_chars] + ("..." if len(title) > max_chars else "")
            fontsize = min(6, max(3, x_width * 30))
            ax.text(x_start + x_width / 2, y + level_height * 0.46, display,
                    ha='center', va='center', color='white', fontsize=fontsize,
                    fontweight='bold')

        # Recurse into children
        children = node.get("children", [])
        if not children or depth + 1 >= max_levels:
            return
        # Allocate width proportional to descendantCount
        total_desc = sum(max(graph[c]["descendantCount"], 1) for c in children if c in graph)
        if total_desc == 0:
            return
        cx = x_start
        for cid in children:
            if cid not in graph:
                continue
            child = graph[cid]
            cw = x_width * max(child["descendantCount"], 1) / total_desc
            draw_node(cid, cx, cw, depth + 1)
            cx += cw

    draw_node("root", 0, 1, 0)
    ax.set_title("Icicle (top 5 levels)", color=TITLE_COLOR, fontsize=9, pad=4)
    save_fig(fig, "icicle.png")


# ── 4. Minimap Strip ───────────────────────────────────────────────────────
def minimap_strip(graph: dict) -> None:
    print("Generating minimap_strip.png...")
    # DFS to compute depth of each row in a fully-expanded tree
    # (polyhierarchy means nodes with N parents appear N times)
    max_depth = max(v["depth"] for v in graph.values())
    row_depths: list[int] = []

    # Iterative DFS with stack to avoid recursion limit
    stack: list[str] = ["root"]
    visited_limit = 500_000  # cap to avoid memory issues
    count = 0
    while stack and count < visited_limit:
        nid = stack.pop()
        node = graph.get(nid)
        if node is None:
            continue
        row_depths.append(node["depth"])
        count += 1
        # Push children in reverse order so first child is processed first
        children = node.get("children", [])
        for cid in reversed(children):
            stack.append(cid)

    total_rows = len(row_depths)
    print(f"  DFS rows: {total_rows}")

    # Compress into 300 pixel rows
    strip_h = SIZE
    strip_w = 40
    img = Image.new("RGB", (strip_w, strip_h), BG_RGB)
    draw = ImageDraw.Draw(img)

    rows_per_pixel = total_rows / strip_h
    bar_max_width = strip_w - 4  # leave margin

    for py in range(strip_h):
        start_row = int(py * rows_per_pixel)
        end_row = int((py + 1) * rows_per_pixel)
        if start_row >= total_rows:
            break
        band = row_depths[start_row:end_row]
        if not band:
            continue
        min_d = min(band)
        max_d_band = max(band)
        avg_d = sum(band) / len(band)
        density = len(band)

        # Color by average depth
        t = avg_d / max_depth
        r, g, b, _ = CMAP(t)
        # Intensity by density (more rows compressed = brighter)
        intensity = min(1.0, density / (rows_per_pixel * 1.2)) * 0.7 + 0.3
        color = (int(r * 255 * intensity), int(g * 255 * intensity), int(b * 255 * intensity))

        # Bar from min_depth to max_depth
        x_start = int(2 + min_d / max_depth * (bar_max_width - 4))
        x_end = int(2 + max_d_band / max_depth * bar_max_width)
        x_end = max(x_end, x_start + 1)
        draw.line([(x_start, py), (x_end, py)], fill=color)

    # Add tiny title
    try:
        font = ImageFont.truetype(FONT_PATH, 8)
    except (OSError, IOError):
        font = ImageFont.load_default()
    # Draw title background
    draw.rectangle([(0, 0), (strip_w, 11)], fill=BG_RGB)
    draw.text((2, 1), "Strip", fill="white", font=font)

    path = OUT_DIR / "minimap_strip.png"
    img.save(path)
    print(f"  Saved {path} ({os.path.getsize(path)} bytes)")


# ── 5. Sunburst ─────────────────────────────────────────────────────────────
def sunburst(graph: dict) -> None:
    print("Generating sunburst.png...")
    max_levels = 5

    fig, ax = dark_fig()
    ax.set_xlim(-1.2, 1.2)
    ax.set_ylim(-1.2, 1.2)
    ax.set_aspect('equal')
    ax.set_axis_off()

    ring_width = 1.0 / max_levels

    def draw_arc(node_id: str, theta_start: float, theta_width: float, depth: int) -> None:
        if depth >= max_levels or theta_width < 0.002:
            return
        node = graph[node_id]
        color = CMAP(depth / (max_levels - 1))

        r_inner = depth * ring_width
        r_outer = (depth + 1) * ring_width

        if depth == 0:
            # Center circle
            circle = plt.Circle((0, 0), r_outer, facecolor=color, edgecolor=BG_COLOR,
                                linewidth=0.3, alpha=0.9)
            ax.add_patch(circle)
        else:
            # Wedge
            theta1_deg = math.degrees(theta_start)
            theta2_deg = math.degrees(theta_start + theta_width)
            wedge = mpatches.Wedge((0, 0), r_outer, theta1_deg, theta2_deg,
                                    width=ring_width, facecolor=color,
                                    edgecolor=BG_COLOR, linewidth=0.3, alpha=0.9)
            ax.add_patch(wedge)

        # Recurse into children
        children = node.get("children", [])
        if not children or depth + 1 >= max_levels:
            return
        total_desc = sum(max(graph[c]["descendantCount"], 1) for c in children if c in graph)
        if total_desc == 0:
            return
        ct = theta_start
        for cid in children:
            if cid not in graph:
                continue
            child = graph[cid]
            cw = theta_width * max(child["descendantCount"], 1) / total_desc
            draw_arc(cid, ct, cw, depth + 1)
            ct += cw

    draw_arc("root", 0, 2 * math.pi, 0)
    ax.set_title("Sunburst (top 5 levels)", color=TITLE_COLOR, fontsize=9, pad=4)
    save_fig(fig, "sunburst.png")


# ── 6. Hilbert Curve ───────────────────────────────────────────────────────
def hilbert_d2xy(n: int, d: int) -> tuple[int, int]:
    """Convert Hilbert curve index d to (x, y) in an n x n grid."""
    x = y = 0
    s = 1
    while s < n:
        rx = 1 if (d & 2) else 0
        ry = 1 if ((d & 1) ^ rx) else 0
        # Rotate
        if ry == 0:
            if rx == 1:
                x = s - 1 - x
                y = s - 1 - y
            x, y = y, x
        x += s * rx
        y += s * ry
        d >>= 2
        s <<= 1
    return x, y


def hilbert_curve(graph: dict) -> None:
    print("Generating hilbert_curve.png...")
    max_depth = max(v["depth"] for v in graph.values())

    # DFS traversal to get node ordering
    node_depths: list[int] = []
    stack: list[str] = ["root"]
    seen: set[str] = set()
    while stack:
        nid = stack.pop()
        if nid in seen:
            continue
        seen.add(nid)
        node = graph.get(nid)
        if node is None:
            continue
        node_depths.append(node["depth"])
        for cid in reversed(node.get("children", [])):
            if cid not in seen:
                stack.append(cid)

    total = len(node_depths)
    print(f"  DFS nodes: {total}")

    # Find smallest power of 2 >= sqrt(total) for Hilbert grid
    order = 1
    while (1 << order) ** 2 < total:
        order += 1
    grid_n = 1 << order
    print(f"  Hilbert grid: {grid_n}x{grid_n} (order {order})")

    # Create image
    img = Image.new("RGB", (grid_n, grid_n), BG_RGB)
    pixels = img.load()

    for i, depth in enumerate(node_depths):
        x, y = hilbert_d2xy(grid_n, i)
        t = depth / max_depth
        r, g, b, _ = CMAP(t)
        pixels[x, y] = (int(r * 255), int(g * 255), int(b * 255))

    # Resize to 300x300
    img = img.resize((SIZE, SIZE), Image.NEAREST)

    # Add title overlay
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT_PATH, 11)
    except (OSError, IOError):
        font = ImageFont.load_default()
    draw.rectangle([(0, 0), (SIZE, 14)], fill=BG_RGB)
    draw.text((4, 1), "Hilbert Curve (DFS, color=depth)", fill="white", font=font)

    path = OUT_DIR / "hilbert_curve.png"
    img.save(path)
    print(f"  Saved {path} ({os.path.getsize(path)} bytes)")


# ── 7. Edge Density Plot ───────────────────────────────────────────────────
def edge_density(graph: dict) -> None:
    print("Generating edge_density.png...")
    max_depth = max(v["depth"] for v in graph.values())

    # Assign x positions within each depth layer
    # Group nodes by depth
    by_depth: dict[int, list[str]] = {}
    for nid, node in graph.items():
        d = node["depth"]
        by_depth.setdefault(d, []).append(nid)

    # Sort within each layer for consistency, assign x position
    node_pos: dict[str, tuple[float, float]] = {}
    for d in sorted(by_depth):
        layer = by_depth[d]
        # Sort by parent position for visual coherence
        layer.sort(key=lambda nid: graph[nid]["title"])
        n = len(layer)
        for i, nid in enumerate(layer):
            x = (i + 0.5) / n  # 0 to 1
            y = d / max_depth   # 0 to 1
            node_pos[nid] = (x, y)

    # Render edges as semi-transparent lines onto a numpy array
    img_w = img_h = SIZE
    # Use accumulation buffer for density
    accum = np.zeros((img_h, img_w), dtype=np.float64)

    # Collect all edges
    edges: list[tuple[str, str]] = []
    for nid, node in graph.items():
        for cid in node.get("children", []):
            if cid in node_pos:
                edges.append((nid, cid))

    print(f"  Edges: {len(edges)}")

    # Draw edges using line rasterization with subsampling
    # Reserve top 15px for title, bottom 5px for margin
    y_offset = 15
    y_range = img_h - y_offset - 5
    x_margin = 5
    x_range = img_w - 2 * x_margin

    for parent_id, child_id in edges:
        px, py = node_pos[parent_id]
        cx, cy = node_pos[child_id]

        x0 = int(x_margin + px * x_range)
        y0 = int(y_offset + py * y_range)
        x1 = int(x_margin + cx * x_range)
        y1 = int(y_offset + cy * y_range)

        # Bresenham-ish: step along y (since edges go down)
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for s in range(steps + 1):
            t = s / steps
            xi = int(x0 + t * (x1 - x0))
            yi = int(y0 + t * (y1 - y0))
            if 0 <= xi < img_w and 0 <= yi < img_h:
                accum[yi, xi] += 1.0

    # Normalize and apply colormap
    # Use log scale for better visibility
    accum_log = np.log1p(accum)
    max_val = accum_log.max()
    if max_val > 0:
        accum_norm = accum_log / max_val
    else:
        accum_norm = accum_log

    # Apply colormap (use 'inferno' for a nice glow effect on dark bg)
    cmap_edge = plt.cm.inferno  # type: ignore[attr-defined]
    colored = cmap_edge(accum_norm)  # (H, W, 4) RGBA
    # Blend with background
    bg = np.array(BG_RGB, dtype=np.float64) / 255.0
    alpha = accum_norm[..., np.newaxis]
    rgb = colored[:, :, :3] * alpha + bg[np.newaxis, np.newaxis, :] * (1 - alpha)
    rgb = (rgb * 255).astype(np.uint8)

    img = Image.fromarray(rgb, "RGB")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT_PATH, 11)
    except (OSError, IOError):
        font = ImageFont.load_default()
    draw.rectangle([(0, 0), (SIZE, 14)], fill=BG_RGB)
    draw.text((4, 1), "Edge Density", fill="white", font=font)

    # Add depth labels on left side
    try:
        small_font = ImageFont.truetype(FONT_PATH, 8)
    except (OSError, IOError):
        small_font = ImageFont.load_default()
    for d in range(0, max_depth + 1, 2):
        yp = int(y_offset + (d / max_depth) * y_range)
        draw.text((1, yp - 3), str(d), fill=(100, 100, 120), font=small_font)

    path = OUT_DIR / "edge_density.png"
    img.save(path)
    print(f"  Saved {path} ({os.path.getsize(path)} bytes)")


# ── Main ────────────────────────────────────────────────────────────────────
def main() -> None:
    print("Loading graph...")
    graph = load_graph()
    print(f"  {len(graph)} nodes loaded")

    depth_histogram(graph)
    treemap(graph)
    icicle(graph)
    minimap_strip(graph)
    sunburst(graph)
    hilbert_curve(graph)
    edge_density(graph)

    print("\nAll minimaps generated!")


if __name__ == "__main__":
    main()
