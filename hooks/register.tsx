import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { registerChat } from './chat.tsx'
import { registerNight, startNight } from './night-pane.tsx'
import { isPair, paint, problems, scene, sessionScene } from './paint.ts'
import { pickPair, SCENE_ALT, SKY } from './scene.js'
import type { Constellation, SkyNow } from './scene.js'
import { activeShower, nextShower } from './sky-time.js'

// The session's two constellations (paint.ts picks and keeps them).
const sky = atom({ plugin: 'dithered-stars', key: 'sky' } as const, null)

// The timer that keeps the sky in step with the clock; one per module load.
let refresh: { cancel: () => void } | null = null

// How often the sky checks the clock: the moon, the tint and the shower move
// slowly, and a rebuild that comes out the same sets nothing.
const REFRESH_MS = 10 * 60 * 1000

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
