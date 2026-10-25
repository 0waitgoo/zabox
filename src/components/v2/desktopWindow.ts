/** All dimensions here are physical CLIENT sizes; positions are physical OUTER positions. */
export type DesktopRect = { x: number; y: number; width: number; height: number };
export type DesktopEdge = 'left' | 'right' | 'top' | 'bottom';
export type DesktopBounds = { x: number; y: number; width: number; height: number };

export function edgeAt(rect: DesktopRect, bounds: DesktopBounds, tolerance: number): DesktopEdge | null {
  if (rect.x + rect.width >= bounds.x + bounds.width - tolerance) return 'right';
  if (rect.x <= bounds.x + tolerance) return 'left';
  if (rect.y <= bounds.y + tolerance) return 'top';
  if (rect.y + rect.height >= bounds.y + bounds.height - tolerance) return 'bottom';
  return null;
}

export interface DesktopWindowAdapter {
  readRect(): Promise<DesktopRect>;
  readOuterRect(): Promise<DesktopRect>;
  scaleFactor(): Promise<number>;
  setSize(width: number, height: number): Promise<void>;
  setMinSize(width: number, height: number): Promise<void>;
  setPosition(x: number, y: number): Promise<void>;
  isMaximized(): Promise<boolean>;
  unmaximize(): Promise<void>;
  toggleMaximize(): Promise<void>;
}

/** Serialize transitions so rapid clicks cannot capture an intermediate strip size. */
export class DesktopWindowController {
  private pending: Promise<unknown> = Promise.resolve();
  private fullRect: DesktopRect | null = null;
  private edgeRect: DesktopRect | null = null;
  headerOnly = false;
  edge: DesktopEdge | null = null;

  constructor(private win: DesktopWindowAdapter, private changed: () => void) {}

  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => undefined);
    return result;
  }

  enterHeader(): Promise<void> {
    return this.run(async () => {
      if (this.headerOnly || this.edge) return;
      if (await this.win.isMaximized()) await this.win.unmaximize();
      const rect = await this.win.readRect();
      const scale = await this.win.scaleFactor();
      // Lower the minimum BEFORE requesting the strip height.
      await this.win.setMinSize(320, 48);
      try {
        await this.win.setSize(Math.max(rect.width, Math.round(320 * scale)), Math.round(48 * scale));
      } catch (error) {
        await this.win.setMinSize(280, 200);
        throw error;
      }
      this.fullRect = rect;
      this.headerOnly = true;
      this.changed();
    });
  }

  private async restoreHeader(): Promise<void> {
    if (!this.headerOnly || !this.fullRect) return;
    if (await this.win.isMaximized()) await this.win.unmaximize();
    await this.win.setMinSize(280, 200);
    await this.win.setSize(this.fullRect.width, this.fullRect.height);
    // Keep the current position: the strip may have been dragged elsewhere.
    this.headerOnly = false;
    this.changed();
  }

  exitHeader(): Promise<void> {
    return this.run(() => this.restoreHeader());
  }

  maximize(): Promise<void> {
    return this.run(async () => {
      await this.restoreHeader();
      await this.win.toggleMaximize();
    });
  }

  collapse(bounds: DesktopBounds): Promise<void> {
    return this.run(async () => {
      if (this.headerOnly || this.edge || await this.win.isMaximized()) return;
      const rect = await this.win.readOuterRect();
      const scale = await this.win.scaleFactor();
      const edge = edgeAt(rect, bounds, 4 * scale);
      if (!edge) return;
      const peek = Math.round(24 * scale);
      const x = edge === 'right' ? bounds.x + bounds.width - peek
        : edge === 'left' ? bounds.x - rect.width + peek : rect.x;
      const y = edge === 'bottom' ? bounds.y + bounds.height - peek
        : edge === 'top' ? bounds.y - rect.height + peek : rect.y;
      await this.win.setPosition(x, y);
      this.edgeRect = rect;
      this.edge = edge;
      this.changed();
    });
  }

  restoreEdge(): Promise<void> {
    return this.run(async () => {
      if (!this.edge || !this.edgeRect) return;
      await this.win.setPosition(this.edgeRect.x, this.edgeRect.y);
      // Edge hiding only changes position, never size.
      this.edge = null;
      this.changed();
    });
  }
}
