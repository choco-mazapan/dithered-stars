// The terminal's share of the night: one row of ASCII stars above the prompt.
// Stars twinkle . + * in turn, a few far ones stay still, and now and then a
// shooting star crosses the row. It runs on the surface's own frame clock, so
// it ticks only while the row is on screen.

import type { ClientModule, RenderElement } from 'claude-code'

type State = { frame: number }

// One frame every 450ms: slow enough to read as twinkling, not flicker.
const FRAME_MS = 450

// The scene's own tints, from the desktop backdrop.
const WHITE = '#eef0ff'
const BLUE = '#a9b5ff'
const GOLD = '#ffe7b0'
const FAR = '#59608f'

// A near star's round: mostly a dot, then a plus, a star and back.
const TWINKLE = ['.', '.', '.', '.', '+', '*', '+', '.', '.', '.', '.', '.']

// A shooting star: a head and a trail, crossing right to left.
const METEOR_HEAD = '*'
const METEOR_TRAIL = '=--'
const METEOR_EVERY = 70 // frames between crossings
const METEOR_SPEED = 3 // cells per frame

/** The same small hash for the same cell, so the sky holds still as it twinkles. */
function hash(n: number): number {
  let t = (n + 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return (t ^ (t >>> 14)) >>> 0
}

/** What one cell shows at one frame: a glyph and its color, or a blank. */
function cell(x: number, frame: number): [string, string | undefined] {
  const h = hash(x)

  if (h % 7 !== 0) {
    return [' ', undefined]
  }

  const kind = (h >>> 3) % 10

  if (kind < 3) {
    return [(h >>> 8) % 2 === 0 ? '.' : "'", FAR]
  }

  const tint = kind < 7 ? WHITE : kind < 9 ? BLUE : GOLD
  const glyph = TWINKLE[(frame + (h >>> 12)) % TWINKLE.length] ?? '.'

  return [glyph, tint]
}

const StarBand: ClientModule<Record<string, never>, State> = (_props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.every(FRAME_MS, () => {
      surface.setState({ frame: (surface.state?.frame ?? 0) + 1 })
    })
    surface.setState({ frame: 0 })
  }

  const frame = surface.state?.frame ?? 0
  const columns = Math.max(surface.columns, 0)

  // Where the meteor is, if it is crossing now.
  const round = frame % METEOR_EVERY
  const head = columns - 1 - round * METEOR_SPEED
  const isCrossing = head > -METEOR_TRAIL.length

  // Lay the row out as runs of one color each.
  const runs: RenderElement[] = []
  let text = ''
  let color: string | undefined

  const flush = () => {
    if (text !== '') {
      runs.push(color === undefined ? Text({ children: text }) : Text({ color, children: text }))
    }
    text = ''
  }

  for (let x = 0; x < columns; x++) {
    let next = cell(x, frame)

    if (isCrossing && x >= head && x <= head + METEOR_TRAIL.length) {
      next = x === head ? [METEOR_HEAD, WHITE] : [METEOR_TRAIL[x - head - 1] ?? '-', BLUE]
    }

    if (next[1] !== color && next[0] !== ' ') {
      flush()
      color = next[1]
    }
    text += next[0]
  }
  flush()

  return Box({ children: Text({ wrap: 'truncate-end', children: runs }) })
}

export default StarBand
