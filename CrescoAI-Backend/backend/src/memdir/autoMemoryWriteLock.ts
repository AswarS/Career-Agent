import { resolve } from 'path'
import * as lockfile from '../utils/lockfile.js'
import {
  isNativeAutoMemoryTopicPath,
  rebuildNativeAutoMemoryIndex,
} from './autoMemoryIndex.js'
import { getAutoMemPath } from './paths.js'

const directoryQueues = new Map<string, Promise<void>>()

const LOCK_OPTIONS = {
  realpath: false,
  retries: {
    retries: 30,
    minTimeout: 5,
    maxTimeout: 100,
  },
}

export async function withAutoMemoryDirectoryLock<T>(
  memoryDir: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const queueKey = resolve(memoryDir).toLowerCase()
  const previous = directoryQueues.get(queueKey) ?? Promise.resolve()
  let releaseQueue!: () => void
  const gate = new Promise<void>(resolveGate => {
    releaseQueue = resolveGate
  })
  const current = previous.catch(() => {}).then(() => gate)
  directoryQueues.set(queueKey, current)

  await previous.catch(() => {})
  let releaseFileLock: (() => Promise<void>) | undefined
  try {
    releaseFileLock = await lockfile.lock(memoryDir, LOCK_OPTIONS)
    return await operation()
  } finally {
    try {
      if (releaseFileLock) await releaseFileLock()
    } finally {
      releaseQueue()
      if (directoryQueues.get(queueKey) === current) {
        directoryQueues.delete(queueKey)
      }
    }
  }
}

/**
 * Commit a native-loop topic mutation and synchronously rebuild its managed
 * MEMORY.md block while both operations are protected by one directory lock.
 */
export async function commitNativeAutoMemoryTopicWrite<T>(
  filePath: string,
  operation: () => T,
): Promise<T> {
  if (!isNativeAutoMemoryTopicPath(filePath)) {
    return operation()
  }

  const memoryDir = getAutoMemPath()
  return withAutoMemoryDirectoryLock(memoryDir, () => {
    const result = operation()
    rebuildNativeAutoMemoryIndex(memoryDir)
    return result
  })
}
