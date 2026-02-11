"""
Crawl the entire ICD-11 Foundation hierarchy from a local Docker API
and save the graph as an adjacency list (JSON).

Usage:
    uv run crawl.py [--out foundation_graph.json] [--concurrency 50]
"""

import argparse
import asyncio
import json
import sys
import time

import aiohttp

API_BASE = "http://localhost:80"
HEADERS = {"API-Version": "v2", "Accept-Language": "en", "Accept": "application/json"}
URI_PREFIX = "http://id.who.int/icd/entity"


def extract_id(uri: str) -> str:
    """Extract numeric ID from a Foundation URI, or 'root' for the root."""
    if uri.rstrip("/") == URI_PREFIX:
        return "root"
    return uri.rsplit("/", 1)[-1]


async def fetch_entity(
    session: aiohttp.ClientSession, entity_id: str, semaphore: asyncio.Semaphore
) -> dict | None:
    path = "/icd/entity" if entity_id == "root" else f"/icd/entity/{entity_id}"
    url = f"{API_BASE}{path}"
    async with semaphore:
        try:
            async with session.get(url, headers=HEADERS) as resp:
                if resp.status != 200:
                    print(f"  WARN: {url} -> {resp.status}", file=sys.stderr)
                    return None
                return await resp.json()
        except Exception as e:
            print(f"  ERROR: {url} -> {e}", file=sys.stderr)
            return None


async def crawl(concurrency: int = 50) -> dict:
    """BFS crawl of the entire Foundation. Returns {id: {title, parents, children}}."""
    graph: dict[str, dict] = {}
    queue: asyncio.Queue[str] = asyncio.Queue()
    seen: set[str] = set()
    semaphore = asyncio.Semaphore(concurrency)

    queue.put_nowait("root")
    seen.add("root")

    fetched = 0
    t0 = time.time()

    async with aiohttp.ClientSession() as session:
        while not queue.empty():
            # Drain the queue into a batch
            batch: list[str] = []
            while not queue.empty():
                batch.append(queue.get_nowait())

            # Fetch batch concurrently
            tasks = [fetch_entity(session, eid, semaphore) for eid in batch]
            results = await asyncio.gather(*tasks)

            for entity_id, data in zip(batch, results):
                fetched += 1
                if fetched % 1000 == 0:
                    elapsed = time.time() - t0
                    print(
                        f"  {fetched} entities fetched ({elapsed:.1f}s, "
                        f"{fetched/elapsed:.0f}/s), queue: {queue.qsize()}",
                        file=sys.stderr,
                    )

                if data is None:
                    graph[entity_id] = {"title": "?", "parents": [], "children": []}
                    continue

                title = data.get("title", {}).get("@value", "?")
                parent_uris = data.get("parent", [])
                child_uris = data.get("child", [])

                parent_ids = [extract_id(u) for u in parent_uris]
                child_ids = [extract_id(u) for u in child_uris]

                graph[entity_id] = {
                    "title": title,
                    "parents": parent_ids,
                    "children": child_ids,
                }

                # Enqueue unseen children
                for cid in child_ids:
                    if cid not in seen:
                        seen.add(cid)
                        queue.put_nowait(cid)

    elapsed = time.time() - t0
    print(
        f"\nDone: {fetched} entities in {elapsed:.1f}s ({fetched/elapsed:.0f}/s)",
        file=sys.stderr,
    )
    return graph


def compute_descendant_stats(graph: dict) -> None:
    """Add descendantCount and maxDepth to each node using memoized DFS.

    descendantCount = number of unique descendants (no double-counting in DAG).
    maxDepth = longest path from this node to any leaf.
    """
    desc_cache: dict[str, set[str]] = {}
    depth_cache: dict[str, int] = {}

    def get_descendants(node_id: str) -> set[str]:
        if node_id in desc_cache:
            return desc_cache[node_id]
        # Mark in-progress to handle cycles gracefully
        desc_cache[node_id] = set()
        children = graph.get(node_id, {}).get("children", [])
        result: set[str] = set()
        for child_id in children:
            if child_id in graph:
                result.add(child_id)
                result |= get_descendants(child_id)
        desc_cache[node_id] = result
        return result

    def get_max_depth(node_id: str) -> int:
        if node_id in depth_cache:
            return depth_cache[node_id]
        depth_cache[node_id] = 0  # cycle guard
        children = graph.get(node_id, {}).get("children", [])
        if not children:
            depth_cache[node_id] = 0
            return 0
        max_child = max(
            (get_max_depth(c) for c in children if c in graph),
            default=-1,
        )
        depth_cache[node_id] = max_child + 1
        return max_child + 1

    # Increase recursion limit for deep hierarchies
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(max(old_limit, len(graph) + 1000))

    for node_id in graph:
        graph[node_id]["descendantCount"] = len(get_descendants(node_id))
        graph[node_id]["maxDepth"] = get_max_depth(node_id)

    sys.setrecursionlimit(old_limit)
    print(f"Computed descendant stats for {len(graph)} nodes", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Crawl ICD-11 Foundation hierarchy")
    parser.add_argument("--out", default="foundation_graph.json", help="Output file")
    parser.add_argument("--concurrency", type=int, default=50, help="Max concurrent requests")
    parser.add_argument(
        "--stats-only",
        action="store_true",
        help="Skip crawling; just add descendant stats to existing JSON",
    )
    args = parser.parse_args()

    if args.stats_only:
        with open(args.out) as f:
            graph = json.load(f)
        print(f"Loaded {len(graph)} entities from {args.out}", file=sys.stderr)
    else:
        graph = asyncio.run(crawl(args.concurrency))

    compute_descendant_stats(graph)

    with open(args.out, "w") as f:
        json.dump(graph, f)
    print(f"Saved {len(graph)} entities to {args.out}", file=sys.stderr)

    # Quick summary
    multi_parent = sum(1 for v in graph.values() if len(v["parents"]) > 1)
    leaf = sum(1 for v in graph.values() if len(v["children"]) == 0)
    max_children = max(len(v["children"]) for v in graph.values())
    max_parents = max(len(v["parents"]) for v in graph.values())
    max_desc = max(v["descendantCount"] for v in graph.values())
    max_depth = max(v["maxDepth"] for v in graph.values())
    print(f"\nSummary:")
    print(f"  Total entities:       {len(graph)}")
    print(f"  Multi-parent nodes:   {multi_parent}")
    print(f"  Leaf nodes:           {leaf}")
    print(f"  Max children:         {max_children}")
    print(f"  Max parents:          {max_parents}")
    print(f"  Max descendants:      {max_desc}")
    print(f"  Max depth:            {max_depth}")


if __name__ == "__main__":
    main()
