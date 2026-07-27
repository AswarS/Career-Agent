import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Keep unit tests deterministic even when a developer's tracked/local
    // Vite environment is configured for a live upstream server.
    env: {
      VITE_CAREER_AGENT_CLIENT_MODE: 'mock',
      VITE_CAREER_AGENT_API_BASE_URL: '',
      VITE_CAREER_AGENT_ARTIFACT_TRANSPORT: 'mock',
    },
  },
});
