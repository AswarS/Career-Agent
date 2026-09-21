import { describe, expect, test } from 'bun:test'
import { selectRipgrepSource } from '../src/utils/ripgrep.js'

describe('ripgrep executable selection', () => {
  test('uses the bundled executable when it exists', () => {
    expect(
      selectRipgrepSource({
        preferSystem: false,
        systemAvailable: true,
        bundledAvailable: true,
      }),
    ).toBe('builtin')
  })

  test('falls back to system rg when the bundled executable is missing', () => {
    expect(
      selectRipgrepSource({
        preferSystem: false,
        systemAvailable: true,
        bundledAvailable: false,
      }),
    ).toBe('system')
  })

  test('reports unavailable when neither executable exists', () => {
    expect(
      selectRipgrepSource({
        preferSystem: false,
        systemAvailable: false,
        bundledAvailable: false,
      }),
    ).toBe('unavailable')
  })
})
