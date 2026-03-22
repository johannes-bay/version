/**
 * Laptop Stand Preview Geometry
 * Uses Three.js primitives directly for instant preview rendering.
 * No JSCAD dependency - pure Three.js geometry.
 */

function mergeGeometries(entries) {
  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  for (const { geometry, position, rotation } of entries) {
    const matrix = new THREE.Matrix4();
    if (rotation) {
      matrix.makeRotationFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]));
    }
    if (position) {
      if (rotation) {
        const posMatrix = new THREE.Matrix4().setPosition(position[0], position[1], position[2]);
        matrix.premultiply(posMatrix);
      } else {
        matrix.setPosition(position[0], position[1], position[2]);
      }
    } else if (!rotation) {
      matrix.identity();
    }

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const idx = geometry.getIndex();
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      if (normAttr) {
        n.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        n.applyMatrix3(normalMatrix).normalize();
        normals.push(n.x, n.y, n.z);
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < posAttr.count; i++) indices.push(i + vertexOffset);
    }

    vertexOffset += posAttr.count;
    geometry.dispose();
  }

  return { positions, normals, indices };
}

/**
 * Create a post with a slot/notch cut into it.
 * The slot is where the laptop edge sits.
 * Uses a lathe geometry with a notch profile.
 */
function createPostWithSlot(radius, totalHeight, platformTop, slotDepth, slotWidth) {
  // Create a 2D profile for lathe: cylinder with an inward notch at platform level
  const points = [];
  const notchStart = platformTop;
  const notchEnd = platformTop + slotWidth;
  const notchRadius = radius - slotDepth;

  // Bottom to notch start
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(radius, 0));
  points.push(new THREE.Vector2(radius, notchStart));

  // Notch
  points.push(new THREE.Vector2(notchRadius, notchStart));
  points.push(new THREE.Vector2(notchRadius, notchEnd));

  // Notch end to top
  points.push(new THREE.Vector2(radius, notchEnd));
  points.push(new THREE.Vector2(radius, totalHeight));
  points.push(new THREE.Vector2(0, totalHeight));

  return new THREE.LatheGeometry(points, 32);
}

/**
 * Create laptop stand preview geometry using Three.js primitives.
 * Returns {positions, normals, indices} for the viewer.
 */
export function createLaptopStandPreview(params) {
  const {
    post_x, post_y, post_radius,
    front_platform_top, back_platform_top,
    post_height_above, platform_thickness,
    laptop_thickness
  } = params;

  const entries = [];

  // 1. Tilted platform (custom box geometry with different heights at front/back)
  const platformGeo = new THREE.BufferGeometry();
  const px = post_x, py = post_y;
  const ft = front_platform_top, bt = back_platform_top;

  // 8 vertices: Y-up in Three.js
  const verts = new Float32Array([
    -px, 0,  -py,  // 0: bottom-front-left
     px, 0,  -py,  // 1: bottom-front-right
     px, 0,   py,  // 2: bottom-back-right
    -px, 0,   py,  // 3: bottom-back-left
    -px, ft, -py,  // 4: top-front-left
     px, ft, -py,  // 5: top-front-right
     px, bt,  py,  // 6: top-back-right
    -px, bt,  py,  // 7: top-back-left
  ]);

  const platformIndices = [
    0, 2, 1, 0, 3, 2,  // Bottom
    4, 5, 6, 4, 6, 7,  // Top
    0, 1, 5, 0, 5, 4,  // Front
    2, 3, 7, 2, 7, 6,  // Back
    3, 0, 4, 3, 4, 7,  // Left
    1, 2, 6, 1, 6, 5   // Right
  ];

  platformGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  platformGeo.setIndex(platformIndices);
  platformGeo.computeVertexNormals();
  entries.push({ geometry: platformGeo, position: null });

  // 2. Four corner posts with laptop slot notches
  const slotDepth = post_radius * 0.4;  // How deep the slot cuts into the post
  const slotWidth = laptop_thickness || post_height_above;  // Width of the slot

  // Back-left post
  const blHeight = back_platform_top + post_height_above;
  const blPost = createPostWithSlot(post_radius, blHeight, back_platform_top, slotDepth, slotWidth);
  entries.push({ geometry: blPost, position: [-post_x, 0, post_y] });

  // Back-right post
  const brPost = createPostWithSlot(post_radius, blHeight, back_platform_top, slotDepth, slotWidth);
  entries.push({ geometry: brPost, position: [post_x, 0, post_y] });

  // Front-left post
  const flHeight = front_platform_top + post_height_above;
  const flPost = createPostWithSlot(post_radius, flHeight, front_platform_top, slotDepth, slotWidth);
  entries.push({ geometry: flPost, position: [-post_x, 0, -post_y] });

  // Front-right post
  const frPost = createPostWithSlot(post_radius, flHeight, front_platform_top, slotDepth, slotWidth);
  entries.push({ geometry: frPost, position: [post_x, 0, -post_y] });

  return mergeGeometries(entries);
}

export default { createLaptopStandPreview };
