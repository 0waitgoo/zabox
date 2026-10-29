// React Bits reference size 404 × 196; edge = min(width, height) × 0.3 / 2.
const map = `<svg xmlns="http://www.w3.org/2000/svg" width="404" height="196" viewBox="0 0 404 196">
<defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop stop-color="#0000"/><stop offset="1" stop-color="red"/></linearGradient>
<linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="#0000"/><stop offset="1" stop-color="blue"/></linearGradient>
<filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="404" height="196" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="30"/></filter></defs>
<rect width="404" height="196" fill="black"/><rect width="404" height="196" rx="28" fill="url(#r)"/>
<rect width="404" height="196" rx="28" fill="url(#b)" style="mix-blend-mode:difference"/>
<rect x="29.4" y="29.4" width="345.2" height="137.2" rx="28" fill="hsl(0 0% 15% / 1)" filter="url(#soft)"/></svg>`;
const mapUrl = `data:image/svg+xml,${encodeURIComponent(map)}`;

export default function LiquidGlassFilter() {
  return <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <defs><filter id="zabox-liquid-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      {/* Equal RGB offsets: 280 + 50 = 330. */}
      <feDisplacementMap in="SourceGraphic" in2="map" scale="330" xChannelSelector="R" yChannelSelector="G" result="displaced" />
      <feGaussianBlur in="displaced" stdDeviation="5" />
    </filter></defs>
  </svg>;
}
