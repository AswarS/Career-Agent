import { runtimeConfig, type RuntimeConfig } from '../config/runtime';

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function isAbsoluteUrl(value: string) {
  return URL_SCHEME_PATTERN.test(value);
}

export function resolveUpstreamAssetUrl(
  value: string | null | undefined,
  config: RuntimeConfig = runtimeConfig,
) {
  const nextValue = value?.trim();

  if (!nextValue || nextValue.startsWith('//')) {
    return null;
  }

  if (isAbsoluteUrl(nextValue)) {
    return nextValue;
  }

  if (!config.upstreamConfigured || !config.apiBaseUrl) {
    return nextValue;
  }

  try {
    return new URL(nextValue, resolveAssetBaseUrl(config.apiBaseUrl)).toString();
  } catch {
    return nextValue;
  }
}

/**
 * `new URL(value, base)` rejects a root-relative base such as "/", so anchor the
 * base to the document origin first. Without this, a same-origin upstream (dev
 * proxy) would leave generated-app URLs relative to the current SPA route.
 */
function resolveAssetBaseUrl(baseUrl: string) {
  if (typeof window === 'undefined') {
    return baseUrl;
  }

  try {
    return new URL(baseUrl, window.location.origin).toString();
  } catch {
    return baseUrl;
  }
}
