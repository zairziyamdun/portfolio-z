uniform sampler2D uMap;
uniform vec3 uLight;
uniform vec3 uShade;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
#include <fog_pars_fragment>

// Soft puff: lit tops, shaded bellies; colours arrive in linear space.
void main() {
  vec4 tex = texture2D(uMap, vUv);
  vec3 color = mix(uShade, uLight, clamp(vUv.y * 0.7 + tex.r * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(color, tex.a * uOpacity * vAlpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
