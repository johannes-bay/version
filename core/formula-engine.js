/**
 * Formula Engine
 * Evaluates parameter formulas with dependency resolution
 * Supports constants/lookup tables for ISO standards and similar data
 */

export class FormulaEngine {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Parse a formula string and extract dependencies
   * Also handles lookup expressions like ISO_PITCH[size]
   */
  parseDependencies(formula, constants = {}) {
    const deps = new Set();
    // Match identifiers (variable names) but not function names followed by (
    const regex = /\b([a-z_][a-z0-9_]*)\b(?!\s*\()/gi;
    let match;

    // Get constant names to exclude them from dependencies
    const constantNames = Object.keys(constants);

    while ((match = regex.exec(formula)) !== null) {
      const name = match[1];
      // Exclude math functions, constants, and schema constants
      if (!['tan', 'sin', 'cos', 'sqrt', 'abs', 'min', 'max', 'pow', 'PI', 'E', 'Math'].includes(name) &&
          !constantNames.includes(name)) {
        deps.add(name);
      }
    }
    return Array.from(deps);
  }

  /**
   * Build a dependency DAG and return topologically sorted order
   */
  buildDependencyOrder(schema) {
    const derived = schema.derived || {};
    const params = schema.parameters || {};
    const constants = schema.constants || {};

    // Build adjacency list
    const deps = new Map();
    const allNodes = new Set();

    // Add all parameter names
    for (const name of Object.keys(params)) {
      allNodes.add(name);
      deps.set(name, []);
    }

    // Add all derived names with their dependencies
    for (const [name, def] of Object.entries(derived)) {
      allNodes.add(name);
      deps.set(name, this.parseDependencies(def.formula, constants));
    }

    // Topological sort (Kahn's algorithm)
    const inDegree = new Map();
    for (const node of allNodes) {
      inDegree.set(node, 0);
    }

    for (const [node, nodeDeps] of deps) {
      for (const dep of nodeDeps) {
        if (allNodes.has(dep)) {
          inDegree.set(node, (inDegree.get(node) || 0) + 1);
        }
      }
    }

    // Find the reverse: who depends on each node
    const dependents = new Map();
    for (const node of allNodes) {
      dependents.set(node, []);
    }
    for (const [node, nodeDeps] of deps) {
      for (const dep of nodeDeps) {
        if (dependents.has(dep)) {
          dependents.get(dep).push(node);
        }
      }
    }

    // Start with nodes that have no dependencies
    const queue = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    const order = [];
    while (queue.length > 0) {
      const node = queue.shift();
      order.push(node);

      for (const dependent of (dependents.get(node) || [])) {
        inDegree.set(dependent, inDegree.get(dependent) - 1);
        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }

    if (order.length !== allNodes.size) {
      throw new Error('Circular dependency detected in formulas');
    }

    return order;
  }

  /**
   * Create a safe evaluation context with math functions and constants
   * @param {Object} values - Current parameter/derived values
   * @param {Object} constants - Schema-defined constant lookup tables
   */
  createContext(values, constants = {}) {
    return {
      ...values,
      ...constants,
      tan: Math.tan,
      sin: Math.sin,
      cos: Math.cos,
      sqrt: Math.sqrt,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      pow: Math.pow,
      PI: Math.PI,
      E: Math.E
    };
  }

  /**
   * Evaluate a formula string with given context
   */
  evaluateFormula(formula, context) {
    // Create function body that returns the formula result
    const contextKeys = Object.keys(context);
    const contextValues = contextKeys.map(k => context[k]);

    try {
      const fn = new Function(...contextKeys, `return (${formula});`);
      return fn(...contextValues);
    } catch (e) {
      console.error(`Error evaluating formula: ${formula}`, e);
      return 0;
    }
  }

  /**
   * Evaluate all parameters and derived values
   * Returns a complete object with all computed values
   * Supports constants section for lookup tables (e.g., ISO standards)
   */
  evaluate(schema, userValues = {}) {
    const params = schema.parameters || {};
    const derived = schema.derived || {};
    const constants = schema.constants || {};

    // Start with defaults, override with user values
    const values = {};
    for (const [name, def] of Object.entries(params)) {
      // Handle 'select' type parameters - use value as-is (string)
      if (def.type === 'select') {
        values[name] = userValues[name] !== undefined ? userValues[name] : def.default;
      } else {
        values[name] = userValues[name] !== undefined ? userValues[name] : def.default;
      }
    }

    // Get evaluation order
    const order = this.buildDependencyOrder(schema);

    // Evaluate in order - include constants in context for lookups like ISO_PITCH[size]
    const context = this.createContext(values, constants);

    for (const name of order) {
      if (derived[name]) {
        const result = this.evaluateFormula(derived[name].formula, context);
        values[name] = result;
        context[name] = result;
      }
    }

    return values;
  }

  /**
   * Get only the derived values (not input parameters)
   */
  getDerivedValues(schema, userValues = {}) {
    const all = this.evaluate(schema, userValues);
    const derived = schema.derived || {};
    const result = {};

    for (const name of Object.keys(derived)) {
      result[name] = all[name];
    }

    return result;
  }
  /**
   * Register a schema's parameters and derived values as entities in the XENOS graph.
   * Creates entities for each parameter and derived value, extractive relations
   * for formula dependencies, institutional relations for constant references.
   * @param {Object} schema - The schema definition
   * @param {Object} xenos - XenosBridge instance
   * @returns {Object} Entity map { paramName: entityId }
   */
  registerSchema(schema, xenos) {
    if (!xenos) return {};

    const schemaId = schema.id || 'unknown';
    const entityMap = {};
    const params = schema.parameters || {};
    const derived = schema.derived || {};
    const constants = schema.constants || {};

    // Entity for the schema itself
    const schemaEntity = xenos.entity(`schema:${schemaId}`);

    // Create entities for parameters
    for (const name of Object.keys(params)) {
      const eid = xenos.entity(`${schemaId}:${name}`);
      entityMap[name] = eid;
      xenos.relate(eid, schemaEntity, 'institutional', 'mutual');
    }

    // Create entities for derived values and register dependency relations
    for (const [name, def] of Object.entries(derived)) {
      const eid = xenos.entity(`${schemaId}:${name}`);
      entityMap[name] = eid;
      xenos.relate(eid, schemaEntity, 'institutional', 'mutual');

      const deps = this.parseDependencies(def.formula, constants);
      for (const dep of deps) {
        if (entityMap[dep] !== undefined) {
          xenos.relate(eid, entityMap[dep], 'analytical', 'extractive');
        }
      }
    }

    // Register constant tables as public entities
    for (const tableName of Object.keys(constants)) {
      const tableEntity = xenos.entity(`const:${tableName}`);
      for (const [name, def] of Object.entries(derived)) {
        if (def.formula.includes(tableName)) {
          xenos.relate(entityMap[name], tableEntity, 'institutional', 'extractive');
        }
      }
    }

    return entityMap;
  }
}

// Default export
export default FormulaEngine;
