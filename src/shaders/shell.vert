varying vec3 vWorld;

// Shared by the atmosphere and the Karman line: fragments only need their world position.
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
