import { expect, test } from 'claude-code/testing'

import { buildScene, CHOSEN_EXTRAS, pickPair, skyAt } from '../hooks/scene.js'
import { activeShower, moonPhase, nextShower, season } from '../hooks/sky-time.js'

// 2024-08-19 was a full moon, 2024-10-02 a new one; the Perseids peak 12 August.
const FULL = Date.UTC(2024, 7, 19, 18)
const NEW = Date.UTC(2024, 9, 2, 18)

// Stands for the engine beneath the mod.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], toasts: string[], at = FULL) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', () => ({ value: { isDrawn: true } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/work/sky' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('command.register', () => ({ value: {} }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('clock.now', () => ({ value: at }))
  on('clock.every', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
}

test('the sky follows the calendar: moon, showers and seasons', async () => {
  expect(moonPhase(FULL).name).toBe('full moon')
  expect(moonPhase(NEW).name).toBe('new moon')
  expect(activeShower(Date.UTC(2024, 7, 12, 12))?.name).toBe('Perseids')
  expect(activeShower(Date.UTC(2024, 7, 1, 12))).toBe(null)
  expect(nextShower(Date.UTC(2024, 11, 1, 12))?.name).toBe('Geminids')
  expect(season(Date.UTC(2024, 6, 1)).hasPleiades).toBe(false)

  // A summer pick comes from the summer sky: no Orion.
  for (let i = 0; i < 20; i++) {
    expect(pickPair(Math.random, Date.UTC(2024, 6, 1)).includes('orion')).toBe(false)
  }

  const full = buildScene(CHOSEN_EXTRAS, { pair: ['cygnus', 'lyra'], sky: skyAt(FULL) })
  const quiet = buildScene(CHOSEN_EXTRAS, { pair: ['cygnus', 'lyra'], sky: skyAt(FULL), isQuiet: true })
  const shower = buildScene(CHOSEN_EXTRAS, { pair: ['cygnus', 'lyra'], sky: { ...skyAt(FULL), shower: 'Perseids' } })

  // Light mode repaints the sky as day; quiet stills every motion.
  expect(full.includes('@media (prefers-color-scheme:light)')).toBe(true)
  expect(full.includes('*{animation:none!important}.mq{display:none}@media (prefers-reduced')).toBe(false)
  expect(quiet.includes('*{animation:none!important}.mq{display:none}@media (prefers-reduced')).toBe(true)
  // A shower rains more meteors.
  expect((shower.match(/class="ms\d+"/g) ?? []).length).toBe(26)
  expect((full.match(/class="ms\d+"/g) ?? []).length).toBe(10)
  // Summer: no Pleiades.
  expect(full.includes('data-sky="pleiades"')).toBe(false)
  expect(full.length < 131072).toBe(true)
})

test('/sky tells tonight, and a limit warns once at 80% and again at 95%', async ($, on) => {
  const toasts: string[] = []
  engine(on, toasts)

  await $.session.start({ cwd: '/work/sky', surface: 'desktop', isInteractive: true })

  const told = await $.command.run({ command: 'sky', args: '' })
  expect(told.text?.includes('Moon: 🌕 full moon')).toBe(true)

  const measure = (percentUsed: number) =>
    $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'seven_day', percentUsed }], changed: ['rateLimits'] })

  await measure(82)
  await measure(84)
  await measure(96)
  const warnings = toasts.filter(one => one.includes('weekly limit'))
  expect(warnings.length).toBe(2)
})

test('the thinking line wears a star', async ($, on) => {
  on('clock.now', () => ({ value: FULL }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as { word: string; suffix: string }

    return <Text>{`${props.word}${props.suffix}`}</Text>
  })

  const ui = await $.ui.mount({
    plugin: 'dithered-stars',
    component: 'Spinner',
    surface: 'terminal',
    props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' },
  })
  const text = (await ui.find({ type: 'Text' }))?.text ?? ''

  expect(text.endsWith('… ✦')).toBe(true)
  expect(text.startsWith('Baking')).toBe(false)
  await ui.unmount()
})
