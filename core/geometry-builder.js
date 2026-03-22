/**
 * Geometry Builder
 * Takes a schema's geometry section + computed parameter values,
 * produces Three.js BufferGeometry data.
 *
 * Geometry primitives are entities — their dimensions are relations
 * to parameter/derived value entities in the XENOS graph.
 */

export class GeometryBuilder {

  /**
   * Build geometry from a declarative description.
   * @param {Object} geometryDesc — schema.geometry section
   * @param {Object} computed — all resolved parameter + derived values
   * @returns {{ positions: Float32Array, normals: Float32Array, indices: Uint32Array }|null}
   */
  build(geometryDesc, computed) {
    const geometries = [];

    for (const [id, def] of Object.entries(geometryDesc)) {
      // Check visibility condition
      if (def.visible !== undefined) {
        const vis = this._resolve(def.visible, computed);
        if (!vis) continue;
      }

      const geo = this._createGeometry(def, computed);
      if (!geo) continue;

      // Apply rotation before position
      this._applyTransform(geo, def, computed);
      geometries.push(geo);

      // Mirror pattern — duplicate across axes
      if (def.mirror) {
        geometries.push(...this._createMirrors(geo, def.mirror));
      }
    }

    if (geometries.length === 0) return null;
    return this._merge(geometries);
  }

  // ─── Value Resolution ────────────────────────────────────────

  _resolve(value, computed) {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (computed[value] !== undefined) return computed[value];
      return this._eval(value, computed);
    }
    return value;
  }

  _resolveVec3(arr, computed) {
    if (!arr) return null;
    return arr.map(v => this._resolve(v, computed));
  }

  _eval(expr, computed) {
    const ctx = {
      ...computed,
      tan: Math.tan, sin: Math.sin, cos: Math.cos,
      sqrt: Math.sqrt, abs: Math.abs, min: Math.min,
      max: Math.max, pow: Math.pow, PI: Math.PI, E: Math.E
    };
    const keys = Object.keys(ctx);
    const vals = keys.map(k => ctx[k]);
    try {
      return new Function(...keys, `return (${expr});`)(...vals);
    } catch {
      return 0;
    }
  }

  // ─── Primitive Creation ──────────────────────────────────────

  _createGeometry(def, computed) {
    switch (def.type) {
      case 'box':      return this._box(def, computed);
      case 'cylinder':  return this._cylinder(def, computed);
      case 'polygon':   return this._polygon(def, computed);
      case 'sphere':    return this._sphere(def, computed);
      case 'cone':      return this._cone(def, computed);
      default:
        console.warn(`GeometryBuilder: unknown type "${def.type}"`);
        return null;
    }
  }

  _box(def, computed) {
    const w = this._resolve(def.width, computed);
    const d = this._resolve(def.depth, computed);
    const h = this._resolve(def.height, computed);

    if (def.shell) {
      return this._shellBox(w, d, h, this._resolve(def.shell, computed));
    }

    return new THREE.BoxGeometry(w, h, d);
  }

  _shellBox(w, d, h, t) {
    // Open-top box from 5 solid boxes, centered at origin
    const halfH = h / 2;
    const geos = [];

    // Bottom
    const bottom = new THREE.BoxGeometry(w, t, d);
    bottom.translate(0, -halfH + t / 2, 0);
    geos.push(bottom);

    // Left/right walls
    const wallH = h - t;
    const left = new THREE.BoxGeometry(t, wallH, d);
    left.translate(-(w - t) / 2, -halfH + t + wallH / 2, 0);
    geos.push(left);

    const right = new THREE.BoxGeometry(t, wallH, d);
    right.translate((w - t) / 2, -halfH + t + wallH / 2, 0);
    geos.push(right);

    // Front/back walls (between left and right)
    const innerW = w - 2 * t;
    const front = new THREE.BoxGeometry(innerW, wallH, t);
    front.translate(0, -halfH + t + wallH / 2, (d - t) / 2);
    geos.push(front);

    const back = new THREE.BoxGeometry(innerW, wallH, t);
    back.translate(0, -halfH + t + wallH / 2, -(d - t) / 2);
    geos.push(back);

    return this._mergeThree(geos);
  }

  _cylinder(def, computed) {
    const r = this._resolve(def.radius, computed);
    const h = this._resolve(def.height, computed);
    const segs = def.segments || 32;

    if (def.bore) {
      const bore = this._resolve(def.bore, computed);
      return this._tubeGeometry(r, bore, h, segs);
    }

    return new THREE.CylinderGeometry(r, r, h, segs);
  }

  _polygon(def, computed) {
    const sides = def.sides || 6;
    const r = this._resolve(def.radius, computed);
    const h = this._resolve(def.height, computed);

    if (def.bore) {
      const bore = this._resolve(def.bore, computed);
      return this._polygonWithBore(sides, r, bore, h);
    }

    return new THREE.CylinderGeometry(r, r, h, sides);
  }

  _polygonWithBore(sides, outerR, boreR, height) {
    // Hexagonal (or N-gon) shape with circular bore via ExtrudeGeometry
    const shape = new THREE.Shape();
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const x = Math.cos(angle) * outerR;
      const y = Math.sin(angle) * outerR;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    // Circular bore hole
    const hole = new THREE.Path();
    const hSegs = 32;
    for (let i = 0; i <= hSegs; i++) {
      const angle = (i / hSegs) * Math.PI * 2;
      const x = Math.cos(angle) * boreR;
      const y = Math.sin(angle) * boreR;
      if (i === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false
    });

    // ExtrudeGeometry extrudes along Z; rotate to Y-up and center
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, height / 2, 0);

    return geo;
  }

  _tubeGeometry(outerR, innerR, height, segments) {
    // Circular tube (cylinder with bore)
    const shape = new THREE.Shape();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * outerR;
      const y = Math.sin(angle) * outerR;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }

    const hole = new THREE.Path();
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * innerR;
      const y = Math.sin(angle) * innerR;
      if (i === 0) hole.moveTo(x, y);
      else hole.lineTo(x, y);
    }
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false
    });

    geo.rotateX(-Math.PI / 2);
    geo.translate(0, height / 2, 0);
    return geo;
  }

  _sphere(def, computed) {
    const r = this._resolve(def.radius, computed);
    const segs = def.segments || 32;
    return new THREE.SphereGeometry(r, segs, segs / 2);
  }

  _cone(def, computed) {
    const rTop = this._resolve(def.radiusTop ?? 0, computed);
    const rBot = this._resolve(def.radiusBottom ?? def.radius, computed);
    const h = this._resolve(def.height, computed);
    const segs = def.segments || 32;
    return new THREE.CylinderGeometry(rTop, rBot, h, segs);
  }

  // ─── Transforms ──────────────────────────────────────────────

  _applyTransform(geo, def, computed) {
    const rot = this._resolveVec3(def.rotation, computed);
    const pos = this._resolveVec3(def.position, computed);

    if (rot) {
      geo.rotateX(rot[0]);
      geo.rotateY(rot[1]);
      geo.rotateZ(rot[2]);
    }
    if (pos) {
      geo.translate(pos[0], pos[1], pos[2]);
    }
  }

  // ─── Mirror ──────────────────────────────────────────────────

  _createMirrors(geo, axes) {
    const mirrors = [];
    // Generate all non-empty axis combinations
    const combos = [[]];
    for (const axis of axes) {
      const len = combos.length;
      for (let i = 0; i < len; i++) {
        combos.push([...combos[i], axis]);
      }
    }

    for (const combo of combos) {
      if (combo.length === 0) continue;
      const clone = geo.clone();
      const sx = combo.includes('x') ? -1 : 1;
      const sy = combo.includes('y') ? -1 : 1;
      const sz = combo.includes('z') ? -1 : 1;
      clone.scale(sx, sy, sz);

      // Odd number of flips reverses winding — fix by swapping index pairs
      if (combo.length % 2 === 1) {
        const idx = clone.getIndex();
        if (idx) {
          const arr = new Uint32Array(idx.array);
          for (let i = 0; i < arr.length; i += 3) {
            const tmp = arr[i + 1];
            arr[i + 1] = arr[i + 2];
            arr[i + 2] = tmp;
          }
          clone.setIndex(new THREE.BufferAttribute(arr, 1));
        }
      }

      clone.computeVertexNormals();
      mirrors.push(clone);
    }

    return mirrors;
  }

  // ─── Merge ───────────────────────────────────────────────────

  _mergeThree(geos) {
    // Merge multiple THREE.BufferGeometry into one THREE.BufferGeometry
    let totalVerts = 0;
    let totalIdx = 0;

    const parts = geos.map(g => {
      // Ensure indexed + normals
      if (!g.getIndex()) {
        const count = g.getAttribute('position').count;
        const idx = new Uint32Array(count);
        for (let i = 0; i < count; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();

      const pos = g.getAttribute('position');
      const norm = g.getAttribute('normal');
      const index = g.getIndex();
      totalVerts += pos.count;
      totalIdx += index.count;
      return { pos, norm, index, count: pos.count };
    });

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIdx);
    let vOff = 0, iOff = 0;

    for (const p of parts) {
      positions.set(p.pos.array, vOff * 3);
      normals.set(p.norm.array, vOff * 3);
      for (let i = 0; i < p.index.count; i++) {
        indices[iOff + i] = p.index.array[i] + vOff;
      }
      vOff += p.count;
      iOff += p.index.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    return merged;
  }

  _merge(geos) {
    // Merge THREE.BufferGeometry array → { positions, normals, indices } for viewer
    let totalVerts = 0;
    let totalIdx = 0;

    const parts = geos.map(g => {
      if (!g.getIndex()) {
        const count = g.getAttribute('position').count;
        const idx = new Uint32Array(count);
        for (let i = 0; i < count; i++) idx[i] = i;
        g.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();

      const pos = g.getAttribute('position');
      const norm = g.getAttribute('normal');
      const index = g.getIndex();
      totalVerts += pos.count;
      totalIdx += index.count;
      return { pos, norm, index, count: pos.count };
    });

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    const indices = new Uint32Array(totalIdx);
    let vOff = 0, iOff = 0;

    for (const p of parts) {
      positions.set(p.pos.array, vOff * 3);
      normals.set(p.norm.array, vOff * 3);
      for (let i = 0; i < p.index.count; i++) {
        indices[iOff + i] = p.index.array[i] + vOff;
      }
      vOff += p.count;
      iOff += p.index.count;
    }

    return { positions, normals, indices };
  }

  // ─── STL Export ──────────────────────────────────────────────

  /**
   * Serialize geometry data to binary STL.
   * Works directly with the output of build() — no JSCAD needed.
   */
  static toSTL(geometryData) {
    const { positions, normals, indices } = geometryData;
    const numTriangles = indices.length / 3;
    const buffer = new ArrayBuffer(80 + 4 + numTriangles * 50);
    const view = new DataView(buffer);

    // Header: 80 bytes (leave as zeros)
    // Triangle count
    view.setUint32(80, numTriangles, true);

    let offset = 84;
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];

      // Face normal (average vertex normals)
      for (let c = 0; c < 3; c++) {
        const n = (normals[i0 * 3 + c] + normals[i1 * 3 + c] + normals[i2 * 3 + c]) / 3;
        view.setFloat32(offset, n, true); offset += 4;
      }

      // Three vertices
      for (const vi of [i0, i1, i2]) {
        view.setFloat32(offset, positions[vi * 3], true);     offset += 4;
        view.setFloat32(offset, positions[vi * 3 + 1], true); offset += 4;
        view.setFloat32(offset, positions[vi * 3 + 2], true); offset += 4;
      }

      // Attribute byte count
      view.setUint16(offset, 0, true); offset += 2;
    }

    return buffer;
  }
}

export default GeometryBuilder;
