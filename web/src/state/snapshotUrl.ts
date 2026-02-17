/**
 * Encode/decode node-link snapshots as compact URL parameters.
 *
 * Uses a BFS-bitmask algorithm that exploits the shared DAG structure between
 * encoder and decoder: both have the full ~69K-node graph in memory, so only
 * the BFS expansion decisions (1 bit per candidate child) need to be stored.
 *
 * URL format: ?s=<base64url-encoded deflated bitstream>
 */

import { deflate, inflate } from 'pako';
import { getNodeIndex, getNodeIdByIndex, getNode, getGraph } from '../api/foundationData';
import type { Snapshot } from './nlHistory';

const SNAPSHOT_VERSION = 1;
const NO_FOCUS_SENTINEL = 0xFFFF;

// --- Bit I/O helpers ---

export class BitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private bitPos = 0;

  writeBit(bit: number): void {
    this.currentByte |= (bit & 1) << this.bitPos;
    this.bitPos++;
    if (this.bitPos === 8) {
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitPos = 0;
    }
  }

  /** Write a non-negative integer as a varint (7-bit chunks, MSB continuation). */
  writeVarint(value: number): void {
    if (value < 0) throw new Error('Varint must be non-negative');
    do {
      let chunk = value & 0x7F;
      value >>>= 7;
      if (value > 0) chunk |= 0x80; // continuation bit
      for (let i = 0; i < 8; i++) {
        this.writeBit((chunk >> i) & 1);
      }
    } while (value > 0);
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.bytes.length + (this.bitPos > 0 ? 1 : 0));
    for (let i = 0; i < this.bytes.length; i++) result[i] = this.bytes[i];
    if (this.bitPos > 0) result[this.bytes.length] = this.currentByte;
    return result;
  }
}

export class BitReader {
  private bytes: Uint8Array;
  private bytePos = 0;
  private bitPos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  readBit(): number {
    if (this.bytePos >= this.bytes.length) throw new Error('BitReader exhausted');
    const bit = (this.bytes[this.bytePos] >> this.bitPos) & 1;
    this.bitPos++;
    if (this.bitPos === 8) {
      this.bytePos++;
      this.bitPos = 0;
    }
    return bit;
  }

  readVarint(): number {
    let value = 0;
    let shift = 0;
    let chunk: number;
    do {
      chunk = 0;
      for (let i = 0; i < 8; i++) {
        chunk |= this.readBit() << i;
      }
      value |= (chunk & 0x7F) << shift;
      shift += 7;
    } while (chunk & 0x80);
    return value;
  }

  get exhausted(): boolean {
    return this.bytePos >= this.bytes.length;
  }
}

// --- Base64url ---

export function toBase64url(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Encode ---

/**
 * Find the connected component containing `startId` within the subgraph,
 * treating edges as undirected (using the main graph's edges).
 */
function findConnectedComponent(subgraphIds: Set<string>, startId: string): Set<string> {
  const graph = getGraph();
  const component = new Set<string>();
  const queue = [startId];
  component.add(startId);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    // Check both parent and child edges in the main graph
    for (const neighbor of [...graph.inNeighbors(nodeId), ...graph.outNeighbors(nodeId)]) {
      if (subgraphIds.has(neighbor) && !component.has(neighbor)) {
        component.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return component;
}

export function encodeSnapshot(snapshot: Snapshot): string {
  // 1. Filter cluster pseudo-nodes
  const realIds = new Set<string>();
  for (const id of snapshot.displayedNodeIds) {
    if (!id.startsWith('cluster:')) realIds.add(id);
  }

  if (realIds.size === 0) {
    throw new Error('No real nodes to encode');
  }

  // 2. Find connected component containing focus (or pick shallowest node)
  const anchorId = snapshot.focusNodeId && realIds.has(snapshot.focusNodeId)
    ? snapshot.focusNodeId
    : findShallowest(realIds);

  const component = findConnectedComponent(realIds, anchorId);
  if (component.size < realIds.size) {
    console.warn(
      `Snapshot has ${realIds.size - component.size} disconnected nodes that will be dropped from the share URL`
    );
  }

  // 3. BFS root = shallowest node in the component
  const bfsRoot = findShallowest(component);

  // 4. Write bitstream
  const writer = new BitWriter();
  writer.writeVarint(SNAPSHOT_VERSION);
  writer.writeVarint(getNodeIndex(bfsRoot));

  const graph = getGraph();
  const visited = new Set<string>();
  const bfsOrder: string[] = [];
  const queue: string[] = [bfsRoot];
  visited.add(bfsRoot);
  bfsOrder.push(bfsRoot);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    // Iterate children in canonical order (childOrder from the main graph)
    const nodeAttrs = getNode(nodeId);
    if (!nodeAttrs) continue;

    for (const childId of nodeAttrs.childOrder) {
      if (!graph.hasNode(childId)) continue;
      if (visited.has(childId)) continue; // DAG cross-edge: no bit emitted
      visited.add(childId);

      if (component.has(childId)) {
        writer.writeBit(1); // child is in subgraph
        queue.push(childId);
        bfsOrder.push(childId);
      } else {
        writer.writeBit(0); // boundary node
      }
    }
  }

  // 5. Encode focus node position
  const focusNodeId = snapshot.focusNodeId;
  if (focusNodeId && component.has(focusNodeId)) {
    const focusPos = bfsOrder.indexOf(focusNodeId);
    writer.writeVarint(focusPos);
  } else {
    writer.writeVarint(NO_FOCUS_SENTINEL);
  }

  // 6. Compress and encode
  const raw = writer.toUint8Array();
  const compressed = deflate(raw);
  return toBase64url(compressed);
}

// --- Decode ---

export function decodeSnapshot(encoded: string): {
  focusNodeId: string | null;
  displayedNodeIds: Set<string>;
} {
  const compressed = fromBase64url(encoded);
  const raw = inflate(compressed);
  const reader = new BitReader(raw);

  const version = reader.readVarint();
  if (version !== SNAPSHOT_VERSION) {
    throw new Error(`Unknown snapshot version: ${version}`);
  }

  const rootIndex = reader.readVarint();
  const rootId = getNodeIdByIndex(rootIndex);
  if (!rootId) throw new Error(`Invalid root index: ${rootIndex}`);

  const graph = getGraph();
  const visited = new Set<string>();
  const bfsOrder: string[] = [];
  const displayedNodeIds = new Set<string>();
  const queue: string[] = [rootId];
  visited.add(rootId);
  bfsOrder.push(rootId);
  displayedNodeIds.add(rootId);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const nodeAttrs = getNode(nodeId);
    if (!nodeAttrs) continue;

    for (const childId of nodeAttrs.childOrder) {
      if (!graph.hasNode(childId)) continue;
      if (visited.has(childId)) continue;
      visited.add(childId);

      const bit = reader.readBit();
      if (bit === 1) {
        displayedNodeIds.add(childId);
        queue.push(childId);
        bfsOrder.push(childId);
      }
      // bit === 0: boundary, skip
    }
  }

  // Read focus position
  const focusPos = reader.readVarint();
  const focusNodeId = focusPos === NO_FOCUS_SENTINEL ? null : (bfsOrder[focusPos] ?? null);

  return { focusNodeId, displayedNodeIds };
}

// --- URL helpers ---

export function buildShareUrl(snapshot: Snapshot): string {
  const encoded = encodeSnapshot(snapshot);
  const url = new URL(window.location.href);
  // Clear other params, keep only `s`
  for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
  url.searchParams.set('s', encoded);
  return url.toString();
}

export function getSnapshotFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('s');
}

export function clearSnapshotFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('s');
  window.history.replaceState(null, '', url.toString());
}

// --- Internal helpers ---

function findShallowest(nodeIds: Set<string>): string {
  let shallowest: string | null = null;
  let minDepth = Infinity;
  for (const id of nodeIds) {
    const node = getNode(id);
    if (node && node.depth < minDepth) {
      minDepth = node.depth;
      shallowest = id;
    }
  }
  if (!shallowest) throw new Error('No valid nodes found');
  return shallowest;
}
