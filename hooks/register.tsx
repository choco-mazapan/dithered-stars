import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE, SCENE_ALT, SCENE_KEY } from './scene.js'

// Night-sky ink for every surface, starlight for the words. Dark only: the
// scene behind it is a night, so a surface acts as if dark mode were named.
const { theme, problems } = makeColors({
  label: 'Dithered stars',
  only: 'dark',
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
})

// No blur: a dither is all hard pixels, and frosting would smear it to a haze.
// The panels' own color, at this opacity, is what keeps the words in front.
const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE_KEY, glass: { blur: 0, opacity: 0.62 } },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // While you build: the line that would stop Desktop painting this look.
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    // The answer's `isDrawn` is not shown: it is asked the moment the theme is
    // set, before a window has attached, and the window draws the theme anyway.
    await $.theme.set(LOOK)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    // Every mod's Backdrop hook hears every backdrop: draw only this one.
    if (e.props.scene !== SCENE_KEY) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt={SCENE_ALT} isInteractive />
  })
}
