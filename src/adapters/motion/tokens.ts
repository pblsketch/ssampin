export const MOTION_DURATION_MS = {
  quick: 120,
  base: 160,
  slow: 200,
  deliberate: 260,
  flourish: 500,
} as const;

export const MOTION_EASING = {
  enter: 'out(4)',
  exit: 'in(3)',
  linear: 'linear',
} as const;
