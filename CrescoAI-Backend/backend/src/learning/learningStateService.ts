import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod/v4'

const artifactRefSchema = z.string().regex(/^artifact:\/\/[0-9a-f-]{36}$/i)
export const learningPlanStateSchema = z.strictObject({
  plan_id: z.string().trim().min(1),
  plan_ref: artifactRefSchema,
  plan_artifact_uid: z.string().uuid(),
  status: z.enum(['active', 'paused', 'completed', 'archived']),
  current_stage_id: z.string().trim().min(1).nullable(),
  current_stage_status: z.enum(['not_started', 'in_progress', 'ready_for_assessment', 'completed']).nullable(),
  completed_stage_ids: z.array(z.string().trim().min(1)),
  current_stage_package_ref: artifactRefSchema.nullable(),
  latest_assessment_ref: artifactRefSchema.nullable(),
  activated_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})
export const userLearningStateSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  version: z.number().int().nonnegative(),
  focus_plan_id: z.string().trim().min(1).nullable(),
  plans: z.array(learningPlanStateSchema),
}).superRefine((state, ctx) => {
  const ids = new Set<string>()
  for (const [index, plan] of state.plans.entries()) {
    if (ids.has(plan.plan_id)) ctx.addIssue({ code: 'custom', path: ['plans', index, 'plan_id'], message: 'Duplicate plan_id' })
    ids.add(plan.plan_id)
    if (new Set(plan.completed_stage_ids).size !== plan.completed_stage_ids.length) {
      ctx.addIssue({ code: 'custom', path: ['plans', index, 'completed_stage_ids'], message: 'Duplicate completed stage id' })
    }
    const refUid = plan.plan_ref.slice('artifact://'.length).toLowerCase()
    if (refUid !== plan.plan_artifact_uid.toLowerCase()) {
      ctx.addIssue({ code: 'custom', path: ['plans', index, 'plan_artifact_uid'], message: 'Plan artifact UID does not match plan_ref' })
    }
  }
  if (state.focus_plan_id !== null) {
    const focus = state.plans.find(plan => plan.plan_id === state.focus_plan_id)
    if (!focus || focus.status === 'archived') ctx.addIssue({ code: 'custom', path: ['focus_plan_id'], message: 'Invalid focus plan' })
  }
})

export type LearningPlanState = z.infer<typeof learningPlanStateSchema>
export type UserLearningState = z.infer<typeof userLearningStateSchema>
export const EMPTY_LEARNING_STATE: UserLearningState = {
  schema_version: '1.0', version: 0, focus_plan_id: null, plans: [],
}
const locks = new Map<string, Promise<void>>()

export class LearningStateError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'LearningStateError' }
}

export function getLearningStatePath(workspaceDir: string): string {
  return join(resolve(workspaceDir), '.state', 'learning_state.json')
}

async function withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolveLock => { release = resolveLock })
  const queued = previous.then(() => current)
  locks.set(key, queued)
  await previous
  try { return await operation() } finally {
    release()
    if (locks.get(key) === queued) locks.delete(key)
  }
}

async function readState(path: string): Promise<UserLearningState> {
  let source: string
  try { source = await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(EMPTY_LEARNING_STATE)
    throw new LearningStateError('STATE_READ_FAILED', 'Learning state could not be read')
  }
  try { return userLearningStateSchema.parse(JSON.parse(source)) } catch {
    throw new LearningStateError('INVALID_LEARNING_STATE', 'Learning state is invalid')
  }
}

async function atomicWrite(path: string, state: UserLearningState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await open(temp, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close(); handle = undefined
    await rename(temp, path)
    const dir = await open(dirname(path), 'r')
    try { await dir.sync() } finally { await dir.close() }
  } catch (error) {
    if (handle) await handle.close().catch(() => {})
    await unlink(temp).catch(() => {})
    throw new LearningStateError('STATE_WRITE_FAILED', 'Learning state could not be saved')
  }
}

export class LearningStateService {
  async getUserState(workspaceDir: string): Promise<UserLearningState> {
    return readState(getLearningStatePath(workspaceDir))
  }
  async getPlanState(workspaceDir: string, planId: string): Promise<LearningPlanState | null> {
    return (await this.getUserState(workspaceDir)).plans.find(plan => plan.plan_id === planId) ?? null
  }
  async findPlanByArtifact(workspaceDir: string, artifactUid: string): Promise<LearningPlanState | null> {
    return (await this.getUserState(workspaceDir)).plans.find(plan => plan.plan_artifact_uid.toLowerCase() === artifactUid.toLowerCase()) ?? null
  }
  async mutate(workspaceDir: string, mutateState: (state: UserLearningState) => UserLearningState): Promise<UserLearningState> {
    return (await this.transact(workspaceDir, state => ({ state: mutateState(state), value: undefined, changed: true }))).state
  }
  async transact<T>(workspaceDir: string, operation: (state: UserLearningState) => {
    state: UserLearningState; value: T; changed: boolean
  }): Promise<{ state: UserLearningState; value: T }> {
    const path = getLearningStatePath(workspaceDir)
    return withLock(path, async () => {
      const current = await readState(path)
      const outcome = operation(structuredClone(current))
      if (!outcome.changed) return { state: current, value: outcome.value }
      let next: UserLearningState
      try { next = userLearningStateSchema.parse({ ...outcome.state, version: current.version + 1 }) } catch (error) {
        if (error instanceof LearningStateError) throw error
        throw new LearningStateError('INVALID_LEARNING_STATE', 'Learning state update violates an invariant')
      }
      await atomicWrite(path, next)
      return { state: next, value: outcome.value }
    })
  }
  async addPlanState(workspaceDir: string, planState: LearningPlanState): Promise<UserLearningState> {
    return this.mutate(workspaceDir, state => ({ ...state, plans: [...state.plans, planState] }))
  }
  async updatePlanState(workspaceDir: string, planId: string, update: (plan: LearningPlanState) => LearningPlanState): Promise<UserLearningState> {
    return this.mutate(workspaceDir, state => {
      const index = state.plans.findIndex(plan => plan.plan_id === planId)
      if (index < 0) throw new LearningStateError('PLAN_NOT_FOUND', 'Learning plan was not found')
      const plans = [...state.plans]; plans[index] = update(plans[index]!)
      return { ...state, plans }
    })
  }
  async setFocusPlan(workspaceDir: string, planId: string | null): Promise<UserLearningState> {
    return this.mutate(workspaceDir, state => ({ ...state, focus_plan_id: planId }))
  }
}

export const learningStateService = new LearningStateService()
