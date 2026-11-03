uniform float uProgress;
varying vec2 vUv;

// Pre-dawn at the base camp → deep blue at the summit → black space.
// Kept dark throughout so light text stays readable (contrast ≥ 4.5:1).
void main() {
  vec3 groundTop = vec3(0.07, 0.13, 0.27);
  vec3 groundBottom = vec3(0.32, 0.26, 0.33);
  vec3 summitTop = vec3(0.03, 0.07, 0.18);
  vec3 summitBottom = vec3(0.12, 0.20, 0.36);
  vec3 spaceTop = vec3(0.0, 0.0, 0.02);
  vec3 spaceBottom = vec3(0.02, 0.05, 0.12);

  float toSummit = smoothstep(0.0, 0.6, uProgress);
  float toSpace = smoothstep(0.6, 0.85, uProgress);

  vec3 top = mix(mix(groundTop, summitTop, toSummit), spaceTop, toSpace);
  vec3 bottom = mix(mix(groundBottom, summitBottom, toSummit), spaceBottom, toSpace);

  gl_FragColor = vec4(mix(bottom, top, vUv.y), 1.0);
}
