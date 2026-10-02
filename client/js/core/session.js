// Hands a battle spec from the screen that starts a Match to the battle
// screen (specs can contain functions, so they don't go through the URL).
let pending = null;
export function setBattle(spec) {
  pending = spec;
}
export function takeBattle() {
  const s = pending;
  pending = null;
  return s;
}
/** The battle about to start, without taking it. */
export const peekBattle = () => pending;
export function hasBattle() {
  return !!pending;
}
