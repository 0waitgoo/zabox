export const EXPAND_SHORTCUT_KEY = 'zabox-plan-expand-shortcut-v1';
export const SHORTCUT_BINDING_KEY = 'zabox-plan-shortcut-binding-v1';
export const DEFAULT_SHORTCUT = 'Control+Backquote';
type ShortcutStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function loadExpandShortcut(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? localStorage).getItem(EXPAND_SHORTCUT_KEY) !== 'false'; } catch { return true; }
}
export function validShortcut(value: unknown): value is string {
  return typeof value === 'string' && /^(?:(?:Control|Alt|Shift|Super)\+)+(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Backquote|Space|Tab|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(value)
    && /(?:Control|Alt|Super)\+/.test(value);
}
export function loadShortcutBinding(storage?: Pick<Storage, 'getItem'>): string {
  try { const value = (storage ?? localStorage).getItem(SHORTCUT_BINDING_KEY); return validShortcut(value) ? value : DEFAULT_SHORTCUT; }
  catch { return DEFAULT_SHORTCUT; }
}
export function captureShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat'>): string | null {
  if (event.repeat) return null;
  const value = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', event.code].filter(Boolean).join('+');
  return validShortcut(value) ? value : null;
}
export function shortcutLabel(value: string): string {
  return value.split('+').map((key) => key === 'Control' ? 'Ctrl' : key === 'Super' ? 'Win' : key === 'Backquote' ? '`' : key.replace(/^(Key|Digit)/, '')).join(' + ');
}
export class DesktopShortcutController {
  enabled: boolean;
  accelerator: string;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private apply: (enabled: boolean, accelerator: string) => Promise<void>, private storage: ShortcutStorage,
    private changed: (enabled: boolean, accelerator: string) => void) {
    this.enabled = loadExpandShortcut(storage);
    this.accelerator = loadShortcutBinding(storage);
  }
  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action); this.pending = result.catch(() => undefined); return result;
  }
  initialize(): Promise<void> { return this.run(() => this.apply(this.enabled, this.accelerator)); }
  suspend(): Promise<void> { return this.run(() => this.apply(false, this.accelerator)); }
  setEnabled(enabled: boolean): Promise<void> {
    return this.run(async () => {
      await this.apply(enabled, this.accelerator);
      this.enabled = enabled;
      try { this.storage.setItem(EXPAND_SHORTCUT_KEY, String(enabled)); } catch { /* Session still works. */ }
      this.changed(enabled, this.accelerator);
    });
  }
  setAccelerator(value: string): Promise<void> {
    return this.run(async () => {
      if (!validShortcut(value)) throw new Error('Invalid shortcut');
      await this.apply(this.enabled, value);
      this.accelerator = value;
      try { this.storage.setItem(SHORTCUT_BINDING_KEY, value); } catch { /* Session still works. */ }
      this.changed(this.enabled, value);
    });
  }
}
