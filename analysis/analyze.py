"""
Analyze the ICD-11 Foundation graph for polyhierarchy path counts.

Main question: For any node, how many distinct paths exist from that node to root?
This tells us how feasible it is to load/display all root paths in the tree view.

Usage:
    uv run analyze.py [--input foundation_graph.json]
"""

import argparse
import json
import sys
import time

import igraph as ig
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def load_graph(path: str) -> tuple[ig.Graph, dict[str, int]]:
    """Load adjacency list JSON into an igraph directed graph.
    Edges go from parent -> child (same as our web app convention)."""
    with open(path) as f:
        data: dict[str, dict] = json.load(f)

    # Build vertex list and index
    ids = list(data.keys())
    id_to_idx = {eid: i for i, eid in enumerate(ids)}

    g = ig.Graph(n=len(ids), directed=True)
    g.vs["name"] = ids
    g.vs["title"] = [data[eid]["title"] for eid in ids]

    # Edges: parent -> child
    edges = []
    for eid, info in data.items():
        child_idx = id_to_idx[eid]
        for pid in info["parents"]:
            if pid in id_to_idx:
                edges.append((id_to_idx[pid], child_idx))
    g.add_edges(edges)

    return g, id_to_idx


def count_paths_to_root(g: ig.Graph, root_idx: int) -> list[int]:
    """Count distinct paths from each node to root via DP on topological order.
    Since edges go parent->child, paths to root means going against edge direction.
    We do DP in reverse topological order (root first)."""

    n = g.vcount()
    path_counts = [0] * n

    # Topological sort (parent before child for parent->child edges)
    try:
        topo = g.topological_sorting(mode="out")
    except ig.InternalError:
        print("WARNING: Graph has cycles! Falling back to BFS.", file=sys.stderr)
        return [1] * n

    path_counts[root_idx] = 1

    # Process in topological order: for each node, propagate its count to children
    for v in topo:
        if path_counts[v] == 0:
            continue
        for child in g.successors(v):
            path_counts[child] += path_counts[v]

    return path_counts


def analyze_depths(g: ig.Graph, root_idx: int) -> list[int]:
    """BFS depth from root for each node."""
    depths = [-1] * g.vcount()
    depths[root_idx] = 0
    queue = [root_idx]
    while queue:
        next_queue = []
        for v in queue:
            for child in g.successors(v):
                if depths[child] == -1:
                    depths[child] = depths[v] + 1
                    next_queue.append(child)
        queue = next_queue
    return depths


def main():
    parser = argparse.ArgumentParser(description="Analyze ICD-11 Foundation graph")
    parser.add_argument("--input", default="foundation_graph.json", help="Input graph file")
    args = parser.parse_args()

    print("Loading graph...", file=sys.stderr)
    g, id_to_idx = load_graph(args.input)
    print(f"  Vertices: {g.vcount()}, Edges: {g.ecount()}", file=sys.stderr)

    root_idx = id_to_idx.get("root")
    if root_idx is None:
        print("ERROR: 'root' not found in graph", file=sys.stderr)
        sys.exit(1)

    # Basic graph stats
    in_degrees = g.indegree()
    out_degrees = g.outdegree()
    multi_parent = sum(1 for d in in_degrees if d > 1)
    leaves = sum(1 for d in out_degrees if d == 0)

    print(f"\n=== Graph Summary ===")
    print(f"  Vertices:           {g.vcount()}")
    print(f"  Edges:              {g.ecount()}")
    print(f"  Multi-parent nodes: {multi_parent} ({100*multi_parent/g.vcount():.1f}%)")
    print(f"  Leaf nodes:         {leaves} ({100*leaves/g.vcount():.1f}%)")
    print(f"  Max in-degree:      {max(in_degrees)}")
    print(f"  Max out-degree:     {max(out_degrees)}")

    # Check for cycles
    print(f"\n  Is DAG:             {g.is_dag()}")

    # Depth analysis
    print(f"\nComputing depths...", file=sys.stderr)
    depths = analyze_depths(g, root_idx)
    reachable_depths = [d for d in depths if d >= 0]
    print(f"\n=== Depth from Root ===")
    print(f"  Max depth:          {max(reachable_depths)}")
    print(f"  Mean depth:         {np.mean(reachable_depths):.1f}")
    print(f"  Median depth:       {np.median(reachable_depths):.1f}")
    unreachable = sum(1 for d in depths if d < 0)
    if unreachable:
        print(f"  Unreachable:        {unreachable}")

    # Path counts to root
    print(f"\nCounting paths to root (DP)...", file=sys.stderr)
    t0 = time.time()
    path_counts = count_paths_to_root(g, root_idx)
    elapsed = time.time() - t0
    print(f"  Done in {elapsed:.2f}s", file=sys.stderr)

    nonzero = [c for c in path_counts if c > 0]
    multi_path = [c for c in nonzero if c > 1]

    print(f"\n=== Paths to Root ===")
    print(f"  Nodes with paths:   {len(nonzero)}")
    print(f"  Nodes with >1 path: {len(multi_path)} ({100*len(multi_path)/len(nonzero):.1f}%)")
    print(f"  Max paths:          {max(nonzero)}")
    print(f"  Mean paths:         {np.mean(nonzero):.1f}")
    print(f"  Median paths:       {np.median(nonzero):.1f}")

    # Percentile breakdown
    pcts = [50, 75, 90, 95, 99, 99.5, 99.9, 100]
    print(f"\n  Percentiles:")
    for p in pcts:
        val = np.percentile(nonzero, p)
        print(f"    {p:>5}th: {val:>10.0f}")

    # Top 20 nodes by path count
    indexed = [(path_counts[i], g.vs[i]["name"], g.vs[i]["title"]) for i in range(g.vcount())]
    indexed.sort(reverse=True)
    print(f"\n  Top 20 nodes by path count:")
    for count, name, title in indexed[:20]:
        print(f"    {count:>10,}  {name:>12}  {title}")

    # Histogram: log-binned
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    # 1. Path count histogram (log-log)
    ax = axes[0, 0]
    nonzero_arr = np.array(nonzero)
    log_bins = np.logspace(0, np.log10(max(nonzero_arr)), 50)
    ax.hist(nonzero_arr, bins=log_bins, edgecolor="black", alpha=0.7)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Number of paths to root")
    ax.set_ylabel("Number of nodes")
    ax.set_title("Distribution of root-path counts (log-log)")

    # 2. In-degree (parent count) histogram
    ax = axes[0, 1]
    in_arr = np.array(in_degrees)
    ax.hist(in_arr[in_arr > 0], bins=range(1, max(in_degrees) + 2), edgecolor="black", alpha=0.7)
    ax.set_yscale("log")
    ax.set_xlabel("Number of parents (in-degree)")
    ax.set_ylabel("Number of nodes")
    ax.set_title("Parent count distribution")

    # 3. Depth histogram
    ax = axes[1, 0]
    ax.hist(reachable_depths, bins=range(max(reachable_depths) + 2), edgecolor="black", alpha=0.7)
    ax.set_xlabel("Depth from root")
    ax.set_ylabel("Number of nodes")
    ax.set_title("Depth distribution")

    # 4. Path count vs depth scatter (sampled)
    ax = axes[1, 1]
    sample_idx = np.random.choice(len(nonzero), size=min(5000, len(nonzero)), replace=False)
    depths_arr = np.array(reachable_depths)
    # Only plot nodes with path count > 0 and depth >= 0
    valid = [(depths[i], path_counts[i]) for i in range(g.vcount()) if path_counts[i] > 0 and depths[i] >= 0]
    if valid:
        vd, vp = zip(*valid)
        sample_size = min(5000, len(vd))
        idx = np.random.choice(len(vd), size=sample_size, replace=False)
        ax.scatter(np.array(vd)[idx], np.array(vp)[idx], alpha=0.3, s=3)
        ax.set_yscale("log")
        ax.set_xlabel("Depth from root")
        ax.set_ylabel("Paths to root")
        ax.set_title("Paths to root vs depth (sampled)")

    plt.tight_layout()
    plt.savefig("foundation_analysis.png", dpi=150)
    print(f"\nSaved histogram to foundation_analysis.png")

    # Additional analysis: how many nodes have "manageable" path counts?
    thresholds = [1, 2, 5, 10, 50, 100, 500, 1000, 10000]
    print(f"\n=== Feasibility: nodes with path count <= threshold ===")
    for t in thresholds:
        count = sum(1 for c in nonzero if c <= t)
        print(f"    <= {t:>6,}: {count:>6,} ({100*count/len(nonzero):.1f}%)")

    # Path counts per depth level
    print(f"\n=== Path counts by depth level ===")
    depth_paths: dict[int, list[int]] = {}
    for i in range(g.vcount()):
        d = depths[i]
        if d >= 0 and path_counts[i] > 0:
            depth_paths.setdefault(d, []).append(path_counts[i])
    print(f"  {'Depth':>5} {'Count':>7} {'Mean':>10} {'Median':>8} {'Max':>10} {'P99':>10}")
    for d in sorted(depth_paths.keys()):
        vals = depth_paths[d]
        print(
            f"  {d:>5} {len(vals):>7} {np.mean(vals):>10.1f} "
            f"{np.median(vals):>8.0f} {max(vals):>10,} {np.percentile(vals, 99):>10.0f}"
        )


if __name__ == "__main__":
    main()
