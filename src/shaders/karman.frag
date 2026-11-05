uniform vec3 uCenter;
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vWorld;

// A thin line where the view grazes the 100 km shell: above the limb from orbit,
// along the horizon from below; it flares while the camera crosses it.
void main() {
  vec3 n = normalize(vWorld - uCenter);
  vec3 d = normalize(vWorld - cameraPosition);
  float line = pow(1.0 - abs(dot(n, d)), 60.0);
  gl_FragColor = vec4(uColor * line * uStrength, 1.0);
  #include <colorspace_fragment>
}
