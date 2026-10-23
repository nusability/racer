// Getting text off the phone: clipboard where allowed, the share sheet where available, and a
// selectable text box as the fallback (clipboard needs a secure context and a fresh gesture).
import { button, h } from './kit.ts';

/** Copies, or shows `text` in a selectable overlay when the clipboard refuses. */
export async function copyText(text: string, host: HTMLElement): Promise<'copied' | 'shown'> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (err) {
      console.warn('[debug] Clipboard write refused; showing the text to copy by hand.', err);
    }
  }
  showText(text, host);
  return 'shown';
}

export function canShare(): boolean {
  return typeof navigator.share === 'function';
}

export async function shareText(title: string, text: string): Promise<void> {
  try {
    await navigator.share({ title, text });
  } catch (err) {
    // Dismissing the share sheet rejects with AbortError; that is the player's choice, not a fault.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    throw err;
  }
}

function showText(text: string, host: HTMLElement): void {
  const area = h('textarea', 'copybox__text');
  area.value = text;
  area.readOnly = true;
  area.id = 'debug_copy_field';
  const overlay = h(
    'div',
    'copybox',
    h('div', 'copybox__panel', h('p', 'note', 'Copy is blocked here: select the text and copy it.'), area, button({ id: 'debug_copyclose_button', label: 'CLOSE', aria: 'Close', variant: 'primary', onTap: () => overlay.remove() })),
  );
  host.append(overlay);
  area.focus();
  area.select();
}
