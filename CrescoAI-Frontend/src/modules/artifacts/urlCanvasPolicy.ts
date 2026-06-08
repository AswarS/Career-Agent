export interface UrlCanvasPolicyOptions {
  currentOrigin: string;
  trustedOrigins: string[];
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
