// Exact solver for two-player zero-sum matrix games (row player maximizes).
// Classic LP reduction solved with a dense tableau simplex (Bland's rule, so
// degenerate game matrices - common here - cannot cycle).
// Returns { value, row: mixed strategy, col: mixed strategy }.

const EPS = 1e-10;

export function solveGame(A) {
  const m = A.length;
  const n = A[0].length;
  if (m === 1) {
    let best = Infinity;
    let bj = 0;
    for (let j = 0; j < n; j++) if (A[0][j] < best) ((best = A[0][j]), (bj = j));
    const col = new Array(n).fill(0);
    col[bj] = 1;
    return { value: best, row: [1], col };
  }
  if (n === 1) {
    let best = -Infinity;
    let bi = 0;
    for (let i = 0; i < m; i++) if (A[i][0] > best) ((best = A[i][0]), (bi = i));
    const row = new Array(m).fill(0);
    row[bi] = 1;
    return { value: best, row, col: [1] };
  }
  let min = Infinity;
  for (const r of A) for (const v of r) if (v < min) min = v;
  const shift = 1 - min; // all entries >= 1  => game value > 0
  const W = n + m + 1;
  const T = new Array(m + 1);
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(W);
    for (let j = 0; j < n; j++) row[j] = A[i][j] + shift;
    row[n + i] = 1;
    row[W - 1] = 1;
    T[i] = row;
  }
  const obj = new Float64Array(W);
  for (let j = 0; j < n; j++) obj[j] = -1;
  T[m] = obj;
  const basis = new Int32Array(m);
  for (let i = 0; i < m; i++) basis[i] = n + i;

  for (let iter = 0; iter < 5000; iter++) {
    // Bland: smallest index with negative reduced cost.
    let pc = -1;
    for (let j = 0; j < W - 1; j++) {
      if (obj[j] < -EPS) {
        pc = j;
        break;
      }
    }
    if (pc < 0) break;
    let pr = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i][pc];
      if (a > EPS) {
        const ratio = T[i][W - 1] / a;
        if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && basis[i] < basis[pr])) {
          best = ratio;
          pr = i;
        }
      }
    }
    if (pr < 0) throw new Error('Unbounded LP (should be impossible for a game)');
    const prow = T[pr];
    const pv = prow[pc];
    for (let j = 0; j < W; j++) prow[j] /= pv;
    for (let i = 0; i <= m; i++) {
      if (i === pr) continue;
      const r = T[i];
      const f = r[pc];
      if (Math.abs(f) < EPS) continue;
      for (let j = 0; j < W; j++) r[j] -= f * prow[j];
    }
    basis[pr] = pc;
  }

  const w = new Float64Array(n);
  for (let i = 0; i < m; i++) if (basis[i] < n) w[basis[i]] = T[i][W - 1];
  let sw = 0;
  for (let j = 0; j < n; j++) sw += w[j];
  const col = Array.from(w, (x) => Math.max(0, x / sw));
  const row = new Array(m);
  let sx = 0;
  for (let i = 0; i < m; i++) {
    row[i] = Math.max(0, obj[n + i]);
    sx += row[i];
  }
  for (let i = 0; i < m; i++) row[i] /= sx;
  return { value: 1 / sw - shift, row, col };
}
