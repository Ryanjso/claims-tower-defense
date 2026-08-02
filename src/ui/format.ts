/** Compact dollar formatting for the HUD, where space is tight. */
export function money(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

/** Full dollar figure, for the end-of-run scorecard. */
export const dollars = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
