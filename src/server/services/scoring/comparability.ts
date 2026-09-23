export interface GamingCondition {
  game: string;
  resolution?: string | null;
  preset?: string | null;
  ray_tracing?: boolean | null;
}

/**
 * Checks whether two gaming tests are comparable in resolution and presets.
 */
export function isGamingComparable(a: GamingCondition, b: GamingCondition): boolean {
  if (a.game.toLowerCase().trim() !== b.game.toLowerCase().trim()) {
    return false;
  }
  if (a.resolution && b.resolution && a.resolution.toLowerCase().trim() !== b.resolution.toLowerCase().trim()) {
    return false;
  }
  if (a.preset && b.preset && a.preset.toLowerCase().trim() !== b.preset.toLowerCase().trim()) {
    return false;
  }
  if (a.ray_tracing !== undefined && b.ray_tracing !== undefined && a.ray_tracing !== b.ray_tracing) {
    return false;
  }
  return true;
}

/**
 * Checks whether two benchmark results belong to the same version and variant.
 */
export function isBenchmarkComparable(
  groupA: string,
  variantA: string | null | undefined,
  groupB: string,
  variantB: string | null | undefined
): boolean {
  if (groupA.toLowerCase().trim() !== groupB.toLowerCase().trim()) {
    return false;
  }
  const vA = (variantA || '').toLowerCase().trim();
  const vB = (variantB || '').toLowerCase().trim();
  return vA === vB;
}
