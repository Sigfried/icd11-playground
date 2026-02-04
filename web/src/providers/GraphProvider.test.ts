import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import type { ConceptNode } from './GraphProvider';

/**
 * Tests for GraphProvider child ordering logic.
 *
 * The key invariant: children must appear in API order (childOrder),
 * not in the arbitrary order that edges were added to the graph.
 */

describe('Child ordering', () => {
  it('should preserve API order when filtering loaded children', () => {
    // Simulate the childOrder from API (canonical order)
    const childOrder = ['child-1', 'child-2', 'child-3', 'child-4', 'child-5'];

    // Simulate graph.outNeighbors() which returns in edge-addition order
    // (arbitrary due to Promise.all completing in different orders)
    const loadedChildrenFromGraph = ['child-3', 'child-1', 'child-5', 'child-2'];

    // This is the logic used in TreeView and DetailPanel
    const loadedChildren = new Set(loadedChildrenFromGraph);
    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    // Should be in API order, not graph edge order
    expect(orderedChildIds).toEqual(['child-1', 'child-2', 'child-3', 'child-5']);
  });

  it('should handle partially loaded children', () => {
    const childOrder = ['a', 'b', 'c', 'd', 'e'];
    const loadedChildren = new Set(['c', 'a']); // Only 2 loaded

    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual(['a', 'c']); // API order preserved
  });

  it('should handle empty loaded children', () => {
    const childOrder = ['a', 'b', 'c'];
    const loadedChildren = new Set<string>([]);

    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual([]);
  });

  it('should handle all children loaded', () => {
    const childOrder = ['x', 'y', 'z'];
    const loadedChildren = new Set(['z', 'x', 'y']); // All loaded, different order

    const orderedChildIds = childOrder.filter(id => loadedChildren.has(id));

    expect(orderedChildIds).toEqual(['x', 'y', 'z']); // API order
  });
});

describe('ConceptNode childOrder storage', () => {
  it('should store childOrder from API entity', () => {
    const graph = new Graph<ConceptNode>();

    // Simulate adding a node with childOrder from API
    const nodeData: ConceptNode = {
      id: 'parent-1',
      title: 'Test Parent',
      definition: 'A test entity',
      parentCount: 1,
      childCount: 5,
      childOrder: ['child-a', 'child-b', 'child-c', 'child-d', 'child-e'],
      loaded: false,
    };

    graph.addNode('parent-1', nodeData);

    const retrieved = graph.getNodeAttributes('parent-1');
    expect(retrieved.childOrder).toEqual(['child-a', 'child-b', 'child-c', 'child-d', 'child-e']);
  });
});
