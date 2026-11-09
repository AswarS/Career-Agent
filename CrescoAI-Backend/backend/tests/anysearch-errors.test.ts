import { describe, expect, test } from 'bun:test'
import { anySearchHttpError } from '../src/tools/WebSearchTool/anySearchErrors.js'

describe('AnySearch error handling', () => {
  test('reports quota exhaustion without exposing generated credentials', () => {
    const body = JSON.stringify({ error_code: 'daily_free_quota_exhausted', message: 'username=example password=secret api_key=as_sk_secret' })
    expect(anySearchHttpError(402, body)).toBe('AnySearch request failed (HTTP 402): daily_free_quota_exhausted')
  })

  test('does not return untrusted error bodies or arbitrary error codes', () => {
    expect(anySearchHttpError(500, 'password=secret')).toBe('AnySearch request failed (HTTP 500)')
    expect(anySearchHttpError(403, JSON.stringify({ error_code: 'secret' }))).toBe('AnySearch request failed (HTTP 403)')
  })
})
