/** Fractional ranking so a card can be dropped between two neighbours without renumbering. */
export const RANK_STEP = 1024;

export function rankBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return RANK_STEP;
  if (before == null) return (after as number) - RANK_STEP;
  if (after == null) return before + RANK_STEP;
  return (before + after) / 2;
}

export function nextRank(existing: number[]): number {
  return existing.length ? Math.max(...existing) + RANK_STEP : RANK_STEP;
}
