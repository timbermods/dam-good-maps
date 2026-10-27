      // A short second thread round an island on a flat reach; both threads keep one bed.
      // This never adds a new mouth or changes the fan's slots, and never cuts a lower shortcut.
      if (fan && natural && a % 2 === 0 && pa.L > 38) {
        const bs = hash32(seed, "delta-braid", attempt, a);
        const sA = pa.L * (0.38 + 0.12 * fbm(bs, 0, 0, 3, 1));
        const sB = Math.min(pa.L - 9, sA + 20 + 6 * fbm(bs, 1, 0, 3, 1));
        const ja = Math.round(sA / pa.L * pa.n), jb = Math.round(sB / pa.L * pa.n);
        const bed = pa.prof[ja];
        let flat = sB - sA >= 16, lo = Infinity, hi = -Infinity;
        for (let q = ja; q <= jb; q++) {
          if (pa.prof[q] !== bed) flat = false;
          const [x, y] = pointAt(armCourse, q * pa.L / pa.n).p;
          const z = deltaGround![Math.round(clamp(y, 0, H - 1)) * W + Math.round(clamp(x, 0, W - 1))];
          lo = Math.min(lo, z);hi = Math.max(hi, z);
        }
        if (flat && hi - lo <= 1) {
          const branch: Point[] = [], side = (bs & 1) ? 1 : -1;
          let clear = true;
          for (let q = 0; q <= 24; q++) {
            const t = q / 24, {p, n} = pointAt(armCourse, sA + t * (sB - sA));
            const off = side * clamp(gap * 0.28, 4.5, 7) * sinDet(TWO_PI * t / 2);
            const x = p[0] + n[0] * off, y = p[1] + n[1] * off;
            if (x < 3 || y < 3 || x > W - 4 || y > H - 4) {clear = false;break;}
            const i = Math.round(y) * W + Math.round(x);
            if (protect?.[i] || (q > 5 && q < 19 && water[i])) clear = false;
            branch.push([x, y]);
          }
          if (clear) {
            const width = Math.max(1.8, aw * 0.75), half = () => width / 2;
            const bp = profileOf(branch, width, 1, false, main.id, half, bed, bed);
            bp.prof.fill(bed);carve(bp.st, bp.prof, bp.L, bp.n, half, 1.2);markArm(bp.st, bp.L, half);
            arms.push({kind:"split", river:main.id, path:branch});
          }
        }
      }
