import type { CareerAgentClient } from './careerAgentClient';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import type { ProfileRecord } from '../types/entities';
import type {
  UpstreamArtifactRecord,
  UpstreamProfileSuggestion,
  UpstreamThreadMessage,
  UpstreamThreadSummary,
} from './upstreamContracts';
import {
  normalizeArtifactRecord,
  normalizeProfileSuggestion,
  normalizeThreadMessage,
  normalizeThreadSummary,
  sanitizeProfileRecord,
} from './upstreamContracts';

export interface UpstreamCareerAgentClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
}

function mergeHeaders(init?: RequestInit) {
  return {
    Accept: 'application/json',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  };
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path}`;
}

async function parseJsonResponse<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status}) for ${path}.`);
  }

  return response.json() as Promise<T>;
}

export function createUpstreamCareerAgentClient(
  options: UpstreamCareerAgentClientOptions,
): CareerAgentClient {
  const fetcher = options.fetcher ?? globalThis.fetch?.bind(globalThis);

  if (!fetcher) {
    throw new Error('Fetch API is not available in the current runtime.');
  }

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(joinUrl(options.baseUrl, path), {
      ...init,
      headers: mergeHeaders(init),
    });

    return parseJsonResponse<T>(response, path);
  }

  async function requestOptionalJson<T>(path: string, init?: RequestInit): Promise<T | null> {
    const response = await fetcher(joinUrl(options.baseUrl, path), {
      ...init,
      headers: mergeHeaders(init),
    });

    if (response.status === 404) {
      return null;
    }

    return parseJsonResponse<T>(response, path);
  }

  return {
    async listThreads() {
      const payload = await requestJson<UpstreamThreadSummary[]>(CAREER_AGENT_API_ROUTES.listThreads());
      return payload.map(normalizeThreadSummary);
    },
    async getThreadMessages(threadId: string) {
      const payload = await requestJson<UpstreamThreadMessage[]>(
        CAREER_AGENT_API_ROUTES.threadMessages(threadId),
      );

      return payload.map((message) => normalizeThreadMessage(message, threadId));
    },
    async getProfile() {
      const payload = await requestJson<ProfileRecord>(CAREER_AGENT_API_ROUTES.profile());
      return sanitizeProfileRecord(payload);
    },
    async updateProfile(profile) {
      const payload = await requestJson<ProfileRecord>(CAREER_AGENT_API_ROUTES.profile(), {
        method: 'PUT',
        body: JSON.stringify(profile),
      });

      return sanitizeProfileRecord(payload);
    },
    async listProfileSuggestions() {
      const payload = await requestJson<UpstreamProfileSuggestion[]>(
        CAREER_AGENT_API_ROUTES.profileSuggestions(),
      );

      return payload.map(normalizeProfileSuggestion);
    },
    async listArtifacts() {
      const payload = await requestJson<UpstreamArtifactRecord[]>(
        CAREER_AGENT_API_ROUTES.listArtifacts(),
      );

      return payload.map(normalizeArtifactRecord);
    },
    async getArtifact(artifactId: string) {
      const payload = await requestOptionalJson<UpstreamArtifactRecord>(
        CAREER_AGENT_API_ROUTES.artifact(artifactId),
      );

      return payload ? normalizeArtifactRecord(payload) : null;
    },
    async refreshArtifact(artifactId: string) {
      const payload = await requestOptionalJson<UpstreamArtifactRecord>(
        CAREER_AGENT_API_ROUTES.refreshArtifact(artifactId),
        { method: 'POST' },
      );

      return payload ? normalizeArtifactRecord(payload) : null;
    },
  };
}
