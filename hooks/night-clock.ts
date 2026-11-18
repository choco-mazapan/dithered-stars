// The star clock: how long the session and the turn have run, and a small sky
// the moon crosses once an hour. It ticks on the surface's own frame clock,
// so it costs nothing while the pane is closed.

import type { ClientModule, RenderElement } from 'claude-code'

type Props = { startedAt: number; turnStartedAt: number | null }
type State = { now: number }

const WHITE = '#eef0ff'
const GOLD = '#ffe7b0'
const FAR = '#59608f'
const SKY_WIDTH = 30

/** 3725000 ms as 1h 2m, 65000 as 1m 5s. */
export function span(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

const NightClock: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements

  if (surface.state === undefined) {
    surface.every(1000, () => surface.setState({ now: Date.now() }))
    surface.setState({ now: Date.now() })
  }

  const now = surface.state?.now ?? Date.now()
  const elapsed = now - props.startedAt
  const width = Math.max(10, Math.min(SKY_WIDTH, surface.columns || SKY_WIDTH))

  // The moon's place: one crossing an hour, left to right.
  const moonAt = Math.floor(((elapsed / 60000) % 60) / 60 * width)
  const twinkle = Math.floor(now / 1000) % 4
  const sky: RenderElement[] = []

  for (let x = 0; x < width; x++) {
    if (x === moonAt) {
      sky.push(Text({ color: GOLD, children: 'C' }))
    } else if ((x * 7 + 3) % 5 === 0) {
      const glyph = (x + twinkle) % 4 === 0 ? '+' : '.'
      sky.push(Text({ color: glyph === '+' ? WHITE : FAR, children: glyph }))
    } else {
      sky.push(Text({ children: ' ' }))
    }
  }

  const turn = props.turnStartedAt === null ? 'idle' : span(now - props.turnStartedAt)

  return Box({
    flexDirection: 'column',
    children: [
      Text({ wrap: 'truncate-end', children: sky }),
      Text({ dimColor: true, children: `Session ${span(elapsed)} · this turn ${turn}` }),
    ],
  })
}

export default NightClock
