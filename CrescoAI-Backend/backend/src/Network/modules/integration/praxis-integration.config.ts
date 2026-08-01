import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';

type Environment = Record<string, string | undefined>;

const DEV_SERVICE_SECRET = 'praxis-development-service-secret';
const DEV_EVENT_SECRET = 'career-development-event-secret';
const devKeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });

function enabled(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseSecrets(
  raw: string | undefined,
  fallback: Record<string, string>,
  name: string,
) {
  if (!raw?.trim()) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  const entries = Object.entries(parsed).filter(
    ([kid, secret]) => kid.trim() && typeof secret === 'string' && secret.length >= 16,
  );
  if (entries.length !== Object.keys(parsed).length || entries.length === 0) {
    throw new Error(`${name} contains an invalid kid or secret`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function privateKey(environment: Environment, production: boolean): KeyObject {
  const pem = environment.CAREER_AGENT_PRAXIS_SSO_PRIVATE_KEY?.replace(
    /\\n/g,
    '\n',
  );
  if (!pem) {
    if (production) {
      throw new Error(
        'CAREER_AGENT_PRAXIS_SSO_PRIVATE_KEY is required when Praxis integration is enabled in production',
      );
    }
    return devKeyPair.privateKey;
  }
  return createPrivateKey(pem);
}

function requireHttps(value: string, name: string, production: boolean) {
  const url = new URL(value);
  if (production && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return url.toString().replace(/\/$/, '');
}

export interface PraxisIntegrationConfig {
  enabled: boolean;
  issuer: string;
  audience: string;
  praxisBaseUrl: string;
  serviceCredentials: Record<string, string>;
  eventSigningKeys: Record<string, string>;
  activeEventSigningKid: string;
  ssoAlgorithm: 'ES256' | 'RS256';
  ssoKid: string;
  ssoPrivateKey: KeyObject;
  ssoPublicKey: KeyObject;
}

export function resolvePraxisIntegrationConfig(
  environment: Environment = process.env,
): PraxisIntegrationConfig {
  const production = environment.NODE_ENV === 'production';
  const integrationEnabled = enabled(
    environment.CAREER_AGENT_PRAXIS_INTEGRATION_ENABLED,
    false,
  );
  const algorithm = environment.CAREER_AGENT_PRAXIS_SSO_ALGORITHM?.trim()
    || 'ES256';
  if (algorithm !== 'ES256' && algorithm !== 'RS256') {
    throw new Error(
      'CAREER_AGENT_PRAXIS_SSO_ALGORITHM must be ES256 or RS256',
    );
  }

  const disabledPrivateKey = devKeyPair.privateKey;
  if (!integrationEnabled) {
    return {
      enabled: false,
      issuer: environment.CAREER_AGENT_PRAXIS_ISSUER?.trim()
        || 'https://career.invalid',
      audience: 'praxis-agent',
      praxisBaseUrl: environment.CAREER_AGENT_PRAXIS_BASE_URL?.trim()
        || 'https://praxis.invalid',
      serviceCredentials: {},
      eventSigningKeys: {},
      activeEventSigningKid: '',
      ssoAlgorithm: algorithm,
      ssoKid: '',
      ssoPrivateKey: disabledPrivateKey,
      ssoPublicKey: createPublicKey(disabledPrivateKey),
    };
  }

  const serviceCredentials = parseSecrets(
    environment.CAREER_AGENT_PRAXIS_SERVICE_CREDENTIALS_JSON,
    production ? {} : { 'praxis-dev': DEV_SERVICE_SECRET },
    'CAREER_AGENT_PRAXIS_SERVICE_CREDENTIALS_JSON',
  );
  const eventSigningKeys = parseSecrets(
    environment.CAREER_AGENT_PRAXIS_EVENT_SIGNING_KEYS_JSON,
    production ? {} : { 'career-dev': DEV_EVENT_SECRET },
    'CAREER_AGENT_PRAXIS_EVENT_SIGNING_KEYS_JSON',
  );
  if (Object.keys(serviceCredentials).length === 0) {
    throw new Error(
      'CAREER_AGENT_PRAXIS_SERVICE_CREDENTIALS_JSON is required when Praxis integration is enabled',
    );
  }
  if (Object.keys(eventSigningKeys).length === 0) {
    throw new Error(
      'CAREER_AGENT_PRAXIS_EVENT_SIGNING_KEYS_JSON is required when Praxis integration is enabled',
    );
  }
  if (production) {
    for (const secret of [
      ...Object.values(serviceCredentials),
      ...Object.values(eventSigningKeys),
    ]) {
      if (secret.length < 32) {
        throw new Error('Praxis integration secrets must contain at least 32 characters in production');
      }
    }
  }

  const activeEventSigningKid =
    environment.CAREER_AGENT_PRAXIS_EVENT_SIGNING_KID?.trim()
    || Object.keys(eventSigningKeys)[0];
  if (!eventSigningKeys[activeEventSigningKid]) {
    throw new Error(
      'CAREER_AGENT_PRAXIS_EVENT_SIGNING_KID is not present in the signing key set',
    );
  }
  const signingKey = privateKey(environment, production);
  const keyType = signingKey.asymmetricKeyType;
  if (
    (algorithm === 'ES256' && keyType !== 'ec')
    || (algorithm === 'RS256' && keyType !== 'rsa')
  ) {
    throw new Error(`Praxis SSO private key does not match ${algorithm}`);
  }

  return {
    enabled: true,
    issuer: requireHttps(
      environment.CAREER_AGENT_PRAXIS_ISSUER?.trim()
        || 'http://localhost:4000',
      'CAREER_AGENT_PRAXIS_ISSUER',
      production,
    ),
    audience: environment.CAREER_AGENT_PRAXIS_AUDIENCE?.trim()
      || 'praxis-agent',
    praxisBaseUrl: requireHttps(
      environment.CAREER_AGENT_PRAXIS_BASE_URL?.trim()
        || 'http://localhost:8000',
      'CAREER_AGENT_PRAXIS_BASE_URL',
      production,
    ),
    serviceCredentials,
    eventSigningKeys,
    activeEventSigningKid,
    ssoAlgorithm: algorithm,
    ssoKid: environment.CAREER_AGENT_PRAXIS_SSO_KID?.trim()
      || 'career-dev',
    ssoPrivateKey: signingKey,
    ssoPublicKey: createPublicKey(signingKey),
  };
}

export function validatePraxisIntegrationConfig() {
  resolvePraxisIntegrationConfig();
}
