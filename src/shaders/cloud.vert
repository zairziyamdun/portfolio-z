varying vec2 vUv;
varying float vAlpha;
#include <fog_pars_vertex>

// Instanced billboard: each instance is a camera-facing quad scaled by its matrix.
void main() {
  vUv = uv;
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scale = length(instanceMatrix[0].xyz);
  mvPosition.xy += position.xy * scale;
  // puffs right in front of the lens fade out instead of filling the screen with one blob
  vAlpha = smoothstep(4.0, 60.0, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
