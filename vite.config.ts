import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Two test projects. Timing-sensitive checks (a week tick relative to host speed, the eight-year world, the bench) measure wall-clock,
 * so they run AFTER everything else and one file at a time: running them beside thirty other worker processes measures contention,
 * not the engine. Nothing about their thresholds changes.
 */
const TIMING = ['src/engine/perf.test.ts', 'src/engine/longrun.test.ts', 'src/engine/sim/bench.test.ts']

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'main', environment: 'node', include: ['src/**/*.test.ts'], exclude: TIMING, testTimeout: 30_000, sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'timing', environment: 'node', include: TIMING, testTimeout: 60_000, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
} as never)
