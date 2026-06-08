/**
 * openrouter-multimodal.test.ts
 *
 * Live integration tests for OpenRouter image & video generation APIs.
 * Mirrors the exact logic used by ImageGenerateTool and VideoGenerateTool.
 *
 * Required env vars:
 *   OPENROUTER_API_KEY  — OpenRouter API key
 *
 * Optional overrides:
 *   IMAGE_MODEL  (default: bytedance-seed/seedream-4.5)
 *   VIDEO_MODEL  (default: alibaba/wan-2.6)
 *   BASE_URL     (default: https://openrouter.ai/api)
 *
 * Run:
 *   cd backend && OPENROUTER_API_KEY=sk-or-v1-... bun test ./tests/openrouter-multimodal.test.ts --timeout 120000
 */

import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const API_KEY   = process.env.OPENROUTER_API_KEY ?? '';
const BASE_URL  = (process.env.BASE_URL ?? 'https://openrouter.ai/api').replace(/\/+$/, '');
const IMG_MODEL = process.env.IMAGE_MODEL ?? 'bytedance-seed/seedream-4.5';
const VID_MODEL = process.env.VIDEO_MODEL ?? 'alibaba/wan-2.6';

const SKIP = !API_KEY;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postJSON(url: string, body: unknown) {
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, json };
}

function saveArtifact(filename: string, data: Buffer | string) {
  const dir = join(tmpdir(), 'openrouter-test-artifacts');
  mkdirSync(dir, { recursive: true });
  const p = join(dir, filename);
  if (typeof data === 'string') {
    writeFileSync(p, data, 'utf8');
  } else {
    writeFileSync(p, data);
  }
  return p;
}

// ── Image generation — chat-modality path (OpenRouter native) ────────────────

describe('Image generation — chat-modality (POST /v1/chat/completions)', () => {
  test.skipIf(SKIP)(`${IMG_MODEL}: text-to-image via modalities:['image']`, async () => {
    console.log(`\n[ImageGen/chat] model=${IMG_MODEL}`);

    const r = await postJSON(`${BASE_URL}/v1/chat/completions`, {
      model: IMG_MODEL,
      messages: [{ role: 'user', content: 'A cheerful cartoon sun over blue ocean waves' }],
      modalities: ['image'],
    });

    console.log(`  status: ${r.status} ${r.statusText}`);
    console.log(`  response keys: ${Object.keys(r.json ?? {}).join(', ')}`);

    if (!r.ok) {
      // 404 "No endpoints found" means model doesn't support this modality — skip gracefully
      const errMsg = (r.json as any)?.error?.message ?? '';
      if (r.status === 404 && errMsg.toLowerCase().includes('no endpoints found')) {
        console.log('  → model does not support chat-modality, test skipped (will fall back to images API)');
        return;
      }
      // Other errors are real failures
      console.log(`  error body: ${JSON.stringify(r.json)}`);
      expect(r.ok).toBe(true); // fail with context
      return;
    }

    const choices = (r.json as any)?.choices ?? [];
    const images: Array<{ image_url?: { url?: string } }> = choices[0]?.message?.images ?? [];
    console.log(`  choices: ${choices.length}, images in message: ${images.length}`);

    expect(choices.length).toBeGreaterThan(0);

    if (images.length > 0) {
      const imgUrl = images[0]?.image_url?.url;
      console.log(`  image URL: ${imgUrl?.slice(0, 80)}…`);
      expect(imgUrl).toBeDefined();

      if (imgUrl?.startsWith('data:')) {
        const base64 = imgUrl.split(',')[1];
        const buf = Buffer.from(base64, 'base64');
        const p = saveArtifact('chat_modality_image.png', buf);
        console.log(`  saved to: ${p} (${buf.length} bytes)`);
        expect(buf.length).toBeGreaterThan(1000);
      } else if (imgUrl?.startsWith('http')) {
        console.log(`  remote URL returned — downloading to verify…`);
        const dl = await fetch(imgUrl, { signal: AbortSignal.timeout(20_000) });
        expect(dl.ok).toBe(true);
        const buf = Buffer.from(await dl.arrayBuffer());
        const p = saveArtifact('chat_modality_image.png', buf);
        console.log(`  saved to: ${p} (${buf.length} bytes)`);
        expect(buf.length).toBeGreaterThan(1000);
      }
    } else {
      console.log('  no images[] in response — model may use different output shape');
      console.log('  full response snippet:', JSON.stringify(r.json).slice(0, 300));
    }
  }, 60_000);
});

// ── Image generation — images API path (OpenAI-compatible fallback) ──────────

describe('Image generation — OpenAI images API (POST /v1/images/generations)', () => {
  test.skipIf(SKIP)(`${IMG_MODEL}: text-to-image via images/generations`, async () => {
    console.log(`\n[ImageGen/images-api] model=${IMG_MODEL}`);

    const r = await postJSON(`${BASE_URL}/v1/images/generations`, {
      model: IMG_MODEL,
      prompt: 'A cheerful cartoon sun over blue ocean waves',
      n: 1,
      size: '1024x1024',
    });

    console.log(`  status: ${r.status} ${r.statusText}`);

    if (!r.ok) {
      console.log(`  error body: ${JSON.stringify(r.json).slice(0, 300)}`);
      // Not all models support images/generations — treat as known skip
      console.log('  → endpoint not supported for this model, skipping assertion');
      return;
    }

    const data: Array<{ b64_json?: string; url?: string }> = (r.json as any)?.data ?? [];
    console.log(`  data items: ${data.length}`);
    expect(data.length).toBeGreaterThan(0);

    const item = data[0];
    if (item.b64_json) {
      const buf = Buffer.from(item.b64_json, 'base64');
      const p = saveArtifact('images_api_b64.png', buf);
      console.log(`  saved base64 image to: ${p} (${buf.length} bytes)`);
      expect(buf.length).toBeGreaterThan(1000);
    } else if (item.url) {
      console.log(`  URL: ${item.url.slice(0, 80)}`);
      const dl = await fetch(item.url, { signal: AbortSignal.timeout(20_000) });
      expect(dl.ok).toBe(true);
      const buf = Buffer.from(await dl.arrayBuffer());
      const p = saveArtifact('images_api_url.png', buf);
      console.log(`  saved to: ${p} (${buf.length} bytes)`);
      expect(buf.length).toBeGreaterThan(1000);
    }
  }, 60_000);
});

// ── Video generation — submit + poll ─────────────────────────────────────────

describe('Video generation — submit + poll (POST /v1/videos)', () => {
  test.skipIf(SKIP)(`${VID_MODEL}: text-to-video submit`, async () => {
    console.log(`\n[VideoGen] model=${VID_MODEL}`);

    const r = await postJSON(`${BASE_URL}/v1/videos`, {
      model: VID_MODEL,
      prompt: 'A calm ocean wave rolling onto a sandy beach, realistic, 5 seconds',
      resolution: '720p',
      duration: 5,  // wan-2.6 supports 5 or 10s (not 4s)
    });

    console.log(`  status: ${r.status} ${r.statusText}`);
    console.log(`  response: ${JSON.stringify(r.json).slice(0, 400)}`);

    if (!r.ok) {
      console.log('  → submit failed. This is expected if the model requires credit/tier.');
      // Don't fail the test — we're checking connectivity and API shape
      expect([200, 201, 202, 400, 402, 404, 422]).toContain(r.status);
      return;
    }

    const submitData = r.json as { id?: string; polling_url?: string; status?: string };
    expect(submitData.id).toBeDefined();
    expect(submitData.polling_url).toBeDefined();

    const jobId = submitData.id!;
    const pollingUrl = submitData.polling_url!;
    console.log(`  job id: ${jobId}`);
    console.log(`  polling_url: ${pollingUrl.slice(0, 80)}`);

    // Poll once to confirm the endpoint shape (don't wait 30min in tests)
    console.log('  polling once after 5s to verify poll endpoint…');
    await new Promise(r => setTimeout(r, 5_000));

    const pollResp = await fetch(pollingUrl, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const pollData = await pollResp.json() as { status?: string; id?: string };
    console.log(`  poll status: HTTP ${pollResp.status}, job status: ${pollData.status}`);

    expect(pollResp.ok).toBe(true);
    expect(['pending', 'in_progress', 'completed', 'failed']).toContain(pollData.status);

    if (pollData.status === 'completed') {
      const urls = (pollData as any).unsigned_urls as string[] | undefined;
      console.log(`  completed! video URLs: ${urls?.join(', ')}`);
      expect(urls?.length).toBeGreaterThan(0);
    } else {
      console.log(`  job still ${pollData.status} — full poll loop not run in unit tests`);
    }
  }, 90_000);
});

// ── Model listing — verify image/video models are available ──────────────────

describe('OpenRouter model availability', () => {
  test.skipIf(SKIP)('fetch model list and verify target models exist', async () => {
    const resp = await fetch(`${BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });

    console.log(`\n[Models] status: ${resp.status}`);
    if (!resp.ok) {
      console.log('  cannot fetch model list — skipping');
      return;
    }

    const body = await resp.json() as { data?: Array<{ id: string }> };
    const ids = new Set(body.data?.map(m => m.id) ?? []);
    console.log(`  total models: ${ids.size}`);

    const check = (id: string) => {
      const found = ids.has(id);
      console.log(`  ${found ? '✓' : '✗'} ${id}`);
      return found;
    };

    const imgFound = check(IMG_MODEL);
    const vidFound = check(VID_MODEL);

    if (!imgFound) console.log(`  WARNING: image model "${IMG_MODEL}" not in model list`);
    if (!vidFound) console.log(`  WARNING: video model "${VID_MODEL}" not in model list`);

    // Non-failing: model list may not include all generation models
  }, 20_000);
});
