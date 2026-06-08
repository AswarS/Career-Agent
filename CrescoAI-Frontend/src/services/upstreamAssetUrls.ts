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
    return new URL(nextValue, config.apiBaseUrl).toString();
  } catch {
    return nextValue;
  }
}
