import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Trophy = (p: P) => (
  <svg {...base} {...p}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
);
export const Wrench = (p: P) => (
  <svg {...base} {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
);
export const User = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const Play = (p: P) => (
  <svg {...base} {...p}><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
);
export const Pause = (p: P) => (
  <svg {...base} {...p}><path d="M8 5v14M16 5v14" /></svg>
);
export const Restart = (p: P) => (
  <svg {...base} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
);
export const Close = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const Home = (p: P) => (
  <svg {...base} {...p}><path d="M3 11l9-8 9 8M5 9v12h14V9" /></svg>
);
export const Coin = (p: P) => (
  <svg width={16} height={16} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10" fill="#e0a100" /><circle cx="12" cy="12" r="7" fill="#ffd166" /><rect x="10.5" y="7" width="3" height="10" rx="1.5" fill="#e0a100" /></svg>
);
export const Engine = (p: P) => (
  <svg {...base} {...p}><path d="M4 10h3l2-3h5v3h3l2 2v4h-2v2h-4l-2-2H7v-2H4zM2 11v4M9 7V5h4" /></svg>
);
export const Tire = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
);
export const Spring = (p: P) => (
  <svg {...base} {...p}><path d="M6 3h12M6 21h12M7 6l10 2.5L7 11l10 2.5L7 16l10 2.5" /></svg>
);
export const Fuel = (p: P) => (
  <svg {...base} {...p}><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16zM3 21h14M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M8 7h4" /></svg>
);
