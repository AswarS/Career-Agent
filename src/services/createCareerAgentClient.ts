import { runtimeConfig, type RuntimeConfig } from '../config/runtime';
import type { CareerAgentClient } from './careerAgentClient';
import { createMockCareerAgentClient } from './mockCareerAgentClient';
import {
  createUpstreamCareerAgentClient,
  type UpstreamCareerAgentClientOptions,
} from './upstreamCareerAgentClient';

export interface CareerAgentClientFactoryOptions {
  config?: RuntimeConfig;
  mockFactory?: () => CareerAgentClient;
  upstreamFactory?: (options: UpstreamCareerAgentClientOptions) => CareerAgentClient;
}

function createUnavailableCareerAgentClient(message: string): CareerAgentClient {
  const unavailable = async () => {
    throw new Error(message);
  };

  return {
    listThreads: unavailable,
    createThread: unavailable,
    getThreadMessages: unavailable,
    uploadThreadFile: unavailable,
    sendMessage: unavailable,
    getProfile: unavailable,
    updateProfile: unavailable,
    listProfileSuggestions: unavailable,
    listArtifacts: unavailable,
    getArtifact: unavailable,
    refreshArtifact: unavailable,
  };
}

export function createCareerAgentClient(
  options: CareerAgentClientFactoryOptions = {},
): CareerAgentClient {
  const config = options.config ?? runtimeConfig;

  if (config.clientMode === 'upstream') {
    if (!config.apiBaseUrl) {
      return createUnavailableCareerAgentClient(
        'Career agent client mode is set to upstream, but VITE_CAREER_AGENT_API_BASE_URL is empty.',
      );
    }

    return (options.upstreamFactory ?? createUpstreamCareerAgentClient)({
      baseUrl: config.apiBaseUrl,
      userId: config.userId,
      withCredentials: config.upstreamWithCredentials,
    });
  }

  return (options.mockFactory ?? createMockCareerAgentClient)();
}
