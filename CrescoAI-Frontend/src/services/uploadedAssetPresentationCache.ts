import type { UploadedConversationFile } from '../types/entities';

interface UploadedAssetPresentation {
  name: string;
}

const SESSION_STORAGE_KEY = 'career-agent:uploaded-asset-presentations';
const byAssetId = new Map<string, UploadedAssetPresentation>();
const byUrl = new Map<string, UploadedAssetPresentation>();
const byStoragePath = new Map<string, UploadedAssetPresentation>();
const byStoredFileName = new Map<string, UploadedAssetPresentation>();
let restoredFromSessionStorage = false;

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function serializeCache() {
  return JSON.stringify({
    byAssetId: [...byAssetId.entries()],
    byUrl: [...byUrl.entries()],
    byStoragePath: [...byStoragePath.entries()],
    byStoredFileName: [...byStoredFileName.entries()],
  });
}

function hydrateMap(
  map: Map<string, UploadedAssetPresentation>,
  entries: unknown,
) {
  if (!Array.isArray(entries)) {
    return;
  }

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      continue;
    }

    const [key, value] = entry;

    if (typeof key !== 'string' || !key.trim()) {
      continue;
    }

    if (!value || typeof value !== 'object' || typeof (value as UploadedAssetPresentation).name !== 'string') {
      continue;
    }

    map.set(key, {
      name: (value as UploadedAssetPresentation).name,
    });
  }
}

function restoreFromSessionStorage() {
  if (restoredFromSessionStorage) {
    return;
  }

  restoredFromSessionStorage = true;
  const sessionStorage = getSessionStorage();
  const rawValue = sessionStorage?.getItem(SESSION_STORAGE_KEY);

  if (!rawValue) {
    return;
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    hydrateMap(byAssetId, parsed.byAssetId);
    hydrateMap(byUrl, parsed.byUrl);
    hydrateMap(byStoragePath, parsed.byStoragePath);
    hydrateMap(byStoredFileName, parsed.byStoredFileName);
  } catch {
    sessionStorage?.removeItem(SESSION_STORAGE_KEY);
  }
}

function persistToSessionStorage() {
  const sessionStorage = getSessionStorage();

  if (!sessionStorage) {
    return;
  }

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, serializeCache());
  } catch {
    // Ignore storage quota/privacy mode failures and keep in-memory behavior.
  }
}

function rememberInMap(
  map: Map<string, UploadedAssetPresentation>,
  key: string | null | undefined,
  value: UploadedAssetPresentation,
) {
  const normalizedKey = key?.trim();

  if (!normalizedKey) {
    return;
  }

  map.set(normalizedKey, value);
}

export function rememberUploadedAssetPresentation(
  file: UploadedConversationFile,
  originalName: string,
) {
  restoreFromSessionStorage();
  const normalizedName = originalName.trim();

  if (!normalizedName) {
    return;
  }

  const value = { name: normalizedName };

  rememberInMap(byAssetId, file.assetId, value);
  rememberInMap(byUrl, file.url, value);
  rememberInMap(byStoragePath, file.storagePath, value);
  rememberInMap(byStoredFileName, file.storedFileName, value);
  persistToSessionStorage();
}

export function findUploadedAssetPresentation(input: {
  assetId?: string | null;
  url?: string | null;
  storagePath?: string | null;
  storedFileName?: string | null;
}) {
  restoreFromSessionStorage();
  const keys = [
    input.assetId,
    input.url,
    input.storagePath,
    input.storedFileName,
  ];

  for (const key of keys) {
    const normalizedKey = key?.trim();

    if (!normalizedKey) {
      continue;
    }

    const matched = byAssetId.get(normalizedKey)
      ?? byUrl.get(normalizedKey)
      ?? byStoragePath.get(normalizedKey)
      ?? byStoredFileName.get(normalizedKey);

    if (matched) {
      return matched;
    }
  }

  return null;
}

export function clearUploadedAssetPresentationCache() {
  byAssetId.clear();
  byUrl.clear();
  byStoragePath.clear();
  byStoredFileName.clear();
  getSessionStorage()?.removeItem(SESSION_STORAGE_KEY);
}
