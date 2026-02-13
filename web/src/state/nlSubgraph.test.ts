import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import type { ConceptNode } from '../api/foundationData';
import { buildNlSubgraph, removeNodeWithPruning } from './nlSubgraph';

/** Helper to create a ConceptNode with minimal attributes */
function node(id: string, overrides: Partial<ConceptNode> = {}): ConceptNode {
  return {
    id,
    title: id,
    parentCount: 0,
    childCount: 0,
    childOrder: [],
    descendantCount: 0,
    height: 0,
    depth: 0,
    maxDepth: 0,
    ...overrides,
  };
}

/** Build a test graph: A → B → C, A → D, B → E */
function makeTestGraph(): Graph<ConceptNode> {
  const g = new Graph<ConceptNode>();
  g.addNode('A', node('A'));
  g.addNode('B', node('B'));
  g.addNode('C', node('C'));
  g.addNode('D', node('D'));
  g.addNode('E', node('E'));
  g.addNode('F', node('F')); // disconnected from A in subgraph
  g.addEdge('A', 'B');
  g.addEdge('B', 'C');
  g.addEdge('A', 'D');
  g.addEdge('B', 'E');
  g.addEdge('E', 'F');
  return g;
}

describe('buildNlSubgraph', () => {
  it('builds subgraph with only specified nodes and edges between them', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B', 'D']);

    const sub = buildNlSubgraph(main, displayed);

    expect(sub.order).toBe(3); // A, B, D
    expect(sub.hasNode('A')).toBe(true);
    expect(sub.hasNode('B')).toBe(true);
    expect(sub.hasNode('D')).toBe(true);
    expect(sub.hasNode('C')).toBe(false);

    // Only edges between displayed nodes
    expect(sub.hasEdge('A', 'B')).toBe(true);
    expect(sub.hasEdge('A', 'D')).toBe(true);
    expect(sub.size).toBe(2);
  });

  it('filters out edges to nodes not in displayedNodeIds', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'C']); // B is missing, so A→C edge shouldn't exist

    const sub = buildNlSubgraph(main, displayed);

    expect(sub.order).toBe(2);
    expect(sub.size).toBe(0); // no direct A→C edge in main graph
  });

  it('adds cluster pseudo-nodes with parent edge', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B', 'cluster:A']);

    const sub = buildNlSubgraph(main, displayed);

    expect(sub.order).toBe(3); // A, B, cluster:A
    expect(sub.hasNode('cluster:A')).toBe(true);
    expect(sub.hasEdge('A', 'cluster:A')).toBe(true);
    expect(sub.hasEdge('A', 'B')).toBe(true);
  });

  it('skips cluster nodes whose parent is not in the subgraph', () => {
    const main = makeTestGraph();
    const displayed = new Set(['B', 'cluster:X']); // X not in graph

    const sub = buildNlSubgraph(main, displayed);

    expect(sub.order).toBe(1); // only B
    expect(sub.hasNode('cluster:X')).toBe(false);
  });
});

describe('removeNodeWithPruning', () => {
  it('removes a leaf node without pruning others', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B', 'D']);
    const sub = buildNlSubgraph(main, displayed);

    const result = removeNodeWithPruning(sub, 'D', 'A');

    expect(result.displayedNodeIds).toEqual(new Set(['A', 'B']));
    expect(result.prunedCount).toBe(0);
  });

  it('prunes disconnected nodes when bridge is removed', () => {
    const main = makeTestGraph();
    // A → B → C, A → D. If we remove B, C becomes disconnected
    const displayed = new Set(['A', 'B', 'C', 'D']);
    const sub = buildNlSubgraph(main, displayed);

    const result = removeNodeWithPruning(sub, 'B', 'A');

    expect(result.displayedNodeIds).toEqual(new Set(['A', 'D']));
    expect(result.prunedCount).toBe(1); // C was pruned
  });

  it('handles diamond topology (no false pruning)', () => {
    // A → B → D, A → C → D  (diamond: D has two paths to A)
    const main = new Graph<ConceptNode>();
    main.addNode('A', node('A'));
    main.addNode('B', node('B'));
    main.addNode('C', node('C'));
    main.addNode('D', node('D'));
    main.addEdge('A', 'B');
    main.addEdge('A', 'C');
    main.addEdge('B', 'D');
    main.addEdge('C', 'D');

    const displayed = new Set(['A', 'B', 'C', 'D']);
    const sub = buildNlSubgraph(main, displayed);

    // Remove B — D is still reachable through C
    const result = removeNodeWithPruning(sub, 'B', 'A');

    expect(result.displayedNodeIds).toEqual(new Set(['A', 'C', 'D']));
    expect(result.prunedCount).toBe(0);
  });

  it('returns empty set when focus node is removed', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B', 'C']);
    const sub = buildNlSubgraph(main, displayed);

    const result = removeNodeWithPruning(sub, 'A', 'A');

    expect(result.displayedNodeIds).toEqual(new Set());
    expect(result.prunedCount).toBe(3); // A + B + C
  });

  it('handles removing a node not in the subgraph', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B']);
    const sub = buildNlSubgraph(main, displayed);

    const result = removeNodeWithPruning(sub, 'Z', 'A');

    expect(result.displayedNodeIds).toEqual(new Set(['A', 'B']));
    expect(result.prunedCount).toBe(0);
  });

  it('prunes cluster pseudo-nodes when parent is removed', () => {
    const main = makeTestGraph();
    const displayed = new Set(['A', 'B', 'cluster:B']);
    const sub = buildNlSubgraph(main, displayed);

    // Remove B — cluster:B should also be pruned (disconnected from A)
    const result = removeNodeWithPruning(sub, 'B', 'A');

    expect(result.displayedNodeIds).toEqual(new Set(['A']));
    expect(result.prunedCount).toBe(1); // cluster:B pruned
  });
});
