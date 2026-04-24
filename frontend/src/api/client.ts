import type {
  CreateSessionRequest, CreateSessionResponse,
  SessionListResponse, SessionDetailResponse,
} from '../types'

const BASE = '/v1'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  health: () => request<{ status: string; sessions: number; uptime: number }>('/health'),

  createSession: (body: CreateSessionRequest) =>
    request<CreateSessionResponse>('/sessions', { method: 'POST', body: JSON.stringify(body) }),

  listSessions: (userId?: string) =>
    request<SessionListResponse>(userId ? `/sessions?userId=${encodeURIComponent(userId)}` : '/sessions'),

  getSession: (id: string) => request<SessionDetailResponse>(`/sessions/${id}`),

  getSessionMessages: (id: string) =>
    request<{ sessionId: string; messages: unknown[] }>(`/sessions/${id}/messages`),

  deleteSession: (id: string) =>
    request<{ destroyed: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
}
