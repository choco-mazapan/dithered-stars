import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { registerChat } from './chat.tsx'
import { makeColors } from './make-colors.js'
import { registerNight, startNight } from './night-pane.tsx'
import { CONSTELLATIONS, pickPair, SCENE_ALT, sceneFor, SKY } from './scene.js'
import type { Constellation, SkyNow } from './scene.js'
import { activeShower, nextShower } from './sky-time.js'

// The session's two constellations, picked once when it starts. Kept in the
// session's state, so a reload of the mod draws the same sky.
const sky = atom({ plugin: 'dithered-stars', key: 'sky' } as const, null)

// The backdrop this module drew last; rebuilt from `sky` after a reload.
let scene: { svg: string; key: string; sky: SkyNow } | null = null

// The timer that keeps the sky in step with the clock; one per module load.
let refresh: { cancel: () => void } | null = null

// How often the sky checks the clock: the moon, the tint and the shower move
// slowly, and a rebuild that comes out the same sets nothing.
const REFRESH_MS = 10 * 60 * 1000

const isPair = (value: unknown): value is [Constellation, Constellation] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(one => (CONSTELLATIONS as readonly unknown[]).includes(one))

/**
 * This session's sky as of now: the pair it picked (or a new pick of the
 * season's, saved for next time), tonight's moon, shower and tint.
 */
async function sessionScene($: EngineInterface) {
  const [kept, isQuiet, at] = await Promise.all([
    read($, sky),
    read($, { plugin: 'dithered-stars', key: 'isQuiet' } as const),
    $.clock.now(),
  ])
  const pair = isPair(kept) ? kept : pickPair(Math.random, at)

  if (!isPair(kept)) {
    await update($, sky, () => pair)
  }
  scene = sceneFor(pair, { at, isQuiet })

  return scene
}

// Night-sky ink for every surface, starlight for the words; in light mode, a
// pale day sky with ink-blue words. The code colors follow: nord by night.
const { theme, problems } = makeColors({
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
async function paint($: EngineInterface, isForced = false) {
  const before = scene?.key
  const drawn = await sessionScene($)

  if (isForced || drawn.key !== before) {
    await $.theme.set(lookFor(drawn.key))
  }

  return drawn
}

const title = (key: Constellation) => SKY[key].name.replace(/\b\w/g, c => c.toUpperCase())

/** Tonight's sky in a few lines, for /sky. */
function skyText(pair: readonly [Constellation, Constellation], now: SkyNow, at: number, isNew: boolean) {
  const shower = activeShower(at)
  const coming = nextShower(at)
  const lines = [
    `${isNew ? 'A new sky' : 'Tonight'}: ${title(pair[0])} on the left, ${title(pair[1])} on the right${now.hasPleiades ? ', the Pleiades below' : ''}.`,
    `Moon: ${now.icon} ${now.phase}, ${Math.round(now.lit * 100)}% lit.`,
    shower !== null
      ? `Meteors: the ${shower.name} are near their peak, so the margins rain.`
      : coming !== null
        ? `Meteors: the ${coming.name} peak in ${coming.days} ${coming.days === 1 ? 'night' : 'nights'}.`
        : '',
    `Light: a ${now.part} sky.`,
  ]

  return lines.filter(Boolean).join('\n')
}

export const register: Register = on => {
  registerNight(on)
  registerChat(on)

  on('session.start', async ($, e, next) => {
    // While you build: the line that would stop Desktop painting this look.
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    // The answer's `isDrawn` is not shown: it is asked the moment the theme is
    // set, before a window has attached, and the window draws the theme anyway.
    await paint($, true)
    await $.command.register({
      name: 'sky',
      description: "Show tonight's sky (constellations, moon phase, meteor shower); \"new\" deals a new pair",
      argumentHint: '[new]',
    })
    await startNight($)

    // The moon, the tint and the shower follow the clock while the session runs.
    refresh?.cancel()
    refresh = $.clock.every(REFRESH_MS, () => void paint($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'sky' }, async ($, e) => {
    const isNew = e.args.trim().toLowerCase() === 'new'
    const at = await $.clock.now()

    if (isNew) {
      const kept = await read($, sky)
      let pair = pickPair(Math.random, at)

      // A new deal is a different deal.
      for (let tries = 0; isPair(kept) && pair[0] === kept[0] && pair[1] === kept[1] && tries < 10; tries++) {
        pair = pickPair(Math.random, at)
      }
      await update($, sky, () => pair)
    }
    const drawn = await paint($, isNew)
    const pair = await read($, sky)

    return { text: isPair(pair) ? skyText(pair, drawn.sky, at, isNew) : 'No sky yet.' }
  })

  // /stars: the terminal band on or off, or every motion stilled (quiet) or
  // back (lively). Quiet stills the backdrop and takes the band away.
  on('command.run', { command: 'stars' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const band = { plugin: 'dithered-stars', key: 'isBandOn' } as const
    const quiet = { plugin: 'dithered-stars', key: 'isQuiet' } as const

    if (arg === 'quiet' || arg === 'lively') {
      const isQuiet = arg === 'quiet'
      await update($, quiet, () => isQuiet)
      await update($, band, () => !isQuiet)
      await paint($)

      return { text: isQuiet ? 'All quiet: the sky holds still and the star band is off.' : 'The sky moves again, and the star band is back.' }
    }
    // Unset counts as on: the band shows until it's turned off.
    const isOn = arg === 'on' ? true : arg === 'off' ? false : (await read($, band)) === false
    await update($, band, () => isOn)

    return { text: isOn ? 'Star band on.' : 'Star band off.' }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    // Every mod's Backdrop hook hears every backdrop: draw only this one.
    const drawn = scene ?? (await sessionScene($))

    if (e.props.scene !== drawn.key) {
      return next(e)
    }

    // No pointer reaches the backdrop: the app passes moves and presses through
    // to what is over it, so a cursor trail can't be drawn here (tried twice).
    const { Svg } = $.ui.resolve(e)

    return <Svg source={drawn.svg} alt={SCENE_ALT} isInteractive />
  })

  // The terminal draws no backdrop, so it gets a row of the same sky above
  // the prompt instead. The apps have the whole scene and need no row.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || (await read($, { plugin: 'dithered-stars', key: 'isBandOn' } as const)) === false) {
      return next(e)
    }

    const { Box, Client } = $.ui.resolve(e)

    return (
      <Box>
        <Client key="stars" module="./star-band.ts" width="100%" height={1} />
      </Box>
    )
  })
}
