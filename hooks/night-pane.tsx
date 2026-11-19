// The night watch: a pane beside the chat with the session's surroundings,
// context, usage and limits, the tool calls, a star clock and quick actions;
// the /night and /stars commands; and a status line with the same figures.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, SessionRateLimit, SessionUsage } from 'claude-code'

import type { Limit, ToolCall, Usage } from '../types'
import { celebrate, chimeIfLong, warnLimits } from './chat.tsx'
import { span } from './night-clock.ts'
import { followUsage } from './paint.ts'

export const PANE = 'night-watch'
const TITLE = 'Night watch'

// Change a tag when that value's fields change: an earlier version's value,
// which outlives a reload, is then declined.
const calls = atom({ plugin: 'dithered-stars', key: 'calls' } as const, [], { shape: 'calls-1' })
const usage = atom({ plugin: 'dithered-stars', key: 'usage' } as const, null, { shape: 'usage-2' })
const branch = atom({ plugin: 'dithered-stars', key: 'branch' } as const, null)
const modes = atom({ plugin: 'dithered-stars', key: 'modes' } as const, [])
const isBandOn = atom({ plugin: 'dithered-stars', key: 'isBandOn' } as const, true)
const turnStartedAt = atom({ plugin: 'dithered-stars', key: 'turnStartedAt' } as const, null)

// The scene's tints, and a red for a limit nearly spent.
const WHITE = '#eef0ff'
const BLUE = '#a9b5ff'
const GOLD = '#ffe7b0'
const FAR = '#59608f'
const RED = '#e5484d'

const LIMIT_NAMES: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: 'Weekly limit',
  spend_limit: 'Spend limit',
}

/** A dithered bar: solid, a soft edge, then empty sky. */
export function bar(percent: number, width: number): string {
  const filled = Math.max(0, Math.min(width, (percent / 100) * width))
  const whole = Math.floor(filled)
  const rest = filled - whole
  const edge = whole < width ? (rest > 0.66 ? '▓' : rest > 0.33 ? '▒' : '') : ''

  return ('█'.repeat(whole) + edge).padEnd(width, '░')
}

const tintFor = (percent: number) => (percent >= 90 ? RED : percent >= 70 ? GOLD : BLUE)

/** 4 hours 5 minutes from now as "in 4h 5m". */
function resetsIn(resetsAt: string | undefined, now: number): string {
  if (resetsAt === undefined) {
    return ''
  }
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  const h = Math.floor(minutes / 60)
  const d = Math.floor(h / 24)

  return d >= 1 ? ` · resets in ${d}d ${h % 24}h` : ` · resets in ${h}h ${minutes % 60}m`
}

/**
 * The figures, with context measured as the app's Context panel measures it:
 * against the compaction window (an auto-compact setting such as 300k), not
 * the model's whole window, which can be a million.
 */
const toUsage = (from: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Usage => {
  const { tokens, breakdown } = from.context
  const window = breakdown?.rawMaxTokens ?? from.context.window
  const percent = tokens !== undefined ? (tokens / window) * 100 : (breakdown?.percentage ?? from.context.percent)
  const threshold = breakdown?.isAutoCompactEnabled ? breakdown.autoCompactThreshold : undefined

  return {
    context: {
      tokens,
      window,
      percent,
      untilCompact: threshold !== undefined && tokens !== undefined ? Math.max(0, threshold - tokens) : undefined,
    },
    limits: from.rateLimits.map((one: SessionRateLimit): Limit => ({ ...one })),
    usd: from.cost?.usd,
  }
}

/**
 * Reads the figures with the local breakdown, which names the compaction
 * window. `summary` estimates on this machine and sends no request.
 */
function readUsage($: EngineInterface) {
  return $.session.usage({ breakdown: 'summary' }).catch(() => $.session.usage())
}

/** 180900 as 180.9k. */
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k` : `${n}`)

async function refreshBranch($: EngineInterface) {
  const cwd = await $.session.cwd()
  const found = await $.process
    .run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 3000 })
    .catch(() => undefined)
  const name = found !== undefined && found.exitCode === 0 ? found.stdout.trim() : null

  if (name !== (await read($, branch))) {
    await update($, branch, () => name)
    await refreshStatus($)
  }
}

/** The status line: branch · model · context · the tightest limit. */
async function refreshStatus($: EngineInterface) {
  const [here, model, used] = await Promise.all([read($, branch), $.session.model(), read($, usage)])
  const parts = [`✦ ${model}`]

  if (here !== null) {
    parts.unshift(`⎇ ${here}`)
  }
  if (used?.context.percent !== undefined) {
    parts.push(`ctx ${Math.round(used.context.percent)}%`)
  }
  const tightest = [...(used?.limits ?? [])].sort((a, b) => b.percentUsed - a.percentUsed)[0]

  if (tightest !== undefined) {
    parts.push(`${tightest.kind === 'seven_day' ? 'week' : tightest.kind === 'five_hour' ? '5h' : 'limit'} ${Math.round(tightest.percentUsed)}%`)
  }
  $.ui.status(parts.join(' · '))
}

/** The usage, limits and cost as plain lines, for /night usage. */
function usageText(used: Usage | null, now: number): string {
  if (used === null) {
    return 'No usage reading yet: it arrives after the first reply.'
  }
  const lines = [
    used.context.percent === undefined
      ? `Context: ${used.context.window.toLocaleString()} token window, no reading yet`
      : `Context: ${Math.round(used.context.percent)}% used (${k(used.context.tokens ?? 0)} / ${k(used.context.window)})` +
        (used.context.untilCompact === undefined ? '' : `, ${k(used.context.untilCompact)} until auto-compact`),
  ]

  for (const limit of used.limits) {
    lines.push(`${LIMIT_NAMES[limit.kind] ?? limit.kind}: ${limit.percentUsed}% used${resetsIn(limit.resetsAt, now)}`)
  }
  if (used.limits.length === 0) {
    lines.push('Limits: none reported (they show on a Claude subscription)')
  }
  if (used.usd !== undefined) {
    lines.push(`Cost this session: $${used.usd.toFixed(2)}`)
  }

  return lines.join('\n')
}

/** Opens a folder in the system's file browser. */
async function openFolder($: EngineInterface, folder: string) {
  const isWindows = /^[A-Za-z]:[\\/]/.test(folder)
  // explorer.exe answers 1 even when it opened the folder, so its code is not read.
  const tries = isWindows ? [['explorer', folder.replace(/\//g, '\\')]] : [['open', folder], ['xdg-open', folder]]

  for (const argv of tries) {
    const ran = await $.process.run(argv, { timeoutMs: 5000 }).catch(() => undefined)

    if (isWindows || ran?.exitCode === 0) {
      return
    }
  }
  $.ui.toast(`Couldn't open ${folder}`)
}

/** The night watch's share of session.start: its commands and first readings. */
export async function startNight($: EngineInterface) {
  {
    await $.command.register({
      name: 'night',
      description: 'Open the night watch pane; "usage" prints usage and limits, "close" closes it',
      argumentHint: '[usage|close]',
    })
    await $.command.register({
      name: 'stars',
      description: 'Turn the terminal star band on or off; "quiet" stills every motion, "lively" brings it back',
      argumentHint: '[on|off|quiet|lively]',
    })
    await update($, usage, () => null)
    void readUsage($).then(async now => {
      await update($, usage, () => toUsage(now))
      await refreshStatus($)
    })
    void refreshBranch($)
  }
}

export function registerNight(on: On) {
  on('command.run', { command: 'night' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'usage') {
      return { text: usageText(await read($, usage), await $.clock.now()) }
    }
    if (arg === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'Night watch closed.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'Night watch opened.' : 'Night watch is open; this surface has no room to show it right now.' }
  })

  // /stars is answered in register.tsx, beside the sky it stills.

  on('session.measure', async ($, e, next) => {
    // The context's fill moved: read it again with the compaction window.
    const fresh = e.changed.includes('context') ? await readUsage($).catch(() => e) : e
    const now = toUsage({ ...fresh, rateLimits: e.rateLimits, cost: e.cost })
    await update($, usage, () => now)
    await followUsage($, now).catch(() => undefined)
    await refreshStatus($)
    await warnLimits($, now.limits).catch(() => undefined)

    return next(e)
  })

  // The log never holds up a prompt or a tool: a failed write is dropped.
  on('prompt.submit', async ($, e, next) => {
    await $.clock
      .now()
      .then(now => update($, turnStartedAt, () => now))
      .catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, turnStartedAt, () => null)
    chimeIfLong($, e.durationMs, e.agentId === undefined, e.isAborted)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const call: ToolCall = { id: e.tool_use_id, tool: e.tool, isDone: false }
    await update($, calls, list => [...list, call].slice(-100)).catch(() => undefined)
    const ran = await next(e)
    await update($, calls, list => list.map(one => (one.id === call.id ? { ...one, isDone: true } : one))).catch(
      () => undefined,
    )

    // A command may have switched branches.
    if (e.tool === 'Bash') {
      void refreshBranch($)
      celebrate($, e, ran)
    }

    return ran
  })

  // The footer's mode labels, kept for the pane; the footer draws as it would.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const now = [...e.props.modes]

    if (JSON.stringify(now) !== JSON.stringify(await read($, modes))) {
      await update($, modes, () => now)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [cwd, model, here, footer, used, list, startedAt, turnAt, now] = await Promise.all([
      $.session.cwd(),
      $.session.model(),
      read($, branch),
      read($, modes),
      read($, usage),
      read($, calls),
      $.session.usage().then(one => one.startedAt),
      read($, turnStartedAt),
      $.clock.now(),
    ])
    const width = Math.max(10, Math.min(30, e.props.bodyColumns - 16))
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 30)
    const lastDone = [...list].reverse().find(one => one.isDone)?.id

    const heading = (text: string) => (
      <Text color={BLUE} weight="bold">
        {text}
      </Text>
    )

    const meter = (label: string, percent: number | undefined, detail: string) => (
      <Box flexDirection="column">
        <Text>
          {label} <Text dimColor>{detail}</Text>
        </Text>
        <Text>
          <Text color={percent === undefined ? FAR : tintFor(percent)}>{bar(percent ?? 0, width)}</Text>{' '}
          {percent === undefined ? '—' : `${Math.round(percent)}%`}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {heading('✦ Session')}
          <Text wrap="truncate-end">
            <Text dimColor>folder </Text>
            {cwd}
          </Text>
          <Text>
            <Text dimColor>branch </Text>
            {here ?? 'not a git repository'}
          </Text>
          <Text>
            <Text dimColor>model </Text>
            {model}
          </Text>
          {footer.length > 0 && (
            <Text>
              <Text dimColor>mode </Text>
              {footer.join(' · ')}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('✦ Context')}
          {meter(
            'Window',
            used?.context.percent,
            used === null
              ? 'no reading yet'
              : used.context.tokens === undefined
                ? `${k(used.context.window)} tokens`
                : `${k(used.context.tokens)} / ${k(used.context.window)}`,
          )}
          {used?.context.untilCompact !== undefined && (
            <Text dimColor>{k(used.context.untilCompact)} until auto-compact</Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('✦ Usage and limits')}
          {(used?.limits ?? []).map(limit =>
            meter(LIMIT_NAMES[limit.kind] ?? limit.kind, limit.percentUsed, resetsIn(limit.resetsAt, now).replace(/^ · /, '')),
          )}
          {(used?.limits.length ?? 0) === 0 && <Text dimColor>No limits reported yet (they show on a Claude subscription, after a reply).</Text>}
          {used?.usd !== undefined && (
            <Text>
              <Text dimColor>cost this session </Text>${used.usd.toFixed(2)}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('✦ Star clock')}
          {e.surface === 'terminal' || e.surface === 'desktop' ? (
            h($.ui.resolve(e).Client, {
              key: 'clock',
              module: './night-clock.ts',
              props: { startedAt, turnStartedAt: turnAt },
              width: '100%',
              height: 2,
            })
          ) : (
            // A surface with no Client gets the figures, still.
            <Text dimColor>
              Session {span(now - startedAt)} · this turn {turnAt === null ? 'idle' : span(now - turnAt)}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          {heading('✦ Tool calls')}
          {list.length === 0 && <Text dimColor>None yet.</Text>}
          {list.slice(-room).map(call => (
            <Text>
              <Text color={!call.isDone ? WHITE : call.id === lastDone ? GOLD : FAR}>
                {!call.isDone ? '+' : call.id === lastDone ? '*' : '.'}
              </Text>{' '}
              <Text dimColor={call.isDone && call.id !== lastDone}>{call.tool}</Text>
            </Text>
          ))}
        </Box>

        <Box flexDirection="column">
          {heading('✦ Quick actions')}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button
              key="tests"
              label="Run tests"
              onPress={() => void $.prompt.submit({ text: "Run this project's tests and tell me what fails." })}
            />
            <Button key="folder" label="Open folder" onPress={() => openFolder($, cwd)} />
            <Button
              key="branch"
              label="New branch"
              onPress={() =>
                void $.prompt.submit({ text: 'Create a new git branch for what we work on next. Suggest a name and ask me before creating it.' })
              }
            />
            <Button key="compact" label="Compact" onPress={() => void $.session.compact()} />
            <Button key="copy" label="Copy path" onPress={() => void $.ui.copy({ text: cwd, surface: e.surface })} />
          </Box>
        </Box>
      </Box>
    )
  })
}
