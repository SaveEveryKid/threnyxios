// "Add THRENYX to your home screen": the real install prompt where the browser
// offers one (Android, desktop Chrome/Edge); on iPhone and iPad, where websites
// can't prompt, the two taps to do it by hand.
let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep it for our button
  deferred = e;
});
addEventListener('appinstalled', () => (deferred = null));

/** Already running from the home screen? */
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0);

export async function install(ctx) {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({}));
    deferred = null;
    if (outcome === 'accepted') ctx.toast('THRENYX is on your home screen');
    return;
  }
  const chrome = /CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const steps = iOS()
    ? chrome
      ? ['Tap the <b>Share</b> button at the top right of the address bar (a square with an arrow).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>.']
      : ['Tap the <b>Share</b> button at the bottom of Safari (a square with an arrow).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>.']
    : ['Open your browser’s menu (<b>⋮</b> at the top right).', 'Tap <b>Add to Home screen</b> or <b>Install app</b>.', 'Tap <b>Install</b>.'];
  ctx.modal(`<div style="max-width:340px"><div class="kicker">Home screen</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">Add THRENYX to your phone</div>
    <ol class="okt-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    <div class="muted" style="font-size:13px;margin-top:10px">THRENYX then opens full screen from its own icon, like an app.</div></div>`);
}
