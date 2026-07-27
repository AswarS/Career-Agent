import { resolve } from 'node:path'

const rootQueues = new Map<string, Promise<void>>()
const deletingSessions = new Set<string>()

export async function withConversationMemoryRootLock<T>(
  rootDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = rootKey(rootDir)
  const previous = rootQueues.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((done) => {
    release = done
  })
  const queued = previous.catch(() => {}).then(() => gate)
  rootQueues.set(key, queued)
  await previous.catch(() => {})
  try {
    return await operation()
  } finally {
    release()
    if (rootQueues.get(key) === queued) rootQueues.delete(key)
  }
}

export function markConversationMemorySessionDeleting(
  rootDir: string,
  conversationId: string,
): void {
  deletingSessions.add(sessionKey(rootDir, conversationId))
}

export function isConversationMemorySessionDeleting(
  rootDir: string,
  conversationId: string,
): boolean {
  return deletingSessions.has(sessionKey(rootDir, conversationId))
}

export function unmarkConversationMemorySessionDeleting(
  rootDir: string,
  conversationId: string,
): void {
  deletingSessions.delete(sessionKey(rootDir, conversationId))
}

function rootKey(rootDir: string): string {
  return resolve(rootDir).toLowerCase()
}

function sessionKey(rootDir: string, conversationId: string): string {
  return `${rootKey(rootDir)}\0${conversationId}`
}
