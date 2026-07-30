/* Displacement map for the glass bevel. Each feImage is a gradient that sits at
   the neutral 128 across the middle and ramps to an extreme only within the
   border band; screening them puts the horizontal ramp in red (x offset) and
   the vertical one in green (y offset). sRGB interpolation is required, or the
   linearRGB conversion shifts that neutral point and the whole pane slides. */

const MAP_X =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='rgb(255,0,0)'/%3E%3Cstop offset='.07' stop-color='rgb(128,0,0)'/%3E%3Cstop offset='.93' stop-color='rgb(128,0,0)'/%3E%3Cstop offset='1' stop-color='rgb(0,0,0)'/%3E%3C/linearGradient%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3C/svg%3E";

const MAP_Y =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='rgb(0,255,0)'/%3E%3Cstop offset='.05' stop-color='rgb(0,128,0)'/%3E%3Cstop offset='.95' stop-color='rgb(0,128,0)'/%3E%3Cstop offset='1' stop-color='rgb(0,0,0)'/%3E%3C/linearGradient%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3C/svg%3E";

export default function GlassFilter() {
  return (
    <svg
      className="pr-filters"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <filter
        id="bevel"
        x="0"
        y="0"
        width="1"
        height="1"
        colorInterpolationFilters="sRGB"
      >
        <feImage preserveAspectRatio="none" result="mx" href={MAP_X} />
        <feImage preserveAspectRatio="none" result="my" href={MAP_Y} />
        <feBlend in="mx" in2="my" mode="screen" result="map" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="38"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
