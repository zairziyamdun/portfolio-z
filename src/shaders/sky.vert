varying vec2 vUv;

void main() {
  vUv = uv;
  // full-screen quad, independent of the camera
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
