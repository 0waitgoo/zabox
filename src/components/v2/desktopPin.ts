export const PIN_KEY = 'zabox-plan-always-on-top-v1';

type PinStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadAlwaysOnTop(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? localStorage).getItem(PIN_KEY) !== 'false'; } catch { return true; }
}

/** Save only after the native operation succeeds; serialize startup and clicks. */
export class DesktopPinController {
  pinned: boolean;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private setNative: (pinned: boolean) => Promise<void>,
    private storage: PinStorage,
    private changed: (pinned: boolean) => void,
  ) {
    this.pinned = loadAlwaysOnTop(storage);
  }

  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => undefined);
    return result;
  }

  initialize(): Promise<void> {
    return this.run(() => this.setNative(this.pinned));
  }

  toggle(): Promise<void> {
    return this.run(async () => {
      const next = !this.pinned;
      await this.setNative(next);
      this.pinned = next;
      try { this.storage.setItem(PIN_KEY, String(next)); } catch { /* session remains usable */ }
      this.changed(next);
    });
  }
}
