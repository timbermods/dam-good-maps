      // Delta's threads share a falling bed at each downstream position across the fan.
      // Arc length differs when a thread bends: comparing equal arc distances let the lower
      // thread steal the whole flow. Recut all threads before the land is shown, never raise one.
      const axis = alongEdge ? 0 : 1, sign = e === "west" || e === "south" ? -1 : 1;
      const bins = Math.max(1, Math.ceil(reach));
      const level = new Float64Array(bins + 1).fill(Infinity);
      const plans = [...armBeds, {prof:pb.prof,L:pb.L,n:pb.n,course:below,st:pb.st,half:bhalf}];
      const at = (p: Point) => Math.round(clamp(sign * (p[axis] - p0[axis]), 0, bins));
      for (const plan of plans) for (let q = 0; q <= plan.n; q++) {
        const row = at(pointAt(plan.course, q * plan.L / plan.n).p);
        level[row] = Math.min(level[row], plan.prof[q]);
      }
      let run = m.prof[j0];
      for (let q = 0; q <= bins; q++) {run = Math.min(run, level[q]);level[q] = run;}
      for (const plan of [...plans, ...braidBeds]) {
        for (let q = 0; q <= plan.n; q++) plan.prof[q] = Math.min(plan.prof[q], level[at(pointAt(plan.course, q * plan.L / plan.n).p)]);
        carve(plan.st, plan.prof, plan.L, plan.n, plan.half, 1.8);
      }
      const bed = pb.prof.slice();
