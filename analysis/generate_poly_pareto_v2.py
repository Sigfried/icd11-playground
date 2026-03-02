"""
Polyhierarchy Pareto distribution chart.

X axis = subtree size bins (log-scale, ascending)
Y axis (left) = number of nodes in each bin (log scale)
Bars stacked by parent group: 1 parent, 2 parents, 3 parents, 4-9 parents
Cumulative lines = % of total tree rows (overall + per group)

Total tree rows for a node = parentCount * (descendantCount + 1)
  (each parent gives one full subtree occurrence in the expanded tree)

Generates poly_pareto_all.png to analysis/minimaps/.
"""

import json
import math
import os

import matplotlib.pyplot as plt
import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BG_COLOR = "#1a1a2e"
TEXT_COLOR = "#e0e0e8"
GRID_COLOR = "#2a2a4a"
ACCENT_COLOR = "#8888aa"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "minimaps")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Parent-count groups: label, color, line style, group filter
GROUPS = [
    ("1 parent",   "#556680", "-",  lambda pc: pc == 1),
    ("2 parents",  "#ffffcc", "-",  lambda pc: pc == 2),
    ("3 parents",  "#fed976", "-",  lambda pc: pc == 3),
    ("4-9 parents","#e31a1c", "-",  lambda pc: 4 <= pc <= 9),
]

# Cumulative line colors (matching but brighter/more saturated for visibility)
GROUP_LINE_COLORS = ["#8899bb", "#ffff66", "#ffcc33", "#ff4444"]

# Subtree size bins (inclusive ranges), ascending
BINS = [
    (1,     5,      "1-5"),
    (6,     50,     "6-50"),
    (51,    200,    "51-200"),
    (201,   500,    "201-500"),
    (501,   1000,   "501-1K"),
    (1001,  2000,   "1K-2K"),
    (2001,  5000,   "2K-5K"),
    (5001,  10000,  "5K-10K"),
    (10001, 20000,  "10K-20K"),
]


def subtree_size(node: dict) -> int:
    return node["descendantCount"] + 1


def tree_rows(node: dict) -> int:
    """Total tree rows this node contributes (all parent occurrences)."""
    return max(len(node["parents"]), 1) * subtree_size(node)


def bin_index(size: int) -> int:
    for i, (lo, hi, _) in enumerate(BINS):
        if lo <= size <= hi:
            return i
    return len(BINS) - 1


def group_index(pc: int) -> int:
    for gi, (_, _, _, filt) in enumerate(GROUPS):
        if filt(pc):
            return gi
    return len(GROUPS) - 1


# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------
print("Loading graph data...")
with open(os.path.join(os.path.dirname(__file__), "foundation_graph.json")) as f:
    DATA = json.load(f)

all_ids = [k for k in DATA if k != "_meta"]
print(f"  {len(all_ids)} nodes loaded")

# ---------------------------------------------------------------------------
# Bin nodes and compute tree rows per bin per group
# ---------------------------------------------------------------------------
n_bins = len(BINS)
n_groups = len(GROUPS)
bin_labels = [label for _, _, label in BINS]

# bin_counts[group][bin] = node count
# bin_rows[group][bin] = total tree rows
bin_counts = [[0] * n_bins for _ in range(n_groups)]
bin_rows = [[0] * n_bins for _ in range(n_groups)]

total_tree_rows = 0

for k in all_ids:
    v = DATA[k]
    pc = max(len(v["parents"]), 1)  # root has 0 parents, treat as 1
    gi = group_index(pc)
    bi = bin_index(subtree_size(v))
    rows = tree_rows(v)
    bin_counts[gi][bi] += 1
    bin_rows[gi][bi] += rows
    total_tree_rows += rows

print(f"  Total tree rows: {total_tree_rows:,}")

# ---------------------------------------------------------------------------
# Matplotlib dark theme
# ---------------------------------------------------------------------------
plt.rcParams.update({
    "figure.facecolor": BG_COLOR,
    "axes.facecolor": BG_COLOR,
    "axes.edgecolor": ACCENT_COLOR,
    "axes.labelcolor": TEXT_COLOR,
    "text.color": TEXT_COLOR,
    "xtick.color": TEXT_COLOR,
    "ytick.color": TEXT_COLOR,
    "grid.color": GRID_COLOR,
    "grid.alpha": 0.6,
    "legend.facecolor": "#222244",
    "legend.edgecolor": ACCENT_COLOR,
    "legend.labelcolor": TEXT_COLOR,
    "font.size": 9,
})

# ---------------------------------------------------------------------------
# Build chart
# ---------------------------------------------------------------------------
print("\nGenerating poly_pareto_all.png...")

fig, ax1 = plt.subplots(figsize=(11, 5.5))
x = np.arange(n_bins)
bar_width = 0.7
bottoms = np.zeros(n_bins)

# Segments for labeling: (bin_idx, bottom, top, count, group_idx)
segments: list[tuple[int, float, float, int, int]] = []

# Stack bars: highest parent group on bottom (reversed)
for gi in reversed(range(n_groups)):
    heights = np.array(bin_counts[gi], dtype=float)
    label, color, _, _ = GROUPS[gi]
    ax1.bar(
        x, heights, bar_width,
        bottom=bottoms,
        color=color, label=label,
        edgecolor="none", alpha=0.9,
    )
    for i in range(n_bins):
        if heights[i] > 0:
            segments.append((i, bottoms[i], bottoms[i] + heights[i], int(heights[i]), gi))
    bottoms += heights

# Label each segment with its count
for bi, bot, top, cnt, gi in segments:
    if cnt == 0:
        continue
    effective_bot = max(bot, 0.8)
    y_mid = (effective_bot * top) ** 0.5 if effective_bot > 0 and top > 0 else top
    # Dark text on light backgrounds (groups 0=gray, 1=pale yellow, 2=gold)
    text_color = "#1a1a2e" if gi <= 2 else TEXT_COLOR
    ax1.text(
        bi, y_mid, str(cnt),
        ha="center", va="center", fontsize=7, fontweight="bold",
        color=text_color, alpha=0.9, zorder=10,
    )

ax1.set_xlabel("Subtree size (descendantCount + 1)", fontsize=10)
ax1.set_ylabel("Number of nodes", fontsize=10, color="#e8a050")
ax1.set_yscale("log")
ax1.set_xticks(x)
ax1.set_xticklabels(bin_labels, fontsize=8, rotation=30, ha="right")
ax1.grid(axis="y", linewidth=0.5)
ax1.tick_params(axis="y", colors="#e8a050")
max_bar = max(bottoms) if max(bottoms) > 0 else 1
ax1.set_ylim(0.8, max_bar * 3)

# Total count labels on top of each stack
for i in range(n_bins):
    total_in_bin = int(bottoms[i])
    if total_in_bin > 0:
        ax1.text(
            i, bottoms[i] * 1.15, str(total_in_bin),
            ha="center", va="bottom", fontsize=8, color=TEXT_COLOR, alpha=0.85,
        )

# --- Cumulative lines on secondary axis: % of total tree rows ---
ax2 = ax1.twinx()

# Overall cumulative
overall_bin_rows = [sum(bin_rows[gi][bi] for gi in range(n_groups)) for bi in range(n_bins)]
cum_overall = np.cumsum(overall_bin_rows) / total_tree_rows * 100
ax2.plot(x, cum_overall, color="#60d0ff", linewidth=2.5, marker="o",
         markersize=5, markerfacecolor="#60d0ff", markeredgecolor="#1a1a2e",
         label="All (cumulative)", zorder=6, linestyle="-")

# Per-group cumulative lines
for gi in range(n_groups):
    group_rows = np.array(bin_rows[gi], dtype=float)
    cum_group = np.cumsum(group_rows) / total_tree_rows * 100
    label, _, ls, _ = GROUPS[gi]
    ax2.plot(x, cum_group, color=GROUP_LINE_COLORS[gi], linewidth=1.5,
             marker=".", markersize=3, label=f"{label} (cum.)",
             zorder=5, linestyle=ls, alpha=0.8)

ax2.set_ylabel("Cumulative % of total tree rows", fontsize=10, color="#60d0ff")
ax2.set_ylim(0, 105)
ax2.tick_params(axis="y", colors="#60d0ff")

# Threshold annotations on overall line
for thresh in (50, 80):
    idx = next((i for i, f in enumerate(cum_overall) if f >= thresh), None)
    if idx is not None:
        ax2.axhline(thresh, color="#60d0ff", linewidth=0.5, alpha=0.3, linestyle="--")
        ax2.annotate(
            f"{thresh}%",
            xy=(idx, thresh), xytext=(idx + 0.4, thresh + 4),
            fontsize=8, color="#60d0ff", alpha=0.8,
            arrowprops=dict(arrowstyle="->", color="#60d0ff", alpha=0.5),
        )

# Legend — combine both axes
handles1, labels1 = ax1.get_legend_handles_labels()
handles2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(
    handles1 + handles2, labels1 + labels2,
    loc="upper right", fontsize=7, framealpha=0.85, ncol=2,
)

ax1.set_title(
    "ICD-11 Foundation: All Nodes by Subtree Size\n"
    "(bars = node count, lines = cumulative % of total tree rows)",
    fontsize=11, fontweight="bold", pad=12,
)
fig.tight_layout()
fig.savefig(os.path.join(OUTPUT_DIR, "poly_pareto_all.png"), dpi=100, facecolor=BG_COLOR)
plt.close(fig)
print("  Saved poly_pareto_all.png")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print(f"\nAll charts saved to {OUTPUT_DIR}/")
for fname in sorted(os.listdir(OUTPUT_DIR)):
    fpath = os.path.join(OUTPUT_DIR, fname)
    if os.path.isfile(fpath):
        kb = os.path.getsize(fpath) / 1024
        print(f"  {fname:35s}  {kb:7.1f} KB")
