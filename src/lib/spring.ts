// A damped spring on one number, stepped per frame (semi-implicit Euler).

export type Spring = { value: number; velocity: number };

export type SpringConfig = { stiffness: number; damping: number };

export const spring = (value: number, velocity = 0): Spring => ({ value, velocity });

export function stepSpring(
  s: Spring,
  target: number,
  dt: number,
  { stiffness, damping }: SpringConfig,
): Spring {
  const velocity = s.velocity + ((target - s.value) * stiffness - s.velocity * damping) * dt;
  return { value: s.value + velocity * dt, velocity };
}
