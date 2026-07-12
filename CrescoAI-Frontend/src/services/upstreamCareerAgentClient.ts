import axios, { AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  MessageStreamUnavailableError,
  type CareerAgentClient,
} from './careerAgentClient';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import type { DraftMessageAttachment, ProfileRecord } from '../types/entities';
import { rememberUploadedAssetPresentation } from './uploadedAssetPresentationCache';
import type {
  UpstreamArtifactRecord,
  UpstreamMessageStreamEvent,
  UpstreamProfileSuggestion,
  UpstreamSendThreadMessageResult,
  UpstreamThreadMessage,
  UpstreamThreadSummary,
  UpstreamUploadedConversationFile,
} from './upstreamContracts';
import {
  normalizeArtifactRecord,
  normalizeMessageStreamEvent,
  normalizeProfileSuggestion,
  normalizeSendThreadMessageResult,
  normalizeThreadMessage,
  normalizeThreadSummary,
  normalizeUploadedConversationFile,
  sanitizeProfileRecord,
} from './upstreamContracts';
import { readStoredAuthToken, readStoredAuthTokenType, readStoredAuthUserId } from './authSessionStorage';

export interface UpstreamCareerAgentClientOptions {
  baseUrl: string;
  userId: string;
  withCredentials?: boolean;
  httpClient?: AxiosInstance;
}

function createDefaultProfile(): ProfileRecord {
  return {
    schemaVersion: 'career_profile_v1',
    basicInfo: {
      fullName: '',
      displayName: '',
      contactEmail: '',
      phoneOrPreferredContact: '',
      currentCity: '',
      profileAssets: [],
    },
    careerProfile: {
      candidateType: '',
      currentRole: '',
      employmentStatus: '',
      careerStage: '',
      educationBackground: '',
      workExperience: '',
      projectExperience: '',
      skills: [],
      interests: [],
      strengthTags: [],
      weaknessTags: [],
      personalityTraits: [],
    },
    intentConstraints: {
      targetIndustry: '',
      targetIndustries: [],
      targetRole: '',
      targetCity: '',
      expectedSalary: '',
      availableTime: '',
      jobSearchStatus: '',
      constraints: [],
      workPreferences: [],
      learningPreferences: [],
      careerGoal: '',
    },
    activityRecords: {
      learningRecords: [],
      projectRecords: [],
      applicationRecords: [],
      interviewRecords: [],
      offerRecords: [],
      workRecords: [],
    },
    artifacts: {
      resumeSummary: '',
      portfolioLinks: [],
      projectMaterials: [],
      coverLetters: [],
    },
    feedbackSignals: {
      userFeedback: [],
      interviewFeedback: [],
      mentorFeedback: [],
      managerFeedback: [],
      systemAssessmentFeedback: [],
    },
    planState: {
      learningPlan: '',
      projectPlan: '',
      applicationPlan: '',
      interviewPlan: '',
      onboardingPlan: '',
      promotionPlan: '',
    },
    chinaResumeSupplement: {
      jobIntentionStatement: '',
      educationDetail: '',
      awardsCertificatesHighlights: '',
      conditionalFields: '',
    },
  };
}

function createAxiosClient(baseUrl: string, withCredentials: boolean) {
  const httpClient = axios.create({
    baseURL: baseUrl,
    withCredentials,
    headers: {
      Accept: 'application/json',
    },
  });

  httpClient.interceptors.request.use((config) => {
    const token = readStoredAuthToken();

    if (token) {
      config.headers = AxiosHeaders.from(config.headers);
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    return config;
  });

  return httpClient;
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

function resolveUpstreamRequestUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function appendSseDataLine(line: string, dataLines: string[]) {
  if (!line.startsWith('data:')) {
    return;
  }

  const value = line.slice('data:'.length);
  dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
}

function parseSseEvent(rawEvent: string): unknown | null {
  const dataLines: string[] = [];

  for (const line of rawEvent.split('\n')) {
    appendSseDataLine(line, dataLines);
  }

  if (!dataLines.length) {
    return null;
  }

  const data = dataLines.join('\n').trim();
  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

async function* readSseJson(response: Response): AsyncGenerator<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is not readable.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let separatorIndex = buffer.indexOf('\n\n');

    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const parsed = parseSseEvent(rawEvent);
      if (parsed) {
        yield parsed;
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, '\n');
  const parsed = parseSseEvent(buffer);
  if (parsed) {
    yield parsed;
  }
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
  const getEffectiveUserId = () => readStoredAuthUserId() ?? options.userId;

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
        CAREER_AGENT_API_ROUTES.listThreads(getEffectiveUserId()),
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
            title: input?.title ?? '新对话',
            preview: input?.preview ?? '',
            updatedAt: now,
            createdAt: now,
          },
        },
      );

      return normalizeThreadSummary(payload);
    },
    async deleteThread(threadId: string) {
      await requestJson<unknown>(
        CAREER_AGENT_API_ROUTES.thread(threadId),
        { method: 'DELETE' },
      );
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

      const normalizedFile = normalizeUploadedConversationFile(payload);
      rememberUploadedAssetPresentation(normalizedFile, file.name);

      return {
        ...normalizedFile,
        title: file.name,
        originalName: file.name,
      };
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
    async *streamMessage(threadId, input, streamOptions) {
      const path = CAREER_AGENT_API_ROUTES.streamThreadMessage(threadId);
      const token = readStoredAuthToken();
      const tokenType = readStoredAuthTokenType();
      const headers = new Headers({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      });

      if (token) {
        headers.set('Authorization', `${tokenType} ${token}`);
      }

      const response = await fetch(resolveUpstreamRequestUrl(options.baseUrl, path), {
        method: 'POST',
        headers,
        credentials: options.withCredentials ? 'include' : 'same-origin',
        signal: streamOptions?.signal,
        body: JSON.stringify({
          kind: input.kind ?? 'markdown',
          content: input.content,
          attachment_asset_ids: input.attachmentAssetIds ?? [],
          client_request_id: input.clientRequestId,
          context: input.context,
        }),
      });

      if (response.status === 404 || response.status === 405 || response.status === 501) {
        throw new MessageStreamUnavailableError(`Message stream endpoint is unavailable (${response.status}).`);
      }

      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(`Upstream stream request failed (${response.status}) for ${path}: ${message || response.statusText}`);
      }

      for await (const rawEvent of readSseJson(response)) {
        const normalizedEvent = normalizeMessageStreamEvent(rawEvent as UpstreamMessageStreamEvent, threadId);
        if (normalizedEvent) {
          yield normalizedEvent;
        }
      }
    },
    async getProfile() {
      const payload = await requestOptionalJson<unknown>(CAREER_AGENT_API_ROUTES.profile());
      return sanitizeProfileRecord(payload ?? createDefaultProfile());
    },
    async updateProfile(profile) {
      const payload = await requestJson<unknown>(CAREER_AGENT_API_ROUTES.profile(), {
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
        CAREER_AGENT_API_ROUTES.listArtifacts(),
      );

      return (payload ?? []).map(normalizeArtifactRecord);
    },
    async getArtifact(artifactId: string) {
      const findArtifactById = async () => {
        const artifacts = await requestOptionalJson<UpstreamArtifactRecord[]>(
          CAREER_AGENT_API_ROUTES.listArtifacts(),
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
