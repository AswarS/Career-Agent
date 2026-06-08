interface ImportMetaEnv {
  readonly VITE_CAREER_AGENT_CLIENT_MODE?: string;
  readonly VITE_CAREER_AGENT_API_BASE_URL?: string;
  readonly VITE_CAREER_AGENT_USER_ID?: string;
  readonly VITE_CAREER_AGENT_WITH_CREDENTIALS?: string;
  readonly VITE_CAREER_AGENT_ARTIFACT_TRANSPORT?: string;
  readonly VITE_CAREER_AGENT_ENABLE_VOICE_INPUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
