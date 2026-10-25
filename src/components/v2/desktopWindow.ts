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
  private stripSize: { width: number; height: number } | null = null;
  headerOnly = false;
  edge: DesktopEdge | null = null;

  constructor(private win: DesktopWindowAdapter, private changed: () => void) {}

  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action);
    this.pending = result.catch(() => undefined);
    return result;
  }

  enterHeader(): Promise<void> {
    return this.run(() => this.collapseHeader());
  }

  private async collapseHeader(): Promise<void> {
    if (this.headerOnly || this.edge) return;
    if (await this.win.isMaximized()) await this.win.unmaximize();
    const rect = await this.win.readRect();
    const scale = await this.win.scaleFactor();
    // Lower the minimum BEFORE requesting the strip height.
    await this.win.setMinSize(232, 48);
    try {
      const stripHeight = Math.round(48 * scale);
      await this.win.setSize(Math.round(232 * scale), stripHeight);
    } catch (error) {
      await this.win.setMinSize(280, 200);
      throw error;
    }
    this.fullRect = rect;
    this.stripSize = { width: Math.round(232 * scale), height: Math.round(48 * scale) };
    this.headerOnly = true;
    this.changed();
  }

  private async restoreHeader(): Promise<void> {
    if (!this.headerOnly || !this.fullRect) return;
    if (await this.win.isMaximized()) await this.win.unmaximize();
    await this.win.setMinSize(280, 200);
    await this.win.setSize(this.fullRect.width, this.fullRect.height);
    // Expand downward from the strip's current position without moving the toolbar.
    this.headerOnly = false;
    this.changed();
  }

  /** Native resize events share the transition queue, so our own strip resize is ignored. */
  handleResize(): Promise<void> {
    return this.run(async () => {
      if (!this.headerOnly || !this.stripSize || this.edge) return;
      const rect = await this.win.readRect();
      const scale = await this.win.scaleFactor();
      const tolerance = 8 * scale;
      if (rect.width <= this.stripSize.width + tolerance && rect.height <= this.stripSize.height + tolerance) return;
      const width = Math.max(rect.width, Math.round(280 * scale));
      const height = Math.max(rect.height, Math.round(200 * scale));
      await this.win.setMinSize(280, 200);
      if (width !== rect.width || height !== rect.height) await this.win.setSize(width, height);
      this.headerOnly = false;
      this.changed();
    });
  }

  exitHeader(): Promise<void> {
    return this.run(() => this.restoreHeader());
  }

  toggleHeader(forceExpand = false): Promise<void> {
    return this.run(async () => {
      if (this.edge && this.edgeRect) {
        await this.win.setPosition(this.edgeRect.x, this.edgeRect.y);
        this.edge = null;
        this.changed();
        await this.restoreHeader();
      } else if (this.headerOnly || forceExpand) await this.restoreHeader();
      else await this.collapseHeader();
    });
  }

  maximize(): Promise<void> {
    return this.run(async () => {
      await this.restoreHeader();
      await this.win.toggleMaximize();
    });
  }

  collapse(bounds: DesktopBounds, dockRegion?: DesktopRect): Promise<void> {
    return this.run(async () => {
      if (this.headerOnly || this.edge || await this.win.isMaximized()) return;
      const rect = await this.win.readOuterRect();
      const scale = await this.win.scaleFactor();
      // Only the title/actions area can dock; the task body and bottom cannot.
      // The optional region is measured in logical client pixels by the UI.
      const trigger = dockRegion ? {
        x: rect.x + dockRegion.x * scale, y: rect.y + dockRegion.y * scale,
        width: dockRegion.width * scale, height: dockRegion.height * scale,
      } : { ...rect, height: Math.min(rect.height, 100 * scale) };
      const edge = edgeAt(trigger, bounds, 4 * scale);
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
