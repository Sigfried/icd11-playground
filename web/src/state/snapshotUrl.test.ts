import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toBase64url, fromBase64url, encodeOps, decodeSnapshots, replayOps } from './snapshotUrl';
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

// Encode ops, decode, return the last snapshot's state
function roundTrip(ops: SnapshotOp[]) {
  const encoded = encodeOps(ops);
  const snapshots = decodeSnapshots(encoded);
  const last = snapshots[snapshots.length - 1];
  return { focusNodeId: last.focusNodeId, displayedNodeIds: last.displayedNodeIds, snapshots };
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
    const expected = neighborhood(CHOLERA);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(expected));
  });

  it('round-trips select + expand + remove', () => {
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    let state = replayOps(ops);

    const children = getChildren(CHOLERA);
    const childIds = children.slice(0, 3).map(c => c.id);
    if (childIds.length > 0) {
      ops.push({ type: 'add', ids: childIds });
      state = replayOps(ops);
    }

    const removable = [...state.displayedNodeIds].find(
      id => id !== CHOLERA && !id.startsWith('cluster:')
    );
    if (removable) {
      ops.push({ type: 'remove', id: removable });
      state = replayOps(ops);
    }

    const decoded = roundTrip(ops);
    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips reselect (merge neighborhoods)', () => {
    const ops: SnapshotOp[] = [
      { type: 'select', nodeId: CHOLERA },
      { type: 'reselect', nodeId: DIABETES },
    ];
    const state = replayOps(ops);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(DIABETES);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips reset', () => {
    const ops: SnapshotOp[] = [
      { type: 'select', nodeId: CHOLERA },
      { type: 'add', ids: ['1217915084'] },
      { type: 'reset' },
    ];
    const expected = neighborhood(CHOLERA);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(CHOLERA);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(expected));
  });

  it('round-trips removeBatch', () => {
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
    const state = replayOps(ops);

    const targets = [...state.displayedNodeIds]
      .filter(id => id !== CHOLERA && !id.startsWith('cluster:'))
      .slice(0, 2);

    if (targets.length > 0) {
      ops.push({ type: 'removeBatch', ids: targets });
      const state2 = replayOps(ops);
      const decoded = roundTrip(ops);

      expect(decoded.focusNodeId).toBe(CHOLERA);
      expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state2.displayedNodeIds));
    }
  });

  it('decodes full history with one snapshot per op', () => {
    const ops: SnapshotOp[] = [
      { type: 'select', nodeId: CHOLERA },
      { type: 'add', ids: ['1217915084'] },
      { type: 'reset' },
    ];
    const decoded = roundTrip(ops);
    expect(decoded.snapshots).toHaveLength(3);
    expect(decoded.snapshots[0].op).toEqual({ type: 'select', nodeId: CHOLERA });
    expect(decoded.snapshots[1].op).toEqual({ type: 'add', ids: ['1217915084'] });
    expect(decoded.snapshots[2].op).toEqual({ type: 'reset' });
  });

  it('throws on empty ops', () => {
    expect(() => encodeOps([])).toThrow('No operations to encode');
  });
});

describe('version mismatch warning', () => {
  it('warns on version mismatch but still decodes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ops: SnapshotOp[] = [{ type: 'select', nodeId: CHOLERA }];
      const state = replayOps(ops);
      const encoded = encodeOps(ops);

      // Tamper with the version in the payload
      const bytes = fromBase64url(encoded);
      const json = new TextDecoder().decode(bytes);
      const payload = JSON.parse(json);
      payload.v = 'tampered-version';
      const tamperedJson = JSON.stringify(payload);
      const tamperedBytes = new TextEncoder().encode(tamperedJson);
      const tamperedEncoded = toBase64url(tamperedBytes);

      const snapshots = decodeSnapshots(tamperedEncoded);
      const last = snapshots[snapshots.length - 1];

      expect(last.focusNodeId).toBe(CHOLERA);
      expect(realIds(last.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
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
    if (!getNode(NINE_PARENTS)) return;
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: NINE_PARENTS }];
    const state = replayOps(ops);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(NINE_PARENTS);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });

  it('round-trips after expanding children of stress node', () => {
    if (!getNode(NINE_PARENTS)) return;
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: NINE_PARENTS }];
    const state = replayOps(ops);

    const toAdd: string[] = [];
    for (const id of state.displayedNodeIds) {
      if (id.startsWith('cluster:')) continue;
      for (const child of getChildren(id).slice(0, 2)) {
        if (!state.displayedNodeIds.has(child.id)) toAdd.push(child.id);
      }
    }
    if (toAdd.length > 0) ops.push({ type: 'add', ids: toAdd });

    const state2 = replayOps(ops);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(NINE_PARENTS);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state2.displayedNodeIds));
  });

  it('round-trips stress node 1531033936', () => {
    if (!getNode(STRESS_NODE)) return;
    const ops: SnapshotOp[] = [{ type: 'select', nodeId: STRESS_NODE }];
    const state = replayOps(ops);
    const decoded = roundTrip(ops);

    expect(decoded.focusNodeId).toBe(STRESS_NODE);
    expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
  });
});

describe('random operation sequences', () => {
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
      const numOps = 5 + Math.floor(rng() * 11);

      for (let i = 0; i < numOps; i++) {
        const displayed = [...state.displayedNodeIds].filter(id => !id.startsWith('cluster:'));
        if (displayed.length === 0) break;

        const action = rng();
        if (action < 0.3) {
          const parentId = displayed[Math.floor(rng() * displayed.length)];
          const children = getChildren(parentId);
          if (children.length > 0) ops.push({ type: 'add', ids: children.slice(0, 3).map(c => c.id) });
        } else if (action < 0.5) {
          const removable = displayed.filter(id => id !== state.focusNodeId);
          if (removable.length > 0) ops.push({ type: 'remove', id: removable[Math.floor(rng() * removable.length)] });
        } else if (action < 0.7) {
          ops.push({ type: 'reselect', nodeId: displayed[Math.floor(rng() * displayed.length)] });
        } else if (action < 0.85) {
          ops.push({ type: 'reset' });
        } else {
          const newNode = testNodes[Math.floor(rng() * testNodes.length)];
          if (getNode(newNode)) ops.push({ type: 'select', nodeId: newNode });
        }
        state = replayOps(ops);
      }

      const decoded = roundTrip(ops);
      expect(decoded.focusNodeId).toBe(state.focusNodeId);
      expect(realIds(decoded.displayedNodeIds)).toEqual(realIds(state.displayedNodeIds));
    });
  }
});
