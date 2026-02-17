import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toBase64url, fromBase64url, encodeSnapshot, decodeSnapshot, replayOps } from './snapshotUrl';
import { initGraph, getNode, getChildren, getParents } from '../api/foundationData';
import { buildInitialNeighborhood } from './buildInitialNeighborhood';
import type { FoundationGraphJson } from '../api/foundationStore';
import type { SnapshotOp } from './nlHistory';

// Load real graph data once for all tests
beforeAll(() => {
  const graphPath = resolve(__dirname, '../../public/foundation_graph.json');
  const raw = readFileSync(graphPath, 'utf-8');
  const data = JSON.parse(raw) as FoundationGraphJson;
  // Extract _meta and init
  const meta = data._meta;
  delete data._meta;
  const release = meta && typeof meta === 'object' && 'release' in meta
    ? (meta as { release: string }).release
    : '2024-01';
  initGraph(data, release);
});

function neighborhood(nodeId: string): Set<string> {
  return buildInitialNeighborhood(nodeId, getParents, getChildren, getNode);
}

// Filter clusters from a set
function realIds(ids: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const id of ids) {
    if (!id.startsWith('cluster:')) result.add(id);
  }
  return result;
}

// Test entities from CLAUDE.md
const CHOLERA = '257068234';
const DIABETES = '1217915084';
// Stress test nodes from spec
const NINE_PARENTS = '383104340';
const STRESS_NODE = '1531033936';

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

describe('instruction-replay encoding', () => {
  it('round-trips default neighborhood (select)', () => {
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    const replayed = replayOps(ops);
    const expected = neighborhood(CHOLERA);

    const encoded = encodeSnapshot(ops, replayed.focusNodeId, replayed.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(expected));
  });

  it('round-trips select + expand + remove', () => {
    // 1. Select Cholera
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    let state = replayOps(ops);

    // 2. Expand: add some children of Cholera
    const children = getChildren(CHOLERA);
    const childIds = children.slice(0, 3).map(c => c.id);
    if (childIds.length > 0) {
      ops.push({ type: 'add', ids: childIds });
      state = replayOps(ops);
    }

    // 3. Remove a non-focus node (pick the first non-focus, non-cluster node)
    const removable = [...state.displayedNodeIds].find(
      id => id !== CHOLERA && !id.startsWith('cluster:')
    );
    if (removable) {
      ops.push({ type: 'remove', id: removable });
      state = replayOps(ops);
    }

    const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips reselect (merge neighborhoods)', () => {
    // 1. Select Cholera
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    // 2. Reselect Diabetes (merge)
    ops.push({ type: 'reselect', nodeId: DIABETES });

    const state = replayOps(ops);

    const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(DIABETES);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips reset', () => {
    const ops: SnapshotOp[] = [
      { type: 'select', nodeId: CHOLERA },
      { type: 'add', ids: ['1217915084'] },  // add Diabetes
      { type: 'reset' },                      // back to default
    ];
    const state = replayOps(ops);
    const expected = neighborhood(CHOLERA);

    const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(expected));
  });

  it('round-trips removeBatch', () => {
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    const state = replayOps(ops);

    // Find two non-focus nodes to batch-remove
    const targets = [...state.displayedNodeIds]
      .filter(id => id !== CHOLERA && !id.startsWith('cluster:'))
      .slice(0, 2);

    if (targets.length > 0) {
      ops.push({ type: 'removeBatch', ids: targets });
      const state2 = replayOps(ops);

      const encoded = encodeSnapshot(ops, state2.focusNodeId, state2.displayedNodeIds);
      const decoded = decodeSnapshot(encoded);

      expect(decoded.focusNodeId).toBe(CHOLERA);
      expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state2.displayedNodeIds));
    }
  });
});

describe('diff fallback encoding', () => {
  it('round-trips when ops are empty (forces diff mode)', () => {
    // Build a state manually and encode with empty ops → diff mode
    const baseIds = neighborhood(CHOLERA);
    const focusNodeId = CHOLERA;

    const encoded = encodeSnapshot([], focusNodeId, baseIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(baseIds));
  });

  it('round-trips with additions and removals vs base', () => {
    const baseIds = neighborhood(CHOLERA);
    // Add an extra node
    const modified = new Set(baseIds);
    modified.add(DIABETES);
    // Remove a non-focus, non-cluster node
    const removable = [...baseIds].find(
      id => id !== CHOLERA && !id.startsWith('cluster:')
    );
    if (removable) modified.delete(removable);

    const encoded = encodeSnapshot([], CHOLERA, modified);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(modified));
  });
});

describe('version mismatch warning', () => {
  it('warns on version mismatch but still decodes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Encode with current version
      const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
      const state = replayOps(ops);
      const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);

      // Tamper with the version in the payload
      const bytes = fromBase64url(encoded);
      const json = new TextDecoder().decode(bytes);
      const payload = JSON.parse(json);
      payload.v = 'tampered-version';
      const tamperedJson = JSON.stringify(payload);
      const tamperedBytes = new TextEncoder().encode(tamperedJson);
      const tamperedEncoded = toBase64url(tamperedBytes);

      const decoded = decodeSnapshot(tamperedEncoded);

      // Should still decode correctly
      expect(decoded.focusNodeId).toBe(CHOLERA);
      expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));

      // Should have warned
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('tampered-version')
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('stress test round-trips', () => {
  it('round-trips node with 9 parents (383104340)', () => {
    const node = getNode(NINE_PARENTS);
    if (!node) return; // skip if not in graph

    const ops: SnapshotOp[] = [{ type: 'select', nodeId: NINE_PARENTS }];
    const state = replayOps(ops);

    const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(NINE_PARENTS);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips after expanding all parents of stress node', () => {
    const node = getNode(NINE_PARENTS);
    if (!node) return;

    const ops: SnapshotOp[] = [{ type: 'select', nodeId: NINE_PARENTS }];
    const state = replayOps(ops);

    // Expand: add children of each displayed node that has children
    const toAdd: string[] = [];
    for (const id of state.displayedNodeIds) {
      if (id.startsWith('cluster:')) continue;
      const children = getChildren(id);
      for (const child of children.slice(0, 2)) {
        if (!state.displayedNodeIds.has(child.id)) {
          toAdd.push(child.id);
        }
      }
    }

    if (toAdd.length > 0) {
      ops.push({ type: 'add', ids: toAdd });
    }

    const state2 = replayOps(ops);
    const encoded = encodeSnapshot(ops, state2.focusNodeId, state2.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(NINE_PARENTS);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state2.displayedNodeIds));
  });

  it('round-trips stress node 1531033936', () => {
    const node = getNode(STRESS_NODE);
    if (!node) return;

    const ops: SnapshotOp[] = [{ type: 'select', nodeId: STRESS_NODE }];
    const state = replayOps(ops);

    const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
    const decoded = decodeSnapshot(encoded);

    expect(decoded.focusNodeId).toBe(STRESS_NODE);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });
});

describe('random operation sequences', () => {
  // Seeded pseudo-random number generator (mulberry32)
  function mulberry32(seed: number) {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const testNodes = [CHOLERA, DIABETES, NINE_PARENTS, STRESS_NODE];

  for (let seed = 1; seed <= 3; seed++) {
    it(`random sequence with seed ${seed}`, () => {
      const rng = mulberry32(seed);
      const startNode = testNodes[Math.floor(rng() * testNodes.length)];
      if (!getNode(startNode)) return;

      const ops: SnapshotOp[] = [{ type: 'select', nodeId: startNode }];
      let state = replayOps(ops);
      const numOps = 5 + Math.floor(rng() * 11); // 5-15 ops

      for (let i = 0; i < numOps; i++) {
        const displayed = [...state.displayedNodeIds].filter(id => !id.startsWith('cluster:'));
        if (displayed.length === 0) break;

        const action = rng();
        if (action < 0.3) {
          // Add children of a random displayed node
          const parentId = displayed[Math.floor(rng() * displayed.length)];
          const children = getChildren(parentId);
          if (children.length > 0) {
            const toAdd = children.slice(0, 3).map(c => c.id);
            ops.push({ type: 'add', ids: toAdd });
          }
        } else if (action < 0.5) {
          // Remove a random non-focus node
          const removable = displayed.filter(id => id !== state.focusNodeId);
          if (removable.length > 0) {
            const removeId = removable[Math.floor(rng() * removable.length)];
            ops.push({ type: 'remove', id: removeId });
          }
        } else if (action < 0.7) {
          // Reselect a displayed node
          const reselectId = displayed[Math.floor(rng() * displayed.length)];
          ops.push({ type: 'reselect', nodeId: reselectId });
        } else if (action < 0.85) {
          // Reset
          ops.push({ type: 'reset' });
        } else {
          // Select a new node entirely
          const newNode = testNodes[Math.floor(rng() * testNodes.length)];
          if (getNode(newNode)) {
            ops.push({ type: 'select', nodeId: newNode });
          }
        }

        state = replayOps(ops);
      }

      // Encode and decode
      const encoded = encodeSnapshot(ops, state.focusNodeId, state.displayedNodeIds);
      const decoded = decodeSnapshot(encoded);

      expect(decoded.focusNodeId).toBe(state.focusNodeId);
      expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
    });
  }
});
