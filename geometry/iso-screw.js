/**
 * ISO Metric Screw Generator
 * Creates screws with true helical threads using JSCAD
 *
 * Thread geometry follows ISO 68-1 standard (60° metric thread)
 */

// Lazy-loaded JSCAD module
let jscadModule = null;

async function getJSCAD() {
  if (!jscadModule) {
    jscadModule = await import('https://cdn.jsdelivr.net/npm/@jscad/modeling@2.12.2/+esm');
  }
  return jscadModule;
}

/**
 * Create helical thread geometry
 * Uses a series of rotated/translated wedge segments to create the helix
 */
function createHelicalThread(jscad, params) {
  const {
    major_diameter,
    minor_diameter,
    pitch,
    thread_depth,
    actual_thread_length,
    segments_per_rotation
  } = params;

  const { cylinder, polygon } = jscad.primitives;
  const { union } = jscad.booleans;
  const { translate, rotateZ, rotateX } = jscad.transforms;
  const { extrudeLinear } = jscad.extrusions;
  const { geom3, poly3 } = jscad.geometries;

  const majorRadius = major_diameter / 2;
  const minorRadius = minor_diameter / 2;

  // Number of complete rotations
  const rotations = Math.ceil(actual_thread_length / pitch) + 1;
  const totalSegments = rotations * segments_per_rotation;

  // Angle per segment
  const anglePerSegment = (Math.PI * 2) / segments_per_rotation;
  // Height per segment
  const heightPerSegment = pitch / segments_per_rotation;

  // Thread profile height (60° V-thread)
  const threadHeight = pitch * 0.866; // H = P * sqrt(3)/2

  const threadSegments = [];

  // Create thread as a series of small wedge-shaped segments
  for (let i = 0; i < totalSegments; i++) {
    const z = i * heightPerSegment;
    if (z > actual_thread_length + pitch) break;

    const angle = i * anglePerSegment;
    const nextAngle = (i + 1) * anglePerSegment;
    const nextZ = (i + 1) * heightPerSegment;

    // Create a small wedge segment of the thread
    // Thread profile: triangle from minor to major radius

    // Points for current position
    const cos1 = Math.cos(angle);
    const sin1 = Math.sin(angle);
    const cos2 = Math.cos(nextAngle);
    const sin2 = Math.sin(nextAngle);

    // Create vertices for thread segment (a small prism)
    // Bottom triangle (at z)
    const p0 = [minorRadius * cos1, minorRadius * sin1, z];
    const p1 = [majorRadius * cos1, majorRadius * sin1, z + pitch / 2];
    const p2 = [minorRadius * cos1, minorRadius * sin1, z + pitch];

    // Top triangle (at nextZ, rotated)
    const p3 = [minorRadius * cos2, minorRadius * sin2, nextZ];
    const p4 = [majorRadius * cos2, majorRadius * sin2, nextZ + pitch / 2];
    const p5 = [minorRadius * cos2, minorRadius * sin2, nextZ + pitch];

    // Create faces for the prism
    const faces = [
      // Front face (triangle 1)
      [p0, p1, p2],
      // Back face (triangle 2)
      [p3, p5, p4],
      // Bottom quad (as two triangles)
      [p0, p3, p4],
      [p0, p4, p1],
      // Top quad (as two triangles)
      [p2, p1, p4],
      [p2, p4, p5],
      // Inner quad (as two triangles)
      [p0, p2, p5],
      [p0, p5, p3]
    ];

    const polygons = faces.map(face => poly3.create(face));
    const segment = geom3.create(polygons);
    threadSegments.push(segment);
  }

  // Core cylinder at minor diameter
  const core = cylinder({
    radius: minorRadius,
    height: actual_thread_length,
    segments: segments_per_rotation,
    center: [0, 0, actual_thread_length / 2]
  });

  // Union all thread segments with core
  if (threadSegments.length > 0) {
    return union(core, ...threadSegments);
  }
  return core;
}

/**
 * Create socket cap head
 */
function createSocketCapHead(jscad, params) {
  const { head_diameter, head_height, hex_key_size, length } = params;
  const { cylinder } = jscad.primitives;
  const { subtract } = jscad.booleans;
  const { translate } = jscad.transforms;
  const { extrudeLinear } = jscad.extrusions;

  const headRadius = head_diameter / 2;
  const socketDepth = head_height * 0.6;

  // Cylindrical head
  const head = cylinder({
    radius: headRadius,
    height: head_height,
    segments: 48,
    center: [0, 0, length + head_height / 2]
  });

  // Hex socket (6-sided polygon extruded)
  // Hex key size is across-flats, so radius = size / sqrt(3) for point radius
  const hexRadius = hex_key_size / Math.sqrt(3);
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    hexPoints.push([Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius]);
  }

  const hexPolygon = jscad.primitives.polygon({ points: hexPoints });
  const hexSocket = extrudeLinear({ height: socketDepth }, hexPolygon);
  const positionedSocket = translate([0, 0, length + head_height - socketDepth], hexSocket);

  return subtract(head, positionedSocket);
}

/**
 * Create hex head
 */
function createHexHead(jscad, params) {
  const { head_diameter, head_height, length } = params;
  const { translate } = jscad.transforms;
  const { extrudeLinear } = jscad.extrusions;

  // Hex head - across flats = head_diameter
  // Point radius = (across flats / 2) / cos(30°)
  const hexRadius = (head_diameter / 2) / Math.cos(Math.PI / 6);
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6 + Math.PI / 6; // Rotate 30° so flats are horizontal
    hexPoints.push([Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius]);
  }

  const hexPolygon = jscad.primitives.polygon({ points: hexPoints });
  const head = extrudeLinear({ height: head_height }, hexPolygon);
  return translate([0, 0, length], head);
}

/**
 * Create button head
 */
function createButtonHead(jscad, params) {
  const { head_diameter, head_height, hex_key_size, length } = params;
  const { cylinder, sphere } = jscad.primitives;
  const { subtract, intersect } = jscad.booleans;
  const { translate, scale } = jscad.transforms;
  const { extrudeLinear } = jscad.extrusions;

  const headRadius = head_diameter / 2;
  // Button head is a spherical cap
  const sphereRadius = headRadius * 1.5;

  // Create dome by intersecting sphere with cylinder
  const domeBase = cylinder({
    radius: headRadius,
    height: head_height * 2,
    segments: 48,
    center: [0, 0, length + head_height]
  });

  const dome = sphere({
    radius: sphereRadius,
    segments: 32,
    center: [0, 0, length + head_height - sphereRadius + head_height]
  });

  const head = intersect(domeBase, dome);

  // Hex socket
  const socketDepth = head_height * 0.5;
  const hexRadius = hex_key_size / Math.sqrt(3);
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    hexPoints.push([Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius]);
  }

  const hexPolygon = jscad.primitives.polygon({ points: hexPoints });
  const hexSocket = extrudeLinear({ height: socketDepth }, hexPolygon);
  const positionedSocket = translate([0, 0, length + head_height - socketDepth], hexSocket);

  return subtract(head, positionedSocket);
}

/**
 * Create flat/countersunk head
 */
function createFlatHead(jscad, params) {
  const { head_diameter, head_height, hex_key_size, major_diameter, length } = params;
  const { cylinder } = jscad.primitives;
  const { subtract } = jscad.booleans;
  const { translate } = jscad.transforms;
  const { extrudeLinear } = jscad.extrusions;

  const headRadius = head_diameter / 2;
  const shankRadius = major_diameter / 2;

  // Flat head is a cone frustum
  // Create as cylinder that tapers
  const headHeight = head_height * 0.6; // Flat heads are typically shorter

  // Use cylinder with different start/end radii via hull of two thin cylinders
  const { hull } = jscad.hulls;

  const topDisc = cylinder({
    radius: headRadius,
    height: 0.1,
    segments: 48,
    center: [0, 0, length + headHeight - 0.05]
  });

  const bottomDisc = cylinder({
    radius: shankRadius,
    height: 0.1,
    segments: 48,
    center: [0, 0, length + 0.05]
  });

  const head = hull(topDisc, bottomDisc);

  // Hex socket
  const socketDepth = headHeight * 0.6;
  const hexRadius = hex_key_size / Math.sqrt(3);
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    hexPoints.push([Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius]);
  }

  const hexPolygon = jscad.primitives.polygon({ points: hexPoints });
  const hexSocket = extrudeLinear({ height: socketDepth }, hexPolygon);
  const positionedSocket = translate([0, 0, length + headHeight - socketDepth], hexSocket);

  return subtract(head, positionedSocket);
}

/**
 * Create head based on type
 */
function createHead(jscad, params) {
  const { head_type } = params;

  switch (head_type) {
    case 'hex':
      return createHexHead(jscad, params);
    case 'button':
      return createButtonHead(jscad, params);
    case 'flat':
      return createFlatHead(jscad, params);
    case 'socket_cap':
    default:
      return createSocketCapHead(jscad, params);
  }
}

/**
 * Create the complete ISO screw geometry
 */
export async function createISOScrew(params) {
  const jscad = await getJSCAD();
  const { union } = jscad.booleans;
  const { translate } = jscad.transforms;
  const { cylinder } = jscad.primitives;

  const {
    major_diameter,
    length,
    actual_thread_length,
    shank_length
  } = params;

  const parts = [];

  // 1. Create shank (unthreaded portion) if any
  if (shank_length > 0.1) {
    const shank = cylinder({
      radius: major_diameter / 2,
      height: shank_length,
      segments: 48,
      center: [0, 0, shank_length / 2]
    });
    parts.push(shank);
  }

  // 2. Create threaded portion with helical threads
  const threadedSection = createHelicalThread(jscad, params);
  if (shank_length > 0.1) {
    parts.push(translate([0, 0, shank_length], threadedSection));
  } else {
    parts.push(threadedSection);
  }

  // 3. Create head
  const head = createHead(jscad, params);
  parts.push(head);

  return union(...parts);
}

/**
 * Convert JSCAD geometry to Three.js compatible format
 * Uses per-face vertices to ensure proper normals at sharp edges
 * JSCAD uses Z-up, Three.js uses Y-up, so we swap Y and Z
 */
export async function toThreeJSGeometry(jscadGeometry) {
  const jscad = await getJSCAD();
  const { geom3 } = jscad.geometries;
  const polygons = geom3.toPolygons(jscadGeometry);

  const positions = [];
  const normals = [];
  const indices = [];
  let vertexIndex = 0;

  // Calculate face normal
  function calculateNormal(v0, v1, v2) {
    const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
    const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  for (const polygon of polygons) {
    const verts = polygon.vertices;
    if (verts.length < 3) continue;

    // Get polygon normal (use first triangle)
    const v0 = verts[0], v1 = verts[1], v2 = verts[2];
    // Swap Y/Z for Three.js and reverse winding
    const tv0 = [v0[0], v0[2], v0[1]];
    const tv1 = [v1[0], v1[2], v1[1]];
    const tv2 = [v2[0], v2[2], v2[1]];
    // Reversed winding normal
    const normal = calculateNormal(tv0, tv2, tv1);

    // Fan triangulation - each triangle gets its own vertices for flat normals on this face
    for (let i = 1; i < verts.length - 1; i++) {
      const p0 = verts[0];
      const p1 = verts[i];
      const p2 = verts[i + 1];

      // Swap Y and Z, add vertices
      positions.push(p0[0], p0[2], p0[1]);
      positions.push(p2[0], p2[2], p2[1]); // Reversed winding
      positions.push(p1[0], p1[2], p1[1]);

      // Same normal for all three vertices of this face
      normals.push(...normal, ...normal, ...normal);

      // Indices
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      vertexIndex += 3;
    }
  }

  return { positions, normals, indices };
}

export default { createISOScrew, toThreeJSGeometry };
