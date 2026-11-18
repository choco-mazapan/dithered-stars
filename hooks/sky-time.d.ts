/** The moon at a moment: its age in days, how much is lit (0 to 1), which way it's going, its name and emoji. */
export function moonPhase(ms: number): { age: number; lit: number; isWaxing: boolean; name: string; icon: string }

/** The meteor shower within a couple of days of its peak at `ms`, or null. */
export function activeShower(ms: number): { name: string; days: number } | null

/** The next shower peak from `ms` (today's included), with the days until it. */
export function nextShower(ms: number): { name: string; days: number } | null

/** The part of the day at `ms`, by the local clock. */
export function partOfDay(ms: number): 'dawn' | 'day' | 'dusk' | 'night'

/** The constellations a northern evening shows in the month of `ms`, and whether the Pleiades are up. */
export function season(ms: number): { constellations: string[]; hasPleiades: boolean }
