import type { CSSProperties } from 'react';

type P = { size?: number; style?: CSSProperties };

const base = (size: number, sw: number, style?: CSSProperties) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style,
  'aria-hidden': true,
});

export const Plus = ({ size = 16, style }: P) => (
  <svg {...base(size, 2.25, style)}><path d="M5 12h14" /><path d="M12 5v14" /></svg>
);
export const Close = ({ size = 18, style }: P) => (
  <svg {...base(size, 2.25, style)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
export const Sparkle = ({ size = 16, style }: P) => (
  <svg {...base(size, 2, style)}>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);
export const UpDown = ({ size = 16, style }: P) => (
  <svg {...base(size, 2.25, style)}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
);
export const ChevronRight = ({ size = 16, style }: P) => (
  <svg {...base(size, 2.25, style)}><path d="m9 18 6-6-6-6" /></svg>
);
export const Check = ({ size = 14, style }: P) => (
  <svg {...base(size, 3, style)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const Send = ({ size = 16, style }: P) => (
  <svg {...base(size, 2.25, style)}>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </svg>
);
