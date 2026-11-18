import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'dithered-stars',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the terminal gets a row of stars that twinkles', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.resize({ columns: 80, rows: 1, in: 'stars' })

  const first = (await ui.find({ type: 'Text', in: 'stars' }))?.text ?? ''
  expect(first.length).toBe(80)
  expect(/[.'+*]/.test(first)).toBe(true)

  // A few frames on, some star has moved to another glyph.
  await ui.advance(450 * 4)
  const later = (await ui.find({ type: 'Text', in: 'stars' }))?.text ?? ''
  expect(later.length).toBe(80)
  expect(later).not.toBe(first)

  await ui.unmount()
})

test('the apps draw no row: they have the whole scene', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
