uniform float uProgress;
varying vec2 vUv;

// Day sky at the base camp → deep blue at the summit → black space.
void main() {
  vec3 groundTop = vec3(0.45, 0.68, 0.92);
  vec3 groundBottom = vec3(0.85, 0.90, 0.95);
  vec3 summitTop = vec3(0.08, 0.22, 0.55);
  vec3 summitBottom = vec3(0.45, 0.62, 0.85);
  vec3 spaceTop = vec3(0.0, 0.0, 0.02);
  vec3 spaceBottom = vec3(0.02, 0.05, 0.12);

  float toSummit = smoothstep(0.0, 0.6, uProgress);
  float toSpace = smoothstep(0.6, 0.85, uProgress);

  vec3 top = mix(mix(groundTop, summitTop, toSummit), spaceTop, toSpace);
  vec3 bottom = mix(mix(groundBottom, summitBottom, toSummit), spaceBottom, toSpace);

  gl_FragColor = vec4(mix(bottom, top, vUv.y), 1.0);
}
