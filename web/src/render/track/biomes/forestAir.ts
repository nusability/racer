import * as THREE from 'three';

// What hangs in the forest's air: shafts of sunlight slanting down through gaps in the canopy,
// the pools of sun they throw on the trail, and ground mist drifting between the trunks. Each
// is one instanced draw, blended (shafts and pools add light, the mist veils), never written
// to depth; shafts and mist also fade out close to the
// camera so a racer flying through one never gets a screen-filling flash or fog wall.

/** Shafts and mist fade in from this far from the camera to this far (m). */
const NEAR_FADE: readonly [number, number] = [12, 45];
/** A shaft is brightest a little above its foot (share of its length), fading to nothing at the top. */
const SHAFT_PEAK = 0.18;
const SHAFT_FOOT = 0.45;
const SHAFT_SIDES = 6;
/** How sharply a shaft fades toward its silhouette (power of the facing term). */
const SHAFT_EDGE = 2;
/** Mist breathes sideways this far (share of its width) at this rate (rad/s). */
const MIST_DRIFT = 0.08;
const MIST_RATE = 0.05;
/** The mist's soft edge: fully clear from this radius out (uv units, 1 = the quad's edge). */
const MIST_EDGE: readonly [number, number] = [0.15, 1];

/**
 * A light shaft in unit space: an open prism along +Y (radius 1, length 1), its vertex colour
 * the brightness up it. Additive, so the colour is the light it adds.
 */
export function shaftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const level = (y: number) => (y < SHAFT_PEAK ? SHAFT_FOOT + (1 - SHAFT_FOOT) * (y / SHAFT_PEAK) : (1 - (y - SHAFT_PEAK) / (1 - SHAFT_PEAK)) ** 1.5);
  const ys = [0, SHAFT_PEAK, 0.55, 1];
  for (let r = 0; r + 1 < ys.length; r++) {
    for (let i = 0; i < SHAFT_SIDES; i++) {
      const a0 = (i / SHAFT_SIDES) * Math.PI * 2;
      const a1 = ((i + 1) / SHAFT_SIDES) * Math.PI * 2;
      const p = (a: number, y: number) => [Math.cos(a), y, Math.sin(a)];
      const quad = [p(a0, ys[r]), p(a1, ys[r]), p(a1, ys[r + 1]), p(a0, ys[r]), p(a1, ys[r + 1]), p(a0, ys[r + 1])];
      for (const v of quad) {
        pos.push(...v);
        nrm.push(v[0], 0, v[2]);
        const l = level(v[1]);
        col.push(l, l, l);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}

const NEAR_FADE_GLSL = `smoothstep(${NEAR_FADE[0].toFixed(1)}, ${NEAR_FADE[1].toFixed(1)}, -mvPosition.z)`;

/**
 * The shafts' material: additive light in `color` (linear, may exceed 1 for the bloom). A
 * shaft is a column of lit dust, so it is brightest where the eye looks through most of it
 * (its middle) and fades to nothing at its silhouette: no hard edges.
 */
export function shaftMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vNearFade;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 shaftN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        float facing = abs(dot(shaftN, normalize(-mvPosition.xyz)));
        vNearFade = ${NEAR_FADE_GLSL} * pow(facing, ${SHAFT_EDGE.toFixed(1)});`,
      );
    // Fog must fade added light to nothing; mixing toward the fog colour would add haze.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNearFade;')
      .replace('#include <fog_fragment>', '#ifdef USE_FOG\ngl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);\n#endif\ngl_FragColor.rgb *= vNearFade;');
  };
  mat.customProgramCacheKey = () => 'forest-shaft';
  return mat;
}

const MIST_VERTEX = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vNearFade;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  // Camera-facing about the vertical: the quad turns to the viewer and stays upright.
  vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  vec3 toCam = cameraPosition - centre;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  float sway = sin(uTime * ${MIST_RATE.toFixed(3)} + centre.x * 0.013 + centre.z * 0.007) * ${MIST_DRIFT.toFixed(3)};
  vec3 world = centre + right * (position.x + sway) * size.x + vec3(0.0, position.y * size.y, 0.0);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vNearFade = ${NEAR_FADE_GLSL};
  #include <fog_vertex>
}`;

const MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vNearFade;
#include <fog_pars_fragment>
void main() {
  // Soft all round, softest at the top so the mist never shows a hard upper edge.
  vec2 d = (vUv - 0.5) * 2.0;
  d.y = d.y > 0.0 ? d.y * 1.3 : d.y;
  float a = 1.0 - smoothstep(${MIST_EDGE[0].toFixed(2)}, ${MIST_EDGE[1].toFixed(2)}, length(d));
  gl_FragColor = vec4(uColor, a * a * uOpacity * vNearFade);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/** Ground mist: camera-facing upright quads (instance scale x = width, y = height) of soft haze. */
export function mistMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: color }, uOpacity: { value: opacity } }]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

/** The mist quad: unit wide, unit tall, standing on its origin. */
export function mistGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
}

/** A sun pool: a disc lying in the road (unit radius), bright at its centre fading to nothing at its rim. */
export function poolGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, POOL_SEGMENTS).rotateX(-Math.PI / 2);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  // Vertex 0 is the centre; the rim takes nothing, so the pool has no edge.
  col.set([1, 1, 1], 0);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const POOL_SEGMENTS = 14;

/** The sun pools' material: light added to the road in `color`, faded by fog, drawn over the road. */
export function poolMaterial(color: THREE.Color): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    color,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', '#ifdef USE_FOG\ngl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);\n#endif');
  };
  mat.customProgramCacheKey = () => 'forest-pool';
  return mat;
}

