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

/** Restore a hidden edge, then hide to the tray and remove the taskbar entry. */
export async function applyCloseAction(
  minimize: boolean,
  win: { hide(): Promise<void>; setSkipTaskbar(skip: boolean): Promise<void>; close(): Promise<void> },
  restoreEdge: () => Promise<void>,
): Promise<void> {
  if (minimize) {
    await restoreEdge();
    await win.setSkipTaskbar(true);
    try { await win.hide(); }
    catch (error) {
      await win.setSkipTaskbar(false);
      throw error;
    }
  } else {
    await win.close();
  }
}
