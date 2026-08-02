/**
 * Optional artwork manifest.
 *
 * The game ships with generated placeholder art. Authored PNGs listed here win
 * over placeholders. Towers listed in `towerKits` load
 * `towers/<id>/t{0..maxTier}/{base,head}.png` for swivel rendering.
 */
export interface SpriteManifest {
  towers?: string[];
  /** Tower ids that have base/head kits under `towers/<id>/tN/`. */
  towerKits?: string[];
  /** Highest authored upgrade tier per kit tower (inclusive). Default 3. */
  towerKitMaxTier?: number;
  claims?: string[];
  /** Filenames under `assets/fx/` (without path), e.g. `proj-network.png`. */
  fx?: string[];
  /** Tower ids with `ui/portrait-<id>.png`. */
  portraits?: string[];
}

export async function loadSpriteManifest(): Promise<SpriteManifest> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}assets/manifest.json`, {
      cache: 'no-cache',
    });
    if (!res.ok) return {};
    return (await res.json()) as SpriteManifest;
  } catch {
    return {};
  }
}
