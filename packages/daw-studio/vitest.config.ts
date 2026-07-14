import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom so future React Testing Library / AudioParam mock-based tests can
    // run side-by-side with the existing pure-TS tests.  The current test
    // suite only touches `Math`/`DataView`/arrays — none of that requires a
    // DOM, but switching to jsdom now avoids a churn later when component
    // tests land.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],

    // AudioParam / AudioNode / OfflineAudioContext are *not* implemented in
    // jsdom.  We provide a lightweight mock surface in `testSetup.ts` so engine
    // tests can assert graph wiring & scheduling without spawning the real
    // audio thread.  (Tests that need sample-accurate PCM must pull in a real
    // polyfill such as `standardized-audio-context` separately.)
    setupFiles: ['src/__test__/testSetup.ts'],
  },
})