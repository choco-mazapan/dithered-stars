/** What the scene shows, for a reader who can't see it. */
export const SCENE_ALT: string

/** A constellation the margins can show. */
export type Constellation = 'big-dipper' | 'orion' | 'cassiopeia' | 'cygnus' | 'lyra'

/** Every constellation the margins can show. */
export const CONSTELLATIONS: readonly Constellation[]

/** Each constellation's stars and lines, from their real positions. */
export const SKY: Record<Constellation, { name: string }>

/** What the real sky is doing at a moment, as the scene draws it. */
export type SkyNow = {
  part: 'dawn' | 'day' | 'dusk' | 'night'
  /** How much of the moon is lit, 0 to 1, in steps of 0.02. */
  lit: number
  isWaxing: boolean
  phase: string
  icon: string
  /** The meteor shower near its peak, or null. */
  shower: string | null
  hasPleiades: boolean
}

/** The sky at `ms`. */
export function skyAt(ms: number): SkyNow

/** Two different constellations at random, from those up in the month of `ms`: left margin first, then right. */
export function pickPair(random?: () => number, ms?: number): [Constellation, Constellation]

/** The margin extras the theme can add, by name, each with a title. */
export const EXTRAS: Record<'constellations' | 'meteors' | 'horizon' | 'lighthouse' | 'edges', { title: string }>

/**
 * The whole backdrop with the named margin extras. `pair` names the two
 * constellations; 'all' draws every one in both margins, hidden but the
 * preview's pick. `sky` (or the sky at `at`) sets the moon, tint and shower;
 * `isQuiet` stills every motion.
 */
export function buildScene(
  extras?: readonly (keyof typeof EXTRAS)[],
  options?: {
    pair?: readonly [Constellation, Constellation] | 'all'
    sky?: Partial<SkyNow>
    at?: number
    isQuiet?: boolean
    /** How hard the session spends its usage, 0 to 1: sets how many meteors fall and how often. */
    pace?: number
  },
): string

/** A usage share, 0 to 1, as the scene's pace, in quarter steps. */
export function paceFor(share: number): number

/** The margin extras the theme draws now. */
export const CHOSEN_EXTRAS: readonly (keyof typeof EXTRAS)[]

/** The session's backdrop at `at` with its two constellations, the key it goes by, and the sky it shows. */
export function sceneFor(
  pair: readonly [Constellation, Constellation],
  options?: { at?: number; isQuiet?: boolean; pace?: number },
): { svg: string; key: string; sky: SkyNow }
