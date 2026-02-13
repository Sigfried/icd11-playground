import { describe, it, expect } from 'vitest';
import {
  createHistory,
  pushSnapshot,
  undo,
  redo,
  jumpTo,
  currentSnapshot,
  canUndo,
  canRedo,
  serializeHistory,
  deserializeHistory,
  type Snapshot,
} from './nlHistory';

function snap(focusNodeId: string, ids: string[], description = ''): Snapshot {
  return {
    focusNodeId,
    displayedNodeIds: new Set(ids),
    timestamp: Date.now(),
    description,
  };
}

describe('nlHistory', () => {
  it('creates empty history', () => {
    const h = createHistory();
    expect(h.snapshots).toEqual([]);
    expect(h.pointer).toBe(-1);
    expect(currentSnapshot(h)).toBeNull();
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it('pushes snapshots', () => {
    let h = createHistory();
    h = pushSnapshot(h, snap('A', ['A', '1', '2']));
    expect(h.pointer).toBe(0);
    expect(currentSnapshot(h)!.focusNodeId).toBe('A');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);

    h = pushSnapshot(h, snap('B', ['B', '3', '4']));
    expect(h.pointer).toBe(1);
    expect(currentSnapshot(h)!.focusNodeId).toBe('B');
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it('undo and redo', () => {
    let h = createHistory();
    h = pushSnapshot(h, snap('A', ['A']));
    h = pushSnapshot(h, snap('B', ['B']));
    h = pushSnapshot(h, snap('C', ['C']));

    h = undo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('B');
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(true);

    h = undo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('A');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);

    // Can't undo past beginning
    h = undo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('A');

    h = redo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('B');

    h = redo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('C');

    // Can't redo past end
    h = redo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('C');
  });

  it('truncates forward history on push from middle', () => {
    let h = createHistory();
    h = pushSnapshot(h, snap('A', ['A']));
    h = pushSnapshot(h, snap('B', ['B']));
    h = pushSnapshot(h, snap('C', ['C']));

    // Undo to B, then push D → C is gone
    h = undo(h);
    expect(currentSnapshot(h)!.focusNodeId).toBe('B');

    h = pushSnapshot(h, snap('D', ['D']));
    expect(h.snapshots.length).toBe(3); // A, B, D
    expect(h.pointer).toBe(2);
    expect(currentSnapshot(h)!.focusNodeId).toBe('D');
    expect(canRedo(h)).toBe(false);
  });

  it('jumpTo navigates directly', () => {
    let h = createHistory();
    h = pushSnapshot(h, snap('A', ['A']));
    h = pushSnapshot(h, snap('B', ['B']));
    h = pushSnapshot(h, snap('C', ['C']));

    h = jumpTo(h, 0);
    expect(currentSnapshot(h)!.focusNodeId).toBe('A');

    h = jumpTo(h, 2);
    expect(currentSnapshot(h)!.focusNodeId).toBe('C');

    // Out of range — no change
    h = jumpTo(h, -1);
    expect(currentSnapshot(h)!.focusNodeId).toBe('C');
    h = jumpTo(h, 99);
    expect(currentSnapshot(h)!.focusNodeId).toBe('C');
  });

  it('serialization round-trip', () => {
    let h = createHistory();
    h = pushSnapshot(h, snap('A', ['A', '1', '2'], 'Selected A'));
    h = pushSnapshot(h, snap('B', ['B', '3'], 'Selected B'));

    const serialized = serializeHistory(h);
    expect(serialized.snapshots[0].displayedNodeIds).toEqual(['A', '1', '2']);
    expect(serialized.pointer).toBe(1);

    const restored = deserializeHistory(serialized);
    expect(restored.pointer).toBe(1);
    expect(currentSnapshot(restored)!.focusNodeId).toBe('B');
    expect(currentSnapshot(restored)!.displayedNodeIds).toBeInstanceOf(Set);
    expect([...currentSnapshot(restored)!.displayedNodeIds]).toEqual(['B', '3']);
  });
});
