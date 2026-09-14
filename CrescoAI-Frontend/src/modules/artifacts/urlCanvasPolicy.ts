export interface UrlCanvasPolicyOptions {
  currentOrigin: string;
  trustedOrigins: string[];
}

/**
 * Effective trusted origins for url-mode artifact iframes: the configured
 * allowlist plus, when running against an upstream backend, that backend's
 * origin. Generated app URLs are absolutized against apiBaseUrl, so without
 * this the artifact pane would reject every backend-hosted app in dev.
 */
export function resolveTrustedCanvasOrigins(options: {
  configured: string[];
  apiBaseUrl?: string | null;
  upstreamConfigured?: boolean;
}): string[] {
  const origins = [...options.configured];
  if (options.upstreamConfigured && options.apiBaseUrl) {
    try {
      const origin = new URL(options.apiBaseUrl).origin;
      if (!origins.includes(origin)) {
        origins.push(origin);
      }
    } catch {
      // Invalid base URL — keep the configured list only.
    }
  }
  return origins;
}

export function resolveTrustedCanvasUrl(
  rawUrl: string,
  options: UrlCanvasPolicyOptions,
): string | null {
  const trimmedUrl = rawUrl.trim();

  if (!trimmedUrl) {
    return null;
  }

  try {
    const nextUrl = new URL(trimmedUrl, options.currentOrigin);

    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      return null;
    }

    const allowedOrigins = new Set([options.currentOrigin, ...options.trustedOrigins]);

    if (!allowedOrigins.has(nextUrl.origin)) {
      return null;
    }

    return nextUrl.toString();
  } catch {
    return null;
  }
}
