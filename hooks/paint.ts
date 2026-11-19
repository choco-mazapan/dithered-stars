// The sky as the theme sets it: the session's constellations, tonight's moon
// and shower, and a meteor rate that follows how much usage the session spends.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ThemeSetArgs } from 'claude-code'

import type { Usage } from '../types'
import { makeColors } from './make-colors.js'
import { CONSTELLATIONS, paceFor, pickPair, sceneFor } from './scene.js'
import type { Constellation, SkyNow } from './scene.js'

// The session's two constellations, picked once when it starts. Kept in the
// session's state, so a reload of the mod draws the same sky.
const sky = atom({ plugin: 'dithered-stars', key: 'sky' } as const, null)

// The backdrop this module drew last; rebuilt from `sky` after a reload.
export let scene: { svg: string; key: string; sky: SkyNow } | null = null

// How hard the session spends its usage, as the scene's pace (0 to 1, quarter
// steps): more falling stars as it climbs. 0 until a reading arrives, which
// comes with every reply.
let pace = 0

/**
 * The share of usage spent, 0 to 1: the tightest rate limit, or, with no
 * limit reported (an API key, a gateway), how full the context window is.
 */
function spentShare(limits: readonly { percentUsed: number }[], contextPercent: number | undefined): number {
  const tightest = limits.reduce((most, one) => Math.max(most, one.percentUsed), -1)

  return (tightest >= 0 ? tightest : (contextPercent ?? 0)) / 100
}

export const isPair = (value: unknown): value is [Constellation, Constellation] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(one => (CONSTELLATIONS as readonly unknown[]).includes(one))

/**
 * This session's sky as of now: the pair it picked (or a new pick of the
 * season's, saved for next time), tonight's moon, shower and tint.
 */
export async function sessionScene($: EngineInterface) {
  const [kept, isQuiet, at] = await Promise.all([
    read($, sky),
    read($, { plugin: 'dithered-stars', key: 'isQuiet' } as const),
    $.clock.now(),
  ])
  const pair = isPair(kept) ? kept : pickPair(Math.random, at)

  if (!isPair(kept)) {
    await update($, sky, () => pair)
  }
  scene = sceneFor(pair, { at, isQuiet, pace })

  return scene
}

// Night-sky ink for every surface, starlight for the words; in light mode, a
// pale day sky with ink-blue words. The code colors follow: nord by night.
export const { theme, problems } = makeColors({
  label: 'Dithered stars',
  roles: { accent: '#7c8cff', danger: '#e5484d', success: '#4cc38a', warning: '#e2a336', pro: '#b58cf5' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#090a12',
        'surface-1': '#0e101b',
        'surface-2': '#131625',
        'surface-3': '#171b2c',
        'text-primary': '#e6e9f8',
        'text-secondary': '#bcc2de',
        'text-muted': '#9399bb',
      },
    },
  },
  light: {
    roles: { accent: '#4453c9' },
    gray: {
      anchors: {
        'surface-0': '#f1f4fc',
        'surface-1': '#f6f8fe',
        'surface-2': '#fcfdff',
        'surface-3': '#fcfdff',
        'text-primary': '#151a33',
        'text-secondary': '#3a4266',
        'text-muted': '#575f85',
      },
    },
  },
  codeTheme: { dark: 'nord', light: 'github-light' },
})

// No blur: a dither is all hard pixels, and frosting would smear it to a haze.
// The panels' own color, at this opacity, is what keeps the words in front.
const lookFor = (key: string): ThemeSetArgs => ({
  colors: theme,
  backdrop: { scene: key, glass: { blur: 0, opacity: 0.62 } },
})

/** Builds the sky as of now and sets it, unless it's the one already up. */
export async function paint($: EngineInterface, isForced = false) {
  const before = scene?.key
  const drawn = await sessionScene($)

  if (isForced || drawn.key !== before) {
    await $.theme.set(lookFor(drawn.key))
  }

  return drawn
}

/** Usage moved: when it crosses a quarter step, the meteors' rate follows. */
export async function followUsage($: EngineInterface, used: Usage) {
  const now = paceFor(spentShare(used.limits, used.context.percent))

  if (now !== pace) {
    pace = now
    await paint($)
  }
}
