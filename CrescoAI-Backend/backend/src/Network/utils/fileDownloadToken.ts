import { createHmac, timingSafeEqual } from 'node:crypto';
import { careerAgentFileDownloadTokenSecret } from '../security.config.js';

const tokenType = 'career-agent-file-download';
const tokenVersion = 'v1';
const defaultExpiresInSeconds = 2 * 60 * 60;

interface FileDownloadTokenPayload {
  typ: typeof tokenType;
  sub: string;
  cid: string;
  file: string;
  iat: number;
  exp: number;
}

export interface FileDownloadTokenClaims {
  userId: number;
  conversationId: string;
  fileName: string;
}

export function createFileDownloadToken(input: {
  userId: number | string;
  conversationId: string;
  fileName: string;
  expiresInSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: FileDownloadTokenPayload = {
    typ: tokenType,
    sub: String(input.userId),
    cid: input.conversationId,
    file: input.fileName,
    iat: now,
    exp: now + (input.expiresInSeconds ?? fileDownloadTokenExpiresInSeconds()),
  };
  const encodedPayload = base64UrlJson(payload);
  const signedValue = `${tokenVersion}.${encodedPayload}`;

  return `${signedValue}.${sign(signedValue)}`;
}

export function verifyFileDownloadToken(
  token: string,
  expected?: { conversationId?: string; fileName?: string },
): FileDownloadTokenClaims | undefined {
  const [version, encodedPayload, signature] = token.split('.');
  if (version !== tokenVersion || !encodedPayload || !signature) {
    return undefined;
  }

  const signedValue = `${version}.${encodedPayload}`;
  if (!safeEqualBase64Url(signature, sign(signedValue))) {
    return undefined;
  }

  let payload: FileDownloadTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as FileDownloadTokenPayload;
  } catch {
    return undefined;
  }

  if (
    payload.typ !== tokenType ||
    !payload.sub ||
    !payload.cid ||
    !payload.file ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return undefined;
  }

  if (expected?.conversationId && payload.cid !== expected.conversationId) {
    return undefined;
  }

  if (expected?.fileName && payload.file !== expected.fileName) {
    return undefined;
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return undefined;
  }

  return {
    userId,
    conversationId: payload.cid,
    fileName: payload.file,
  };
}

function safeEqualBase64Url(value: string, expected: string) {
  let valueBuffer: Buffer;
  let expectedBuffer: Buffer;
  try {
    valueBuffer = Buffer.from(value, 'base64url');
    expectedBuffer = Buffer.from(expected, 'base64url');
  } catch {
    return false;
  }

  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}

function sign(value: string) {
  return createHmac('sha256', careerAgentFileDownloadTokenSecret())
    .update(value)
    .digest('base64url');
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function fileDownloadTokenExpiresInSeconds() {
  const parsed = Number(process.env.CAREER_AGENT_FILE_DOWNLOAD_TOKEN_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultExpiresInSeconds;
}
