/** A constellation the margins can show (the same names as hooks/scene.js). */
export type Constellation = 'big-dipper' | 'orion' | 'cassiopeia' | 'cygnus' | 'lyra'

/** One tool call in the night log. */
export type ToolCall = { id: string; tool: string; isDone: boolean }

/**
 * The context's fill against the compaction window, as the app's Context panel
 * shows it, and how many tokens are left before auto-compact runs.
 */
export type Gauge = { tokens?: number; window: number; percent?: number; untilCompact?: number }

/** One rate-limit window: five-hour, weekly, or a gateway's spend limit. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** What the session has used: context, limits and cost. */
export type Usage = { context: Gauge; limits: Limit[]; usd?: number }

declare module 'claude-code' {
  interface PluginState {
    'dithered-stars': {
      calls: Shaped<ToolCall[]>
      usage: Shaped<Usage | null>
      branch: string | null
      modes: string[]
      isBandOn: boolean
      turnStartedAt: number | null
      /** The session's two constellations, left margin then right. */
      sky: [Constellation, Constellation] | null
      /** Every motion stilled: the backdrop and the terminal band. */
      isQuiet: boolean
      /** The highest level (80 or 95) each usage limit has warned at. */
      warned: Record<string, number>
    }
  }
}
