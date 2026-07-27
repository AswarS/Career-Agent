const DEVELOPMENT_SECRET = "career-agent-dev-secret";
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

type Environment = Record<string, string | undefined>;

function configuredSecret(environment: Environment, ...names: string[]) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function requireProductionSecret(
  value: string | undefined,
  configurationName: string,
) {
  if (!value) {
    throw new Error(`${configurationName} must be configured in production`);
  }
  if (value.length < MINIMUM_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `${configurationName} must contain at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters in production`,
    );
  }
  return value;
}

export function resolveCareerAgentSecurityConfig(
  environment: Environment = process.env,
) {
  const jwtSecret = configuredSecret(
    environment,
    "CAREER_AGENT_JWT_SECRET",
    "JWT_SECRET",
  );
  const fileDownloadTokenSecret =
    configuredSecret(environment, "CAREER_AGENT_FILE_DOWNLOAD_TOKEN_SECRET") ??
    jwtSecret;
  const production = environment.NODE_ENV === "production";

  if (production) {
    return {
      jwtSecret: requireProductionSecret(
        jwtSecret,
        "CAREER_AGENT_JWT_SECRET (or JWT_SECRET)",
      ),
      fileDownloadTokenSecret: requireProductionSecret(
        fileDownloadTokenSecret,
        "CAREER_AGENT_FILE_DOWNLOAD_TOKEN_SECRET (or the JWT secret)",
      ),
    };
  }

  return {
    jwtSecret: jwtSecret ?? DEVELOPMENT_SECRET,
    fileDownloadTokenSecret:
      fileDownloadTokenSecret ?? jwtSecret ?? DEVELOPMENT_SECRET,
  };
}

export function validateCareerAgentSecurityConfig() {
  resolveCareerAgentSecurityConfig();
}

export function careerAgentJwtSecret() {
  return resolveCareerAgentSecurityConfig().jwtSecret;
}

export function careerAgentFileDownloadTokenSecret() {
  return resolveCareerAgentSecurityConfig().fileDownloadTokenSecret;
}
