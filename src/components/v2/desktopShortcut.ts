export const EXPAND_SHORTCUT_KEY = 'zabox-plan-expand-shortcut-v1';

type ShortcutStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function loadExpandShortcut(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? localStorage).getItem(EXPAND_SHORTCUT_KEY) !== 'false'; }
  catch { return true; }
}

export class DesktopShortcutController {
  enabled: boolean;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private apply: (enabled: boolean) => Promise<void>, private storage: ShortcutStorage,
    private changed: (enabled: boolean) => void) {
    this.enabled = loadExpandShortcut(storage);
  }
  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => undefined);
    return result;
  }
  initialize(): Promise<void> { return this.run(() => this.apply(this.enabled)); }
  setEnabled(enabled: boolean): Promise<void> {
    return this.run(async () => {
      await this.apply(enabled);
      this.enabled = enabled;
      try { this.storage.setItem(EXPAND_SHORTCUT_KEY, String(enabled)); } catch { /* Keep the session usable. */ }
      this.changed(enabled);
    });
  }
}
