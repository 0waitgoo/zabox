export const MINIMIZE_ON_CLOSE_KEY = 'zabox-plan-minimize-on-close-v1';

type CloseStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadMinimizeOnClose(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? localStorage).getItem(MINIMIZE_ON_CLOSE_KEY) !== 'false'; }
  catch { return true; }
}

export function saveMinimizeOnClose(value: boolean, storage?: CloseStorage): void {
  try { (storage ?? localStorage).setItem(MINIMIZE_ON_CLOSE_KEY, String(value)); }
  catch { /* Keep the preference usable for this session. */ }
}

/** Restore a hidden edge before minimizing so taskbar activation remains usable. */
export async function applyCloseAction(
  minimize: boolean,
  win: { minimize(): Promise<void>; close(): Promise<void> },
  restoreEdge: () => Promise<void>,
): Promise<void> {
  if (minimize) {
    await restoreEdge();
    // If minimize fails, keep the window open and let the caller report it.
    await win.minimize();
  } else {
    await win.close();
  }
}
