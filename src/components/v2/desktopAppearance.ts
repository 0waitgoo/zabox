export const CUSTOM_BACKGROUND_KEY = 'zabox-plan-custom-bg-v1';

export function normalizeBackgroundColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return '#' + [...hex.slice(1)].map((part) => part + part).join('');
  return null;
}

export function loadCustomBackground(storage?: Pick<Storage, 'getItem'>): string | null {
  try { return normalizeBackgroundColor((storage ?? localStorage).getItem(CUSTOM_BACKGROUND_KEY)); }
  catch { return null; }
}

export function backgroundColorRgb(color: string): [number, number, number] {
  const hex = normalizeBackgroundColor(color) ?? '#17171d';
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

/** Pick the text palette with stronger contrast against the chosen opaque base. */
export function themeForBackground(color: string): 'light' | 'dark' {
  const [r, g, b] = backgroundColorRgb(color).map((part) => {
    const channel = part / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? 'light' : 'dark';
}
