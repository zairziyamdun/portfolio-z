uniform vec3 uSunDir;
uniform vec3 uAtmosphere;
varying vec3 vColor;
varying float vCity;
varying vec3 vWorld;
varying vec3 vNormal;
#include <fog_pars_fragment>

// Procedural planet, lit per face so it reads as low-poly like the mountain; colours come from the vertex shader.
void main() {
  vec3 faceNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float sun = dot(vNormal, uSunDir);
  float day = smoothstep(-0.12, 0.22, sun);
  vec3 lit = vColor * (max(dot(faceNormal, uSunDir), 0.0) * 0.9 + 0.12) * day * 1.7;

  // city lights on the night side
  lit += vec3(1.0, 0.62, 0.28) * vCity * (1.0 - smoothstep(-0.15, 0.05, sun)) * 0.35;

  // atmospheric haze toward the limb, mostly on the day side
  vec3 view = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(vNormal, view), 0.0), 3.0);
  lit += uAtmosphere * rim * (0.08 + day * 0.9);

  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
