export const PROFILE_INDEX_PATTERN = /^P\d{6,}$/;

export function formatProfileIndex(sequence: number) {
  const normalized = Math.max(Math.trunc(sequence), 1);
  return `P${String(normalized).padStart(6, '0')}`;
}

export function normalizeProfileIndex(value: string) {
  const normalized = value.trim().toUpperCase();
  return PROFILE_INDEX_PATTERN.test(normalized) ? normalized : null;
}
