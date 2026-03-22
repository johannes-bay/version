/**
 * Laptop Stand - Shader-Driven Parametric Geometry with Real-Time Fillets
 *
 * Builds geometry ONCE with encoded vertex attributes,
 * then a vertex shader deforms it in real-time on the GPU.
 * Includes fillet strips along the platform's top edges.
 * Result: 60fps parameter changes with zero JS geometry computation.
 */

// Part IDs encoded in vertex attribute
const PART_PLATFORM = 0;
const PART_POST_BL = 1; // back-left
const PART_POST_BR = 2; // back-right
const PART_POST_FL = 3; // front-left
const PART_POST_FR = 4; // front-right

// Fillet angle codes for non-arc vertices
const FILLET_NONE = -1;      // No fillet adjustment
const FILLET_TOP_FACE = -2;  // Top face: inset X/Z by R
const FILLET_SIDE_TOP = -3;  // Side face top: lower Y by R

// Fillet arc subdivisions
const N_FILLET_STEPS = 6;

/**
 * Build the base geometry with encoded attributes, including fillet strips.
 */
function buildBaseGeometry() {
  const positions = [];
  const normals = [];
  const partIds = [];
  const localCoords = [];
  const filletAngles = [];  // -1=none, -2=top inset, -3=side lower, 0..PI/2=arc
  const filletEdges = [];   // vec2: edge normal direction (x, z)
  const indices = [];
  let vertexOffset = 0;

  // Helper to push a vertex (returns its index)
  function addVertex(pos, norm, partId, lc, filletAngle, filletEdge) {
    positions.push(pos[0], pos[1], pos[2]);
    normals.push(norm[0], norm[1], norm[2]);
    partIds.push(partId);
    localCoords.push(lc[0], lc[1], lc[2]);
    filletAngles.push(filletAngle);
    filletEdges.push(filletEdge[0], filletEdge[1]);
    return vertexOffset++;
  }

  // --- Platform box ---
  const boxVerts = [
    [-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], // bottom (y=0)
    [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],  // top (y=1)
  ];

  // Face definitions with correct outward-facing winding
  const faces = [
    { verts: [0,1,2,3], normal: [0,-1,0], fillet: FILLET_NONE },       // bottom
    { verts: [4,7,6,5], normal: [0,1,0], fillet: FILLET_TOP_FACE },    // top
    { verts: [0,4,5,1], normal: [0,0,-1], filletTop: FILLET_SIDE_TOP },// front
    { verts: [2,6,7,3], normal: [0,0,1], filletTop: FILLET_SIDE_TOP }, // back
    { verts: [3,7,4,0], normal: [-1,0,0], filletTop: FILLET_SIDE_TOP },// left
    { verts: [1,5,6,2], normal: [1,0,0], filletTop: FILLET_SIDE_TOP }, // right
  ];

  for (const face of faces) {
    const [a, b, c, d] = face.verts.map(i => boxVerts[i]);
    const faceVerts = [a, b, c, a, c, d];
    for (const v of faceVerts) {
      let filletCode = face.fillet !== undefined ? face.fillet : FILLET_NONE;
      if (face.filletTop !== undefined && v[1] > 0.5) {
        filletCode = face.filletTop;
      }
      const idx = addVertex(v, face.normal, PART_PLATFORM, v, filletCode, [0, 0]);
      indices.push(idx);
    }
  }

  // --- Fillet strips (4 top edges) ---
  // Each strip is a quarter-cylinder arc connecting side top to platform top
  const filletEdgeDefs = [
    { normal: [0, -1], axis: 'x', zSign: -1, flip: false }, // front edge
    { normal: [0, 1],  axis: 'x', zSign: 1,  flip: true },  // back edge
    { normal: [-1, 0], axis: 'z', xSign: -1, flip: true },   // left edge
    { normal: [1, 0],  axis: 'z', xSign: 1,  flip: false },  // right edge
  ];

  for (const edge of filletEdgeDefs) {
    const baseIdx = vertexOffset;

    // Build strip: (N_FILLET_STEPS+1) rows x 2 vertices per row
    for (let row = 0; row <= N_FILLET_STEPS; row++) {
      const angle = (row / N_FILLET_STEPS) * (Math.PI / 2);

      // Normal for this arc position
      const arcNormY = Math.sin(angle);
      const arcNormPerp = Math.cos(angle); // perpendicular to edge (outward)

      // Two vertices per row: at each end of the edge
      for (let end = 0; end <= 1; end++) {
        const edgePos = end === 0 ? -1 : 1; // position along edge

        let lc, norm;
        if (edge.axis === 'x') {
          // Front/back edge: runs along X, fillet in YZ plane
          lc = [edgePos, 0, edge.zSign];
          norm = [0, arcNormY, edge.zSign * arcNormPerp];
        } else {
          // Left/right edge: runs along Z, fillet in XY plane
          lc = [edge.xSign, 0, edgePos];
          norm = [edge.xSign * arcNormPerp, arcNormY, 0];
        }

        addVertex(
          [0, 0, 0],  // position placeholder (shader computes)
          norm,
          PART_PLATFORM,
          lc,
          angle,
          edge.normal
        );
      }
    }

    // Build indices for the strip (quads between rows)
    for (let row = 0; row < N_FILLET_STEPS; row++) {
      const r0 = baseIdx + row * 2;
      const r1 = baseIdx + (row + 1) * 2;
      if (edge.flip) {
        indices.push(r0, r0 + 1, r1);
        indices.push(r0 + 1, r1 + 1, r1);
      } else {
        indices.push(r0, r1, r0 + 1);
        indices.push(r0 + 1, r1, r1 + 1);
      }
    }
  }

  // --- Posts: unit cylinders (radius=1, height=0-1) ---
  const postSegments = 24;
  const postParts = [PART_POST_BL, PART_POST_BR, PART_POST_FL, PART_POST_FR];

  for (const partId of postParts) {
    const baseIdx = vertexOffset;

    // Side vertices
    for (let h = 0; h <= 1; h++) {
      for (let s = 0; s <= postSegments; s++) {
        const angle = (s / postSegments) * Math.PI * 2;
        const x = Math.cos(angle);
        const z = Math.sin(angle);
        positions.push(x, h, z);
        normals.push(x, 0, z);
        partIds.push(partId);
        localCoords.push(x, h, z);
        filletAngles.push(FILLET_NONE);
        filletEdges.push(0, 0);
        vertexOffset++;
      }
    }

    // Side indices
    for (let s = 0; s < postSegments; s++) {
      const a = baseIdx + s;
      const b = baseIdx + s + 1;
      const c = baseIdx + (postSegments + 1) + s;
      const d = baseIdx + (postSegments + 1) + s + 1;
      indices.push(a, c, b, b, c, d);
    }

    // Top cap
    const topCenter = vertexOffset;
    positions.push(0, 1, 0);
    normals.push(0, 1, 0);
    partIds.push(partId);
    localCoords.push(0, 1, 0);
    filletAngles.push(FILLET_NONE);
    filletEdges.push(0, 0);
    vertexOffset++;

    for (let s = 0; s <= postSegments; s++) {
      const angle = (s / postSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, 1, z);
      normals.push(0, 1, 0);
      partIds.push(partId);
      localCoords.push(x, 1, z);
      filletAngles.push(FILLET_NONE);
      filletEdges.push(0, 0);
      vertexOffset++;
    }

    for (let s = 0; s < postSegments; s++) {
      indices.push(topCenter, topCenter + 1 + s + 1, topCenter + 1 + s);
    }

    // Bottom cap
    const botCenter = vertexOffset;
    positions.push(0, 0, 0);
    normals.push(0, -1, 0);
    partIds.push(partId);
    localCoords.push(0, 0, 0);
    filletAngles.push(FILLET_NONE);
    filletEdges.push(0, 0);
    vertexOffset++;

    for (let s = 0; s <= postSegments; s++) {
      const angle = (s / postSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      positions.push(x, 0, z);
      normals.push(0, -1, 0);
      partIds.push(partId);
      localCoords.push(x, 0, z);
      filletAngles.push(FILLET_NONE);
      filletEdges.push(0, 0);
      vertexOffset++;
    }

    for (let s = 0; s < postSegments; s++) {
      indices.push(botCenter, botCenter + 1 + s, botCenter + 1 + s + 1);
    }
  }

  // Build BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('aPartId', new THREE.Float32BufferAttribute(new Float32Array(partIds), 1));
  geometry.setAttribute('aLocalCoord', new THREE.Float32BufferAttribute(new Float32Array(localCoords), 3));
  geometry.setAttribute('aFilletAngle', new THREE.Float32BufferAttribute(new Float32Array(filletAngles), 1));
  geometry.setAttribute('aFilletEdge', new THREE.Float32BufferAttribute(new Float32Array(filletEdges), 2));
  geometry.setIndex(indices);

  return geometry;
}

/**
 * Vertex shader preamble: attribute and uniform declarations.
 */
const vertexShaderPreamble = `
  attribute float aPartId;
  attribute vec3 aLocalCoord;
  attribute float aFilletAngle;
  attribute vec2 aFilletEdge;

  uniform float uPostX;
  uniform float uPostY;
  uniform float uPostRadius;
  uniform float uFrontPlatformTop;
  uniform float uBackPlatformTop;
  uniform float uBackPostHeight;
  uniform float uFrontPostHeight;
  uniform float uFilletRadius;
`;

/**
 * Vertex shader body: deforms geometry based on parameters.
 * Handles platform (with fillet), posts, and fillet arc strips.
 */
const vertexShaderBody = `
  vec3 transformed = vec3(position);

  float partId = aPartId;
  vec3 lc = aLocalCoord;
  float filletAngle = aFilletAngle;
  vec2 filletEdge = aFilletEdge;

  if (filletAngle >= 0.0) {
    // --- Fillet arc vertex ---
    float angle = filletAngle;
    float R = uFilletRadius;

    // Taper factor: at angle=0 use full extent, at PI/2 use inset extent
    float taper = sin(angle); // 0 at angle=0, 1 at angle=PI/2

    if (abs(filletEdge.x) > 0.5) {
      // Left/right edge: fillet in XY plane, runs along Z
      float zExtent = mix(uPostY, uPostY - R, taper);
      float z = lc.z * zExtent;
      float t = (lc.z + 1.0) * 0.5;
      float platformTop = mix(uFrontPlatformTop, uBackPlatformTop, t);

      float edgeDir = sign(filletEdge.x);
      float cx = edgeDir * (uPostX - R);
      float cy = platformTop - R;

      float x = cx + edgeDir * R * cos(angle);
      float y = cy + R * sin(angle);
      transformed = vec3(x, y, z);
    } else {
      // Front/back edge: fillet in YZ plane, runs along X
      float xExtent = mix(uPostX, uPostX - R, taper);
      float x = lc.x * xExtent;
      float edgeZ = sign(filletEdge.y);
      float platformTop = edgeZ > 0.0 ? uBackPlatformTop : uFrontPlatformTop;

      float cz = edgeZ * (uPostY - R);
      float cy = platformTop - R;

      float z = cz + edgeZ * R * cos(angle);
      float y = cy + R * sin(angle);
      transformed = vec3(x, y, z);
    }
  }
  else if (partId < 0.5) {
    // --- Platform vertex ---
    if (filletAngle < -1.5 && filletAngle > -2.5) {
      // Top face: inset by fillet radius
      float x = lc.x * (uPostX - uFilletRadius);
      float z = lc.z * (uPostY - uFilletRadius);
      float t = (lc.z + 1.0) * 0.5;
      float y = mix(uFrontPlatformTop, uBackPlatformTop, t);
      transformed = vec3(x, y, z);
    }
    else if (filletAngle < -2.5) {
      // Side face top vertex: lower by fillet radius
      float x = lc.x * uPostX;
      float z = lc.z * uPostY;
      float t = (lc.z + 1.0) * 0.5;
      float platformTop = mix(uFrontPlatformTop, uBackPlatformTop, t);
      float y = platformTop - uFilletRadius;
      transformed = vec3(x, y, z);
    }
    else {
      // Regular platform vertex (bottom, lower sides)
      float x = lc.x * uPostX;
      float z = lc.z * uPostY;
      float frontH = mix(0.0, uFrontPlatformTop, lc.y);
      float backH = mix(0.0, uBackPlatformTop, lc.y);
      float t = (lc.z + 1.0) * 0.5;
      float y = mix(frontH, backH, t);
      transformed = vec3(x, y, z);
    }
  }
  else if (partId < 1.5) {
    // Back-left post
    float x = lc.x * uPostRadius + (-uPostX);
    float z = lc.z * uPostRadius + uPostY;
    float y = lc.y * uBackPostHeight;
    transformed = vec3(x, y, z);
  }
  else if (partId < 2.5) {
    // Back-right post
    float x = lc.x * uPostRadius + uPostX;
    float z = lc.z * uPostRadius + uPostY;
    float y = lc.y * uBackPostHeight;
    transformed = vec3(x, y, z);
  }
  else if (partId < 3.5) {
    // Front-left post
    float x = lc.x * uPostRadius + (-uPostX);
    float z = lc.z * uPostRadius + (-uPostY);
    float y = lc.y * uFrontPostHeight;
    transformed = vec3(x, y, z);
  }
  else {
    // Front-right post
    float x = lc.x * uPostRadius + uPostX;
    float z = lc.z * uPostRadius + (-uPostY);
    float y = lc.y * uFrontPostHeight;
    transformed = vec3(x, y, z);
  }
`;

/**
 * Create the shader material by modifying MeshStandardMaterial's shader.
 * Preserves PBR lighting while adding custom vertex deformation.
 */
function createShaderMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xf0ece4,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  material.onBeforeCompile = (shader) => {
    for (const [key, value] of Object.entries(uniforms)) {
      shader.uniforms[key] = value;
    }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      ${vertexShaderPreamble}`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      vertexShaderBody
    );

    material.userData.shader = shader;
  };

  return material;
}

/**
 * Create the laptop stand shader mesh.
 * Returns { mesh, updateParams(computed) }
 */
export function createLaptopStandShader() {
  const geometry = buildBaseGeometry();

  const uniforms = {
    uPostX: { value: 156 },
    uPostY: { value: 110.5 },
    uPostRadius: { value: 23.4 },
    uFrontPlatformTop: { value: 40 },
    uBackPlatformTop: { value: 60 },
    uBackPostHeight: { value: 75 },
    uFrontPostHeight: { value: 55 },
    uFilletRadius: { value: 8 },
  };

  const material = createShaderMaterial(uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  function updateParams(computed) {
    const {
      post_x, post_y, post_radius,
      front_platform_top, back_platform_top,
      post_height_above, fillet_radius
    } = computed;

    uniforms.uPostX.value = post_x;
    uniforms.uPostY.value = post_y;
    uniforms.uPostRadius.value = post_radius;
    uniforms.uFrontPlatformTop.value = front_platform_top;
    uniforms.uBackPlatformTop.value = back_platform_top;
    uniforms.uBackPostHeight.value = back_platform_top + post_height_above;
    uniforms.uFrontPostHeight.value = front_platform_top + post_height_above;
    uniforms.uFilletRadius.value = fillet_radius || 0;
  }

  return { mesh, updateParams, uniforms };
}

export default { createLaptopStandShader };
