/**
 * Schema Store
 * IndexedDB-backed persistence for schemas and user parameter state.
 * Separate from the XENOS graph — different lifecycles.
 */

const DB_NAME = 'v4-store';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('schemas')) db.createObjectStore('schemas');
      if (!db.objectStoreNames.contains('params')) db.createObjectStore('params');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class SchemaStore {
  constructor() {
    this.db = null;
    this.registry = null;
  }

  async init() {
    this.db = await openDB();
    this.registry = await this.loadRegistry();
    return this;
  }

  /**
   * Load the schema registry. Network-first with IDB fallback.
   */
  async loadRegistry() {
    try {
      const resp = await fetch('./schemas/registry.json');
      const registry = await resp.json();
      await this._put('meta', 'registry', registry);
      return registry;
    } catch {
      // Offline — try cache
      const cached = await this._get('meta', 'registry');
      if (cached) return cached;
      throw new Error('Cannot load registry (offline, no cache)');
    }
  }

  /**
   * Get the list of available schemas from the registry.
   */
  getSchemas() {
    return this.registry ? this.registry.schemas : [];
  }

  /**
   * Load a schema by ID. Network-first with IDB fallback (offline).
   */
  async loadSchema(id) {
    const entry = this.getSchemas().find(s => s.id === id);
    if (!entry) throw new Error(`Schema not found: ${id}`);

    // Network-first: always fetch fresh when online
    try {
      const resp = await fetch(entry.schema);
      const schema = await resp.json();
      await this._put('schemas', id, schema);
      return schema;
    } catch {
      // Offline fallback: try IDB cache
      const cached = await this._get('schemas', id);
      if (cached) return cached;
      throw new Error(`Schema "${id}" unavailable offline (not cached)`);
    }
  }

  /**
   * Save user parameter overrides for a schema.
   */
  async saveParams(schemaId, params) {
    await this._put('params', schemaId, params);
  }

  /**
   * Load saved parameter overrides for a schema.
   */
  async loadParams(schemaId) {
    return await this._get('params', schemaId);
  }

  // ─── IDB Helpers ──────────────────────────────────────────────

  _get(storeName, key) {
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  _put(storeName, key, value) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    });
  }
}

export default SchemaStore;
