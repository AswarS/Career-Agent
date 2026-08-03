import { createHash } from "node:crypto";

function assertUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new TypeError('RFC 8785 does not permit lone Unicode surrogates');
      }
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError('RFC 8785 does not permit lone Unicode surrogates');
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError('RFC 8785 does not permit lone Unicode surrogates');
    }
  }
}

/** Serialize an I-JSON value using RFC 8785 JSON Canonicalization Scheme. */
export function serializeCanonicalProfile(value: unknown): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('RFC 8785 only permits finite JSON numbers');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalProfile).join(',')}]`;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object).sort().map((key) => {
      assertUnicode(key);
      const nested = object[key];
      if (nested === undefined
        || typeof nested === 'function'
        || typeof nested === 'symbol'
        || typeof nested === 'bigint') {
        throw new TypeError('RFC 8785 input must be valid I-JSON');
      }
      return `${JSON.stringify(key)}:${serializeCanonicalProfile(nested)}`;
    });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError('RFC 8785 input must be valid I-JSON');
}

export function hashCanonicalProfile(profileJson: string) {
  return createHash("sha256").update(profileJson).digest("hex");
}
