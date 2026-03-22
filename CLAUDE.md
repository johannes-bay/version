# CLAUDE.md — v4 Parametric Design Platform

## What This Is

Parametric 3D design generator with an XENOS-powered index graph. Designs are not files — they are encounters between dimension entities, constraint entities, and manufacturing contexts. The parameter space is a relation graph where higher-order associations emerge from encounter history at scale.

Built on v3 (vanilla JS, Three.js, JSCAD). v4 adds xenos-rs as a WASM module for the index graph runtime.

## Architecture

```
v4/
├── index.html              # Entry point
├── ui/
│   ├── configurator.js     # Parameter UI, schema loading, design switching
│   └── three-viewer.js     # 3D viewport (Three.js, PBR, shadows)
├── core/
│   ├── formula-engine.js   # Dependency resolution (Kahn's algorithm)
│   └── xenos-bridge.js     # JS ↔ WASM bridge for xenos-rs runtime [NEW]
├── schemas/
│   ├── laptop-stand.json   # Parametric laptop stand schema
│   └── iso-screw.json      # ISO 68-1 metric screw schema
├── geometry/
│   ├── laptop-stand.js         # JSCAD export geometry
│   ├── laptop-stand-shader.js  # GPU shader preview
│   ├── iso-screw.js            # JSCAD screw geometry
│   └── iso-screw-preview.js    # Three.js screw preview
├── xenos-wasm/                 # XENOS runtime compiled to WASM [NEW]
│   ├── Cargo.toml              # Rust crate: xenos-rs + wasm-bindgen
│   ├── src/lib.rs              # WASM exports: entities, relations, encounters, assemblages
│   └── pkg/                    # wasm-pack output (loaded by xenos-bridge.js)
└── CLAUDE.md
```

## XENOS Integration

### Why XENOS

Every design is an encounter between constraints. The primitives map directly:

- **Entities** — dimensions (210mm), geometries (cylinder), materials (PLA), standards (ISO 68-1)
- **Relations** — "210mm *is* the depth of this stand" (experiential) vs "210mm *is* A4 width" (institutional). Same entity, different modality. The relation carries conditionality: mutual (both constrain each other), extractive (one derives from the other), conditional (depends on context)
- **Encounters** — a design session. User opens laptop stand configurator → encounter unfolds between laptop dimensions, ergonomic preferences, printer capabilities, and aesthetic intent. Produces affordances (what's buildable). Concludes with an STL or abandons
- **Assumptions** — "this assumes resin printing at 50μm" is a declared assumption on the encounter. Change the assumption, the affordances change. Assumptions are first-class, not comments
- **Publicness** — ISO screw dimensions are PUBLIC (that's what makes them interoperable). User ergonomic preferences are INTIMATE. A shared template is COMMUNAL. The index graph respects these boundaries
- **Assemblages** — "what relates to 210mm with compatible manufacturing affordances?" is a subgraph query, not a category lookup. The answer depends on the encounter context

### The Index Graph

The index graph is the XENOS runtime persisted across sessions. Every schema contributes entities and relations. As designs accumulate:

- Dimensions that co-occur across many encounters gain implicit salience
- Parameter combinations validated through manufacturing encounters carry provenance
- Standards (ISO, DIN) are highly-public, highly-connected entities in the graph
- Personal preferences are intimate entities with limited relations
- The graph surfaces associations that no taxonomy could predict — "users who set tilt_angle > 15° tend to also need thicker platform_thickness" is an emergent relation, not a design rule

### WASM Module

xenos-rs compiles to wasm32-unknown-unknown via wasm-pack. The WASM module exposes:

```
// Entity lifecycle
entity_create() → EntityId
entity_exists(id) → bool

// Relations with typed modality
relate(a, b, modality, conditionality)
relations_for(entity) → [(other, modality, conditionality)]
relation_find(a, b) → Option<index>

// Encounters (design sessions)
encounter_begin(relations, publicness) → EncounterId
encounter_join(enc, entity)
encounter_conclude(enc)

// Assemblage queries (subgraph traversal)
path_between(a, b) → [EntityId]
assemblage_query(root, depth) → subgraph

// Assumptions
declare_assumption(key, value)
get_assumptions() → HashMap

// State persistence
snapshot() → JSON (serializable RuntimeState)
from_state(JSON) → runtime
```

The JS bridge (`xenos-bridge.js`) wraps these in ergonomic JS:

```javascript
const xenos = await XenosBridge.init();

// A dimension is an entity
const depth = xenos.entity("depth_210mm");
const a4_width = xenos.entity("a4_width");

// Relate them — institutional modality (both reference a standard)
xenos.relate(depth, a4_width, "institutional", "mutual");

// When user starts designing, an encounter unfolds
const session = xenos.encounter([depth, tilt, thickness], "familiar");

// Query: what else relates to this dimension?
const assemblage = xenos.assemblage(depth, { maxDepth: 3 });
```

### Formula Engine Integration

The formula engine becomes a consumer of the XENOS graph:

1. Schema loads → creates entities for each parameter, relations for each dependency
2. Formula evaluation → traverses XENOS relations (replaces current adjacency list)
3. Derived values carry provenance through the encounter that produced them
4. ISO lookup tables become public entities with institutional relations
5. User overrides are encounter-scoped — they exist in the context of this design session, not globally

### Performance Considerations

At scale (thousands of schemas, millions of dimension entities):

- **Graph traversal**: BFS/assemblage queries in compiled WASM, not interpreted JS
- **Relation indexing**: xenos-rs uses HashMap internals, O(1) entity lookup
- **Serialization**: RuntimeState snapshots via serde → JSON, stored in IndexedDB
- **Lazy loading**: WASM module loaded on first graph operation (same pattern as JSCAD)
- **Memory**: WASM linear memory for the graph, JS heap for rendering. No GC pressure on the graph

### Infrastructure Path

1. **wasm-pack** builds xenos-rs → `xenos-wasm/pkg/` (JS + WASM + TypeScript types)
2. **IndexedDB** persists RuntimeState snapshots (graph survives page reloads)
3. **Web Workers** for assemblage queries on large graphs (don't block render thread)
4. **SharedArrayBuffer** if multiple tabs need concurrent graph access
5. **Service Worker** for offline-first — graph is local, no server dependency

## Build & Run

```bash
# Current (v3 baseline — no XENOS yet)
# Just open index.html in a browser

# With XENOS WASM module (when implemented)
cd xenos-wasm && wasm-pack build --target web
# Then open index.html — xenos-bridge.js loads the WASM
```

## Zero-Server Architecture

v4 requires no backend. Everything runs in the browser:

- **Geometry kernel**: WASM. Replace JSCAD with OpenCascade.js or Manifold (fast mesh booleans, already have WASM builds) for real-time CSG. JSCAD is fine for export but too slow for real-time booleans at scale. The shader-driven preview system (v3's laptop-stand-shader.js) stays for cases where GPU deformation is faster than CSG recomputation
- **Parametric engine**: WASM. xenos-rs graph + formula resolution. All dependency resolution, assemblage queries, and encounter lifecycle in compiled code
- **Rendering**: WebGL. Three.js with PBR, shadows, tone mapping. Already working from v3
- **Persistence**: IndexedDB. Graph state (RuntimeState snapshots), cached geometry (keyed by parameter hash), user designs. Survives page reloads, works offline
- **Distribution**: Static files on a CDN. HTML + JS + WASM. No backend process, no server-side computation, no round-trips for parameter changes

### Why This Beats ShapeDiver

ShapeDiver runs Grasshopper on cloud Rhino servers. Every parameter change round-trips to their infrastructure. They charge per computation. Their architecture exists because Grasshopper requires Rhino which requires a desktop runtime — they're working around a platform dependency.

v4 has no platform dependency. The geometry kernel is WASM. The parametric engine is WASM. The rendering is WebGL. It all runs in the user's browser at zero marginal cost. A CDN serves the static files for pennies.

What ShapeDiver provides that v4 also provides:
- Parametric models with user-adjustable parameters (schema system)
- Real-time 3D preview (Three.js viewer, shader-driven updates)
- Export to manufacturing formats (STL, potentially STEP via OpenCascade)
- Embeddable (it's a web page — iframe it anywhere)

What v4 provides that ShapeDiver cannot:
- **The index graph** — parametric relationships across all designs, not isolated models
- **Encounter-scoped sessions** with provenance, publicness, assumptions
- **Client-side computation** — no server round-trip, no per-computation cost
- **Offline-first** — Service Worker + IndexedDB, works without internet
- **Emergent associations** — the graph surfaces parameter relationships that no taxonomy predicts
- **Zero infrastructure cost** — no Rhino servers, no GPU farms, no scaling headaches

### When You'd Still Want a Server

- **Collaborative index graph**: Multiple users contributing encounters to a shared graph. Could potentially use CRDTs and peer-to-peer sync instead of a central server
- **Design sharing**: Passing serialized RuntimeState between users. Could encode small states in URLs, use peer-to-peer for larger ones, or a thin relay server that stores blobs without understanding them
- **Heavy geometry**: If a design requires CSG operations that exceed browser WASM memory limits (very large assemblies). A server with more memory could run the same WASM, same code, just more headroom

But the default path is serverless. The server is an optimization for edge cases, not a requirement.

## What v4 Adds Over v3

- XENOS relation graph as the substrate for all parametric relationships
- Encounter-scoped design sessions with publicness and assumptions
- Assemblage queries for discovering cross-schema associations
- Provenance tracking on derived parameters
- Persistent index graph (IndexedDB) that grows with use
- WASM-compiled graph operations for scale
- Zero-server architecture — geometry, parametrics, and persistence all client-side
- Real-time CSG via OpenCascade.js or Manifold WASM (replacing JSCAD for preview)
- Offline-first with Service Worker
- No per-computation cost — user's hardware does the work
