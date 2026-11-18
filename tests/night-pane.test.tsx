import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'dithered-stars',
  component: 'Pane',
  requestId: 'night-watch',
  props: {
    title: 'Night watch',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = {
  startedAt: 0,
  context: {
    tokens: 50000,
    window: 1000000,
    percent: 5,
    breakdown: { rawMaxTokens: 200000, percentage: 25, isAutoCompactEnabled: true, autoCompactThreshold: 160000 },
  },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2099-01-01T00:00:00Z' },
    { kind: 'seven_day', percentUsed: 91 },
  ],
  cost: { usd: 1.5 },
}

// Stands for the engine beneath the mod: the session's facts and a tool run.
function engine(on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/work/sky' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'stars\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: {} }))
  on('theme.set', () => ({ value: { isDrawn: true } }))
  on('tool.call', () => ({ result: {} }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.parse('2098-12-31T20:00:00Z') }))
}

test('the pane shows the session, usage and limits, and the tool log', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/sky', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text).join('\n')

    expect(texts).toContain('/work/sky')
    expect(texts).toContain('stars')
    expect(texts).toContain('claude-opus-5-5')
    expect(texts).toContain('50k / 200k')
    expect(texts).toContain('110k until auto-compact')
    expect(texts).toContain('5-hour limit')
    expect(texts).toContain('42%')
    expect(texts).toContain('Weekly limit')
    expect(texts).toContain('91%')
    expect(texts).toContain('$1.50')
    expect(texts).toContain('Bash')
    expect(await ui.find({ type: 'Button', key: 'tests' })).toBeDefined()
    await ui.unmount()
  }
})

test('/night usage prints usage and limits, /stars switches the band', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work/sky', surface: 'terminal', isInteractive: true })

  const printed = await $.command.run({ command: 'night', args: 'usage' })
  expect(printed.text).toContain('Context: 25%')
  expect(printed.text).toContain('Weekly limit: 91% used')

  const off = await $.command.run({ command: 'stars', args: 'off' })
  expect(off.text).toBe('Star band off.')

  const band = await $.ui.mount({
    plugin: 'dithered-stars',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 } },
  })
  expect(await band.find({ type: 'Client' })).toBeUndefined()
  await band.unmount()
})
