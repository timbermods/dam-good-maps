/** Identical deformation for visible and depth geometry. Roots stay fixed; no CPU matrix animation. */
export const windGLSL = /* glsl */ `
attribute vec4 wind;
uniform float vegTime;
uniform float vegSway;
vec2 windVector() {
  if (vegSway < 0.001 || wind.z < 0.001) return vec2(0.0);
  float t = vegTime * wind.y;
  return wind.z * vegSway * vec2(sin(t + wind.x) + 0.28 * sin(t * 1.73 + wind.x * 2.3), 0.48 * cos(t * 0.83 + wind.x));
}
vec3 bend(vec3 p, vec2 w) {
  float h = max(wind.w, 0.1);
  p.xz += w * pow(max(p.y, 0.0) / h, 2.0);
  return p;
}
vec3 bendNormal(vec3 p, vec3 n, vec2 w) {
  n.y -= dot(w, n.xz) * 2.0 * max(p.y, 0.0) / max(wind.w * wind.w, 0.01);
  return normalize(n);
}
`;
export const motion = { vegTime: { value: 8 }, vegSway: { value: 1 } };
