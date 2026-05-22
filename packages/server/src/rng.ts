import { randomInt } from 'node:crypto';

export type RNG = (min: number, max: number) => number;

// Cryptographically secure RNG using node:crypto
export const cryptoRNG: RNG = (min, max) => randomInt(min, max);

// Seeded deterministic RNG for tests (xorshift32)
export function makeSeededRNG(seed: number): RNG {
  let s = seed >>> 0;
  return (min, max) => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const range = max - min;
    return min + ((s >>> 0) % range);
  };
}
