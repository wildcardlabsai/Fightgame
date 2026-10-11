import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Build identity, derived from the repository (never the wall clock), so the same commit always builds the same bundle. */
const git = (args: string): string => { try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const dirty = git('status --porcelain -- src package.json index.html public') !== ''

/**
 * Two test projects. Timing-sensitive checks (a week tick relative to host speed, the eight-year world, the bench) measure wall-clock,
 * so they run AFTER everything else and one file at a time: running them beside thirty other worker processes measures contention,
 * not the engine. Nothing about their thresholds changes.
 */
const TIMING = ['src/engine/perf.test.ts', 'src/engine/longrun.test.ts', 'src/engine/sim/bench.test.ts', 'src/engine/fight/fiveyear.test.ts']

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify((git('rev-parse --short=7 HEAD') || 'unknown') + (dirty ? '+local' : '')),
    __BUILD_DATE__: JSON.stringify(git('log -1 --format=%cs') || 'unknown'),
  },
  test: {
    projects: [
      { extends: true, test: { name: 'main', environment: 'node', include: ['src/**/*.test.ts'], exclude: TIMING, testTimeout: 30_000, sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'timing', environment: 'node', include: TIMING, testTimeout: 60_000, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
} as never)
