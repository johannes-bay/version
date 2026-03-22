//! XENOS Runtime — WASM module for the v4 parametric design platform.
//!
//! Entities, relations, encounters, assemblages, assumptions.
//! Compiles to wasm32-unknown-unknown via `wasm-pack build --target web`.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use wasm_bindgen::prelude::*;

// ─── Data Types ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Relation {
    pub a: u32,
    pub b: u32,
    pub modality: String,
    pub conditionality: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Encounter {
    pub id: u32,
    pub relations: Vec<u32>,
    pub entities: Vec<u32>,
    pub publicness: String,
    pub concluded: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuntimeState {
    pub next_entity_id: u32,
    pub next_encounter_id: u32,
    pub entities: Vec<u32>,
    pub relations: Vec<Relation>,
    pub encounters: Vec<Encounter>,
    pub assumptions: HashMap<String, String>,
}

// ─── Runtime ──────────────────────────────────────────────────────────

#[wasm_bindgen]
pub struct XenosRuntime {
    state: RuntimeState,
}

#[wasm_bindgen]
impl XenosRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            state: RuntimeState {
                next_entity_id: 0,
                next_encounter_id: 0,
                entities: Vec::new(),
                relations: Vec::new(),
                encounters: Vec::new(),
                assumptions: HashMap::new(),
            },
        }
    }

    // ─── Entity Lifecycle ─────────────────────────────────────────

    pub fn entity_create(&mut self) -> u32 {
        let id = self.state.next_entity_id;
        self.state.next_entity_id += 1;
        self.state.entities.push(id);
        id
    }

    pub fn entity_exists(&self, id: u32) -> bool {
        self.state.entities.contains(&id)
    }

    // ─── Relations ────────────────────────────────────────────────

    /// Create a relation between two entities. Returns the relation index.
    pub fn relate(&mut self, a: u32, b: u32, modality: &str, conditionality: &str) -> u32 {
        let idx = self.state.relations.len() as u32;
        self.state.relations.push(Relation {
            a,
            b,
            modality: modality.to_string(),
            conditionality: conditionality.to_string(),
        });
        idx
    }

    /// Get all relations involving an entity. Returns a JS array of objects.
    pub fn relations_for(&self, entity: u32) -> JsValue {
        let rels: Vec<serde_json::Value> = self
            .state
            .relations
            .iter()
            .enumerate()
            .filter(|(_, r)| r.a == entity || r.b == entity)
            .map(|(i, r)| {
                let other = if r.a == entity { r.b } else { r.a };
                serde_json::json!({
                    "other": other,
                    "modality": r.modality,
                    "conditionality": r.conditionality,
                    "index": i
                })
            })
            .collect();
        serde_wasm_bindgen::to_value(&rels).unwrap_or(JsValue::NULL)
    }

    /// Find a relation between two entities. Returns the index or null.
    pub fn relation_find(&self, a: u32, b: u32) -> JsValue {
        for (i, r) in self.state.relations.iter().enumerate() {
            if (r.a == a && r.b == b) || (r.a == b && r.b == a) {
                return JsValue::from(i as u32);
            }
        }
        JsValue::NULL
    }

    // ─── Encounters ──────────────────────────────────────────────

    /// Begin an encounter with a set of relation indices and a publicness level.
    pub fn encounter_begin(&mut self, relation_indices_js: JsValue, publicness: &str) -> u32 {
        let relation_indices: Vec<u32> =
            serde_wasm_bindgen::from_value(relation_indices_js).unwrap_or_default();

        let id = self.state.next_encounter_id;
        self.state.next_encounter_id += 1;

        let mut entities = Vec::new();
        for &ri in &relation_indices {
            if let Some(rel) = self.state.relations.get(ri as usize) {
                if !entities.contains(&rel.a) {
                    entities.push(rel.a);
                }
                if !entities.contains(&rel.b) {
                    entities.push(rel.b);
                }
            }
        }

        self.state.encounters.push(Encounter {
            id,
            relations: relation_indices,
            entities,
            publicness: publicness.to_string(),
            concluded: false,
        });
        id
    }

    /// Add an entity to an ongoing encounter.
    pub fn encounter_join(&mut self, enc_id: u32, entity_id: u32) {
        if let Some(enc) = self.state.encounters.iter_mut().find(|e| e.id == enc_id) {
            if !enc.concluded && !enc.entities.contains(&entity_id) {
                enc.entities.push(entity_id);
            }
        }
    }

    /// Conclude an encounter.
    pub fn encounter_conclude(&mut self, enc_id: u32) {
        if let Some(enc) = self.state.encounters.iter_mut().find(|e| e.id == enc_id) {
            enc.concluded = true;
        }
    }

    // ─── Assemblage Queries ──────────────────────────────────────

    /// BFS shortest path between two entities. Returns array of entity IDs.
    pub fn path_between(&self, a: u32, b: u32) -> JsValue {
        if a == b {
            return serde_wasm_bindgen::to_value(&vec![a]).unwrap_or(JsValue::NULL);
        }

        let mut adj: HashMap<u32, Vec<u32>> = HashMap::new();
        for r in &self.state.relations {
            adj.entry(r.a).or_default().push(r.b);
            adj.entry(r.b).or_default().push(r.a);
        }

        let mut visited = HashSet::new();
        visited.insert(a);
        let mut queue = VecDeque::new();
        queue.push_back(vec![a]);

        while let Some(path) = queue.pop_front() {
            let node = *path.last().unwrap();
            if let Some(neighbors) = adj.get(&node) {
                for &neighbor in neighbors {
                    if neighbor == b {
                        let mut result = path.clone();
                        result.push(b);
                        return serde_wasm_bindgen::to_value(&result)
                            .unwrap_or(JsValue::NULL);
                    }
                    if !visited.contains(&neighbor) {
                        visited.insert(neighbor);
                        let mut new_path = path.clone();
                        new_path.push(neighbor);
                        queue.push_back(new_path);
                    }
                }
            }
        }

        serde_wasm_bindgen::to_value(&Vec::<u32>::new()).unwrap_or(JsValue::NULL)
    }

    /// Subgraph traversal from a root entity up to a given depth.
    /// Returns { entities: [id, ...], relations: [{ a, b, modality, conditionality }, ...] }
    pub fn assemblage_query(&self, root: u32, depth: u32) -> JsValue {
        let mut entities = vec![root];
        let mut relation_indices = Vec::new();
        let mut visited = HashSet::new();
        visited.insert(root);
        let mut frontier = vec![root];

        for _ in 0..depth {
            let mut next_frontier = Vec::new();
            for &entity in &frontier {
                for (i, r) in self.state.relations.iter().enumerate() {
                    let other = if r.a == entity {
                        Some(r.b)
                    } else if r.b == entity {
                        Some(r.a)
                    } else {
                        None
                    };
                    if let Some(o) = other {
                        if !visited.contains(&o) {
                            visited.insert(o);
                            entities.push(o);
                            relation_indices.push(i);
                            next_frontier.push(o);
                        }
                    }
                }
            }
            frontier = next_frontier;
            if frontier.is_empty() {
                break;
            }
        }

        let relations: Vec<&Relation> = relation_indices
            .iter()
            .filter_map(|&i| self.state.relations.get(i))
            .collect();

        serde_wasm_bindgen::to_value(&serde_json::json!({
            "entities": entities,
            "relations": relations
        }))
        .unwrap_or(JsValue::NULL)
    }

    // ─── Assumptions ─────────────────────────────────────────────

    pub fn declare_assumption(&mut self, key: &str, value: &str) {
        self.state
            .assumptions
            .insert(key.to_string(), value.to_string());
    }

    pub fn get_assumptions(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.state.assumptions).unwrap_or(JsValue::NULL)
    }

    // ─── State Persistence ──────────────────────────────────────

    /// Serialize the entire runtime state to a JS object.
    pub fn snapshot(&self) -> JsValue {
        serde_wasm_bindgen::to_value(&self.state).unwrap_or(JsValue::NULL)
    }

    /// Restore a runtime from a previously serialized state.
    pub fn from_state(state: JsValue) -> Result<XenosRuntime, JsValue> {
        let s: RuntimeState = serde_wasm_bindgen::from_value(state)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(XenosRuntime { state: s })
    }
}
