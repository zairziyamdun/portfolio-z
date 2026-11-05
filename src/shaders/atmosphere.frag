uniform vec3 uCenter;
uniform float uInner;
uniform float uOuter;
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform vec3 uSunColor;
uniform float uStrength;
varying vec3 vWorld;

// Glow from the length of the view ray inside the shell (stopped by the planet), so the
// same shader works from inside the atmosphere (bright horizon, dark zenith) and from orbit.
void main() {
  vec3 o = cameraPosition - uCenter;
  vec3 d = normalize(vWorld - cameraPosition);
  float b = dot(o, d);
  float oo = dot(o, o);
  float h = b * b - (oo - uOuter * uOuter);
  if (h <= 0.0) discard;
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = -b + h;
  float he = b * b - (oo - uInner * uInner);
  if (he > 0.0) {
    float te = -b - sqrt(he);
    if (te > 0.0) t1 = min(t1, te);
  }
  float density = max(t1 - t0, 0.0) / (2.0 * sqrt(uOuter * uOuter - uInner * uInner));

  vec3 mid = normalize(o + d * (t0 + t1) * 0.5);
  float day = smoothstep(-0.3, 0.35, dot(mid, uSunDir));
  float toward = pow(max(dot(d, uSunDir), 0.0), 6.0);
  vec3 color = uColor * (0.1 + day) + uSunColor * toward * day * 1.5;
  float a = (1.0 - exp(-pow(density, 1.6) * 3.5)) * uStrength;

  gl_FragColor = vec4(color * a, 1.0);
  #include <colorspace_fragment>
}
