/**
 * XENOS Graph View — Dual-mode explorer for cross-schema connections.
 * Canvas 2D rendering, no dependencies.
 *
 * Overview: force-directed graph of schemas + shared constants
 * Explore: radial assemblage expansion from any entity
 */

const COLORS = {
  schema: '#4a9eff',
  constant: '#ff6b6b',
  parameter: '#51cf66',
  derived: '#ffd43b',
  geometry: '#ff922b',
  other: '#aaa',
  edge: 'rgba(255,255,255,0.12)',
  edgeHighlight: 'rgba(255,255,255,0.5)',
  bg: 'rgba(18,18,18,0.95)',
  panel: '#2a2a2a',
  text: '#ccc',
  textDim: '#666',
};

function entityType(name) {
  if (name.startsWith('schema:')) return 'schema';
  if (name.startsWith('const:')) return 'constant';
  if (name.includes(':geo:')) return 'geometry';
  // Derived values and parameters both contain schemaId:name
  // We can't distinguish without schema data, so default to parameter
  return 'parameter';
}

function shortName(name) {
  if (name.startsWith('schema:')) return name.slice(7);
  if (name.startsWith('const:')) return name.slice(6);
  if (name.includes(':geo:')) return name.split(':geo:')[1];
  if (name.includes(':')) return name.split(':').slice(1).join(':');
  return name;
}

export class GraphView {
  constructor(container) {
    this._container = container;
    this._overlay = null;
    this._canvas = null;
    this._ctx = null;
    this._xenos = null;
    this._registry = null;
    this._mode = 'overview'; // 'overview' | 'explore'
    this._nodes = [];
    this._edges = [];
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._dragNode = null;
    this._dragStart = null;
    this._isPanning = false;
    this._hoveredNode = null;
    this._selectedNode = null;
    this._highlightSet = new Set();
    this._animFrame = null;
    this._simulationEnergy = Infinity;
    this._exploreRoot = null;
    this._exploreDepth = 0;
    this._exploreExpanded = new Set();
    this._visible = false;
  }

  show(xenos, registry) {
    this._xenos = xenos;
    this._registry = registry;
    this._visible = true;
    this._createOverlay();
    this._switchMode('overview');
  }

  hide() {
    this._visible = false;
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
  }

  // ─── Overlay UI ──────────────────────────────────────────────

  _createOverlay() {
    if (this._overlay) this._overlay.remove();

    const ov = document.createElement('div');
    ov.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background:${COLORS.bg};z-index:100;display:flex;flex-direction:column;`;

    // Top bar
    const bar = document.createElement('div');
    bar.style.cssText = `display:flex;align-items:center;padding:8px 16px;gap:8px;background:${COLORS.panel};border-bottom:1px solid #3a3a3a;flex-shrink:0;`;

    const makeTab = (label, mode) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset.mode = mode;
      btn.style.cssText = `padding:6px 16px;border:1px solid #4a4a4a;border-radius:4px;background:${mode === this._mode ? '#4a9eff' : '#3a3a3a'};color:#fff;cursor:pointer;font-size:12px;`;
      btn.addEventListener('click', () => this._switchMode(mode));
      return btn;
    };

    this._tabOverview = makeTab('Overview', 'overview');
    this._tabExplore = makeTab('Explore', 'explore');
    bar.appendChild(this._tabOverview);
    bar.appendChild(this._tabExplore);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    bar.appendChild(spacer);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:12px;align-items:center;font-size:10px;color:#888;';
    for (const [type, color] of [['schema', COLORS.schema], ['constant', COLORS.constant], ['param', COLORS.parameter], ['derived', COLORS.derived], ['geometry', COLORS.geometry]]) {
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-flex;align-items:center;gap:3px;`;
      dot.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>${type}`;
      legend.appendChild(dot);
    }
    bar.appendChild(legend);

    // Close button
    const close = document.createElement('button');
    close.textContent = '\u2715';
    close.style.cssText = 'margin-left:12px;padding:4px 10px;border:1px solid #4a4a4a;border-radius:4px;background:#3a3a3a;color:#ccc;cursor:pointer;font-size:14px;';
    close.addEventListener('click', () => this.hide());
    bar.appendChild(close);

    ov.appendChild(bar);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'flex:1;cursor:grab;';
    ov.appendChild(canvas);

    this._container.appendChild(ov);
    this._overlay = ov;
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');

    // Size canvas
    this._resize();
    window.addEventListener('resize', this._onResize);

    // Mouse events
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    canvas.addEventListener('wheel', (e) => this._onWheel(e));
    canvas.addEventListener('dblclick', (e) => this._onDblClick(e));

    // Keyboard
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        if (this._mode === 'explore' && this._exploreRoot) {
          this._switchMode('overview');
        } else {
          this.hide();
        }
      }
    };
    document.addEventListener('keydown', keyHandler);
    this._keyHandler = keyHandler;
  }

  _onResize = () => this._resize();

  _resize() {
    if (!this._canvas) return;
    const rect = this._canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = (rect.height - 40) * dpr; // minus top bar
    this._canvas.style.width = rect.width + 'px';
    this._canvas.style.height = (rect.height - 40) + 'px';
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = rect.width;
    this._h = rect.height - 40;
  }

  _switchMode(mode) {
    this._mode = mode;
    this._tabOverview.style.background = mode === 'overview' ? '#4a9eff' : '#3a3a3a';
    this._tabExplore.style.background = mode === 'explore' ? '#4a9eff' : '#3a3a3a';
    this._hoveredNode = null;
    this._selectedNode = null;
    this._highlightSet.clear();

    if (mode === 'overview') {
      this._buildOverviewGraph();
      this._zoom = 1;
      this._panX = 0;
      this._panY = 0;
      this._simulationEnergy = Infinity;
      this._startSimulation();
    } else {
      if (!this._exploreRoot) {
        // Default: explore from the first schema
        const firstName = [...this._xenos._names.keys()].find(n => n.startsWith('schema:'));
        if (firstName) this._exploreRoot = this._xenos._names.get(firstName);
      }
      this._exploreExpanded = new Set();
      this._exploreDepth = 0;
      this._buildExploreGraph(this._exploreRoot);
      this._zoom = 1;
      this._panX = 0;
      this._panY = 0;
      this._startRender();
    }
  }

  // ─── Data Extraction ─────────────────────────────────────────

  _buildOverviewGraph() {
    const xenos = this._xenos;
    const snapshot = xenos.snapshot();
    const names = xenos._names;
    const ids = xenos._ids;

    // Find all constant entities and which schemas reference them
    const constSchemaMap = new Map(); // constId → Set<schemaId>
    const schemaSet = new Set();

    for (const [name, id] of names) {
      if (name.startsWith('schema:')) schemaSet.add(id);
    }

    // For each relation, if one side is a const entity, find the schema of the other
    for (const rel of snapshot.relations) {
      const aName = ids.get(rel.entity_a) || '';
      const bName = ids.get(rel.entity_b) || '';

      let constId = null, otherName = null;
      if (aName.startsWith('const:')) { constId = rel.entity_a; otherName = bName; }
      if (bName.startsWith('const:')) { constId = rel.entity_b; otherName = aName; }

      if (constId !== null && otherName && otherName.includes(':')) {
        const schemaPrefix = otherName.split(':')[0];
        const schemaId = names.get(`schema:${schemaPrefix}`);
        if (schemaId !== undefined) {
          if (!constSchemaMap.has(constId)) constSchemaMap.set(constId, new Set());
          constSchemaMap.get(constId).add(schemaId);
        }
      }
    }

    // Only include constants connected to 2+ schemas
    const sharedConsts = new Map();
    for (const [cid, schemas] of constSchemaMap) {
      if (schemas.size >= 2) sharedConsts.set(cid, schemas);
    }

    // Build nodes
    const nodes = [];
    const nodeIndex = new Map(); // entityId → node index

    // Schema nodes
    const registryMap = new Map();
    if (this._registry) {
      for (const s of this._registry) registryMap.set(s.id, s);
    }

    for (const schemaId of schemaSet) {
      const name = ids.get(schemaId);
      const sId = name.slice(7); // remove 'schema:'
      const regEntry = registryMap.get(sId);
      const idx = nodes.length;
      nodeIndex.set(schemaId, idx);
      nodes.push({
        id: schemaId, name, label: sId, type: 'schema',
        category: regEntry?.category || 'general',
        x: (Math.random() - 0.5) * this._w * 0.6,
        y: (Math.random() - 0.5) * this._h * 0.6,
        vx: 0, vy: 0, radius: 6,
      });
    }

    // Constant hub nodes
    for (const [cid, schemas] of sharedConsts) {
      const name = ids.get(cid) || `entity:${cid}`;
      const idx = nodes.length;
      nodeIndex.set(cid, idx);
      nodes.push({
        id: cid, name, label: shortName(name), type: 'constant',
        x: (Math.random() - 0.5) * this._w * 0.4,
        y: (Math.random() - 0.5) * this._h * 0.4,
        vx: 0, vy: 0, radius: 4 + Math.min(schemas.size * 0.5, 12),
      });
    }

    // Build edges (constant → schema)
    const edges = [];
    for (const [cid, schemas] of sharedConsts) {
      const ci = nodeIndex.get(cid);
      if (ci === undefined) continue;
      for (const sid of schemas) {
        const si = nodeIndex.get(sid);
        if (si !== undefined) {
          edges.push({ source: ci, target: si });
        }
      }
    }

    this._nodes = nodes;
    this._edges = edges;
  }

  _buildExploreGraph(rootId) {
    const xenos = this._xenos;
    const ids = xenos._ids;
    const names = xenos._names;

    // BFS from root, expanding one level at a time based on exploreExpanded
    const visited = new Set([rootId]);
    const layers = [[rootId]];
    const allRelations = [];

    // Always show at least depth 1
    let currentIds = [rootId];
    for (let d = 0; d <= this._exploreDepth; d++) {
      const nextIds = [];
      for (const eid of currentIds) {
        const rels = xenos.relationsFor(eid);
        for (const rel of rels) {
          allRelations.push({ from: eid, to: rel.other, modality: rel.modality, conditionality: rel.conditionality });
          if (!visited.has(rel.other)) {
            visited.add(rel.other);
            nextIds.push(rel.other);
          }
        }
      }
      if (nextIds.length > 0) layers.push(nextIds);
      currentIds = nextIds;
    }

    // Build nodes with radial layout
    const nodes = [];
    const nodeIndex = new Map();
    const cx = 0, cy = 0;

    for (let layer = 0; layer < layers.length; layer++) {
      const ring = layers[layer];
      const radius = layer * 120;
      for (let i = 0; i < ring.length; i++) {
        const eid = ring[i];
        const name = ids.get(eid) || `entity:${eid}`;
        const angle = ring.length === 1 ? 0 : (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        const idx = nodes.length;
        nodeIndex.set(eid, idx);
        const type = entityType(name);
        nodes.push({
          id: eid, name, label: shortName(name), type,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: 0, vy: 0,
          radius: type === 'schema' ? 8 : type === 'constant' ? 7 : 5,
          layer,
        });
      }
    }

    // Build edges
    const edges = [];
    const edgeSet = new Set();
    for (const rel of allRelations) {
      const si = nodeIndex.get(rel.from);
      const ti = nodeIndex.get(rel.to);
      if (si !== undefined && ti !== undefined) {
        const key = Math.min(si, ti) + ':' + Math.max(si, ti);
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: si, target: ti, modality: rel.modality, conditionality: rel.conditionality });
        }
      }
    }

    this._nodes = nodes;
    this._edges = edges;
  }

  // ─── Force Simulation (Overview) ─────────────────────────────

  _startSimulation() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    const tick = () => {
      if (!this._visible) return;
      this._simulateTick();
      this._render();
      if (this._simulationEnergy > 0.1) {
        this._animFrame = requestAnimationFrame(tick);
      }
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  _startRender() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._render();
  }

  _simulateTick() {
    const nodes = this._nodes;
    const edges = this._edges;
    const n = nodes.length;
    if (n === 0) return;

    let energy = 0;

    // Repulsion (inverse square)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let force = 800 / (dist * dist);
        let fx = (dx / dist) * force;
        let fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction (springs along edges)
    for (const e of edges) {
      const a = nodes[e.source], b = nodes[e.target];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      let force = (dist - 80) * 0.005;
      let fx = (dx / dist) * force;
      let fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Center gravity
    for (const node of nodes) {
      node.vx -= node.x * 0.001;
      node.vy -= node.y * 0.001;
    }

    // Apply velocity with damping
    for (const node of nodes) {
      if (node === this._dragNode) continue;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      energy += node.vx * node.vx + node.vy * node.vy;
    }

    this._simulationEnergy = energy;
  }

  // ─── Rendering ────────────────────────────────────────────────

  _render() {
    const ctx = this._ctx;
    const w = this._w;
    const h = this._h;
    if (!ctx || !w) return;

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Transform: center + pan + zoom
    ctx.translate(w / 2 + this._panX, h / 2 + this._panY);
    ctx.scale(this._zoom, this._zoom);

    // Draw edges
    for (const e of this._edges) {
      const a = this._nodes[e.source];
      const b = this._nodes[e.target];
      const highlighted = this._highlightSet.has(e.source) && this._highlightSet.has(e.target);
      ctx.strokeStyle = highlighted ? COLORS.edgeHighlight : COLORS.edge;
      ctx.lineWidth = highlighted ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Edge labels in explore mode
      if (this._mode === 'explore' && e.modality && this._zoom > 0.6) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.fillStyle = COLORS.textDim;
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.modality, mx, my - 3);
      }
    }

    // Draw nodes
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      const isHovered = node === this._hoveredNode;
      const isSelected = node === this._selectedNode;
      const isHighlighted = this._highlightSet.has(i);
      const color = COLORS[node.type] || COLORS.other;
      const r = node.radius * (isHovered ? 1.3 : 1);

      // Glow for highlighted/selected
      if (isSelected || isHighlighted) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '33';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = (isHighlighted || isHovered || isSelected) ? color : color + 'cc';
      ctx.fill();

      // Border
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      if (this._zoom > 0.4 || isHovered || isHighlighted || node.type === 'constant') {
        ctx.fillStyle = isHovered ? '#fff' : COLORS.text;
        ctx.font = `${isHovered ? 'bold ' : ''}${node.type === 'schema' || node.type === 'constant' ? 10 : 8}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + r + 12);
      }
    }

    ctx.restore();

    // Info tooltip for hovered node
    if (this._hoveredNode) {
      const n = this._hoveredNode;
      const connCount = this._edges.filter(e => this._nodes[e.source] === n || this._nodes[e.target] === n).length;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(10, h - 40, 300, 30);
      ctx.fillStyle = COLORS.text;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${n.name}  (${connCount} connections)`, 16, h - 21);
    }

    // Explore mode depth indicator
    if (this._mode === 'explore') {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Depth: ${this._exploreDepth}  |  Click nodes to expand  |  Double-click to recenter`, 12, 20);
    }
  }

  // ─── Interaction ──────────────────────────────────────────────

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._w / 2 - this._panX) / this._zoom,
      y: (sy - this._h / 2 - this._panY) / this._zoom,
    };
  }

  _hitTest(sx, sy) {
    const { x, y } = this._screenToWorld(sx, sy);
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy < (n.radius + 4) * (n.radius + 4)) return n;
    }
    return null;
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this._dragNode) {
      const { x, y } = this._screenToWorld(sx, sy);
      this._dragNode.x = x;
      this._dragNode.y = y;
      this._dragNode.vx = 0;
      this._dragNode.vy = 0;
      if (this._mode === 'overview') this._simulationEnergy = 10;
      else this._render();
      return;
    }

    if (this._isPanning) {
      this._panX += e.movementX;
      this._panY += e.movementY;
      if (this._mode !== 'overview') this._render();
      return;
    }

    const node = this._hitTest(sx, sy);
    if (node !== this._hoveredNode) {
      this._hoveredNode = node;
      this._canvas.style.cursor = node ? 'pointer' : 'grab';

      // Highlight connected nodes
      this._highlightSet.clear();
      if (node) {
        const idx = this._nodes.indexOf(node);
        this._highlightSet.add(idx);
        for (const e of this._edges) {
          if (e.source === idx) this._highlightSet.add(e.target);
          if (e.target === idx) this._highlightSet.add(e.source);
        }
      }
      if (this._mode !== 'overview') this._render();
    }
  }

  _onMouseDown(e) {
    const rect = this._canvas.getBoundingClientRect();
    const node = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);

    if (e.button === 2 || (e.button === 0 && e.altKey)) {
      // Pan
      e.preventDefault();
      this._isPanning = true;
      this._canvas.style.cursor = 'grabbing';
      return;
    }

    if (node) {
      this._dragNode = node;
      this._dragStart = { x: node.x, y: node.y };
      this._canvas.style.cursor = 'grabbing';
    } else {
      this._isPanning = true;
      this._canvas.style.cursor = 'grabbing';
    }
  }

  _onMouseUp(e) {
    if (this._dragNode) {
      const dx = this._dragNode.x - this._dragStart.x;
      const dy = this._dragNode.y - this._dragStart.y;
      const wasDrag = Math.abs(dx) > 3 || Math.abs(dy) > 3;

      if (!wasDrag) {
        // Click — not a drag
        this._handleNodeClick(this._dragNode);
      }
      this._dragNode = null;
    }
    this._isPanning = false;
    this._canvas.style.cursor = this._hoveredNode ? 'pointer' : 'grab';
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this._zoom = Math.max(0.1, Math.min(5, this._zoom * factor));
    if (this._mode !== 'overview') this._render();
  }

  _onDblClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const node = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (node && this._mode === 'explore') {
      // Recenter exploration on this node
      this._exploreRoot = node.id;
      this._exploreDepth = 1;
      this._exploreExpanded.clear();
      this._buildExploreGraph(this._exploreRoot);
      this._panX = 0;
      this._panY = 0;
      this._render();
    }
  }

  _handleNodeClick(node) {
    if (this._mode === 'overview') {
      if (node.type === 'schema') {
        // Drill into this schema via Explore tab
        this._exploreRoot = node.id;
        this._exploreDepth = 1;
        this._exploreExpanded.clear();
        this._switchMode('explore');
      } else if (node.type === 'constant') {
        // Highlight all schemas connected to this constant
        this._selectedNode = node;
        this._highlightSet.clear();
        const idx = this._nodes.indexOf(node);
        this._highlightSet.add(idx);
        for (const e of this._edges) {
          if (e.source === idx) this._highlightSet.add(e.target);
          if (e.target === idx) this._highlightSet.add(e.source);
        }
      }
    } else if (this._mode === 'explore') {
      // Expand depth
      this._exploreDepth++;
      this._buildExploreGraph(this._exploreRoot);
      this._render();
    }
  }
}

export default GraphView;
