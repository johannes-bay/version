/**
 * XENOS Bridge
 * JS ↔ WASM bridge for the xenos-rs runtime.
 * Falls back to a pure JS implementation when WASM is unavailable.
 */

const IDB_NAME = 'xenos';
const IDB_STORE = 'xenos-state';
const IDB_KEY = 'runtime';

// ─── Helpers ──────────────────────────────────────────────────────────

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ─── Pure JS Runtime ──────────────────────────────────────────────────
// Mirrors the WASM XenosRuntime API so the system works without wasm-pack.
// Snapshot format matches xenos-rs RuntimeState for future WASM migration.

class JsRuntime {
  constructor() {
    this.nextEntityId = 0;
    this.nextEncounterId = 0;
    this.entities = new Set();
    this.relations = [];
    this.encounters = [];
    this.assumptions = new Map([
      ['ontology', 'relational'],
      ['scheduling', 'encounter-aware'],
      ['capabilities', 'encounter-scoped'],
      ['memory', 'shared-by-default'],
      ['hierarchy', 'none'],
      ['publicness', 'graduated'],
      ['interface', 'reflexive'],
    ]);
  }

  entity_create() {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }

  entity_exists(id) {
    return this.entities.has(id);
  }

  relate(a, b, modality, conditionality) {
    const idx = this.relations.length;
    this.relations.push({ a, b, modality, conditionality });
    return idx;
  }

  relations_for(entity) {
    return this.relations
      .map((r, i) => ({ ...r, index: i }))
      .filter(r => r.a === entity || r.b === entity)
      .map(r => ({
        other: r.a === entity ? r.b : r.a,
        modality: r.modality,
        conditionality: r.conditionality,
        index: r.index
      }));
  }

  relation_find(a, b) {
    const idx = this.relations.findIndex(
      r => (r.a === a && r.b === b) || (r.a === b && r.b === a)
    );
    return idx >= 0 ? idx : null;
  }

  encounter_begin(relationIndices, publicness) {
    const id = this.nextEncounterId++;
    const entities = new Set();
    for (const ri of relationIndices) {
      const rel = this.relations[ri];
      if (rel) {
        entities.add(rel.a);
        entities.add(rel.b);
      }
    }
    this.encounters.push({
      id,
      relations: [...relationIndices],
      entities: [...entities],
      publicness,
      concluded: false
    });
    return id;
  }

  encounter_join(encId, entityId) {
    const enc = this.encounters.find(e => e.id === encId);
    if (enc && !enc.concluded && !enc.entities.includes(entityId)) {
      enc.entities.push(entityId);
    }
  }

  encounter_conclude(encId) {
    const enc = this.encounters.find(e => e.id === encId);
    if (enc) enc.concluded = true;
  }

  path_between(a, b) {
    if (a === b) return [a];
    const adj = new Map();
    for (const r of this.relations) {
      if (!adj.has(r.a)) adj.set(r.a, []);
      if (!adj.has(r.b)) adj.set(r.b, []);
      adj.get(r.a).push(r.b);
      adj.get(r.b).push(r.a);
    }
    const visited = new Set([a]);
    const queue = [[a]];
    while (queue.length > 0) {
      const path = queue.shift();
      const node = path[path.length - 1];
      for (const neighbor of (adj.get(node) || [])) {
        if (neighbor === b) return [...path, b];
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return [];
  }

  assemblage_query(root, depth) {
    const result = { entities: new Set([root]), relations: [] };
    let frontier = [root];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier = [];
      for (const entity of frontier) {
        for (let i = 0; i < this.relations.length; i++) {
          const r = this.relations[i];
          let other = null;
          if (r.a === entity) other = r.b;
          else if (r.b === entity) other = r.a;
          if (other !== null && !result.entities.has(other)) {
            result.entities.add(other);
            result.relations.push(i);
            nextFrontier.push(other);
          }
        }
      }
      frontier = nextFrontier;
    }

    return {
      entities: [...result.entities],
      relations: result.relations.map(i => this.relations[i])
    };
  }

  declare_assumption(key, value) {
    this.assumptions.set(key, value);
  }

  get_assumptions() {
    return Object.fromEntries(this.assumptions);
  }

  // Snapshot format matches xenos-rs RuntimeState for WASM migration compatibility.
  snapshot() {
    return {
      num_entities: this.nextEntityId,
      assumptions: Object.fromEntries(this.assumptions),
      relations: this.relations.map(r => ({
        entity_a: r.a,
        entity_b: r.b,
        modality: capitalize(r.modality),
        conditionality: capitalize(r.conditionality),
      })),
      encounters: this.encounters.map(e => ({
        id: e.id,
        state: e.concluded ? 'Concluded' : 'Unfolding',
        participants: e.entities,
        publicness: capitalize(e.publicness),
      }))
    };
  }

  static from_state(state) {
    const rt = new JsRuntime();
    // Handle both xenos-rs format (num_entities) and legacy (next_entity_id)
    rt.nextEntityId = state.num_entities ?? state.next_entity_id ?? 0;
    rt.nextEncounterId = (state.encounters || []).reduce(
      (max, e) => Math.max(max, (e.id ?? 0) + 1), 0
    );
    rt.entities = new Set(
      Array.from({ length: rt.nextEntityId }, (_, i) => i)
    );
    rt.relations = (state.relations || []).map(r => ({
      a: r.entity_a ?? r.a,
      b: r.entity_b ?? r.b,
      modality: lowerFirst(r.modality),
      conditionality: lowerFirst(r.conditionality),
    }));
    rt.encounters = (state.encounters || []).map(e => ({
      id: e.id,
      relations: [],
      entities: e.participants ?? e.entities ?? [],
      publicness: lowerFirst(e.publicness ?? 'intimate'),
      concluded: e.state === 'Concluded' || e.state === 'Abandoned' || e.concluded === true,
    }));
    rt.assumptions = new Map(Object.entries(state.assumptions || {}));
    return rt;
  }
}

// ─── IndexedDB Helpers ────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadState() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveState(state) {
  try {
    const db = await openDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(state, IDB_KEY);
  } catch (e) {
    console.warn('XENOS: failed to persist state', e);
  }
}

// ─── Bridge ───────────────────────────────────────────────────────────

export class XenosBridge {
  constructor(runtime, isWasm) {
    this._rt = runtime;
    this._wasm = isWasm;
    this._names = new Map();   // name → entityId
    this._ids = new Map();     // entityId → name
    this._dirty = false;
    this._saveTimer = null;
  }

  /**
   * Initialize the bridge.
   * Attempts to load WASM; falls back to pure JS.
   * Restores persisted state from IndexedDB if available.
   */
  static async init() {
    let runtime;
    let isWasm = false;

    // Try loading the WASM module
    try {
      const wasm = await import('../xenos-wasm/pkg/xenos_wasm.js');
      await wasm.default();
      runtime = new wasm.XenosRuntime();
      isWasm = true;
      console.log('XENOS: WASM runtime loaded');
    } catch {
      runtime = new JsRuntime();
      console.log('XENOS: using JS fallback runtime');
    }

    const bridge = new XenosBridge(runtime, isWasm);

    // Restore persisted state
    const saved = await loadState();
    if (saved) {
      try {
        if (isWasm) {
          bridge._rt = bridge._rt.constructor.from_state(saved.runtime);
        } else {
          bridge._rt = JsRuntime.from_state(saved.runtime);
        }
        if (saved.names) {
          bridge._names = new Map(
            Object.entries(saved.names).map(([k, v]) => [k, Number(v)])
          );
          bridge._ids = new Map(
            [...bridge._names].map(([k, v]) => [v, k])
          );
        }
        console.log('XENOS: restored persisted state');
      } catch (e) {
        console.warn('XENOS: failed to restore state, starting fresh', e);
      }
    }

    return bridge;
  }

  // ─── Entity Management ──────────────────────────────────────

  /**
   * Get or create a named entity. Idempotent.
   * @param {string} name
   * @returns {number} Entity ID
   */
  entity(name) {
    if (this._names.has(name)) return this._names.get(name);
    const id = this._rt.entity_create();
    this._names.set(name, id);
    this._ids.set(id, name);
    this._markDirty();
    return id;
  }

  /**
   * Check if an entity exists by name or ID.
   */
  entityExists(nameOrId) {
    if (typeof nameOrId === 'string') return this._names.has(nameOrId);
    return this._rt.entity_exists(nameOrId);
  }

  /**
   * Get entity name by ID, or null.
   */
  entityName(id) {
    return this._ids.get(id) || null;
  }

  // ─── Relations ──────────────────────────────────────────────

  /**
   * Create a relation between two entities.
   * @param {number} a - Entity ID
   * @param {number} b - Entity ID
   * @param {string} modality - "experiential" | "analytical" | "institutional" | "public"
   * @param {string} conditionality - "mutual" | "extractive" | "conditional"
   * @returns {number} Relation index
   */
  relate(a, b, modality, conditionality) {
    const idx = this._rt.relate(a, b, modality, conditionality);
    this._markDirty();
    return idx;
  }

  /**
   * Get all relations for an entity.
   * @returns {Array<{other: number, modality: string, conditionality: string, index: number}>}
   */
  relationsFor(entityId) {
    const raw = this._rt.relations_for(entityId);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Find a relation between two entities.
   * @returns {number|null} Relation index, or null if none exists
   */
  relationFind(a, b) {
    const result = this._rt.relation_find(a, b);
    return (result === null || result === undefined) ? null : result;
  }

  // ─── Encounters ─────────────────────────────────────────────

  /**
   * Begin a design encounter.
   * @param {number[]} entities - Entity IDs participating
   * @param {string} publicness - "intimate" | "familiar" | "communal" | "public"
   * @returns {number} Encounter ID
   */
  encounter(entities, publicness) {
    // Gather existing relation indices between participants
    const relationIndices = [];
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const idx = this.relationFind(entities[i], entities[j]);
        if (idx !== null) {
          relationIndices.push(idx);
        }
      }
    }

    const encId = this._rt.encounter_begin(relationIndices, publicness);

    // Ensure all entities are joined (some may not be connected by relations yet)
    for (const eid of entities) {
      this._rt.encounter_join(encId, eid);
    }

    this._markDirty();
    return encId;
  }

  /**
   * Add an entity to an ongoing encounter.
   */
  encounterJoin(encounterId, entityId) {
    this._rt.encounter_join(encounterId, entityId);
    this._markDirty();
  }

  /**
   * Conclude an encounter.
   */
  encounterConclude(encounterId) {
    this._rt.encounter_conclude(encounterId);
    this._markDirty();
  }

  // ─── Assemblage Queries ─────────────────────────────────────

  /**
   * Find a path between two entities.
   * @returns {number[]} Array of entity IDs forming the shortest path
   */
  pathBetween(a, b) {
    const raw = this._rt.path_between(a, b);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Query the assemblage (subgraph) rooted at an entity.
   * @param {number} root - Root entity ID
   * @param {Object} opts - { maxDepth: number }
   * @returns {{ entities: number[], relations: Object[], namedEntities: Array<{id: number, name: string|null}> }}
   */
  assemblage(root, opts = {}) {
    const depth = opts.maxDepth || 3;
    const result = this._rt.assemblage_query(root, depth);

    // Annotate entities with names
    if (result && result.entities) {
      result.namedEntities = result.entities.map(id => ({
        id,
        name: this._ids.get(id) || null
      }));
    }

    return result;
  }

  // ─── Assumptions ────────────────────────────────────────────

  /**
   * Declare an assumption on the current context.
   */
  assume(key, value) {
    this._rt.declare_assumption(key, String(value));
    this._markDirty();
  }

  /**
   * Get all current assumptions.
   * @returns {Object} key-value map
   */
  assumptions() {
    const raw = this._rt.get_assumptions();
    return (typeof raw === 'object' && raw !== null) ? raw : {};
  }

  // ─── Persistence ────────────────────────────────────────────

  /**
   * Force save current state to IndexedDB.
   */
  async save() {
    const snapshot = this._rt.snapshot();
    await saveState({
      runtime: snapshot,
      names: Object.fromEntries(this._names)
    });
    this._dirty = false;
  }

  /**
   * Get a JSON-serializable snapshot of the runtime state.
   */
  snapshot() {
    return this._rt.snapshot();
  }

  /**
   * Whether this bridge is backed by the compiled WASM runtime.
   */
  get isWasm() {
    return this._wasm;
  }

  // ─── Internal ───────────────────────────────────────────────

  _markDirty() {
    this._dirty = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      if (this._dirty) this.save();
    }, 1000);
  }
}

export default XenosBridge;
