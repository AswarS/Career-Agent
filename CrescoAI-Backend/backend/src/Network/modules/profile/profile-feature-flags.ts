function envFlag(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

export const profileFeatureFlags = {
  v2Read: () => envFlag('CAREER_AGENT_PROFILE_V2_READ', true),
  v2Write: () => envFlag('CAREER_AGENT_PROFILE_V2_WRITE', true),
  recall: () => envFlag('CAREER_AGENT_PROFILE_V2_RECALL', true),
  tools: () => envFlag('CAREER_AGENT_PROFILE_V2_TOOLS', true),
  compactTools: () => envFlag('CAREER_AGENT_PROFILE_COMPACT_TOOLS', true),
  l1AutoApply: () => envFlag('CAREER_AGENT_PROFILE_L1_AUTO_APPLY', true),
  l2AutoApply: () => envFlag('CAREER_AGENT_PROFILE_L2_AUTO_APPLY', true),
  l3AutoApply: () => envFlag('CAREER_AGENT_PROFILE_L3_AUTO_APPLY', true),
  legacySuggestionExtraction: () =>
    envFlag('CAREER_AGENT_PROFILE_LEGACY_SUGGESTIONS', true),
  projectionWorker: () =>
    envFlag('CAREER_AGENT_PROFILE_PROJECTION_WORKER', true),
  legacyMigration: () =>
    envFlag('CAREER_AGENT_PROFILE_LEGACY_MIGRATION', true),
};
