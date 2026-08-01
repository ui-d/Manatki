import { cn } from "@/lib/utils";

/**
 * Tiny animated pixel-art accents for the marketing pages. Sprites are
 * defined as character maps (one char per pixel) and rendered as crisp-edge
 * SVG rects, so they stay sharp at any DPR without shipping image assets.
 * Two-frame sprites hard-swap between frames; wrappers add a slow bob or
 * twinkle. All sprites are decorative (`aria-hidden`) and every animation
 * is disabled under prefers-reduced-motion (see global.css).
 */

const PIXEL_COLORS: Record<string, string> = {
  G: "#FFC145", // gold
  g: "#E89A2B", // gold shade
  C: "#FF5A2B", // coral
  P: "#F5F2E8", // paper
  D: "#101433", // ink detail (eyes)
};

type Frame = readonly string[];

/**
 * "Manatki" is Polish for one's belongings — goods and chattels. The
 * sprites are exactly that: a knotted bundle, a suitcase, a tied parcel.
 * Two frames give the bundle's knot a little wobble.
 */
const BUNDLE_A: Frame = [
  ".....GG.....",
  "....G..G....",
  ".....GG.....",
  "....gGGg....",
  "..GGGGGGGG..",
  ".GGGGGGGGGG.",
  ".GGGGGGGGGG.",
  ".gGGGGGGGGg.",
  "..gGGGGGGg..",
  "....gggg....",
];

const BUNDLE_B: Frame = [
  "....GG......",
  "...G..G.....",
  "....GG......",
  "....gGGg....",
  "..GGGGGGGG..",
  ".GGGGGGGGGG.",
  ".GGGGGGGGGG.",
  ".gGGGGGGGGg.",
  "..gGGGGGGg..",
  "....gggg....",
];

/** A coral suitcase; the gold clasps glint between frames. */
const SUITCASE_A: Frame = [
  "....CCCC....",
  "...C....C...",
  ".CCCCCCCCCC.",
  ".CGCCCCCCGC.",
  ".CCCCCCCCCC.",
  ".CCCCCCCCCC.",
  ".CCCCCCCCCC.",
];

const SUITCASE_B: Frame = [
  "....CCCC....",
  "...C....C...",
  ".CCCCCCCCCC.",
  ".CgCCCCCCgC.",
  ".CCCCCCCCCC.",
  ".CCCCCCCCCC.",
  ".CCCCCCCCCC.",
];

/** A paper parcel tied with coral string; a corner pixel glints. */
const PARCEL_A: Frame = [
  "....CC....",
  "...C..C...",
  "PPPPCCPPPP",
  "PPPPCCPPPP",
  "CCCCCCCCCC",
  "PPPPCCPPPP",
  "PPPPCCPPPG",
];

const PARCEL_B: Frame = [
  "....CC....",
  "...C..C...",
  "PPPPCCPPPP",
  "PPPPCCPPPP",
  "CCCCCCCCCC",
  "GPPPCCPPPP",
  "PPPPCCPPPP",
];

/** Four-point sparkle; frame B collapses to a dot for the twinkle. */
const SPARKLE_A: Frame = [
  "..C..",
  "..C..",
  "CCCCC",
  "..C..",
  "..C..",
];

const SPARKLE_B: Frame = [
  ".....",
  "..C..",
  ".CCC.",
  "..C..",
  ".....",
];

const SPARKLE_GOLD_A: Frame = SPARKLE_A.map((row) => row.replace(/C/g, "G"));
const SPARKLE_GOLD_B: Frame = SPARKLE_B.map((row) => row.replace(/C/g, "G"));

/** Terminal cursor block; frame B is empty so it blinks. */
const CURSOR_A: Frame = ["GGG", "GGG", "GGG", "GGG"];
const CURSOR_B: Frame = ["...", "...", "...", "..."];

function FrameSvg({ frame, scale }: { frame: Frame; scale: number }) {
  const height = frame.length;
  const width = frame[0].length;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className="block"
    >
      {frame.flatMap((row, y) =>
        [...row].map((char, x) => {
          const fill = PIXEL_COLORS[char];
          if (!fill) return null;
          return (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
          );
        }),
      )}
    </svg>
  );
}

interface PixelSpriteProps {
  frames: readonly [Frame, Frame];
  scale?: number;
  /** Wrapper motion: a slow vertical bob, a twinkle pulse, or none. */
  motion?: "bob" | "twinkle" | "none";
  className?: string;
}

export function PixelSprite({
  frames,
  scale = 3,
  motion = "none",
  className,
}: PixelSpriteProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative inline-block select-none",
        motion === "bob" && "landing-px-bob",
        motion === "twinkle" && "landing-px-twinkle",
        className,
      )}
    >
      <span className="landing-px-f1 block">
        <FrameSvg frame={frames[0]} scale={scale} />
      </span>
      <span className="landing-px-f2 absolute inset-0 block">
        <FrameSvg frame={frames[1]} scale={scale} />
      </span>
    </span>
  );
}

export function PixelBundle({
  scale = 3,
  className,
}: {
  scale?: number;
  className?: string;
}) {
  return (
    <PixelSprite
      frames={[BUNDLE_A, BUNDLE_B]}
      scale={scale}
      motion="bob"
      className={className}
    />
  );
}

export function PixelSuitcase({
  scale = 3,
  className,
}: {
  scale?: number;
  className?: string;
}) {
  return (
    <PixelSprite
      frames={[SUITCASE_A, SUITCASE_B]}
      scale={scale}
      motion="bob"
      className={className}
    />
  );
}

export function PixelParcel({
  scale = 3,
  className,
}: {
  scale?: number;
  className?: string;
}) {
  return (
    <PixelSprite
      frames={[PARCEL_A, PARCEL_B]}
      scale={scale}
      className={className}
    />
  );
}

export function PixelSparkle({
  tone = "coral",
  scale = 3,
  className,
}: {
  tone?: "coral" | "gold";
  scale?: number;
  className?: string;
}) {
  const frames =
    tone === "gold"
      ? ([SPARKLE_GOLD_A, SPARKLE_GOLD_B] as const)
      : ([SPARKLE_A, SPARKLE_B] as const);
  return (
    <PixelSprite
      frames={frames}
      scale={scale}
      motion="twinkle"
      className={className}
    />
  );
}

export function PixelCursor({ className }: { className?: string }) {
  return (
    <PixelSprite
      frames={[CURSOR_A, CURSOR_B]}
      scale={3}
      className={className}
    />
  );
}
