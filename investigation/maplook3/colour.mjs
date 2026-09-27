import assert from 'node:assert/strict';

/** Read lossless, synchronized canvas pixels. UI and the separate tree panel never
 * enter the sample. A second Standard draw with a black sky supplies one shared
 * geometry mask; High cannot pass the map test by brightening its backdrop. */
export async function measureColour(page) {
  return page.evaluate(() => {
    const a = window.maplook3; a.freeze(8);
    function pixels(r) {
      r.renderNow();
      const gl = r.canvas.getContext('webgl2');
      const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p);
      return p;
    }
    const standard = pixels(a.standard), high = pixels(a.high);
    const sky = a.standard.sky, original = sky.material, black = original.clone();
    black.fragmentShader = 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';
    let mask;
    try { sky.material = black; mask = pixels(a.standard); }
    finally { sky.material = original; black.dispose(); a.standard.renderNow(); }
    const linear = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
    function average(p, region) {
      let count = 0, brightness = 0, luminance = 0, saturation = 0, chroma = 0, clipped = 0;
      const rgb = [0, 0, 0];
      for (let i = 0; i < p.length; i += 4) {
        if (region !== 'frame' && Math.max(mask[i], mask[i + 1], mask[i + 2]) < 8) continue;
        // Choose sunny yellow-green reference pixels once for both renderers.
        if (region === 'sunnyGreen' && !(standard[i] > .6 * standard[i + 1] && standard[i] < .96 * standard[i + 1] && standard[i + 2] < .55 * standard[i + 1] && standard[i + 1] > 95)) continue;
        const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        count++; brightness += .2126 * r + .7152 * g + .0722 * b;
        luminance += .2126 * linear[p[i]] + .7152 * linear[p[i + 1]] + .0722 * linear[p[i + 2]];
        saturation += max ? (max - min) / max : 0; chroma += max - min;
        clipped += max === 1 ? 1 : 0; rgb[0] += r; rgb[1] += g; rgb[2] += b;
      }
      const mean = rgb.map(c => c / count), max = Math.max(...mean), min = Math.min(...mean), span = max - min;
      const hue = !span ? 0 : 60 * (max === mean[0] ? ((mean[1] - mean[2]) / span + 6) % 6 : max === mean[1] ? (mean[2] - mean[0]) / span + 2 : (mean[0] - mean[1]) / span + 4);
      return { pixels: count, brightness: brightness / count, linearLuminance: luminance / count, saturation: saturation / count, chroma: chroma / count, clippedFraction: clipped / count, rgb: mean, hueOfMeanRgb: hue };
    }
    const out = {};
    for (const region of ['frame', 'map', 'sunnyGreen']) {
      const s = average(standard, region), h = average(high, region);
      out[region] = { standard: s, high: h, ratio: { brightness: h.brightness / s.brightness, linearLuminance: h.linearLuminance / s.linearLuminance, saturation: h.saturation / s.saturation } };
    }
    return out;
  });
}

export function assertColour(result, label) {
  for (const region of ['frame', 'map', 'sunnyGreen']) {
    assert.ok(result[region].standard.pixels > 1000, `${label}: ${region} mask is empty`);
    for (const metric of ['brightness', 'linearLuminance', 'saturation']) {
      assert.ok(result[region].ratio[metric] >= 1, `${label} ${region} ${metric}: High / Standard = ${result[region].ratio[metric]}`);
    }
  }
  for (const region of ['frame', 'map']) assert.ok(result[region].ratio.saturation <= 1.30, `${label} ${region}: saturation overshoots +30%`);
}
