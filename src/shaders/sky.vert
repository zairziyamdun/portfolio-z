varying vec3 vDir;

// Sky dome centred on the camera: only the view direction matters.
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // keep the dome on the far plane so it never clips the terrain
  gl_Position.z = gl_Position.w;
}
