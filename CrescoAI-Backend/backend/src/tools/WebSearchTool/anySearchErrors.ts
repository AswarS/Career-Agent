/** Provider response bodies may contain generated account credentials. */
export function anySearchHttpError(status: number, body: string): string {
  let quotaExhausted = false
  try {
    const value: unknown = JSON.parse(body)
    quotaExhausted =
      typeof value === 'object' && value !== null &&
      'error_code' in value && value.error_code === 'daily_free_quota_exhausted'
  } catch {
    // The body is untrusted and must never be included in the error.
  }
  return `AnySearch request failed (HTTP ${status})${quotaExhausted ? ': daily_free_quota_exhausted' : ''}`
}
