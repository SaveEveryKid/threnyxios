// Copy text to the clipboard, with a fallback for older browsers. Returns true if it worked.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers: copy from a hidden text box
    const t = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(t);
    t.select();
    t.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    t.remove();
    return ok;
  }
}
