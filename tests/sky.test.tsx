import { expect, test } from 'claude-code/testing'

// Stands for the engine beneath the mod, and keeps each scene the theme names.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], keys: string[]) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', (_, e) => {
    const scene = e.backdrop && 'scene' in e.backdrop ? e.backdrop.scene : undefined

    if (typeof scene === 'string') {
      keys.push(scene)
    }

    return { value: { isDrawn: true } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/work/sky' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: {} }))
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 17, 3) }))
  on('clock.every', () => ({ value: undefined }))
}

test('the sky is picked once a session, and the backdrop draws that sky', async ($, on) => {
  const keys: string[] = []
  engine(on, keys)

  await $.session.start({ cwd: '/work/sky', surface: 'desktop', isInteractive: true })
  // A reload runs session.start again: the session's pick stands.
  await $.session.start({ cwd: '/work/sky', surface: 'desktop', isInteractive: true })

  expect(keys.length).toBe(2)
  expect(keys[1]).toBe(keys[0])

  const ui = await $.ui.mount({
    plugin: 'dithered-stars',
    component: 'Backdrop',
    surface: 'desktop',
    props: { scene: keys[0] },
  })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  await ui.unmount()
})
