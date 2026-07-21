export interface Rng { next(): number }
export class SeededRng implements Rng {
  private seed: number
  constructor(seed = 1) { this.seed = seed }
  next() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 0x100000000 }
}
