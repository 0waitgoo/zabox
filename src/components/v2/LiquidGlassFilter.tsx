// Shared map based on the React Bits Glass Surface settings: blur 13, brightness 71%.
const map = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
<defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop stop-color="#0000"/><stop offset="1" stop-color="red"/></linearGradient>
<linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop stop-color="#0000"/><stop offset="1" stop-color="blue"/></linearGradient>
<filter id="soft"><feGaussianBlur stdDeviation="13"/></filter></defs>
<rect width="400" height="200" fill="black"/><rect width="400" height="200" rx="24" fill="url(#r)"/>
<rect width="400" height="200" rx="24" fill="url(#b)" style="mix-blend-mode:difference"/>
<rect x="7" y="7" width="386" height="186" rx="24" fill="hsl(0 0% 71% / .93)" filter="url(#soft)"/></svg>`;
const mapUrl = `data:image/svg+xml,${encodeURIComponent(map)}`;

export default function LiquidGlassFilter() {
  return <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <defs><filter id="zabox-liquid-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      {/* Scale 300, with the previous equal RGB offsets of -50. */}
      <feDisplacementMap in="SourceGraphic" in2="map" scale="250" xChannelSelector="R" yChannelSelector="G" />
    </filter></defs>
  </svg>;
}
