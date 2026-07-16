/**
 * Hero art based on the Villi wolf emblem: brand mark plus stylized night-sky frame
 * (moon arc, stars, peak silhouettes) matching the logo’s double-exposure motif.
 */
export function LandingHeroArt() {
  return (
    <div className="landing-art" aria-hidden="true">
      <div className="landing-art-glow" />

      <svg
        className="landing-art-frame"
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="peakFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--landing-art-accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--landing-art-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Orbital stars */}
        <g className="landing-art-stars" fill="var(--landing-art-accent)">
          <polygon points="48,120 50,126 56,126 51,130 53,136 48,132 43,136 45,130 40,126 46,126" />
          <polygon points="340,88 342,94 348,94 343,98 345,104 340,100 335,104 337,98 332,94 338,94" />
          <polygon points="360,220 362,226 368,226 363,230 365,236 360,232 355,236 357,230 352,226 358,226" />
          <polygon points="52,280 54,286 60,286 55,290 57,296 52,292 47,296 49,290 44,286 50,286" />
          <circle cx="200" cy="36" r="3" />
          <circle cx="24" cy="200" r="2" />
          <circle cx="376" cy="168" r="2" />
        </g>

        {/* Stylized moon arc (outside emblem, echoes logo sky) */}
        <path
          className="landing-art-moon-arc"
          d="M108 72a120 120 0 0 1 168-48"
          fill="none"
          stroke="var(--landing-art-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.35"
        />

        {/* Distant peaks under the emblem */}
        <path
          d="M0 320 L80 260 L140 300 L200 240 L260 290 L320 250 L400 310 L400 400 L0 400 Z"
          fill="url(#peakFade)"
          opacity="0.6"
        />
      </svg>

      <div className="landing-art-emblem-wrap">
        <img src="/hero-emblem.png" alt="" className="landing-art-emblem" width={320} height={320} />
        <div className="landing-art-emblem-ring" />
      </div>
    </div>
  );
}
