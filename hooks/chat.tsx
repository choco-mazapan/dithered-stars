// The night sky in the chat itself: a starry thinking line, a star on each
// tool call's row, tonight's moon in the prompt's hint; and the alerts: a
// chime when a long turn ends, a toast when tests pass or a PR opens, and a
// warning as a usage limit nears.

import { read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Limit } from '../types'
import { activeShower, moonPhase, nextShower } from './sky-time.js'

const WHITE = '#eef0ff'
const GOLD = '#ffe7b0'
const FAR = '#59608f'
const RED = '#e5484d'

// What the thinking line says after its word, by what the turn is doing.
const SUFFIX: Record<string, string> = {
  thinking: '… ✦',
  requesting: '… ·',
  responding: '… ✧',
  'tool-use': '… ✶',
  'tool-input': '… ✶',
}

// The terminal's word while the model thinks. The desktop's word says what
// the step is doing, so it is left alone there.
const THINKING_WORDS = ['Stargazing', 'Moonwatching', 'Charting stars', 'Tracing constellations']

// A turn at least this long rings the chime when it ends.
const LONG_TURN_MS = 60 * 1000

// The limit levels that warn, highest first.
const LEVELS = [95, 80]

const warned = { plugin: 'dithered-stars', key: 'warned' } as const

/** The moon and the meteors in a few words, for the prompt's hint. */
export function skyHint(ms: number): string {
  const moon = moonPhase(ms)
  const shower = activeShower(ms)
  const coming = nextShower(ms)
  const meteors =
    shower !== null
      ? `${shower.name} tonight`
      : coming !== null
        ? `${coming.name} in ${coming.days} ${coming.days === 1 ? 'night' : 'nights'}`
        : ''

  return [`${moon.icon} ${moon.name}`, meteors].filter(Boolean).join(' · ')
}

/** Whether a command runs a project's tests. */
const isTestRun = (command: string) =>
  /(^|[\s;&|(])(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(pytest|jest|vitest|mocha|phpunit|rspec)\b|\b(cargo|go|dotnet|mix|deno|swift)\s+test\b|\bclaude\s+plugin\s+test\b|\bgradlew?\s+test\b|\bmvn\s+test\b|\bmake\s+test\b/.test(
    command,
  )

/** Whether a run's output owns up to any failure. */
const hasFailures = (text: string) => /\b[1-9]\d*\s+(failed|failing|failures?|errors?)\b|\bFAIL(ED)?\b|\bnot ok\b/.test(text)

/** The text of whatever a tool call answered, as far as it can be read. */
function outputOf(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }
  if (result !== null && typeof result === 'object') {
    const { stdout, stderr } = result as { stdout?: unknown; stderr?: unknown }

    if (typeof stdout === 'string' || typeof stderr === 'string') {
      return `${typeof stdout === 'string' ? stdout : ''}\n${typeof stderr === 'string' ? stderr : ''}`
    }

    return JSON.stringify(result)
  }

  return ''
}

/**
 * A toast when a Bash call ran tests that passed, or opened a pull request.
 * `input` and `ran` are the call's input and its answer.
 */
export function celebrate($: EngineInterface, input: unknown, ran: { result?: unknown; isError?: boolean }) {
  const command = typeof (input as { command?: unknown })?.command === 'string' ? (input as { command: string }).command : ''

  if (command === '' || ran.isError === true) {
    return
  }
  const output = outputOf(ran.result)
  const interrupted = (ran.result as { interrupted?: unknown } | undefined)?.interrupted === true

  if (interrupted) {
    return
  }
  if (/\bgh\s+pr\s+create\b/.test(command) && /https:\/\/\S+\/pull\/\d+/.test(output)) {
    $.ui.toast('✦ ･ﾟ✧ Pull request opened. The stars align ✧ﾟ･ ✦', { timeoutMs: 6000 })
  } else if (isTestRun(command) && !hasFailures(output)) {
    $.ui.toast('✦ ･ﾟ✧ Tests passed. A shooting star for you ✧ﾟ･ ✦', { timeoutMs: 6000 })
  }
}

/** A soft chime when a main-loop turn that ran a minute or more has ended. */
export function chimeIfLong($: EngineInterface, durationMs: number, isMainLoop: boolean, isAborted: boolean) {
  if (!isMainLoop || isAborted || durationMs < LONG_TURN_MS) {
    return
  }
  // Fire and forget: a surface with no player plays nothing, and that's fine.
  void $.audio.play({ asset: 'sounds/chime.wav' }, { gain: 0.6 }).catch(() => undefined)
}

/**
 * A toast the first time a limit passes 80%, and again past 95%. A limit that
 * falls back under 80% (its window reset) is free to warn again.
 */
export async function warnLimits($: EngineInterface, limits: readonly Limit[]) {
  const before = (await read($, warned)) ?? {}
  const after: Record<string, number> = { ...before }
  const names: Record<string, string> = { five_hour: '5-hour limit', seven_day: 'weekly limit', spend_limit: 'spend limit' }

  for (const limit of limits) {
    const level = LEVELS.find(one => limit.percentUsed >= one)
    const was = before[limit.kind] ?? 0

    if (level === undefined) {
      delete after[limit.kind]
      continue
    }
    if (level > was) {
      after[limit.kind] = level
      $.ui.toast(
        `${level >= 95 ? '☄' : '✦'} ${Math.round(limit.percentUsed)}% of your ${names[limit.kind] ?? limit.kind} is used${level >= 95 ? '. Nearly out' : ''}.`,
        { timeoutMs: 8000 },
      )
    }
  }
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    await update($, warned, () => after)
  }
}

export function registerChat(on: On) {
  // The thinking line: a star after the word, and on the terminal a starry
  // word while the model thinks.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const props = { ...e.props, suffix: SUFFIX[e.props.mode] ?? e.props.suffix }

    if (e.surface === 'terminal' && e.props.mode === 'thinking' && e.props.message === null) {
      // Steady for a turn: the word follows the minute, not every frame.
      const minute = Math.floor((await $.clock.now()) / 60000)
      props.word = THINKING_WORDS[minute % THINKING_WORDS.length] ?? e.props.word
    }

    return next({ ...e, props })
  })

  // A star before each tool call's row: white while it runs, gold once done,
  // red if it failed, dim if it was stopped.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { isRunning, isErrored, isInterrupted } = e.props
    const [glyph, color] = isRunning
      ? ['+', WHITE]
      : isErrored
        ? ['×', RED]
        : isInterrupted
          ? ['·', FAR]
          : ['*', GOLD]

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={color}>{glyph}</Text>
        <Box flexGrow={1} flexDirection="column">
          {row}
        </Box>
      </Box>
    )
  })

  // The prompt's hint: tonight's moon and the next meteor shower at its end.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.props.isDraft) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, tail: skyHint(await $.clock.now()) } })
  })
}
