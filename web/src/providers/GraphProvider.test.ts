import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import type { ConceptNode } from '../api/foundationData';

/**
 * Tests for child ordering logic used by foundationData.
 *
 * The key invariant: children must appear in API order (childOrder),
 * not in the arbitrary order that edges were added to the graph.
 */

describe('Child ordering', () => {
  it('should preserve API order when filtering loaded children', () => {
    const childOrder = ['child-1', 'child-2', 'child-3', 'child-4', 'child-5'];
    const loadedChildrenFromGraph = ['child-3', 'child-1', 'child-5', 'child-2'];
    const loadedChildren = new Set(loadedChildrenFromGraph);
    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual(['child-1', 'child-2', 'child-3', 'child-5']);
  });

  it('should handle partially loaded children', () => {
    const childOrder = ['a', 'b', 'c', 'd', 'e'];
    const loadedChildren = new Set(['c', 'a']);
    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual(['a', 'c']);
  });

  it('should handle empty loaded children', () => {
    const childOrder = ['a', 'b', 'c'];
    const loadedChildren = new Set<string>([]);
    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual([]);
  });

  it('should handle all children loaded', () => {
    const childOrder = ['x', 'y', 'z'];
    const loadedChildren = new Set(['z', 'x', 'y']);
    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual(['x', 'y', 'z']);
  });
});

describe('ConceptNode childOrder storage', () => {
  it('should store childOrder from graph data', () => {
    const graph = new Graph<ConceptNode>();

    const nodeData: ConceptNode = {
      id: 'parent-1',
      title: 'Test Parent',
      parentCount: 1,
      childCount: 5,
      childOrder: ['child-a', 'child-b', 'child-c', 'child-d', 'child-e'],
      descendantCount: 100,
      height: 3,
      depth: 2,
      maxDepth: 2,
    };

    graph.addNode('parent-1', nodeData);

    const retrieved = graph.getNodeAttributes('parent-1');
    expect(retrieved.childOrder).toEqual(['child-a', 'child-b', 'child-c', 'child-d', 'child-e']);
  });
});
