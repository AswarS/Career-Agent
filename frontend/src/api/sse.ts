/**
 * POST-based SSE stream parser.
 *
 * The backend requires POST to initiate streaming (not GET),
 * so we use fetch + ReadableStream instead of EventSource.
 */
export async function sendMessageSSE(
  sessionId: string,
  content: string,
  onEvent: (event: string, data: unknown) => void,
  onError: (err: Error) => void,
  onDone: () => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/v1/sessions/${sessionId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ content }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') onError(e as Error)
    return
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    onError(new Error(body.error || `HTTP ${response.status}`))
    return
  }

  const reader = response.body?.getReader()
  if (!reader) { onError(new Error('No response body')); return }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Parse complete SSE events (delimited by \n\n)
      const parts = buffer.split('\n\n')
      // Last part might be incomplete, keep in buffer
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim()) continue
        let eventType = 'message'
        let dataStr = ''
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) dataStr = line.slice(6)
          else if (line.startsWith('data:')) dataStr = line.slice(5).trimStart()
        }
        if (!dataStr) continue
        try {
          const data = JSON.parse(dataStr)
          onEvent(eventType, data)
          if (eventType === 'done') { onDone(); return }
        } catch {
          // skip malformed JSON
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') onError(e as Error)
  } finally {
    reader.releaseLock()
  }
}
