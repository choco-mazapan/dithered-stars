// The backdrop: a night sky shaded with an ordered (Bayer) dither, a dithered
// crescent moon, and stars drawn in ASCII that twinkle, flare and fall.
// It is built once, as a string, when the module loads. No DOM, no script:
// every movement is a CSS animation inside the SVG's own <style>.


export const SCENE_ALT =
  'A dark night sky shaded with a pixel dither, a crescent moon, and small text-character stars that twinkle'

// The drawing's own box. The root slices it to fill any window.
const W = 1600
const H = 1000

// One dither pixel, in viewBox units.
const PX = 4

// Colors of the scene itself. The panels' colors come from the theme.
const INK = '#06070d'
const GLOW = '#232c7a'
const NEBULA = '#43206e'
const MOON_DIM = '#59608f'
const MOON_LIT = '#e3e7ff'

// 4x4 Bayer matrix. At level k, the cells whose threshold is under k are on,
// so each level holds every cell of the levels beneath it: stacking shapes of
// rising level in one color reads as one smooth dithered gradient.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** A small seeded generator, so the sky is the same sky at every load. */
function makeRandom(seed) {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = makeRandom(20261115)
const between = (low, high) => low + random() * (high - low)
const pick = list => list[Math.floor(random() * list.length)]
const round = value => Math.round(value * 10) / 10

// Dither patterns, made as they are asked for.
const patterns = new Map()

/** The fill for one color at one dither level, 1 (sparse) to 15 (nearly solid). */
function dither(name, color, level) {
  const id = `${name}${level}`

  if (!patterns.has(id)) {
    let cells = ''

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (BAYER[y][x] < level) {
          cells += `M${x * PX} ${y * PX}h${PX}v${PX}h-${PX}z`
        }
      }
    }
    patterns.set(
      id,
      `<pattern id="${id}" width="${4 * PX}" height="${4 * PX}" patternUnits="userSpaceOnUse"><path d="${cells}" fill="${color}"/></pattern>`,
    )
  }

  return `url(#${id})`
}

// The sky: a glow rising from the horizon, and two drifts of nebula.
function sky() {
  let out = `<rect width="${W}" height="${H}" fill="${INK}"/>`

  for (let level = 1; level <= 10; level++) {
    const y = 430 + (level - 1) * 54

    out += `<rect y="${y}" width="${W}" height="${H - y}" fill="${dither('g', GLOW, level)}"/>`
  }

  const drifts = [
    { x: 230, y: 140, radius: 560, shrink: 86, levels: 6 },
    { x: 1430, y: 830, radius: 430, shrink: 78, levels: 5 },
  ]

  for (const drift of drifts) {
    for (let level = 1; level <= drift.levels; level++) {
      const rx = drift.radius - (level - 1) * drift.shrink

      out += `<ellipse cx="${drift.x}" cy="${drift.y}" rx="${rx}" ry="${round(rx * 0.5)}" transform="rotate(-18 ${drift.x} ${drift.y})" fill="${dither('n', NEBULA, level)}"/>`
    }
  }

  return `<g shape-rendering="crispEdges">${out}</g>`
}

// The moon: a disc in earthshine, and a crescent that brightens to its limb.
const MOON_RADIUS = 56

function moon() {
  const r = MOON_RADIUS
  const box = r + 4
  let out = `<rect x="${-box}" y="${-box}" width="${2 * box}" height="${2 * box}" fill="${INK}"/>`

  out += `<rect x="${-box}" y="${-box}" width="${2 * box}" height="${2 * box}" fill="${dither('e', MOON_DIM, 3)}"/>`

  // Each crescent is the disc with a shadow circle cut from it. A thinner
  // crescent sits closer to the limb and takes a denser level.
  const crescents = [
    { offset: 44, level: 5 },
    { offset: 33, level: 8 },
    { offset: 22, level: 11 },
    { offset: 12, level: 14 },
  ]

  for (const { offset, level } of crescents) {
    const cx = -offset
    const cy = round(-offset * 0.3)

    out += `<path fill-rule="evenodd" d="M${-box} ${-box}h${2 * box}v${2 * box}h${-2 * box}zM${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z" fill="${dither('m', MOON_LIT, level)}"/>`
  }

  return `<g class="moon"><g clip-path="url(#disc)" shape-rendering="crispEdges">${out}</g></g>`
}

// The middle of the drawing is where the words sit: the busy stars keep out.
const inMiddle = (x, y) => x > 480 && x < 1120 && y > 220 && y < 820

// Everywhere the moon can sit (see the media rules in the style).
const MOON_SPOTS = [
  [1390, 215],
  [1040, 150],
  [940, 130],
]
const nearMoon = (x, y) => MOON_SPOTS.some(([mx, my]) => Math.hypot(x - mx, y - my) < 120)

const TINTS = ['w', 'w', 'w', 'u', 'u', 'y']

// The far stars: still, small and many. Each tint and brightness is one
// <text> whose glyphs are placed one by one.
function farStars() {
  const groups = new Map()

  for (let i = 0; i < 340; i++) {
    const key = `${pick(TINTS)}|${pick(['.3', '.45', '.65'])}`
    const group = groups.get(key) ?? { xs: [], ys: [], glyphs: '' }

    group.xs.push(Math.round(between(0, W)))
    group.ys.push(Math.round(between(0, H)))
    group.glyphs += pick(['.', '.', '.', '.', "'", ',', '`', ':'])
    groups.set(key, group)
  }

  let out = ''

  for (const [key, group] of groups) {
    const [tint, opacity] = key.split('|')

    out += `<text class="${tint}" opacity="${opacity}" font-size="14" x="${group.xs.join(' ')}" y="${group.ys.join(' ')}">${group.glyphs}</text>`
  }

  return out
}

// How long a star takes to go round, and how far into its round it starts.
// Each is a class on the star's group, and the rule that reads it is in the
// style: the app keeps a scene's <style>, but not a custom property written
// on an element, so a star's timing can't ride in a `--variable` of its own.
const TWINKLE_PERIODS = [3.7, 4.6, 5.5, 6.8, 7.9, 9.1]
const FLARE_PERIODS = [8, 10.5, 13]
const DELAYS = [0, 0.9, 1.9, 2.8, 3.7, 4.6, 5.6, 6.5, 7.4, 8.3]

const timing = (periods, prefix) =>
  `${prefix}${Math.floor(random() * periods.length)} d${Math.floor(random() * DELAYS.length)}`

const timingRules = () =>
  TWINKLE_PERIODS.map((seconds, i) => `.t${i} text{animation-duration:${seconds}s}`).join('') +
  FLARE_PERIODS.map((seconds, i) => `.f${i} text{animation-duration:${seconds}s}`).join('') +
  DELAYS.map((seconds, i) => `.d${i} text{animation-delay:-${seconds}s}`).join('')

// The near stars twinkle: three glyphs on one spot, shown in turn.
function twinklers() {
  let out = ''
  let placed = 0

  while (placed < 84) {
    const x = Math.round(between(20, W - 20))
    const y = Math.round(between(20, H - 20))

    if (inMiddle(x, y) && random() < 0.75) {
      continue
    }
    const size = pick([15, 16, 16, 18, 20])
    const at = `x="${x}" y="${y}"`

    out += `<g class="${pick(TINTS)} ${timing(TWINKLE_PERIODS, 't')}" font-size="${size}" opacity="${pick(['.6', '.8', '1'])}"><text class="a" ${at}>.</text><text class="b" ${at}>+</text><text class="c" ${at} dy=".12em">*</text></g>`
    placed++
  }

  return out
}

// A few stars flare: a plus, then a cross, then a burst, drawn on a 3x3 grid.
function flares() {
  const cw = 11
  const ch = 17
  const base = 6
  const cross = `<text class="q" x="0 ${-cw} 0 ${cw} 0" y="${base - ch} ${base} ${base} ${base} ${base + ch}">|-+-|</text>`
  const xs = `${-cw} 0 ${cw} ${-cw} 0 ${cw} ${-cw} 0 ${cw}`
  const ys = [base - ch, base, base + ch].map(y => `${y} ${y} ${y}`).join(' ')
  const burst = `<text class="r" x="${xs}" y="${ys}">\\|/-*-/|\\</text>`
  let out = ''
  let placed = 0

  while (placed < 9) {
    const x = Math.round(between(60, W - 60))
    const y = Math.round(between(60, H - 60))

    if (inMiddle(x, y) || nearMoon(x, y)) {
      continue
    }
    out += `<g class="${pick(['w', 'w', 'y'])} ${timing(FLARE_PERIODS, 'f')}" font-size="18" transform="translate(${x} ${y})"><text class="p" y="${base}">+</text>${cross}${burst}</g>`
    placed++
  }

  return out
}

// Two stars fall, a cell at a time, each trailing the slash that leans its way.
// A faller never stops: it steps one cell every 50ms for its whole round, far
// off the drawing, and is shown only for the first 22 cells of it.
function fallers() {
  const cw = 10
  const ch = 18
  const trail = (direction, slash) => {
    const xs = from => [0, 1, 2].map(i => direction * cw * (from + i)).join(' ')
    const ys = from => [0, 1, 2].map(i => -ch * (from + i)).join(' ')

    return `<text>*</text><text opacity=".75" x="${xs(1)}" y="${ys(1)}">${slash.repeat(3)}</text><text opacity=".4" x="${xs(4)}" y="${ys(4)}">${slash}'.</text>`
  }

  return (
    `<g class="w" transform="translate(300 80)"><g class="show1"><g class="fall1">${trail(-1, '\\')}</g></g></g>` +
    `<g class="u" transform="translate(430 520)"><g class="show2"><g class="fall2">${trail(1, '/')}</g></g></g>`
  )
}

const STYLE = `
text{font-family:ui-monospace,'Cascadia Mono','SF Mono',Menlo,Consolas,'DejaVu Sans Mono',monospace;font-size:16px;text-anchor:middle}
.w{fill:#eef0ff}.u{fill:#a9b5ff}.y{fill:#ffe7b0}
.b,.c,.q,.r,.show1,.show2{fill-opacity:0}
.a{animation:a 5s steps(1) infinite}
.b{animation:b 5s steps(1) infinite}
.c{animation:c 5s steps(1) infinite}
.p{animation:p 9s steps(1) infinite}
.q{animation:q 9s steps(1) infinite}
.r{animation:r 9s steps(1) infinite}
${timingRules()}
@keyframes a{0%{fill-opacity:1}50%{fill-opacity:0}87.5%{fill-opacity:1}100%{fill-opacity:1}}
@keyframes b{0%{fill-opacity:0}50%{fill-opacity:1}62.5%{fill-opacity:0}75%{fill-opacity:1}87.5%{fill-opacity:0}100%{fill-opacity:0}}
@keyframes c{0%{fill-opacity:0}62.5%{fill-opacity:1}75%{fill-opacity:0}100%{fill-opacity:0}}
@keyframes p{0%{fill-opacity:1}64%{fill-opacity:0}88%{fill-opacity:1}100%{fill-opacity:1}}
@keyframes q{0%{fill-opacity:0}64%{fill-opacity:1}70%{fill-opacity:0}82%{fill-opacity:1}88%{fill-opacity:0}100%{fill-opacity:0}}
@keyframes r{0%{fill-opacity:0}70%{fill-opacity:1}82%{fill-opacity:0}100%{fill-opacity:0}}
.show1{animation:show1 23s steps(1) -21s infinite}
.fall1{animation:fall1 23s steps(460) -21s infinite}
.show2{animation:show2 31s steps(1) -19s infinite}
.fall2{animation:fall2 31s steps(620) -19s infinite}
@keyframes show1{0%{fill-opacity:1}4.8%{fill-opacity:0}100%{fill-opacity:0}}
@keyframes show2{0%{fill-opacity:1}3.55%{fill-opacity:0}100%{fill-opacity:0}}
@keyframes fall1{from{transform:translate(0,0)}to{transform:translate(4600px,8280px)}}
@keyframes fall2{from{transform:translate(0,0)}to{transform:translate(-6200px,11160px)}}
.moon{transform:translate(${MOON_SPOTS[0][0]}px,${MOON_SPOTS[0][1]}px)}
@media (max-aspect-ratio:13/10){.moon{transform:translate(${MOON_SPOTS[1][0]}px,${MOON_SPOTS[1][1]}px)}}
@media (max-aspect-ratio:4/5){.moon{transform:translate(${MOON_SPOTS[2][0]}px,${MOON_SPOTS[2][1]}px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`.replace(/\n/g, '')

function build() {
  // Drawn first, so every pattern they ask for is known before <defs> is written.
  const body = sky() + farStars() + twinklers() + flares() + fallers() + moon()
  const defs = `<defs>${[...patterns.values()].join('')}<clipPath id="disc"><circle r="${MOON_RADIUS}"/></clipPath></defs>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${STYLE}</style>${defs}${body}</svg>`
}

export const SCENE = build()

/** A short fingerprint of a string: FNV-1a, in base 36. */
function fingerprint(text) {
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  }

  return hash.toString(36)
}

// A scene's key is 1 to 64 letters, digits, _ or -: the engine refuses any other.
// It carries the drawing's fingerprint, so an edited scene is a new scene to the
// app and can't be answered with a drawing it kept from before the edit.
export const SCENE_KEY = `dithered-stars-night-sky-${fingerprint(SCENE)}`
