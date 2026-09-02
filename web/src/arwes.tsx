import { type CSSProperties, type ReactNode } from "react";
import { AnimatorGeneralProvider, Animator } from "@arwes/react-animator";
import { Dots, GridLines } from "@arwes/react-bgs";
import { FrameOctagon, FrameCorners } from "@arwes/react-frames";

// Thin integration layer over Arwes so the rest of the app doesn't wire raw
// providers/frames. Colours are driven from our existing neon tokens via the
// Arwes frame CSS variables (--arwes-frames-*), so the sci-fi chrome matches
// the cyberpunk palette already in styles.css.

// Frame colour presets (cyan by default, magenta/green/red for variants).
type FrameVars = Record<"--arwes-frames-bg-color" | "--arwes-frames-line-color" | "--arwes-frames-deco-color", string>;

export const FRAME_COLORS: Record<"cyan" | "magenta" | "green" | "red", FrameVars> = {
  cyan: {
    "--arwes-frames-bg-color": "hsla(187, 100%, 45%, 0.05)",
    "--arwes-frames-line-color": "hsla(187, 100%, 55%, 0.6)",
    "--arwes-frames-deco-color": "hsla(320, 100%, 62%, 0.75)",
  },
  magenta: {
    "--arwes-frames-bg-color": "hsla(320, 100%, 55%, 0.05)",
    "--arwes-frames-line-color": "hsla(320, 100%, 62%, 0.65)",
    "--arwes-frames-deco-color": "hsla(187, 100%, 55%, 0.75)",
  },
  green: {
    "--arwes-frames-bg-color": "hsla(155, 100%, 50%, 0.05)",
    "--arwes-frames-line-color": "hsla(155, 100%, 60%, 0.6)",
    "--arwes-frames-deco-color": "hsla(187, 100%, 55%, 0.7)",
  },
  red: {
    "--arwes-frames-bg-color": "hsla(345, 100%, 55%, 0.06)",
    "--arwes-frames-line-color": "hsla(345, 100%, 62%, 0.65)",
    "--arwes-frames-deco-color": "hsla(320, 100%, 62%, 0.7)",
  },
};

export type FrameColor = keyof typeof FRAME_COLORS;

// Sets the default animation timing for every Animator under the app.
export function AppAnimatorProvider({ children }: { children: ReactNode }) {
  return (
    <AnimatorGeneralProvider duration={{ enter: 0.5, exit: 0.3, stagger: 0.03 }}>
      {children}
    </AnimatorGeneralProvider>
  );
}

// Full-screen animated background (behind everything). Canvas layers fill the
// fixed container; the CSS scanline overlay in styles.css stays on top.
export function ArwesBackground() {
  return (
    <Animator active duration={{ enter: 1.2 }}>
      <div className="arwes-bg" aria-hidden="true">
        <GridLines lineColor="hsla(300, 100%, 60%, 0.05)" distance={38} />
        <Dots color="hsla(187, 100%, 55%, 0.18)" type="cross" distance={38} size={2} />
      </div>
    </Animator>
  );
}

// A reusable "framed box": its own Animator node + an absolutely-positioned
// Arwes frame + a relative content wrapper. Used by Card, Login cards and the
// flow dialog. `frame` picks the frame silhouette; `color` picks the palette.
export function Panel({
  children,
  className = "",
  color = "cyan",
  frame = "octagon",
  style,
  active,
}: {
  children: ReactNode;
  className?: string;
  color?: FrameColor;
  frame?: "octagon" | "corners";
  style?: CSSProperties;
  active?: boolean;
}) {
  const vars = FRAME_COLORS[color] as unknown as CSSProperties;
  const Frame = frame === "corners" ? FrameCorners : FrameOctagon;
  return (
    <Animator {...(active === undefined ? {} : { active })}>
      <div className={`arwes-panel ${className}`} style={{ ...vars, ...style }}>
        <Frame style={{ zIndex: 0 }} />
        <div className="arwes-panel-body">{children}</div>
      </div>
    </Animator>
  );
}
