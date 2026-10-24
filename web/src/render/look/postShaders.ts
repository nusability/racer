// GLSL for the look pipeline (postFx.ts). All passes draw one full-screen triangle; every
// texture they read is linear HDR except the FXAA input, which is display-referred sRGB.

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Bright pass + first down-sample (to half resolution): a 5-tap dual-filter kernel, then a
 * soft-knee threshold on the largest channel, so saturated neon glows as readily as white.
 */
export const PREFILTER_FRAGMENT = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
varying vec2 vUv;
vec3 tap(vec2 uv) { return min(texture2D(tInput, uv).rgb, vec3(uClamp)); }
void main() {
  vec3 c = tap(vUv) * 4.0;
  c += tap(vUv + uTexel * vec2(-1.0, -1.0));
  c += tap(vUv + uTexel * vec2(1.0, -1.0));
  c += tap(vUv + uTexel * vec2(-1.0, 1.0));
  c += tap(vUv + uTexel * vec2(1.0, 1.0));
  c *= 0.125;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

/** Dual-filter down-sample: centre plus four diagonal bilinear taps. */
export const DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv).rgb * 4.0;
  c += texture2D(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tInput, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tInput, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tInput, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.125, 1.0);
}`;

/** Dual-filter up-sample of the smaller level (8 taps), plus this level's own down-sample. */
export const UP_FRAGMENT = /* glsl */ `
uniform sampler2D tInput;
uniform sampler2D tSame;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 c = texture2D(tInput, vUv + vec2(-2.0 * t.x, 0.0)).rgb;
  c += texture2D(tInput, vUv + vec2(2.0 * t.x, 0.0)).rgb;
  c += texture2D(tInput, vUv + vec2(0.0, -2.0 * t.y)).rgb;
  c += texture2D(tInput, vUv + vec2(0.0, 2.0 * t.y)).rgb;
  c += texture2D(tInput, vUv + vec2(-t.x, t.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(t.x, t.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(-t.x, -t.y)).rgb * 2.0;
  c += texture2D(tInput, vUv + vec2(t.x, -t.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tSame, vUv).rgb, 1.0);
}`;

/**
 * The composite: heat haze and boost blur on the scene, bloom and wet-road reflections added,
 * then exposure, ACES, the colour grade, sRGB encoding and a dither (the night sky is one long
 * dark gradient; 8-bit output bands it). The defines switch whole features out of the program.
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tWet;
uniform float uBloom;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uAspect;
uniform float uBlur;
uniform float uBlurInner;
uniform float uBlurOuter;
uniform float uChroma;
uniform vec3 uHorizon;
uniform float uWet;
uniform float uSmear;
uniform float uNearShare;
uniform float uHorizonFade;
uniform float uHaze;
uniform float uHazeBand;
uniform float uHazeAbove;
uniform float uHazeScale;
uniform float uHazeRise;
uniform float uTime;
varying vec2 vUv;

// three.js's ACES filmic fit (tonemapping_pars_fragment), with the exposure passed in.
vec3 rrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= uExposure / 0.6;
  return clamp(outM * rrtOdtFit(inM * c), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 uv = vUv;
#ifdef HAZE
  // Heat shimmer along the road's horizon: strongest on the line (the far road and ground),
  // gone within a few screen percent of it, so nothing near enough to dodge ever wobbles. The
  // noise is stretched across (heat swims in horizontal bands), rises, and moves the image
  // mostly up and down.
  vec2 hp = vec2(vUv.x * uAspect, vUv.y);
  float hside = dot(uHorizon.xy, hp) + uHorizon.z;
  float hmask = uHaze * (hside < 0.0 ? exp(hside / uHazeBand) : exp(-hside / uHazeAbove));
  if (hmask > 1e-5) {
    vec2 q = hp * uHazeScale * vec2(0.5, 1.6) - vec2(0.0, uTime * uHazeRise);
    vec2 o = vec2(vnoise(q + 17.3), vnoise(q)) - 0.5;
    uv += o * vec2(0.6 / uAspect, 2.0) * hmask;
  }
#endif
  vec4 scene = texture2D(tScene, uv);
  vec3 c = scene.rgb;

#ifdef BOOST_BLUR
  // Radial blur toward the centre, zero in the middle of the screen so the line ahead stays sharp.
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(uAspect, 1.0));
  float w = uBlur * smoothstep(uBlurInner, uBlurOuter, r);
  if (w > 0.0005) {
    vec3 acc = c;
    for (int i = 1; i < BLUR_TAPS; i++) acc += texture2D(tScene, vUv - d * (w * float(i) / float(BLUR_TAPS - 1))).rgb;
    c = acc / float(BLUR_TAPS);
    float split = uChroma * w / max(uBlur, 1e-4);
    c.r = mix(c.r, texture2D(tScene, vUv - d * split).r, 0.5);
    c.b = mix(c.b, texture2D(tScene, vUv + d * split).b, 0.5);
  }
#endif

#ifdef BLOOM
  vec3 glow = texture2D(tBloom, vUv).rgb;
  c += glow * uBloom;
#endif

#ifdef WET
  // The road writes 1 - wetness into alpha. Lights mirror about the road plane's horizon line
  // (exact for anything far away, and a fair smear for the rest), drawn from a soft level of the
  // glow chain and stretched toward the viewer like light on wet asphalt.
  float wet = 1.0 - scene.a;
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float side = dot(uHorizon.xy, p) + uHorizon.z;
  if (wet > 0.01 && side < 0.0) {
    vec2 m = p - 2.0 * side * uHorizon.xy;
    // A few evenly spaced taps would draw a few stacked copies of every light. Interleaved
    // gradient noise (Jimenez 2014) slides each pixel's taps along the streak by its own share of
    // the spacing, so neighbours sample between each other's taps and the eye integrates one
    // continuous streak. It is fixed in screen space: no shimmer from frame to frame.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec3 refl = vec3(0.0);
    float weights = 0.0;
    for (int i = 0; i < WET_TAPS; i++) {
      // t runs from the head of the streak (a little toward the horizon) down the road toward the viewer.
      float t = (float(i) + jitter) / float(WET_TAPS);
      vec2 q = m - uHorizon.xy * (uSmear * (t - WET_LEAD));
      vec2 uv = vec2(q.x / uAspect, q.y);
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      // Brightest at the head, tapering to nothing at the tail, so the streak has no far end to repeat.
      float w = 1.0 - t;
      refl += texture2D(tWet, uv).rgb * (w * inside);
      weights += w;
    }
    float grazing = mix(uNearShare, 1.0, exp(side * 4.0));
    // Fade in below the mirror line rather than starting at full strength on it.
    float edge = smoothstep(0.0, uHorizonFade, -side);
    c += refl * (wet * uWet * grazing * edge / weights);
  }
#endif

  c = aces(c);
  c = pow(max(c * uGain + uLift * (1.0 - c), 0.0), 1.0 / uGamma);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(luma), c, uSaturation), 0.0, 1.0);
  c = toSrgb(c);
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;
