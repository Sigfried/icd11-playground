/**
 * IndexedDB cache for ICD-11 Foundation data.
 *
 * Two tiers:
 * - "graph": full graph structure (single entry, keyed "graph")
 * - "entities": individual entity details (keyed by entity ID)
 */

import type { FoundationEntity } from './icd11';

export interface FoundationGraphJson {
  [id: string]: {
    title: string;
    parents: string[];
    children: string[];
    descendantCount: number;
    maxDepth: number;
  };
}

const DB_NAME = 'icd11-foundation';
const DB_VERSION = 1;
const GRAPH_STORE = 'graph';
const ENTITY_STORE = 'entities';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GRAPH_STORE)) {
        db.createObjectStore(GRAPH_STORE);
      }
      if (!db.objectStoreNames.contains(ENTITY_STORE)) {
        db.createObjectStore(ENTITY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const foundationStore = {
  async getGraph(): Promise<FoundationGraphJson | null> {
    const db = await openDb();
    return txGet<FoundationGraphJson>(db, GRAPH_STORE, 'graph');
  },

  async putGraph(data: FoundationGraphJson): Promise<void> {
    const db = await openDb();
    return txPut(db, GRAPH_STORE, 'graph', data);
  },

  async getEntity(id: string): Promise<FoundationEntity | null> {
    const db = await openDb();
    return txGet<FoundationEntity>(db, ENTITY_STORE, id);
  },

  async putEntity(id: string, entity: FoundationEntity): Promise<void> {
    const db = await openDb();
    return txPut(db, ENTITY_STORE, id, entity);
  },

  async clear(): Promise<void> {
    const db = await openDb();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(GRAPH_STORE, 'readwrite');
        tx.objectStore(GRAPH_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ENTITY_STORE, 'readwrite');
        tx.objectStore(ENTITY_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
    ]);
  },
};
