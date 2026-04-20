import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
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
  userId: string;
  withCredentials?: boolean;
  httpClient?: AxiosInstance;
}

function createDefaultProfile(): ProfileRecord {
  return {
    displayName: '',
    locale: 'zh-CN',
    timezone: 'Asia/Singapore',
    currentRole: '',
    employmentStatus: '',
    experienceSummary: '',
    educationSummary: '',
    locationRegion: '',
    targetRole: '',
    targetIndustries: [],
    shortTermGoal: '',
    longTermGoal: '',
    weeklyTimeBudget: '',
    constraints: [],
    workPreferences: [],
    learningPreferences: [],
    keyStrengths: [],
    riskSignals: [],
    portfolioLinks: [],
  };
}

function createAxiosClient(baseUrl: string, withCredentials: boolean) {
  return axios.create({
    baseURL: baseUrl,
    withCredentials,
    headers: {
      Accept: 'application/json',
    },
  });
}

function formatUpstreamError(error: unknown, path: string) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = typeof error.response?.data === 'object' && error.response.data && 'message' in error.response.data
      ? String(error.response.data.message)
      : error.message;

    return new Error(`Upstream request failed${status ? ` (${status})` : ''} for ${path}: ${message}`);
  }

  return error instanceof Error ? error : new Error(`Upstream request failed for ${path}.`);
}

function isNotFoundError(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function normalizeUserIdForServer(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
}

export function createUpstreamCareerAgentClient(
  options: UpstreamCareerAgentClientOptions,
): CareerAgentClient {
  const httpClient = options.httpClient ?? createAxiosClient(options.baseUrl, Boolean(options.withCredentials));

  async function requestJson<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await httpClient.request<T>({
        url: path,
        ...config,
      });

      return response.data;
    } catch (error) {
      throw formatUpstreamError(error, path);
    }
  }

  async function requestOptionalJson<T>(path: string, config?: AxiosRequestConfig): Promise<T | null> {
    try {
      const response = await httpClient.request<T>({
        url: path,
        ...config,
      });

      return response.data;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw formatUpstreamError(error, path);
    }
  }

  return {
    async listThreads() {
      const payload = await requestJson<UpstreamThreadSummary[]>(
        CAREER_AGENT_API_ROUTES.listThreads(options.userId),
      );
      return payload.map(normalizeThreadSummary);
    },
    async createThread(input) {
      const now = new Date().toISOString();
      const payload = await requestJson<UpstreamThreadSummary>(
        CAREER_AGENT_API_ROUTES.createThread(),
        {
          method: 'POST',
          data: {
            userId: normalizeUserIdForServer(options.userId),
            title: input?.title ?? '新对话',
            preview: input?.preview ?? '',
            updatedAt: now,
            createdAt: now,
          },
        },
      );

      return normalizeThreadSummary(payload);
    },
    async getThreadMessages(threadId: string) {
      const payload = await requestJson<UpstreamThreadMessage[]>(
        CAREER_AGENT_API_ROUTES.threadMessages(threadId),
      );

      return payload.map((message) => normalizeThreadMessage(message, threadId));
    },
    async getProfile() {
      const payload = await requestOptionalJson<ProfileRecord>(CAREER_AGENT_API_ROUTES.profile());
      return sanitizeProfileRecord(payload ?? createDefaultProfile());
    },
    async updateProfile(profile) {
      const payload = await requestJson<ProfileRecord>(CAREER_AGENT_API_ROUTES.profile(), {
        method: 'PUT',
        data: profile,
      });

      return sanitizeProfileRecord(payload);
    },
    async listProfileSuggestions() {
      const payload = await requestOptionalJson<UpstreamProfileSuggestion[]>(
        CAREER_AGENT_API_ROUTES.profileSuggestions(),
      );

      return (payload ?? []).map(normalizeProfileSuggestion);
    },
    async listArtifacts() {
      const payload = await requestJson<UpstreamArtifactRecord[]>(
        CAREER_AGENT_API_ROUTES.listArtifacts(options.userId),
      );

      return payload.map(normalizeArtifactRecord);
    },
    async getArtifact(artifactId: string) {
      const findArtifactById = async () => {
        const artifacts = await requestJson<UpstreamArtifactRecord[]>(
          CAREER_AGENT_API_ROUTES.listArtifacts(options.userId),
        );
        const matchedArtifact = artifacts.find((artifact) => String(artifact.id) === artifactId);
        return matchedArtifact ? normalizeArtifactRecord(matchedArtifact) : null;
      };

      const payload = await requestOptionalJson<UpstreamArtifactRecord | UpstreamArtifactRecord[]>(
        CAREER_AGENT_API_ROUTES.artifact(artifactId),
      );

      if (Array.isArray(payload)) {
        const matchedArtifact = payload.find((artifact) => String(artifact.id) === artifactId);
        return matchedArtifact ? normalizeArtifactRecord(matchedArtifact) : findArtifactById();
      }

      if (!payload) {
        return findArtifactById();
      }

      if (String(payload.id) !== artifactId) {
        return findArtifactById();
      }

      return normalizeArtifactRecord(payload);
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
