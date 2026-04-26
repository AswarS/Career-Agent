import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { CareerAgentClient } from './careerAgentClient';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import type { DraftMessageAttachment, ProfileRecord } from '../types/entities';
import type {
  UpstreamArtifactRecord,
  UpstreamProfileSuggestion,
  UpstreamSendThreadMessageResult,
  UpstreamThreadMessage,
  UpstreamThreadSummary,
  UpstreamUploadedConversationFile,
} from './upstreamContracts';
import {
  normalizeArtifactRecord,
  normalizeProfileSuggestion,
  normalizeSendThreadMessageResult,
  normalizeThreadMessage,
  normalizeThreadSummary,
  normalizeUploadedConversationFile,
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
    const responseData = error.response?.data;
    const message = typeof responseData === 'object' && responseData && 'message' in responseData
      ? Array.isArray(responseData.message)
        ? responseData.message.join(', ')
        : String(responseData.message)
      : error.message;
    const code = typeof responseData === 'object' && responseData && 'code' in responseData
      ? String(responseData.code)
      : null;
    const requestId = typeof responseData === 'object' && responseData && 'request_id' in responseData
      ? String(responseData.request_id)
      : null;
    const detail = [
      code ? `code=${code}` : null,
      requestId ? `request_id=${requestId}` : null,
    ].filter(Boolean).join(', ');

    return new Error(`Upstream request failed${status ? ` (${status})` : ''} for ${path}: ${message}${detail ? ` (${detail})` : ''}`);
  }

  return error instanceof Error ? error : new Error(`Upstream request failed for ${path}.`);
}

function isOptionalCapabilityError(error: unknown) {
  return axios.isAxiosError(error) && (
    error.response?.status === 404
    || error.response?.status === 405
    || error.response?.status === 501
  );
}

function normalizeUserIdForServer(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : value;
}

async function attachmentToFile(attachment: DraftMessageAttachment | File): Promise<File> {
  if (typeof File !== 'undefined' && attachment instanceof File) {
    return attachment;
  }

  const draftAttachment = attachment as DraftMessageAttachment;
  const response = await fetch(draftAttachment.url);

  if (!response.ok) {
    throw new Error(`Failed to fetch attachment "${draftAttachment.name}" (${response.status} ${response.statusText}).`);
  }

  const blob = await response.blob();

  if (typeof File === 'undefined') {
    throw new Error(`File API is not available to prepare attachment "${draftAttachment.name}".`);
  }

  return new File([blob], draftAttachment.name, {
    type: draftAttachment.mimeType,
  });
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
      if (isOptionalCapabilityError(error)) {
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
    async uploadThreadFile(threadId, attachment) {
      const file = await attachmentToFile(attachment);
      const formData = new FormData();
      formData.append('file', file);

      const payload = await requestJson<UpstreamUploadedConversationFile>(
        CAREER_AGENT_API_ROUTES.threadFiles(threadId),
        {
          method: 'POST',
          data: formData,
        },
      );

      return normalizeUploadedConversationFile(payload);
    },
    async sendMessage(threadId, input) {
      const payload = await requestJson<UpstreamSendThreadMessageResult>(
        CAREER_AGENT_API_ROUTES.sendThreadMessage(threadId),
        {
          method: 'POST',
          data: {
            kind: input.kind ?? 'markdown',
            content: input.content,
            attachment_asset_ids: input.attachmentAssetIds ?? [],
            client_request_id: input.clientRequestId,
            context: input.context,
          },
        },
      );

      return normalizeSendThreadMessageResult(payload);
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
      const payload = await requestOptionalJson<UpstreamArtifactRecord[]>(
        CAREER_AGENT_API_ROUTES.listArtifacts(options.userId),
      );

      return (payload ?? []).map(normalizeArtifactRecord);
    },
    async getArtifact(artifactId: string) {
      const findArtifactById = async () => {
        const artifacts = await requestOptionalJson<UpstreamArtifactRecord[]>(
          CAREER_AGENT_API_ROUTES.listArtifacts(options.userId),
        );
        const matchedArtifact = artifacts?.find((artifact) => String(artifact.id) === artifactId);
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
