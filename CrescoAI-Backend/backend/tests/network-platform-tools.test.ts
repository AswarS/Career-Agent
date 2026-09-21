import { describe, expect, test } from 'bun:test'
import type { Tool } from '../src/Tool.js'
import { filterNetworkPlatformTools } from '../src/server/queryEngineFactory.js'

const tool = (name: string) => ({ name }) as Tool

describe('Network platform tool filtering', () => {
  test('hides Bash on Windows while retaining PowerShell and file tools', () => {
    expect(
      filterNetworkPlatformTools(
        [tool('Bash'), tool('PowerShell'), tool('Read')],
        'windows',
      ).map((entry) => entry.name),
    ).toEqual(['PowerShell', 'Read'])
  })

  test('retains Bash on POSIX platforms', () => {
    expect(
      filterNetworkPlatformTools([tool('Bash'), tool('Read')], 'linux').map(
        (entry) => entry.name,
      ),
    ).toEqual(['Bash', 'Read'])
  })
})
