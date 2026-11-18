// What the real sky is doing at a moment: the moon's phase, the meteor
// shower near its peak, the part of the day, and the season's constellations.
// Plain arithmetic, no network: close enough for a backdrop (the moon's phase
// is right to within about a day).

const DAY = 86400000

// A new moon to count from, and the time from one new moon to the next.
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const LUNATION = 29.530588853

const PHASES = [
  { until: 1.85, name: 'new moon', icon: '🌑' },
  { until: 5.54, name: 'waxing crescent', icon: '🌒' },
  { until: 9.23, name: 'first quarter', icon: '🌓' },
  { until: 12.92, name: 'waxing gibbous', icon: '🌔' },
  { until: 16.61, name: 'full moon', icon: '🌕' },
  { until: 20.3, name: 'waning gibbous', icon: '🌖' },
  { until: 23.99, name: 'last quarter', icon: '🌗' },
  { until: 27.68, name: 'waning crescent', icon: '🌘' },
  { until: Infinity, name: 'new moon', icon: '🌑' },
]

/** The moon at `ms`: its age in days, how much of it is lit, which way it's going, and its name. */
export function moonPhase(ms) {
  const age = ((((ms - NEW_MOON) / DAY) % LUNATION) + LUNATION) % LUNATION
  const lit = (1 - Math.cos((2 * Math.PI * age) / LUNATION)) / 2
  const phase = PHASES.find(one => age < one.until) ?? PHASES[0]

  return { age, lit, isWaxing: age < LUNATION / 2, name: phase.name, icon: phase.icon }
}

// The year's major showers, at their peak night (month, day).
const SHOWERS = [
  { name: 'Quadrantids', month: 1, day: 3 },
  { name: 'Lyrids', month: 4, day: 22 },
  { name: 'Eta Aquariids', month: 5, day: 6 },
  { name: 'Perseids', month: 8, day: 12 },
  { name: 'Orionids', month: 10, day: 21 },
  { name: 'Leonids', month: 11, day: 17 },
  { name: 'Geminids', month: 12, day: 14 },
  { name: 'Ursids', month: 12, day: 22 },
]

// Days either side of a peak that count as the shower being on.
const SHOWER_REACH = 2

/** Each shower's next peak from `ms`, soonest first, with the days to it (negative: just past). */
function peaks(ms) {
  const now = new Date(ms)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  return SHOWERS.flatMap(one =>
    [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(year => ({
      name: one.name,
      days: Math.round((Date.UTC(year, one.month - 1, one.day) - today) / DAY),
    })),
  ).sort((a, b) => a.days - b.days)
}

/** The shower on at `ms`, within a couple of days of its peak, or null. */
export function activeShower(ms) {
  return peaks(ms).find(one => Math.abs(one.days) <= SHOWER_REACH) ?? null
}

/** The next shower peak from `ms` (today's included), with the days until it. */
export function nextShower(ms) {
  return peaks(ms).find(one => one.days >= 0) ?? null
}

/**
 * The part of the day at `ms`, by the clock where this runs: `dawn` 5 to 8,
 * `day` 8 to 17, `dusk` 17 to 20, `night` 20 to 5.
 */
export function partOfDay(ms) {
  const hour = new Date(ms).getHours()

  return hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night'
}

/**
 * What a northern evening sky shows in the month of `ms`: the constellations
 * a session picks from, and whether the Pleiades are up.
 */
export function season(ms) {
  const month = new Date(ms).getMonth() + 1

  if (month === 12 || month <= 2) {
    return { constellations: ['orion', 'big-dipper', 'cassiopeia'], hasPleiades: true }
  }
  if (month <= 5) {
    return { constellations: ['big-dipper', 'lyra', 'cassiopeia'], hasPleiades: month === 3 }
  }
  if (month <= 8) {
    return { constellations: ['cygnus', 'lyra', 'big-dipper', 'cassiopeia'], hasPleiades: false }
  }

  return { constellations: ['cassiopeia', 'cygnus', 'lyra', 'orion'], hasPleiades: true }
}
