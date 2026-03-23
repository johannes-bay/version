/**
 * Configurator Controller (v4.1)
 * Split architecture: Three.js-native preview + JSCAD for STL export.
 * XENOS graph as relational index. IndexedDB persistence. Offline-first.
 */

import { FormulaEngine } from '../core/formula-engine.js';
import { ThreeViewer } from './three-viewer.js';
import { XenosBridge } from '../core/xenos-bridge.js';
import { SchemaStore } from '../core/schema-store.js';
import { GeometryBuilder } from '../core/geometry-builder.js';
import { GraphView } from './graph-view.js';

export class Configurator {
  constructor() {
    this.schema = null;
    this.formulaEngine = new FormulaEngine();
    this.viewer = null;
    this.currentParams = {};
    this.displayParams = {};
    this.lastComputedHash = null;
    this.isUpdating = false;
    this.needsRebuild = false;

    // Design type
    this.currentDesignType = 'laptop-stand';

    // Shader mesh (for designs that support it)
    this.shaderMesh = null;
    this.shaderUpdate = null;

    // Smooth transitions
    this.lerpSpeed = 0.15;
    this.animationFrame = null;

    // v4.1: XENOS graph + persistence + declarative geometry
    this.xenos = null;
    this.store = null;
    this.geometryBuilder = new GeometryBuilder();
    this.graphView = null;
    this.entityMap = {};
    this.currentEncounter = null;
    this._previewModule = null;  // cached custom preview module
    this._exportModule = null;   // cached custom export module
    this._saveParamsTimer = null;

    this.init();
  }

  async init() {
    const container = document.getElementById('canvas-container');
    this.viewer = new ThreeViewer(container);

    // Initialize XENOS graph and schema store
    this.xenos = await XenosBridge.init();
    this.store = await new SchemaStore().init();

    // Populate design selector from registry
    this.setupDesignSelector();

    await this.loadSchema();
    this.setupControls();
    this.setupPresets();
    this.setupViewButtons();
    this.setupViewSettings();
    this.setupExportButton();
    this.startAnimationLoop();

    // Initial geometry build
    this.rebuildPreview();

    // Background: register ALL schemas in the XENOS graph so the
    // graph view shows the full cross-schema connection picture.
    this._registerAllSchemas();
  }

  setupDesignSelector() {
    const select = document.getElementById('design-type-select');
    if (!select) return;
    const schemas = this.store.getSchemas();
    select.innerHTML = schemas.map(s =>
      `<option value="${s.id}" ${s.id === this.currentDesignType ? 'selected' : ''}>${s.name}</option>`
    ).join('');
    select.addEventListener('change', async () => {
      await this.switchDesignType(select.value);
    });
  }

  async switchDesignType(newType) {
    if (newType === this.currentDesignType) return;

    // Conclude the current encounter
    if (this.currentEncounter !== null && this.xenos) {
      this.xenos.encounterConclude(this.currentEncounter);
      this.currentEncounter = null;
    }

    this.currentDesignType = newType;
    this.lastComputedHash = null;

    // Clear preview state when switching
    if (this.shaderMesh) {
      this.viewer.clearMesh();
      this.shaderMesh = null;
      this.shaderUpdate = null;
    }
    this._previewModule = null;
    this._exportModule = null;

    await this.loadSchema();
    this.rebuildUI();
    this.rebuildPreview();
  }

  async loadSchema() {
    // Load schema via store (cached in IndexedDB)
    this.schema = await this.store.loadSchema(this.currentDesignType);

    // Set defaults
    this.currentParams = {};
    this.displayParams = {};
    for (const [name, def] of Object.entries(this.schema.parameters)) {
      this.currentParams[name] = def.default;
      this.displayParams[name] = def.default;
    }

    // Restore saved parameter overrides
    const savedParams = await this.store.loadParams(this.currentDesignType);
    if (savedParams) {
      for (const [name, value] of Object.entries(savedParams)) {
        if (name in this.currentParams) {
          this.currentParams[name] = value;
          this.displayParams[name] = value;
        }
      }
    }

    // Register schema entities/relations in the XENOS graph
    if (this.xenos) {
      this.entityMap = this.formulaEngine.registerSchema(this.schema, this.xenos);

      // Begin a design encounter
      const entityIds = Object.values(this.entityMap);
      if (entityIds.length > 0) {
        this.currentEncounter = this.xenos.encounter(entityIds, 'familiar');
      }
    }

    // Load custom preview module if specified in registry
    const entry = this.store.getSchemas().find(s => s.id === this.currentDesignType);
    if (entry && entry.preview) {
      try {
        const url = new URL(entry.preview, location.href).href;
        this._previewModule = await import(url);
      } catch (e) {
        console.warn('Failed to load preview module:', e);
        this._previewModule = null;
      }
    }

    // Update title
    const titleEl = document.querySelector('#controls h1');
    if (titleEl) titleEl.textContent = this.schema.name || 'Design';
  }

  rebuildUI() {
    document.getElementById('parameters').innerHTML = '';
    document.getElementById('presets').innerHTML = '';
    const derivedContainer = document.getElementById('derived-values');
    if (derivedContainer) derivedContainer.innerHTML = '';
    this.setupControls();
    this.setupPresets();
  }

  startAnimationLoop() {
    const animate = () => {
      this.animationFrame = requestAnimationFrame(animate);
      this.updateDisplayParams();
    };
    animate();
  }

  updateDisplayParams() {
    let changed = false;

    for (const [name, def] of Object.entries(this.schema.parameters)) {
      const current = this.displayParams[name];
      const target = this.currentParams[name];

      if (def.type === 'boolean' || def.type === 'select') {
        if (current !== target) {
          this.displayParams[name] = target;
          changed = true;
        }
      } else {
        const diff = target - current;
        if (Math.abs(diff) > 0.01) {
          this.displayParams[name] = current + diff * this.lerpSpeed;
          changed = true;
        } else if (current !== target) {
          this.displayParams[name] = target;
          changed = true;
        }
      }
    }

    if (changed) {
      const computed = this.formulaEngine.evaluate(this.schema, this.displayParams);
      this.updateDerivedDisplay(computed);
      this.updateSliderDisplays();
      this.rebuildPreview(computed);
    }
  }

  updateSliderDisplays() {
    for (const [name, def] of Object.entries(this.schema.parameters)) {
      if (def.type === 'boolean' || def.type === 'select') continue;
      const value = this.displayParams[name];
      const input = document.getElementById(name);
      const valSpan = document.getElementById(`${name}-val`);
      if (input && !input.matches(':active')) input.value = value;
      if (valSpan) {
        const step = def.step || 1;
        const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
        valSpan.textContent = value.toFixed(decimals);
      }
    }
  }

  /**
   * Rebuild preview geometry.
   * Dispatches based on registry:
   *   - Custom shader module → update uniforms (GPU-driven)
   *   - Custom primitive module → rebuild geometry
   *   - Declarative geometry in schema → use geometry builder
   */
  rebuildPreview(computed) {
    if (!computed) {
      computed = this.formulaEngine.evaluate(this.schema, this.displayParams);
    }

    if (this._previewModule) {
      // Legacy custom preview module
      if (this._previewModule.createLaptopStandShader) {
        // Shader strategy: build once, then update uniforms
        if (!this.shaderMesh) {
          const { mesh, updateParams } = this._previewModule.createLaptopStandShader();
          this.shaderMesh = mesh;
          this.shaderUpdate = updateParams;
          this.viewer.setMesh(mesh, true);
        }
        this.shaderUpdate(computed);
      } else if (this._previewModule.createISOScrewPreview) {
        // Primitive strategy: rebuild on change
        const hash = JSON.stringify(computed);
        if (hash === this.lastComputedHash) return;
        this.lastComputedHash = hash;
        const geoData = this._previewModule.createISOScrewPreview(computed);
        if (geoData) this.viewer.updateModel(geoData, false);
      }
    } else if (this.schema.geometry) {
      // Declarative geometry — generic builder
      const hash = JSON.stringify(computed);
      if (hash === this.lastComputedHash) return;
      this.lastComputedHash = hash;
      try {
        const geoData = this.geometryBuilder.build(this.schema.geometry, computed);
        if (geoData) this.viewer.updateModel(geoData, false);
      } catch (e) {
        console.error('Geometry build failed:', e);
      }
    }
  }

  setupControls() {
    const controlsContainer = document.getElementById('parameters');
    const groups = {};
    for (const [name, def] of Object.entries(this.schema.parameters)) {
      const group = def.group || 'other';
      if (!groups[group]) groups[group] = [];
      groups[group].push({ name, ...def });
    }

    const sortedGroups = Object.entries(this.schema.groups || {})
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      .map(([id, def]) => ({ id, ...def }));

    for (const group of sortedGroups) {
      const params = groups[group.id] || [];
      if (params.length === 0) continue;
      const section = document.createElement('div');
      section.className = 'section';
      section.innerHTML = `<div class="section-title">${group.label}</div>`;
      for (const param of params) {
        if (param.type === 'boolean') section.appendChild(this.createCheckbox(param));
        else if (param.type === 'select') section.appendChild(this.createSelect(param));
        else section.appendChild(this.createSlider(param));
      }
      controlsContainer.appendChild(section);
    }
  }

  createSlider(param) {
    const div = document.createElement('div');
    div.className = 'param';
    const unit = param.unit === 'deg' ? '\u00B0' : (param.unit || 'mm');
    const val = this.currentParams[param.name] ?? param.default;
    div.innerHTML = `
      <label>${param.label} <span id="${param.name}-val">${val}</span>${unit}</label>
      <input type="range" id="${param.name}" min="${param.min}" max="${param.max}" step="${param.step || 1}" value="${val}">
    `;
    const slider = div.querySelector('input');
    slider.addEventListener('input', () => {
      this.currentParams[param.name] = parseFloat(slider.value);
      div.querySelector('span').textContent = slider.value;
      this._persistParams();
    });
    return div;
  }

  createCheckbox(param) {
    const div = document.createElement('div');
    div.className = 'param checkbox';
    const checked = this.currentParams[param.name] ?? param.default;
    div.innerHTML = `<label class="checkbox-label"><input type="checkbox" id="${param.name}" ${checked ? 'checked' : ''}> ${param.label}</label>`;
    div.querySelector('input').addEventListener('change', (e) => {
      this.currentParams[param.name] = e.target.checked;
      this._persistParams();
    });
    return div;
  }

  createSelect(param) {
    const div = document.createElement('div');
    div.className = 'param';
    div.innerHTML = `
      <label for="${param.name}">${param.label}</label>
      <select id="${param.name}">
        ${param.options.map(opt => `<option value="${opt}" ${opt === (this.currentParams[param.name] ?? param.default) ? 'selected' : ''}>${opt}</option>`).join('')}
      </select>
      ${param.description ? `<div class="param-description">${param.description}</div>` : ''}
    `;
    div.querySelector('select').addEventListener('change', (e) => {
      this.currentParams[param.name] = e.target.value;
      this._persistParams();
    });
    return div;
  }

  setupPresets() {
    const presetsContainer = document.getElementById('presets');
    for (const [id, preset] of Object.entries(this.schema.presets || {})) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => this.applyPreset(id));
      presetsContainer.appendChild(btn);
    }
  }

  applyPreset(presetId) {
    const preset = this.schema.presets[presetId];
    if (!preset) return;
    for (const [name, value] of Object.entries(preset.values)) {
      this.currentParams[name] = value;
      const input = document.getElementById(name);
      if (input) {
        if (input.type === 'checkbox') input.checked = value;
        else if (input.tagName === 'SELECT') input.value = value;
        else {
          input.value = value;
          const valSpan = document.getElementById(`${name}-val`);
          if (valSpan) valSpan.textContent = value;
        }
      }
    }
    this._persistParams();
  }

  /**
   * Debounced save of current parameters to IndexedDB.
   */
  _persistParams() {
    if (!this.store) return;
    clearTimeout(this._saveParamsTimer);
    this._saveParamsTimer = setTimeout(() => {
      this.store.saveParams(this.currentDesignType, { ...this.currentParams });
    }, 500);
  }

  /**
   * Register all schemas in the XENOS graph (background).
   * Fetches every schema in parallel and registers entities/relations
   * so the graph view shows the full cross-schema picture.
   */
  async _registerAllSchemas() {
    const all = this.store.getSchemas();
    const pending = all.filter(s => s.id !== this.currentDesignType);
    await Promise.all(pending.map(async (entry) => {
      try {
        const schema = await this.store.loadSchema(entry.id);
        this.formulaEngine.registerSchema(schema, this.xenos);
      } catch { /* skip failures */ }
    }));
    console.log(`XENOS: registered ${all.length} schemas in graph`);
  }

  setupViewButtons() {
    document.querySelectorAll('#view-buttons .view-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.viewer.setView(btn.dataset.view));
    });
    const fitBtn = document.getElementById('fit-btn');
    if (fitBtn) {
      fitBtn.addEventListener('click', () => this.viewer.fitToModel(true));
    }

    // Graph view toggle
    const graphBtn = document.getElementById('toggle-graph');
    if (graphBtn) {
      const container = document.getElementById('canvas-container');
      this.graphView = new GraphView(container);
      graphBtn.addEventListener('click', () => {
        if (this.graphView._visible) {
          this.graphView.hide();
        } else {
          this.graphView.show(this.xenos, this.store.getSchemas());
        }
      });
    }
  }

  setupViewSettings() {
    const toggleBtn = document.getElementById('toggle-settings');
    const panel = document.getElementById('view-settings');
    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      toggleBtn.style.display = panel.classList.contains('hidden') ? 'flex' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== toggleBtn) {
        panel.classList.add('hidden');
        toggleBtn.style.display = 'flex';
      }
    });

    // Color
    document.getElementById('model-color')?.addEventListener('input', (e) => this.viewer.setMaterialColor(e.target.value));

    // Roughness
    const roughness = document.getElementById('roughness');
    if (roughness) roughness.addEventListener('input', () => {
      document.getElementById('roughness-val').textContent = parseFloat(roughness.value).toFixed(2);
      this.viewer.setRoughness(parseFloat(roughness.value));
    });

    // Metalness
    const metalness = document.getElementById('metalness');
    if (metalness) metalness.addEventListener('input', () => {
      document.getElementById('metalness-val').textContent = parseFloat(metalness.value).toFixed(2);
      this.viewer.setMetalness(parseFloat(metalness.value));
    });

    // Key light
    const keyLight = document.getElementById('key-light');
    if (keyLight) keyLight.addEventListener('input', () => {
      document.getElementById('key-light-val').textContent = parseFloat(keyLight.value).toFixed(1);
      this.viewer.setKeyLightIntensity(parseFloat(keyLight.value));
    });

    // Ambient
    const ambient = document.getElementById('ambient');
    if (ambient) ambient.addEventListener('input', () => {
      document.getElementById('ambient-val').textContent = parseFloat(ambient.value).toFixed(1);
      this.viewer.setAmbientIntensity(parseFloat(ambient.value));
    });

    // Exposure
    const exposure = document.getElementById('exposure');
    if (exposure) exposure.addEventListener('input', () => {
      document.getElementById('exposure-val').textContent = parseFloat(exposure.value).toFixed(1);
      this.viewer.setExposure(parseFloat(exposure.value));
    });
  }

  setupExportButton() {
    document.getElementById('generate-btn').addEventListener('click', () => this.exportSTL());
  }

  /**
   * Export STL.
   * Legacy designs: lazy-load JSCAD module.
   * Declarative designs: serialize geometry builder output directly (no JSCAD).
   */
  async exportSTL() {
    const btn = document.getElementById('generate-btn');
    btn.disabled = true;

    try {
      const computed = this.formulaEngine.evaluate(this.schema, this.currentParams);
      let stlData;

      const entry = this.store.getSchemas().find(s => s.id === this.currentDesignType);

      if (entry && entry.export) {
        // Legacy: JSCAD export module
        btn.textContent = 'Loading JSCAD...';
        const exportUrl = new URL(entry.export, location.href).href;
        const mod = await import(exportUrl);
        btn.textContent = 'Generating...';

        // Find the export function (first exported function)
        const exportFn = Object.values(mod).find(v => typeof v === 'function');
        const jscadGeometry = await exportFn(computed);

        const { serialize } = await import('https://cdn.jsdelivr.net/npm/@jscad/stl-serializer@2.1.17/+esm');
        const rawData = serialize({ binary: true }, jscadGeometry);

        if (rawData.length === 1) {
          stlData = rawData[0];
        } else {
          const totalLength = rawData.reduce((acc, buf) => acc + buf.byteLength, 0);
          const result = new Uint8Array(totalLength);
          let offset = 0;
          for (const buffer of rawData) {
            result.set(new Uint8Array(buffer), offset);
            offset += buffer.byteLength;
          }
          stlData = result.buffer;
        }
      } else if (this.schema.geometry) {
        // Declarative: build geometry and serialize directly to STL
        btn.textContent = 'Generating...';
        const geoData = this.geometryBuilder.build(this.schema.geometry, computed);
        stlData = GeometryBuilder.toSTL(geoData);
      } else {
        btn.textContent = 'No export available';
        setTimeout(() => { btn.textContent = 'Generate STL'; }, 2000);
        return;
      }

      // Download
      const filename = `${this.currentDesignType}-${Date.now()}.stl`;
      const blob = new Blob([stlData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      btn.textContent = 'Downloaded!';
      setTimeout(() => { btn.textContent = 'Generate STL'; }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      btn.textContent = 'Export Failed';
      setTimeout(() => { btn.textContent = 'Generate STL'; }, 2000);
    } finally {
      btn.disabled = false;
    }
  }

  updateDerivedDisplay(computed) {
    const container = document.getElementById('derived-values');
    if (!container) return;
    let html = '';
    for (const name of Object.keys(this.schema.derived || {})) {
      const value = computed[name];
      const displayValue = typeof value === 'number' ? value.toFixed(2) : value;
      html += `<div class="derived-item"><span class="derived-name">${name}:</span><span class="derived-value">${displayValue}</span></div>`;
    }
    container.innerHTML = html;
  }
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  window.configurator = new Configurator();
});

export default Configurator;
