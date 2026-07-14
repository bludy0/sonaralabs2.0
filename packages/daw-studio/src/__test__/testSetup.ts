// Vitest setup — side-effect import: registers Mock AudioContext /
// OfflineAudioContext / AudioParam globals on `globalThis`. The defining
// module is in `mockCtx.ts` so individual tests can also import the classes
// directly when they need a typed reference.
import './mockCtx'