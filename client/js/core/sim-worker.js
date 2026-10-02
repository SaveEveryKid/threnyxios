// Runs the Octave builder's test Duels off the page thread (screens/octave.js).
import { testOctave } from '../../../engine/deckbuild.js';

self.onmessage = async (e) => {
  const { ids, gauntlet, n, seed } = e.data;
  const r = await testOctave(ids, gauntlet, { n, seed, chunk: 4, onProgress: (done, total, wins) => self.postMessage({ progress: [done, total, wins] }) });
  self.postMessage({ result: r });
};
