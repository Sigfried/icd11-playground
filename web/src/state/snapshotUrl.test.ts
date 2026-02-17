import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitWriter, BitReader, toBase64url, fromBase64url, encodeSnapshot, decodeSnapshot } from './snapshotUrl';
import type { Snapshot } from './nlHistory';

/**
 * Mock a small DAG for testing:
 *
 *     A (depth 0)
 *    / \
 *   B   C (depth 1)
 *  / \   \
 * D   E   F (depth 2)
 *      \ /
 *       G (depth 3, polyhierarchy: parents E and F)
 */

const nodes: Record<string, { title: string; depth: number; childOrder: string[] }> = {
  A: { title: 'A', depth: 0, childOrder: ['B', 'C'] },
  B: { title: 'B', depth: 1, childOrder: ['D', 'E'] },
  C: { title: 'C', depth: 1, childOrder: ['F'] },
  D: { title: 'D', depth: 2, childOrder: [] },
  E: { title: 'E', depth: 2, childOrder: ['G'] },
  F: { title: 'F', depth: 2, childOrder: ['G'] },
  G: { title: 'G', depth: 3, childOrder: [] },
};

// Canonical sorted order: A, B, C, D, E, F, G → indices 0..6
const sortedIds = Object.keys(nodes).sort();
const idToIndex = new Map(sortedIds.map((id, i) => [id, i]));

// Edges: A→B, A→C, B→D, B→E, C→F, E→G, F→G
const edges: Array<[string, string]> = [
  ['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['E', 'G'], ['F', 'G'],
];

// Build neighbor lookup
const outNeighbors = new Map<string, string[]>();
const inNeighbors = new Map<string, string[]>();
for (const id of sortedIds) {
  outNeighbors.set(id, []);
  inNeighbors.set(id, []);
}
for (const [from, to] of edges) {
  outNeighbors.get(from)!.push(to);
  inNeighbors.get(to)!.push(from);
}

// Mock foundationData
vi.mock('../api/foundationData', () => ({
  getNodeIndex: (id: string) => {
    const idx = idToIndex.get(id);
    if (idx === undefined) throw new Error(`Unknown node ID: ${id}`);
    return idx;
  },
  getNodeIdByIndex: (index: number) => sortedIds[index] ?? null,
  getNode: (id: string) => {
    const n = nodes[id];
    if (!n) return null;
    return { id, title: n.title, depth: n.depth, childOrder: n.childOrder, parentCount: 0, childCount: n.childOrder.length, descendantCount: 0, height: 0, maxDepth: 0 };
  },
  getGraph: () => ({
    hasNode: (id: string) => id in nodes,
    inNeighbors: (id: string) => inNeighbors.get(id) ?? [],
    outNeighbors: (id: string) => outNeighbors.get(id) ?? [],
  }),
}));

function snap(focusNodeId: string | null, ids: string[]): Snapshot {
  return {
    focusNodeId,
    displayedNodeIds: new Set(ids),
    timestamp: Date.now(),
    description: 'test',
  };
}

describe('BitWriter / BitReader', () => {
  it('round-trips individual bits', () => {
    const w = new BitWriter();
    w.writeBit(1);
    w.writeBit(0);
    w.writeBit(1);
    w.writeBit(1);
    const data = w.toUint8Array();
    const r = new BitReader(data);
    expect(r.readBit()).toBe(1);
    expect(r.readBit()).toBe(0);
    expect(r.readBit()).toBe(1);
    expect(r.readBit()).toBe(1);
  });

  it('round-trips varints', () => {
    const values = [0, 1, 127, 128, 255, 1000, 16383, 16384, 65535, 100000];
    const w = new BitWriter();
    for (const v of values) w.writeVarint(v);
    const r = new BitReader(w.toUint8Array());
    for (const v of values) expect(r.readVarint()).toBe(v);
  });

  it('mixes bits and varints', () => {
    const w = new BitWriter();
    w.writeBit(1);
    w.writeVarint(42);
    w.writeBit(0);
    w.writeVarint(300);
    const r = new BitReader(w.toUint8Array());
    expect(r.readBit()).toBe(1);
    expect(r.readVarint()).toBe(42);
    expect(r.readBit()).toBe(0);
    expect(r.readVarint()).toBe(300);
  });
});

describe('Base64url', () => {
  it('round-trips arbitrary bytes', () => {
    const data = new Uint8Array([0, 1, 255, 128, 63, 62, 61]);
    const encoded = toBase64url(data);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    const decoded = fromBase64url(encoded);
    expect(decoded).toEqual(data);
  });
});

describe('encodeSnapshot / decodeSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips a simple subgraph', () => {
    // A → B → E → G, with C and F as boundaries
    const s = snap('E', ['A', 'B', 'C', 'E', 'G']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.focusNodeId).toBe('E');
    expect(decoded.displayedNodeIds).toEqual(new Set(['A', 'B', 'C', 'E', 'G']));
  });

  it('round-trips the full DAG', () => {
    const s = snap('A', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.focusNodeId).toBe('A');
    expect(decoded.displayedNodeIds).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']));
  });

  it('round-trips a single node', () => {
    const s = snap('D', ['D']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.focusNodeId).toBe('D');
    expect(decoded.displayedNodeIds).toEqual(new Set(['D']));
  });

  it('handles null focus node', () => {
    const s = snap(null, ['A', 'B', 'C']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.focusNodeId).toBeNull();
    expect(decoded.displayedNodeIds).toEqual(new Set(['A', 'B', 'C']));
  });

  it('filters out cluster pseudo-nodes', () => {
    const s = snap('A', ['A', 'B', 'cluster:A', 'cluster:B']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.displayedNodeIds).toEqual(new Set(['A', 'B']));
  });

  it('throws on empty subgraph', () => {
    const s = snap(null, []);
    expect(() => encodeSnapshot(s)).toThrow();
  });

  it('throws on empty subgraph with only cluster nodes', () => {
    const s = snap(null, ['cluster:A']);
    expect(() => encodeSnapshot(s)).toThrow();
  });

  it('handles polyhierarchy node G (parents E and F)', () => {
    // G has two parents. Encode a subgraph that includes both paths to G.
    const s = snap('G', ['A', 'B', 'C', 'E', 'F', 'G']);
    const encoded = encodeSnapshot(s);
    const decoded = decodeSnapshot(encoded);
    expect(decoded.focusNodeId).toBe('G');
    expect(decoded.displayedNodeIds).toEqual(new Set(['A', 'B', 'C', 'E', 'F', 'G']));
  });
});
