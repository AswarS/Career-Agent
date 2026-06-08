import type { MessageFileAttachment } from '../types/entities';
import { runtimeConfig, type RuntimeConfig } from '../config/runtime';
import { resolveUpstreamAssetUrl } from './upstreamAssetUrls';

const CONTENT_DISPOSITION_FILENAME_STAR = /filename\*\s*=\s*([^;]+)/i;
const CONTENT_DISPOSITION_FILENAME = /filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]+)/i;
const UTF8_TEXT_MIME_FRAGMENT_PATTERN = /(?:^text\/|\/json$|\+json$|\/xml$|\+xml$|\/javascript$|\/ecmascript$)/i;

function stripOuterQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1');
  }

  return value;
}

function stripMimeParameters(value: string | null | undefined) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export function parseContentDispositionFilename(value: string | null) {
  if (!value) {
    return null;
  }

  const extendedMatch = value.match(CONTENT_DISPOSITION_FILENAME_STAR)?.[1]?.trim();

  if (extendedMatch) {
    const normalized = stripOuterQuotes(extendedMatch);
    const segments = normalized.split("'");
    const encodedValue = segments.length >= 3 ? segments.slice(2).join("'") : normalized;

    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return encodedValue;
    }
  }

  const basicMatch = value.match(CONTENT_DISPOSITION_FILENAME)?.[1]?.trim();
  return basicMatch ? stripOuterQuotes(basicMatch) : null;
}

export function isUtf8TextLikeMimeType(value: string | null | undefined) {
  const normalized = stripMimeParameters(value);
  return Boolean(normalized) && UTF8_TEXT_MIME_FRAGMENT_PATTERN.test(normalized);
}

export function createDownloadBlob(
  bytes: ArrayBuffer,
  mimeType: string | null | undefined,
) {
  const normalizedMimeType = stripMimeParameters(mimeType) || 'application/octet-stream';

  if (isUtf8TextLikeMimeType(normalizedMimeType)) {
    const decodedText = new TextDecoder('utf-8').decode(bytes);
    const textWithBom = decodedText.startsWith('\uFEFF') ? decodedText : `\uFEFF${decodedText}`;
    return new Blob([textWithBom], {
      type: `${normalizedMimeType};charset=utf-8`,
    });
  }

  return new Blob([bytes], {
    type: normalizedMimeType,
  });
}

function resolveFetchCredentials(config: RuntimeConfig) {
  if (!config.upstreamConfigured) {
    return 'same-origin';
  }

  return config.upstreamWithCredentials ? 'include' : 'omit';
}

export function resolveDownloadUrl(
  value: string | null | undefined,
  config: RuntimeConfig = runtimeConfig,
) {
  const normalizedValue = value?.trim();

  if (!normalizedValue || normalizedValue.startsWith('//')) {
    return null;
  }

  return resolveUpstreamAssetUrl(normalizedValue, config);
}

export function shouldUseControlledDownload(file: MessageFileAttachment) {
  return isUtf8TextLikeMimeType(file.mimeType);
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}

function triggerNativeDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadMessageFile(
  file: MessageFileAttachment,
  config: RuntimeConfig = runtimeConfig,
) {
  const resolvedUrl = resolveDownloadUrl(file.url, config);

  if (!resolvedUrl) {
    throw new Error(`Attachment "${file.name}" does not have a downloadable URL.`);
  }

  if (!shouldUseControlledDownload(file)) {
    triggerNativeDownload(resolvedUrl, file.name || 'download');
    return;
  }

  const response = await fetch(resolvedUrl, {
    credentials: resolveFetchCredentials(config),
  });

  if (!response.ok) {
    throw new Error(`Failed to download attachment "${file.name}" (${response.status} ${response.statusText}).`);
  }

  const buffer = await response.arrayBuffer();
  const responseMimeType = response.headers.get('content-type');
  const blob = createDownloadBlob(buffer, responseMimeType ?? file.mimeType);
  const responseFileName = parseContentDispositionFilename(response.headers.get('content-disposition'));
  triggerBrowserDownload(blob, responseFileName || file.name || 'download');
}
