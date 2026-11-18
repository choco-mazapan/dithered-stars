// The backdrop: a night sky shaded with an ordered (Bayer) dither, a dithered
// crescent moon, and stars drawn in ASCII that twinkle, flare and fall.
// It is built once, as a string, when the module loads. No DOM, no script:
// every movement is a CSS animation inside the SVG's own <style>.
//
// It follows the real sky: the moon in tonight's phase, more meteors near a
// shower's peak, a dusk, night or dawn tint by the clock, the season's
// constellations, and a pale day sky when the app is in light mode.

import { activeShower, moonPhase, partOfDay, season } from './sky-time.js'

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

// The glow and the nebula by the part of the day: a deep night, a plum
// dusk, a blue dawn. Daytime keeps the base pair (light mode repaints them).
const TINTS_BY_PART = {
  night: { glow: '#1b2266', nebula: '#3a1b60' },
  dusk: { glow: '#5a2a6a', nebula: '#6a2a4a' },
  dawn: { glow: '#2f5a9e', nebula: '#4a3a7a' },
  day: { glow: GLOW, nebula: NEBULA },
}

// What the sky is doing for the build under way; set at each build.
let now = { part: 'night', lit: 0.25, isWaxing: true, shower: null, hasPleiades: true }
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

// Reseeded at each build, so the base sky is the same sky whatever is added.
let random = makeRandom(20261115)

// Space the margin figures stand in, set at each build: the flares keep out.
let reserved = []
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
      // The class lets light mode repaint a pattern's pixels from the style.
      `<pattern id="${id}" width="${4 * PX}" height="${4 * PX}" patternUnits="userSpaceOnUse"><path class="c-${name}" d="${cells}" fill="${color}"/></pattern>`,
    )
  }

  return `url(#${id})`
}

// The sky: a glow rising from the horizon, and two drifts of nebula.
function sky() {
  const tint = TINTS_BY_PART[now.part] ?? TINTS_BY_PART.day
  let out = `<rect class="ink" width="${W}" height="${H}" fill="${INK}"/>`

  for (let level = 1; level <= 10; level++) {
    const y = 430 + (level - 1) * 54

    out += `<rect y="${y}" width="${W}" height="${H - y}" fill="${dither('g', tint.glow, level)}"/>`
  }

  const drifts = [
    { x: 230, y: 140, radius: 560, shrink: 86, levels: 6 },
    { x: 1430, y: 830, radius: 430, shrink: 78, levels: 5 },
  ]

  for (const drift of drifts) {
    for (let level = 1; level <= drift.levels; level++) {
      const rx = drift.radius - (level - 1) * drift.shrink

      out += `<ellipse cx="${drift.x}" cy="${drift.y}" rx="${rx}" ry="${round(rx * 0.5)}" transform="rotate(-18 ${drift.x} ${drift.y})" fill="${dither('n', tint.nebula, level)}"/>`
    }
  }

  return `<g shape-rendering="crispEdges">${out}</g>`
}

// The moon: a disc in earthshine, and its lit part in tonight's phase.
const MOON_RADIUS = 56

/**
 * The lit part of a disc of radius `r` with `lit` (0 to 1) of it lit: one
 * half of the limb, closed by the terminator, a half ellipse. As seen from
 * the north, a waxing moon is lit on the right and a waning one on the left.
 */
function litShape(r, lit, isWaxing) {
  const rx = round(r * Math.abs(1 - 2 * lit))
  const isCrescent = lit < 0.5
  // The limb from the top to the bottom, round the lit side.
  const limb = isWaxing ? 1 : 0
  // The terminator back to the top: bulging toward the lit side on a
  // crescent, away from it on a gibbous moon.
  const back = isWaxing === isCrescent ? 0 : 1

  return `M0 ${-r}A${r} ${r} 0 0 ${limb} 0 ${r}A${rx} ${r} 0 0 ${back} 0 ${-r}Z`
}

function moon() {
  const r = MOON_RADIUS
  const box = r + 4
  let out = `<rect class="ink" x="${-box}" y="${-box}" width="${2 * box}" height="${2 * box}" fill="${INK}"/>`

  out += `<rect x="${-box}" y="${-box}" width="${2 * box}" height="${2 * box}" fill="${dither('e', MOON_DIM, 3)}"/>`

  // A new moon is earthshine alone. Otherwise the lit part, then a slimmer
  // copy of it hugging the limb at a denser level, so it brightens outward.
  if (now.lit > 0.02) {
    out += `<path d="${litShape(r, now.lit, now.isWaxing)}" fill="${dither('m', MOON_LIT, 9)}"/>`
    out += `<path d="${litShape(r, Math.max(0.02, now.lit * 0.82), now.isWaxing)}" fill="${dither('m', MOON_LIT, 14)}"/>`
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

    if (inMiddle(x, y) || nearMoon(x, y) || reserved.some(box => isIn(x, y, box))) {
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
@media (prefers-reduced-motion:reduce){*{animation:none!important}.mq{display:none}}
`.replace(/\n/g, '')

// ---------------------------------------------------------------------------
// The margins. Each extra below draws only beside the words: the bands either
// side of the middle, which the chat column covers. Each has its own seed, so
// adding one never moves a star of the base sky or of another extra.

const LEFT = [150, 430]
const RIGHT = [1170, 1450]

/** A seeded set of helpers for one extra. */
function helpers(seed) {
  const r = makeRandom(seed)

  return {
    r,
    between: (low, high) => low + r() * (high - low),
    pick: list => list[Math.floor(r() * list.length)],
    timing: (periods, prefix) =>
      `${prefix}${Math.floor(r() * periods.length)} d${Math.floor(r() * DELAYS.length)}`,
  }
}

const twinkle = (h, x, y, size, opacity) => {
  const at = `x="${Math.round(x)}" y="${Math.round(y)}"`

  return `<g class="${h.pick(TINTS)} ${h.timing(TWINKLE_PERIODS, 't')}" font-size="${size}" opacity="${opacity}"><text class="a" ${at}>.</text><text class="b" ${at}>+</text><text class="c" ${at} dy=".12em">*</text></g>`
}

// 1. Constellations: real ones, from the stars' own positions (J2000 right
// ascension and declination, in degrees) and brightness (visual magnitude:
// smaller is brighter). Each session shows two, one in each margin, and the
// Pleiades always sit low in the left margin.
export const SKY = {
  'big-dipper': {
    name: 'big dipper',
    stars: [
      ['Dubhe', 165.93, 61.75, 1.8], ['Merak', 165.46, 56.38, 2.4], ['Phecda', 178.46, 53.69, 2.4],
      ['Megrez', 183.86, 57.03, 3.3], ['Alioth', 193.51, 55.96, 1.8], ['Mizar', 200.98, 54.93, 2.2],
      ['Alkaid', 206.89, 49.31, 1.9],
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
  },
  orion: {
    name: 'orion',
    stars: [
      ['Betelgeuse', 88.79, 7.41, 0.5], ['Rigel', 78.63, -8.2, 0.1], ['Bellatrix', 81.28, 6.35, 1.6],
      ['Mintaka', 83.0, -0.3, 2.2], ['Alnilam', 84.05, -1.2, 1.7], ['Alnitak', 85.19, -1.94, 1.8],
      ['Saiph', 86.94, -9.67, 2.1], ['Meissa', 83.78, 9.93, 3.4],
    ],
    lines: [[7, 0], [7, 2], [0, 5], [2, 3], [3, 4], [4, 5], [5, 6], [3, 1]],
  },
  cassiopeia: {
    name: 'cassiopeia',
    stars: [
      ['Caph', 2.29, 59.15, 2.3], ['Schedar', 10.13, 56.54, 2.2], ['Navi', 14.18, 60.72, 2.5],
      ['Ruchbah', 21.45, 60.24, 2.7], ['Segin', 28.6, 63.67, 3.4],
    ],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  cygnus: {
    name: 'cygnus',
    stars: [
      ['Deneb', 310.36, 45.28, 1.3], ['Sadr', 305.56, 40.26, 2.2], ['Albireo', 292.68, 27.96, 3.1],
      ['Gienah', 311.55, 33.97, 2.5], ['Fawaris', 296.24, 45.13, 2.9],
    ],
    lines: [[0, 1], [1, 2], [4, 1], [1, 3]],
  },
  lyra: {
    name: 'lyra',
    stars: [
      ['Vega', 279.23, 38.78, 0.0], ['Epsilon', 281.08, 39.67, 4.7], ['Zeta', 281.19, 37.61, 4.4],
      ['Delta', 283.63, 36.9, 4.3], ['Sheliak', 282.52, 33.36, 3.5], ['Sulafat', 284.74, 32.69, 3.2],
    ],
    lines: [[0, 1], [0, 2], [1, 2], [2, 3], [3, 5], [5, 4], [4, 2]],
  },
}

const PLEIADES = [
  ['Alcyone', 56.87, 24.105, 2.9], ['Atlas', 57.29, 24.05, 3.6], ['Electra', 56.22, 24.11, 3.7],
  ['Maia', 56.46, 24.37, 3.9], ['Merope', 56.58, 23.95, 4.2], ['Taygeta', 56.3, 24.47, 4.3],
  ['Pleione', 57.29, 24.14, 5.1], ['Celaeno', 56.2, 24.29, 5.4], ['Asterope', 56.48, 24.55, 5.8],
]

/** The names a session picks two of. */
export const CONSTELLATIONS = Object.keys(SKY)

// Where each margin's figure goes: a box in the scene's own units. The boxes
// sit inside what a wide window shows beside the chat column (about x 160 to
// 360 and 1240 to 1440), with room for the brightest stars' glow.
const SLOTS = {
  left: { x: 190, y: 170, w: 160, h: 250 },
  right: { x: 1260, y: 330, w: 160, h: 230 },
}
const PLEIADES_BOX = { x: 210, y: 580, w: 120, h: 80 }

/**
 * The stars laid flat, as on a chart facing them: east to the left, north up,
 * then scaled into the box keeping their shape, and centred in it.
 */
function plot(stars, box) {
  const ra0 = stars.reduce((sum, s) => sum + s[1], 0) / stars.length
  const dec0 = stars.reduce((sum, s) => sum + s[2], 0) / stars.length
  const cos = Math.cos((dec0 * Math.PI) / 180)
  const flat = stars.map(([, ra, dec]) => [-(ra - ra0) * cos, -(dec - dec0)])
  const xs = flat.map(p => p[0])
  const ys = flat.map(p => p[1])
  const spanX = Math.max(...xs) - Math.min(...xs) || 1
  const spanY = Math.max(...ys) - Math.min(...ys) || 1
  const scale = Math.min(box.w / spanX, box.h / spanY)
  const offX = box.x + (box.w - spanX * scale) / 2 - Math.min(...xs) * scale
  const offY = box.y + (box.h - spanY * scale) / 2 - Math.min(...ys) * scale

  return flat.map(([x, y]) => [round(x * scale + offX), round(y * scale + offY)])
}

/** A star drawn by its brightness: bigger, brighter and sharper when brighter. */
function starGlyph([x, y], magnitude, delay) {
  const size = Math.round(Math.max(16, 46 - magnitude * 7))
  const glyph = magnitude < 2.6 ? '*' : magnitude < 4 ? '+' : '.'
  const opacity = Math.max(0.6, 1 - magnitude * 0.08).toFixed(2)
  const tint = magnitude < 1 ? 'y' : 'w'
  // The brightest stars wear a small dithered glow, so they read as the
  // anchors of the figure even at a glance.
  const glow =
    magnitude < 2.4
      ? `<circle class="sg" cx="${x}" cy="${y}" r="${Math.round(16 - magnitude * 3)}" fill="${dither('sg', '#cfd6ff', magnitude < 1 ? 5 : 3)}" shape-rendering="crispEdges"/>`
      : ''

  return `${glow}<g class="${tint} cs d${delay}" font-size="${size}" opacity="${opacity}"><text x="${x}" y="${y}" dy=".35em">${glyph}</text></g>`
}

function figure(key, slot, h, attrs = '') {
  const one = SKY[key]
  const box = SLOTS[slot]
  const at = plot(one.stars, box)
  const d = one.lines.map(([a, b]) => `M${at[a].join(' ')}L${at[b].join(' ')}`).join('')
  const stars = one.stars.map((star, i) => starGlyph(at[i], star[3], Math.floor(h.r() * DELAYS.length))).join('')
  const label = `<text class="u" opacity=".45" font-size="12" letter-spacing="3" x="${box.x + box.w / 2}" y="${box.y + box.h + 34}">${one.name}</text>`

  return `<g data-sky="${key}-${slot}"${attrs}><path class="cl" d="${d}" stroke="#a9b5ff" stroke-width="2" stroke-dasharray="3 6" fill="none"/>${stars}${label}</g>`
}

function pleiades(h) {
  const at = plot(PLEIADES, PLEIADES_BOX)
  const cx = PLEIADES_BOX.x + PLEIADES_BOX.w / 2
  const cy = PLEIADES_BOX.y + PLEIADES_BOX.h / 2
  // Their blue haze: a dithered glow behind the cluster.
  const haze = [1, 2, 3]
    .map((level, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${100 - i * 26}" ry="${66 - i * 17}" fill="${dither('p', '#9fb0ff', level)}"/>`)
    .join('')
  // Drawn a little brighter than their magnitudes: the cluster is small and
  // dim, and at true brightness it would vanish into the margin.
  const stars = PLEIADES.map((star, i) => starGlyph(at[i], star[3] - 1.2, Math.floor(h.r() * DELAYS.length))).join('')
  const label = `<text class="u" opacity=".45" font-size="12" letter-spacing="3" x="${cx}" y="${PLEIADES_BOX.y + PLEIADES_BOX.h + 34}">pleiades</text>`

  return `<g data-sky="pleiades"><g class="ph" shape-rendering="crispEdges">${haze}</g>${stars}${label}</g>`
}

/**
 * The two picked figures and the Pleiades. `pair` names the left and right
 * figures; 'all' draws every figure in both margins, all but the first pair
 * hidden, for the preview page to switch between.
 */
function constellations({ pair = ['orion', 'cassiopeia'] } = {}) {
  const h = helpers(7001)

  if (pair === 'all') {
    let out = ''

    for (const key of CONSTELLATIONS) {
      for (const slot of ['left', 'right']) {
        out += figure(key, slot, h, ' style="display:none"')
      }
    }

    return out + pleiades(h)
  }

  // The Pleiades only in the months they're up in the evening.
  return figure(pair[0], 'left', h) + figure(pair[1], 'right', h) + (now.hasPleiades ? pleiades(h) : '')
}

/**
 * Two different figures, picked at random, left first: from the ones up in
 * the evening in the month of `ms`.
 */
export function pickPair(random = Math.random, ms = Date.now()) {
  const up = season(ms).constellations.filter(key => CONSTELLATIONS.includes(key))
  const pool = up.length >= 2 ? up : CONSTELLATIONS
  const first = pool[Math.floor(random() * pool.length)]
  const rest = pool.filter(key => key !== first)

  return [first, rest[Math.floor(random() * rest.length)]]
}

// 2. A meteor shower: stars that fall down the margins only, a cell at a time.
function meteorShower() {
  const h = helpers(7002)
  const cw = 10
  const ch = 18
  const trail = (direction, slash) => {
    const xs = from => [0, 1, 2].map(i => direction * cw * (from + i)).join(' ')
    const ys = from => [0, 1, 2].map(i => -ch * (from + i)).join(' ')

    return `<text>*</text><text opacity=".75" x="${xs(1)}" y="${ys(1)}">${slash.repeat(3)}</text><text opacity=".4" x="${xs(4)}" y="${ys(4)}">${slash}'.</text>`
  }
  let out = ''
  let css = ''

  // Near a real shower's peak, the margins rain.
  const count = now.shower === null ? 10 : 26

  for (let i = 0; i < count; i++) {
    const isLeft = i % 2 === 0
    const [low, high] = isLeft ? LEFT : RIGHT
    const x = Math.round(h.between(low, high))
    const y = Math.round(h.between(-40, 380))
    // Left ones fall toward the left edge, right ones toward the right.
    const dx = isLeft ? -260 : 260
    const seconds = round(h.between(5, 11))
    const delay = round(h.between(0, 11))

    css += `.ms${i}{animation:ms${i} ${seconds}s steps(36) -${delay}s infinite}@keyframes ms${i}{0%{transform:translate(0,0);opacity:1}14%{transform:translate(${dx}px,470px);opacity:0}100%{transform:translate(${dx}px,470px);opacity:0}}`
    out += `<g class="${h.pick(['w', 'w', 'u'])}" transform="translate(${x} ${y})" font-size="16"><g class="ms${i}">${trail(isLeft ? 1 : -1, isLeft ? '/' : '\\')}</g></g>`
  }

  return { svg: `<g class="mq" clip-path="url(#margins)">${out}</g>`, css }
}

// 3. A horizon: hills and pines along the foot of both margins, with fireflies.
function pine(x, base, height) {
  const w = height * 0.42
  const tiers = [0, 0.3, 0.55].map(at => {
    const top = base - height + at * height
    const half = w * (0.5 + at * 0.6)

    return `M${round(x)} ${round(top)}L${round(x + half)} ${round(top + height * 0.42)}L${round(x - half)} ${round(top + height * 0.42)}Z`
  })

  // Wound the same way as the hills, so the trunk adds to them, not cuts.
  return tiers.join('') + `M${round(x - 3)} ${base}v-${round(height * 0.2)}h6v${round(height * 0.2)}z`
}

function horizon() {
  const h = helpers(7003)
  const left = 'M0 1000L0 812Q110 760 220 792T470 846L470 1000Z'
  const right = 'M1130 1000L1130 852Q1250 776 1372 806T1600 784L1600 1000Z'
  const trees =
    [[48, 806, 92], [96, 796, 66], [150, 790, 110], [338, 832, 74], [392, 842, 96]]
      .map(([x, base, height]) => pine(x, base, height))
      .join('') +
    [[1190, 840, 84], [1236, 822, 120], [1470, 798, 90], [1528, 792, 116], [1574, 790, 70]]
      .map(([x, base, height]) => pine(x, base, height))
      .join('')
  let flies = ''

  for (let i = 0; i < 14; i++) {
    const [low, high] = i % 2 === 0 ? [20, 450] : [1150, 1580]

    flies += `<g class="ff d${Math.floor(h.r() * DELAYS.length)}"><text class="y" font-size="12" x="${Math.round(h.between(low, high))}" y="${Math.round(h.between(720, 900))}">.</text></g>`
  }

  // A rim of dithered glow on the ridge, then the ridge itself.
  const rim = `<path d="${left}${right}" transform="translate(0 -10)" fill="${dither('h', GLOW, 6)}" shape-rendering="crispEdges"/>`

  return `${rim}<path class="hill" d="${left}${right}${trees}" fill="${INK}"/>${flies}`
}

// 4. A lighthouse on a rock in the right margin, its beam swinging round.
function lighthouse({ extras = [] } = {}) {
  const x = 1330
  const top = 700
  const base = 872
  const stripe = dither('l', '#c9cfee', 7)
  let tower = ''

  // The tower narrows as it rises: bands of light and dark.
  for (let i = 0; i < 6; i++) {
    const y0 = base - (i + 1) * ((base - top) / 6)
    const y1 = base - i * ((base - top) / 6)
    const half0 = 14 + (y0 - top) * 0.06
    const half1 = 14 + (y1 - top) * 0.06

    tower += `<path d="M${round(x - half1)} ${round(y1)}L${round(x + half1)} ${round(y1)}L${round(x + half0)} ${round(y0)}L${round(x - half0)} ${round(y0)}Z" fill="${i % 2 === 0 ? stripe : '#1a1d33'}"/>`
  }

  const lampY = top - 16
  const beam = `<g transform="translate(${x} ${lampY})"><g class="beam"><path d="M0 0L-330 -34L-330 34Z" fill="${dither('b', '#ffe7b0', 3)}"/><path d="M0 0L-170 -16L-170 16Z" fill="${dither('b', '#ffe7b0', 6)}"/></g></g>`
  const room =
    `<rect x="${x - 18}" y="${top - 4}" width="36" height="6" fill="#1a1d33"/>` +
    `<rect x="${x - 13}" y="${lampY - 12}" width="26" height="22" fill="#0e101b" stroke="#59608f"/>` +
    `<path d="M${x - 17} ${lampY - 12}L${x} ${lampY - 30}L${x + 17} ${lampY - 12}Z" fill="#1a1d33"/>` +
    `<g class="lamp"><text class="y" font-size="20" x="${x}" y="${lampY}" dy=".35em">*</text></g>`
  const rock = `<path class="hill" d="M1236 1000L1252 ${base + 6}Q1300 ${base - 10} 1380 ${base}L1420 ${base + 22}L1440 1000Z" fill="${INK}"/>`
  // With the horizon drawn, the tower stands on its hills and needs no sea.
  const sea = extras.includes('horizon')
    ? ''
    : `<rect x="1130" y="${base + 30}" width="470" height="${1000 - base - 30}" fill="${dither('s', '#2a3270', 5)}"/>`

  return `<g shape-rendering="crispEdges">${sea}${beam}${tower}${room}</g>${rock}`
}

// 5. Denser edges: more twinkling at both sides, thinning toward the middle.
// Where the margins' figures stand: busy stars keep out, so the figures read.
const pad = (box, by) => ({ x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by + 40 })
const isIn = (x, y, box) => x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h

function edges({ extras = [] } = {}) {
  const h = helpers(7005)
  const clear = [{ x: 1300, y: 125, w: 180, h: 180 }]

  if (extras.includes('constellations')) {
    clear.push(pad(SLOTS.left, 30), pad(SLOTS.right, 30), pad(PLEIADES_BOX, 40))
  }
  if (extras.includes('lighthouse')) {
    clear.push({ x: 1270, y: 630, w: 130, h: 370 })
  }
  // Above the hills only: a star drawn on a hillside would sit on the ground.
  const lowest = extras.includes('horizon') ? 770 : H - 15
  let out = ''
  let placed = 0

  for (let tries = 0; placed < 110 && tries < 2000; tries++) {
    // Closer to an edge is likelier: the square pulls toward 0.
    const fromEdge = h.r() ** 2 * 470
    const x = placed % 2 === 0 ? 10 + fromEdge : W - 10 - fromEdge
    const y = h.between(15, lowest)

    if (clear.some(box => isIn(x, y, box))) {
      continue
    }
    out += twinkle(h, x, y, h.pick([12, 14, 15, 16, 18]), h.pick(['.45', '.65', '.85', '1']))
    placed++
  }

  return out
}

const EXTRA_STYLE = `
.cl{animation:cl 6s ease-in-out infinite}@keyframes cl{0%,100%{stroke-opacity:.45}50%{stroke-opacity:.8}}
.cs text{animation:cs 4.2s ease-in-out infinite}@keyframes cs{0%,100%{fill-opacity:1}50%{fill-opacity:.5}}
.ff text{animation:ff 7s ease-in-out infinite}@keyframes ff{0%,100%{transform:translate(0,0);fill-opacity:0}30%{fill-opacity:.9}60%{transform:translate(6px,-22px);fill-opacity:.2}80%{fill-opacity:.8}}
.beam{animation:beam 9s ease-in-out infinite}@keyframes beam{0%{transform:scaleX(1);opacity:.7}25%{transform:scaleX(.04);opacity:.35}50%{transform:scaleX(-1);opacity:.7}75%{transform:scaleX(.04);opacity:.35}100%{transform:scaleX(1);opacity:.7}}
.lamp text{animation:cs 2.2s ease-in-out infinite}
.ph{animation:ph 8s ease-in-out infinite}@keyframes ph{0%,100%{opacity:.55}50%{opacity:.95}}
`.replace(/\n/g, '')

// Light mode: the same drawing as a day sky. The ink turns pale blue, the
// horizon glow a bright haze, the nebulae white clouds, the hills a soft
// slate, and the stars, lines and beam go (no stars by day). The moon stays,
// pale, as a daytime moon does.
const DAY_STYLE = `@media (prefers-color-scheme:light){
.ink{fill:#c9d8f4}.c-g{fill:#f3f6ff}.c-n{fill:#ffffff}.c-h{fill:#eef3ff}
.c-e{fill:#dfe6f7}.c-m{fill:#ffffff}.hill{fill:#7383ad}.c-s{fill:#8fa6d8}
text,.cl,.sg,.ph,.beam,.lamp{display:none}}`.replace(/\n/g, '')

/** The margin extras, by the name the theme picks them with. */
export const EXTRAS = {
  constellations: { title: 'Constellations', draw: constellations },
  meteors: { title: 'Meteor shower', draw: meteorShower },
  horizon: { title: 'Horizon silhouette', draw: horizon },
  lighthouse: { title: 'Lighthouse', draw: lighthouse },
  edges: { title: 'Denser edges', draw: edges },
}

/** What the sky is doing at `ms`, as the build reads it. */
export function skyAt(ms) {
  const phase = moonPhase(ms)

  return {
    part: partOfDay(ms),
    // Rounded, so the drawing (and its key) changes a few times a day, not
    // at every build.
    lit: Math.round(phase.lit * 50) / 50,
    isWaxing: phase.isWaxing,
    phase: phase.name,
    icon: phase.icon,
    shower: activeShower(ms)?.name ?? null,
    hasPleiades: season(ms).hasPleiades,
  }
}

/**
 * The whole backdrop, with the margin extras named in `extras`. `at` is the
 * moment whose sky it shows (now by default); `isQuiet` stills every motion.
 */
export function buildScene(extras = [], options = {}) {
  now = { ...skyAt(options.at ?? Date.now()), ...options.sky }
  random = makeRandom(20261115)
  patterns.clear()
  reserved = []
  if (extras.includes('constellations')) {
    reserved.push(pad(SLOTS.left, 40), pad(SLOTS.right, 40), pad(PLEIADES_BOX, 40))
  }
  if (extras.includes('lighthouse')) {
    reserved.push({ x: 1250, y: 600, w: 170, h: 400 })
  }

  // Drawn first, so every pattern they ask for is known before <defs> is written.
  let body = sky() + farStars() + twinklers() + flares() + fallers()
  let css = ''

  for (const name of extras) {
    const drawn = EXTRAS[name].draw({ ...options, extras })

    // Each in a group of its own, which the preview page switches on and off.
    if (typeof drawn === 'string') {
      body += `<g data-extra="${name}">${drawn}</g>`
    } else {
      body += `<g data-extra="${name}">${drawn.svg}</g>`
      css += drawn.css
    }
  }
  body += moon()

  const margins = `<clipPath id="margins"><rect x="0" y="0" width="${LEFT[1] + 40}" height="${H}"/><rect x="${RIGHT[0] - 40}" y="0" width="${W - RIGHT[0] + 40}" height="${H}"/></clipPath>`
  const defs = `<defs>${[...patterns.values()].join('')}<clipPath id="disc"><circle r="${MOON_RADIUS}"/></clipPath>${margins}</defs>`
  // The reduced-motion rule stays last, so it stills the extras too.
  const quiet = options.isQuiet ? '*{animation:none!important}.mq{display:none}' : ''
  const style = STYLE.replace('@media (prefers-reduced-motion', `${EXTRA_STYLE}${css}${DAY_STYLE}${quiet}@media (prefers-reduced-motion`)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><style>${style}</style>${defs}${body}</svg>`
}

// Which margin extras the theme draws: pick from the names in EXTRAS.
export const CHOSEN_EXTRAS = ['constellations', 'meteors', 'horizon', 'lighthouse', 'edges']


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
/**
 * The session's backdrop: the chosen extras, with `pair` as its two
 * constellations, left then right. The key carries the drawing's fingerprint.
 */
export function sceneFor(pair, { at = Date.now(), isQuiet = false } = {}) {
  const sky = skyAt(at)
  const svg = buildScene(CHOSEN_EXTRAS, { pair, sky, isQuiet })

  return { svg, key: `dithered-stars-night-sky-${fingerprint(svg)}`, sky }
}
