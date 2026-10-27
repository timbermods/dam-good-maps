    // Delta's fan is fed from the actual lake floor, not an outlet profile that can stand
    // above the lake's settled water. Do this before drawing any arm, so its bed shares it.
    if (fan) {
      const bed = m.prof.slice();
      let run = Infinity;
      for (let q = 0; q <= m.n; q++) {
        const s = q * m.L / m.n, {p:[px,py]} = pointAt(m.path, s);
        const r = m.half(s, m.L);
        for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++)
          for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W - 1, Math.ceil(px + r)); x++) {
            const i = y * W + x;
            if (water[i] === 2 && (x-px)*(x-px)+(y-py)*(y-py) < r*r) run = Math.min(run, h[i]);
          }
        run = Math.max(BED_FLOOR, Math.min(run, bed[q]));
        bed[q] = run;
      }
      const st = stamp(m.path, W, H, Math.ceil(m.width / 2 + 3));
      carve(st, bed, m.L, m.n, m.half, 0);
      m.prof.set(bed);
      const steps: BedStep[] = [];
      for (let q = 1; q <= m.n; q++) if (bed[q-1] > bed[q])
        steps.push({at:Math.round(q * m.L / m.n * 100)/100,drop:bed[q-1]-bed[q]});
      main.params.bedProfile = {start:bed[0],steps};
    }
