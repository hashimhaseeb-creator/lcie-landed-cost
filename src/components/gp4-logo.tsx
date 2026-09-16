import * as React from 'react';

/**
 * Green G(P)⁴™ ring logo — the four-arc ring represents the
 * Plan · Procure · Produce · Provide decision sequence.
 *
 * Brand colors (from the official favicon):
 *   Quadrant 1 (top-right)  — #0369A1  (cyan-blue)
 *   Quadrant 2 (bottom-right) — #1B6C79 (teal)
 *   Quadrant 3 (bottom-left)  — #2E6A45 (forest green)
 *   Quadrant 4 (top-left)     — #3F5C31 (olive green)
 * Ring background: #F6F8F5 (warm cream)
 */
export function Gp4Logo({
  size = 40,
  showText = true,
  className,
}: {
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Green G(P)4 trademark logo"
    >
      <circle cx="50" cy="50" r="48" fill="#F6F8F5" />
      <g fill="none" strokeWidth={7} strokeLinecap="round">
        <path d="M 50 6 A 44 44 0 0 1 91 47" stroke="#0369A1" />
        <path d="M 93 50 A 44 44 0 0 1 59 93" stroke="#1B6C79" />
        <path d="M 50 94 A 44 44 0 0 1 8 55" stroke="#2E6A45" />
        <path d="M 6 50 A 44 44 0 0 1 47 7" stroke="#3F5C31" />
      </g>
      {showText && (
        <g fontFamily="Sora, Arial, sans-serif" fontWeight={800}>
          <text x="22" y="59" fontSize="23" fill="#1A2420">G(P)</text>
          <text x="70" y="41" fontSize="13" fill="#1A2420">4</text>
          <text x="82" y="39" fontSize="9" fontWeight={700} fill="#4A5750">TM</text>
        </g>
      )}
    </svg>
  );
}
