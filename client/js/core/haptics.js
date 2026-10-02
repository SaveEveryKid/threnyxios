// Haptics: scarce on purpose. Strong patterns are reserved for moments that
// deserve them (READ, Mythic, match end) so they stay meaningful.
let enabled = true;
export function setHaptics(on) {
  enabled = on;
}
const vib = (p) => {
  if (!enabled) return;
  try {
    navigator.vibrate?.(p);
  } catch {
    /* unsupported */
  }
};
export const haptic = {
  tick: () => vib(6),
  lock: () => vib(18),
  slam: () => vib([30]),
  read: () => vib([12, 40, 60]),
  misread: () => vib([40, 30, 10]),
  tear: () => vib([8, 20, 8, 20, 30]),
  rare: () => vib(20),
  legendary: () => vib([20, 60, 40]),
  mythic: () => vib([90]),
  immortal: () => vib([60, 80, 120]),
  win: () => vib([20, 40, 20, 40, 80]),
};
