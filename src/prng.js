export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function randint(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo));
}

export function choice(rng, xs) {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];
}

export function shuffle(rng, xs) {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function deriveSeed(seed, tag) {
  let h = seed >>> 0;
  for (let i = 0; i < String(tag).length; i++) {
    h ^= String(tag).charCodeAt(i);
    h = Math.imul(h, 0x45d9f3b) >>> 0;
    h ^= h >>> 16;
  }
  return h >>> 0;
}
