// Icon sprite: Orders, faction sigils, rarity gems, UI glyphs.
// Order glyphs are built to be distinguishable at 12px by *shape* alone
// (colour-blind safe): STRIKE = blade point, GUARD = shield, WOUND (the stat once called Scheme) = blood drop.

export const ORDER_COLOR = { strike: 'var(--strike)', guard: 'var(--guard)', scheme: 'var(--scheme)' };

const SPRITE = `
<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
  <symbol id="i-strike" viewBox="0 0 24 24"><path d="M12 1.5 L17.5 13 L13.6 11.6 L13.6 22.5 L10.4 22.5 L10.4 11.6 L6.5 13 Z" fill="currentColor"/></symbol>
  <symbol id="i-guard" viewBox="0 0 24 24"><path d="M12 1.8 L21 5 C21 13 18 19 12 22.6 C6 19 3 13 3 5 Z M12 5 L6 7.2 C6.2 12.6 8.2 16.6 12 19.2 Z" fill="currentColor" fill-rule="evenodd"/></symbol>
  <symbol id="i-scheme" viewBox="0 0 24 24"><path d="M12 1.8 C12 1.8 4.5 10.6 4.5 15.2 C4.5 19.4 7.9 22.4 12 22.4 C16.1 22.4 19.5 19.4 19.5 15.2 C19.5 10.6 12 1.8 12 1.8 Z M8.6 15 C8.6 17.2 10 18.8 11.8 19.2 L11.5 20.4 C9.2 19.9 7.4 17.8 7.4 15 Z" fill="currentColor" fill-rule="evenodd"/></symbol>
  <symbol id="i-voice" viewBox="0 0 24 24"><path d="M12 2 C11.2 2 10.6 2.6 10.6 3.4 L10.6 4.1 C7.4 4.8 5.4 7.6 5.4 11 L5.4 15.4 L3.4 18 L20.6 18 L18.6 15.4 L18.6 11 C18.6 7.6 16.6 4.8 13.4 4.1 L13.4 3.4 C13.4 2.6 12.8 2 12 2 Z M9.6 19.4 C9.9 20.9 10.8 22 12 22 C13.2 22 14.1 20.9 14.4 19.4 Z" fill="currentColor"/></symbol>
  <symbol id="i-mic" viewBox="0 0 24 24"><path d="M12 2 a3.6 3.6 0 0 0 -3.6 3.6 v6 a3.6 3.6 0 0 0 7.2 0 v-6 A3.6 3.6 0 0 0 12 2 Z M5.6 11 a6.4 6.4 0 0 0 12.8 0 M12 17.6 V21.4 M8.4 21.4 H15.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-mic-off" viewBox="0 0 24 24"><path d="M12 2 a3.6 3.6 0 0 0 -3.6 3.6 v6 a3.6 3.6 0 0 0 7.2 0 v-6 A3.6 3.6 0 0 0 12 2 Z M5.6 11 a6.4 6.4 0 0 0 12.8 0 M12 17.6 V21.4 M8.4 21.4 H15.6 M3.5 3.5 L20.5 20.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-speaker" viewBox="0 0 24 24"><path d="M3 9 H7 L12 4.5 V19.5 L7 15 H3 Z" fill="currentColor"/><path d="M15.5 8.5 a5 5 0 0 1 0 7 M18.3 5.8 a9 9 0 0 1 0 12.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="i-focus" viewBox="0 0 24 24"><path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="currentColor"/></symbol>
  <symbol id="i-read" viewBox="0 0 24 24"><path d="M12 3 C6 3 2 8 1 12 C2 16 6 21 12 21 C18 21 22 16 23 12 C22 8 18 3 12 3 Z M12 6.5 A5.5 5.5 0 1 0 12.01 6.5 Z" fill="currentColor" fill-rule="evenodd"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 0 L12 3 M12 21 L12 24" stroke="currentColor" stroke-width="1.6"/></symbol>
  <symbol id="i-health" viewBox="0 0 24 24"><path d="M12 21.5 C5 16.5 2 12.6 2 8.6 C2 5.4 4.5 3 7.4 3 C9.4 3 11 4.1 12 5.8 C13 4.1 14.6 3 16.6 3 C19.5 3 22 5.4 22 8.6 C22 12.6 19 16.5 12 21.5 Z" fill="currentColor"/></symbol>
  <symbol id="i-initiative" viewBox="0 0 24 24"><path d="M4 3 L20 12 L4 21 L7.5 12 Z" fill="currentColor"/></symbol>

  <symbol id="s-crown" viewBox="0 0 32 32"><path d="M4 23 L5.5 9 L10 15 L13 6 L16 13 L17.2 10.5 L19 12 M20.5 6 L22.2 15 L27 9 L28 23 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 26 L28 26" stroke="currentColor" stroke-width="2.2"/><path d="M16 17 C14 19 15 21 16 22 C17 21 18 19 16 17 Z" fill="currentColor"/></symbol>
  <symbol id="s-quiet" viewBox="0 0 32 32"><path d="M16 3 L16 6 M9 23 C9 14 10.5 7.5 16 7.5 C21.5 7.5 23 14 23 23 L26 26 L6 26 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11 29 L21 29" stroke="currentColor" stroke-width="1.6" stroke-dasharray="1.5 2.5"/></symbol>
  <symbol id="s-hour" viewBox="0 0 32 32"><path d="M8 23 C8 14 10 7.5 16 7.5 C22 7.5 24 14 24 23 L26.5 25.5 L5.5 25.5 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M16 11 L16 20 L20 23" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="4.5" r="2" fill="currentColor"/></symbol>
  <symbol id="s-margin" viewBox="0 0 32 32"><path d="M16 3 C10 3 7 8 7.5 12 C4 13 4 18 7 19 C6 23 9 27 12 26 L12 29 L20 29 L20 26 C23 27 26 23 25 19 C28 18 28 13 24.5 12 C25 8 22 3 16 3 Z" fill="currentColor" opacity=".25"/><path d="M12 29 L12 15 C12 12 14 10.5 16 10.5 C18 10.5 20 12 20 15 L20 29" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="18" cy="21" r="1.2" fill="currentColor"/></symbol>
  <symbol id="s-vigil" viewBox="0 0 32 32"><path d="M11 4 L21 4 M16 1.5 L16 4 M9.5 8 L22.5 8 L21 26 L11 26 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M11.5 17 C13.5 13.5 18.5 13.5 20.5 17 C18.5 20.5 13.5 20.5 11.5 17 Z" fill="currentColor"/><circle cx="16" cy="17" r="1.4" fill="#000"/><path d="M9 29 L23 29" stroke="currentColor" stroke-width="2.2"/></symbol>

  <symbol id="g-common" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2" fill="currentColor"/></symbol>
  <symbol id="g-rare" viewBox="0 0 20 20"><path d="M10 2 L16 10 L10 18 L4 10 Z" fill="currentColor"/></symbol>
  <symbol id="g-epic" viewBox="0 0 20 20"><path d="M10 1.5 L17.4 5.75 L17.4 14.25 L10 18.5 L2.6 14.25 L2.6 5.75 Z" fill="currentColor"/><path d="M10 5 L13.8 7.5 L13.8 12.5 L10 15 L6.2 12.5 L6.2 7.5 Z" fill="#fff" opacity=".35"/></symbol>
  <symbol id="g-legendary" viewBox="0 0 20 20"><path d="M10 0.8 L12.5 7.2 L19.2 7.5 L14 11.8 L15.8 18.6 L10 14.8 L4.2 18.6 L6 11.8 L0.8 7.5 L7.5 7.2 Z" fill="currentColor"/></symbol>
  <symbol id="g-mythic" viewBox="0 0 20 20"><path d="M10 0 L11.6 8.4 L20 10 L11.6 11.6 L10 20 L8.4 11.6 L0 10 L8.4 8.4 Z" fill="currentColor"/><circle cx="10" cy="10" r="2.2" fill="#fff"/></symbol>
  <symbol id="g-immortal" viewBox="0 0 20 20"><path d="M10 0 L11.6 8.4 L20 10 L11.6 11.6 L10 20 L8.4 11.6 L0 10 L8.4 8.4 Z" fill="currentColor"/><path d="M10 3.5 L10.9 9.1 L16.5 10 L10.9 10.9 L10 16.5 L9.1 10.9 L3.5 10 L9.1 9.1 Z" fill="#000"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/></symbol>

  <symbol id="u-vault" viewBox="0 0 24 24"><path d="M3 21 L3 9 L12 3 L21 9 L21 21 Z M7 21 L7 12 L17 12 L17 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></symbol>
  <symbol id="u-pack" viewBox="0 0 24 24"><path d="M5 3 L19 3 L19 21 L5 21 Z M5 7 L19 7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11 L13.4 14 L16.5 14.3 L14.2 16.3 L14.9 19.4 L12 17.8 L9.1 19.4 L9.8 16.3 L7.5 14.3 L10.6 14 Z" fill="currentColor"/></symbol>
  <symbol id="u-battle" viewBox="0 0 24 24"><path d="M3 3 L10 3 L21 14 L18 17 L7 6 L3 6 Z M21 3 L14 3 L10.5 6.5 L13.5 9.5 L17 6 L21 6 Z M4 17 L7 20 L4.5 22.5 L1.5 19.5 Z M17 20 L20 17 L22.5 19.5 L19.5 22.5 Z" fill="currentColor"/></symbol>
  <symbol id="u-close" viewBox="0 0 24 24"><path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" stroke-width="2.2"/></symbol>
</svg>`;

export function installIcons() {
  if (document.getElementById('threnyx-icons')) return;
  const d = document.createElement('div');
  d.id = 'threnyx-icons';
  d.innerHTML = SPRITE;
  document.body.prepend(d);
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
