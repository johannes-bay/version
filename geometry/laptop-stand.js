/**
 * Laptop Stand Geometry Generator
 * Ported from OpenSCAD tilted platform design
 * Uses JSCAD for CSG operations and STL export
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
 * Create a tilted platform (polyhedron)
 */
function createTiltedPlatform(jscad, params) {
  const { post_x, post_y, front_platform_top, back_platform_top } = params;
  const { geom3, poly3 } = jscad.geometries;

  const x1 = -post_x;
  const x2 = post_x;
  const y1 = -post_y;
  const y2 = post_y;

  const points = [
    [x1, y1, 0],
    [x2, y1, 0],
    [x2, y2, 0],
    [x1, y2, 0],
    [x1, y1, front_platform_top],
    [x2, y1, front_platform_top],
    [x2, y2, back_platform_top],
    [x1, y2, back_platform_top]
  ];

  const faces = [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [1, 2, 6, 5]
  ];

  const polygons = faces.map(face => {
    const vertices = face.map(i => points[i]);
    return poly3.create(vertices);
  });

  return geom3.create(polygons);
}

/**
 * Create a chamfered cylinder
 */
function createChamferedCylinder(jscad, radius, height, chamferSize, segments = 48) {
  const { cylinder } = jscad.primitives;
  const { hull } = jscad.hulls;

  if (chamferSize <= 0) {
    return cylinder({ radius, height, segments, center: [0, 0, height / 2] });
  }

  const innerCyl = cylinder({
    radius: radius - chamferSize,
    height: height,
    segments,
    center: [0, 0, height / 2]
  });

  const outerCyl = cylinder({
    radius: radius,
    height: height - chamferSize * 2,
    segments,
    center: [0, 0, height / 2]
  });

  return hull(innerCyl, outerCyl);
}

/**
 * Create front-left post cutout
 */
function createFrontLeftCutout(jscad, params) {
  const { post_x, post_y, post_radius, post_height_above, height_per_y, front_platform_top } = params;
  const { cuboid } = jscad.primitives;
  const { hull } = jscad.hulls;
  const { translate } = jscad.transforms;

  const cutHeight = post_height_above + 20;
  const cutSize = post_radius;
  const cutRise = height_per_y * cutSize;
  const thickness = 0.1;

  const box1 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [cutSize / 2, thickness / 2, front_platform_top + cutHeight / 2]
  });

  const box2 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [cutSize / 2, cutSize - thickness / 2, front_platform_top + cutRise + cutHeight / 2]
  });

  const cutout = hull(box1, box2);
  return translate([-post_x, -post_y, 0], cutout);
}

/**
 * Create front-right post cutout
 */
function createFrontRightCutout(jscad, params) {
  const { post_x, post_y, post_radius, post_height_above, height_per_y, front_platform_top } = params;
  const { cuboid } = jscad.primitives;
  const { hull } = jscad.hulls;
  const { translate } = jscad.transforms;

  const cutHeight = post_height_above + 20;
  const cutSize = post_radius;
  const cutRise = height_per_y * cutSize;
  const thickness = 0.1;

  const box1 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [-cutSize / 2, thickness / 2, front_platform_top + cutHeight / 2]
  });

  const box2 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [-cutSize / 2, cutSize - thickness / 2, front_platform_top + cutRise + cutHeight / 2]
  });

  const cutout = hull(box1, box2);
  return translate([post_x, -post_y, 0], cutout);
}

/**
 * Create back-left post cutout
 */
function createBackLeftCutout(jscad, params) {
  const { post_x, post_y, post_radius, post_height_above, height_per_y, back_platform_top } = params;
  const { cuboid } = jscad.primitives;
  const { hull } = jscad.hulls;
  const { translate } = jscad.transforms;

  const cutHeight = post_height_above + 20;
  const cutSize = post_radius;
  const cutRise = height_per_y * cutSize;
  const thickness = 0.1;

  const box1 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [cutSize / 2, -thickness / 2, back_platform_top + cutHeight / 2]
  });

  const box2 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [cutSize / 2, -cutSize + thickness / 2, back_platform_top - cutRise + cutHeight / 2]
  });

  const cutout = hull(box1, box2);
  return translate([-post_x, post_y, 0], cutout);
}

/**
 * Create back-right post cutout
 */
function createBackRightCutout(jscad, params) {
  const { post_x, post_y, post_radius, post_height_above, height_per_y, back_platform_top } = params;
  const { cuboid } = jscad.primitives;
  const { hull } = jscad.hulls;
  const { translate } = jscad.transforms;

  const cutHeight = post_height_above + 20;
  const cutSize = post_radius;
  const cutRise = height_per_y * cutSize;
  const thickness = 0.1;

  const box1 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [-cutSize / 2, -thickness / 2, back_platform_top + cutHeight / 2]
  });

  const box2 = cuboid({
    size: [cutSize, thickness, cutHeight],
    center: [-cutSize / 2, -cutSize + thickness / 2, back_platform_top - cutRise + cutHeight / 2]
  });

  const cutout = hull(box1, box2);
  return translate([post_x, post_y, 0], cutout);
}

/**
 * Create the complete laptop stand geometry
 */
export async function createLaptopStand(params) {
  const jscad = await getJSCAD();
  const { union, subtract } = jscad.booleans;
  const { translate } = jscad.transforms;

  const {
    post_x,
    post_y,
    post_radius,
    front_platform_top,
    back_platform_top,
    post_height_above,
    chamfer_size,
    use_chamfers
  } = params;

  const segments = 48;  // Balance between smoothness and speed
  const chamfer = use_chamfers ? chamfer_size : 0;

  // 1. Create the tilted platform
  const platform = createTiltedPlatform(jscad, params);

  // 2. Create four corner posts
  const backPostHeight = back_platform_top + post_height_above;
  const frontPostHeight = front_platform_top + post_height_above;

  const posts = [
    translate(
      [-post_x, post_y, 0],
      createChamferedCylinder(jscad, post_radius, backPostHeight, chamfer, segments)
    ),
    translate(
      [post_x, post_y, 0],
      createChamferedCylinder(jscad, post_radius, backPostHeight, chamfer, segments)
    ),
    translate(
      [-post_x, -post_y, 0],
      createChamferedCylinder(jscad, post_radius, frontPostHeight, chamfer, segments)
    ),
    translate(
      [post_x, -post_y, 0],
      createChamferedCylinder(jscad, post_radius, frontPostHeight, chamfer, segments)
    )
  ];

  // Combine platform and posts
  let stand = union(platform, ...posts);

  // 3. Create and subtract cutouts for laptop edges
  const flCutout = createFrontLeftCutout(jscad, params);
  const frCutout = createFrontRightCutout(jscad, params);
  const blCutout = createBackLeftCutout(jscad, params);
  const brCutout = createBackRightCutout(jscad, params);

  stand = subtract(stand, flCutout);
  stand = subtract(stand, frCutout);
  stand = subtract(stand, blCutout);
  stand = subtract(stand, brCutout);

  return stand;
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

export default { createLaptopStand, toThreeJSGeometry };
