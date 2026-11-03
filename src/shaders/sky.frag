uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSunStrength;
varying vec3 vDir;

// Gradient by view elevation plus a soft sun glow; colours arrive in linear space.
void main() {
  vec3 dir = normalize(vDir);
  float h = smoothstep(-0.08, 0.55, dir.y);
  vec3 color = mix(uHorizon, uTop, h);

  float d = max(dot(dir, uSunDir), 0.0);
  color += uSun * (pow(d, 6.0) * 0.18 + pow(d, 64.0) * 0.5 + pow(d, 900.0) * 2.0) * uSunStrength;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
