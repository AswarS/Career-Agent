import { defineStore } from 'pinia';
import { matchesMobileLayoutViewport } from '../app/responsive';
import { runtimeConfig } from '../config/runtime';
import { createCareerAgentClient } from '../services/createCareerAgentClient';
import { shouldSimulateArtifactRefreshLifecycle } from './artifactRefreshPolicy';
import type {
  ArtifactRecord,
  ArtifactStatus,
  ArtifactViewMode,
  DraftMessageSubmission,
  LoadState,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

const client = createCareerAgentClient();
const simulateArtifactRefreshLifecycle = shouldSimulateArtifactRefreshLifecycle(runtimeConfig);
let initializePromise: Promise<void> | null = null;
let threadLoadRequestToken = 0;
let artifactRefreshRequestToken = 0;

function createMessageId(prefix: string) {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}-${randomValue}`;
}

function formatLocalTimestamp(date: Date) {
  return date.toISOString();
}

function revokeBlobUrl(value: string | null | undefined) {
  if (value?.startsWith('blob:')) {
    URL.revokeObjectURL(value);
  }
}

function revokeLocalMessageResources(messages: ThreadMessage[]) {
  for (const message of messages) {
    for (const media of message.media ?? []) {
      revokeBlobUrl(media.url);
      revokeBlobUrl(media.posterUrl);
    }

    for (const file of message.files ?? []) {
      revokeBlobUrl(file.url);
    }
  }
}

function normalizeInlineText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function deriveThreadSeed(submission: DraftMessageSubmission) {
  const normalizedContent = normalizeInlineText(submission.content);

  if (normalizedContent) {
    return {
      title: truncateText(normalizedContent, 18),
      preview: truncateText(normalizedContent, 72),
    };
  }

  if (submission.attachments.length === 1) {
    const attachmentName = submission.attachments[0]?.name.trim() || '附件';
    return {
      title: truncateText(attachmentName, 18),
      preview: `包含附件：${truncateText(attachmentName, 56)}`,
    };
  }

  if (submission.attachments.length > 1) {
    return {
      title: '多附件对话',
      preview: `包含 ${submission.attachments.length} 个附件`,
    };
  }

  return {
    title: '新对话',
    preview: '',
  };
}

interface WorkspaceState {
  initialized: boolean;
  threads: ThreadSummary[];
  messages: ThreadMessage[];
  profile: ProfileRecord | null;
  profileSuggestions: ProfileSuggestion[];
  artifacts: ArtifactRecord[];
  activeThreadId: string | null;
  activeArtifactId: string | null;
  sideRailCollapsed: boolean;
  mobileSideRailOpen: boolean;
  artifactPaneOpen: boolean;
  artifactViewMode: ArtifactViewMode;
  threadsStatus: LoadState;
  threadCreateStatus: LoadState;
  messagesStatus: LoadState;
  profileStatus: LoadState;
  profileSuggestionsStatus: LoadState;
  profileSaveStatus: LoadState;
  artifactsStatus: LoadState;
  messageSubmitStatus: LoadState;
  errorMessage: string | null;
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    initialized: false,
    threads: [],
    messages: [],
    profile: null,
    profileSuggestions: [],
    artifacts: [],
    activeThreadId: null,
    activeArtifactId: null,
    sideRailCollapsed: false,
    mobileSideRailOpen: false,
    artifactPaneOpen: false,
    artifactViewMode: 'pane',
    threadsStatus: 'idle',
    threadCreateStatus: 'idle',
    messagesStatus: 'idle',
    profileStatus: 'idle',
    profileSuggestionsStatus: 'idle',
    profileSaveStatus: 'idle',
    artifactsStatus: 'idle',
    messageSubmitStatus: 'idle',
    errorMessage: null,
  }),
  getters: {
    activeThread(state) {
      return state.threads.find((thread) => thread.id === state.activeThreadId) ?? null;
    },
    activeArtifact(state) {
      return state.artifacts.find((artifact) => artifact.id === state.activeArtifactId) ?? null;
    },
    artifactFocusMode(state) {
      return state.artifactPaneOpen && state.artifactViewMode === 'focus';
    },
    artifactImmersiveMode(state) {
      return state.artifactPaneOpen && state.artifactViewMode === 'immersive';
    },
  },
  actions: {
    setSideRailCollapsed(collapsed: boolean) {
      this.sideRailCollapsed = collapsed;
    },
    toggleSideRailCollapsed() {
      this.sideRailCollapsed = !this.sideRailCollapsed;
    },
    setMobileSideRailOpen(open: boolean) {
      this.mobileSideRailOpen = open;
    },
    openMobileSideRail() {
      this.mobileSideRailOpen = true;
    },
    closeMobileSideRail() {
      this.mobileSideRailOpen = false;
    },
    toggleMobileSideRail() {
      this.mobileSideRailOpen = !this.mobileSideRailOpen;
    },
    syncArtifactViewForLayout(isMobileLayout: boolean) {
      if (!this.artifactPaneOpen || !this.activeArtifactId || this.artifactViewMode === 'immersive') {
        return;
      }

      if (isMobileLayout && this.artifactViewMode === 'pane') {
        this.artifactViewMode = 'focus';
        return;
      }

      if (!isMobileLayout && this.artifactViewMode === 'focus') {
        this.artifactViewMode = 'pane';
      }
    },
    upsertArtifactRecord(nextArtifact: ArtifactRecord) {
      const artifactIndex = this.artifacts.findIndex((artifact) => artifact.id === nextArtifact.id);

      if (artifactIndex >= 0) {
        this.artifacts[artifactIndex] = nextArtifact;
      } else {
        this.artifacts.push(nextArtifact);
      }
    },
    setArtifactStatus(artifactId: string, status: ArtifactStatus) {
      const artifactIndex = this.artifacts.findIndex((artifact) => artifact.id === artifactId);

      if (artifactIndex < 0) {
        return;
      }

      this.artifacts[artifactIndex] = {
        ...this.artifacts[artifactIndex],
        status,
      };
    },
    async initialize() {
      if (this.initialized) {
        return;
      }

      if (initializePromise) {
        await initializePromise;
        return;
      }

      initializePromise = (async () => {
        this.threadsStatus = 'loading';
        this.profileStatus = 'loading';
        this.profileSuggestionsStatus = 'loading';
        this.artifactsStatus = 'loading';
        this.errorMessage = null;

        try {
          const [threads, profile, profileSuggestions, artifacts] = await Promise.all([
            client.listThreads(),
            client.getProfile(),
            client.listProfileSuggestions(),
            client.listArtifacts(),
          ]);

          this.threads = threads;
          this.profile = profile;
          this.profileSuggestions = profileSuggestions;
          this.artifacts = artifacts;
          this.activeThreadId ??= threads[0]?.id ?? null;
          this.initialized = true;

          this.threadsStatus = 'ready';
          this.threadCreateStatus = 'idle';
          this.profileStatus = 'ready';
          this.profileSuggestionsStatus = 'ready';
          this.artifactsStatus = 'ready';
          this.messagesStatus = 'idle';
          this.profileSaveStatus = 'idle';
        } catch (error) {
          this.threadsStatus = 'error';
          this.threadCreateStatus = 'error';
          this.profileStatus = 'error';
          this.profileSuggestionsStatus = 'error';
          this.artifactsStatus = 'error';
          this.messagesStatus = 'error';
          this.errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
        } finally {
          initializePromise = null;
        }
      })();

      await initializePromise;
    },
    async setActiveThread(threadId: string) {
      if (this.activeThreadId === threadId && (this.messagesStatus === 'loading' || this.messagesStatus === 'ready')) {
        return this.activeThreadId;
      }

      const requestToken = ++threadLoadRequestToken;

      this.messagesStatus = 'loading';
      this.errorMessage = null;
      revokeLocalMessageResources(this.messages);
      this.messages = [];

      await this.initialize();

      if (!this.initialized || requestToken !== threadLoadRequestToken) {
        return null;
      }

      const targetThreadId = this.threads.some((thread) => thread.id === threadId)
        ? threadId
        : this.threads[0]?.id ?? null;

      if (!targetThreadId) {
        this.activeThreadId = null;
        this.messagesStatus = 'ready';
        return null;
      }

      if (this.activeThreadId !== targetThreadId) {
        this.closeArtifact();
      }

      this.activeThreadId = targetThreadId;
      this.closeMobileSideRail();

      try {
        const nextMessages = await client.getThreadMessages(targetThreadId);

        if (requestToken !== threadLoadRequestToken || this.activeThreadId !== targetThreadId) {
          return null;
        }

        revokeLocalMessageResources(this.messages);
        this.messages = nextMessages;
        this.messagesStatus = 'ready';

        return targetThreadId;
      } catch (error) {
        if (requestToken !== threadLoadRequestToken || this.activeThreadId !== targetThreadId) {
          return null;
        }

        revokeLocalMessageResources(this.messages);
        this.messages = [];
        this.messagesStatus = 'error';
        this.errorMessage = error instanceof Error ? error.message : 'Unknown message loading error';
        return null;
      }
    },
    async createThread(input?: { title?: string; preview?: string }) {
      await this.initialize();

      if (!this.initialized) {
        throw new Error(this.errorMessage ?? 'Workspace is not initialized.');
      }

      this.threadCreateStatus = 'loading';
      this.errorMessage = null;

      try {
        const nextThread = await client.createThread({
          title: input?.title ?? '新对话',
          preview: input?.preview ?? '',
        });

        this.threads = [
          nextThread,
          ...this.threads.filter((thread) => thread.id !== nextThread.id),
        ];
        this.activeThreadId = nextThread.id;
        this.closeMobileSideRail();
        this.closeArtifact();
        revokeLocalMessageResources(this.messages);
        this.messages = [];
        this.messagesStatus = 'idle';
        this.threadCreateStatus = 'ready';

        return nextThread;
      } catch (error) {
        this.threadCreateStatus = 'error';
        this.errorMessage = error instanceof Error ? error.message : 'Unknown thread creation error';
        throw error;
      }
    },
    async startThreadFromDraft(submission: DraftMessageSubmission | string) {
      const nextSubmission = typeof submission === 'string'
        ? { content: submission, attachments: [] }
        : submission;
      const content = nextSubmission.content.trim();

      if (!content && nextSubmission.attachments.length === 0) {
        return null;
      }

      try {
        const nextThread = await this.createThread(deriveThreadSeed(nextSubmission));
        await this.submitDraftMessage({
          content: nextSubmission.content,
          attachments: [...nextSubmission.attachments],
        });
        return nextThread;
      } catch (error) {
        throw error;
      }
    },
    async openArtifact(artifactId: string, viewMode: ArtifactViewMode = 'pane') {
      await this.initialize();

      const artifact = await client.getArtifact(artifactId);

      if (!artifact) {
        return;
      }

      this.upsertArtifactRecord(artifact);

      this.activeArtifactId = artifact.id;
      this.artifactPaneOpen = true;
      this.artifactViewMode = matchesMobileLayoutViewport() && viewMode === 'pane'
        ? 'focus'
        : viewMode;
      this.closeMobileSideRail();
    },
    promoteArtifactFocus() {
      if (!this.activeArtifactId) {
        return;
      }

      this.artifactPaneOpen = true;
      this.artifactViewMode = 'focus';
    },
    promoteArtifactImmersive() {
      if (!this.activeArtifactId) {
        return;
      }

      this.artifactPaneOpen = true;
      this.artifactViewMode = 'immersive';
    },
    restoreArtifactFocus() {
      if (!this.activeArtifactId) {
        return;
      }

      this.artifactPaneOpen = true;
      this.artifactViewMode = 'focus';
    },
    restoreArtifactPane() {
      if (!this.activeArtifactId) {
        return;
      }

      this.artifactPaneOpen = true;
      this.artifactViewMode = 'pane';
    },
    async refreshArtifact(artifactId?: string | null) {
      await this.initialize();

      const targetArtifactId = artifactId ?? this.activeArtifactId;

      if (!targetArtifactId) {
        return;
      }

      const requestToken = ++artifactRefreshRequestToken;

      this.errorMessage = null;
      this.setArtifactStatus(targetArtifactId, 'loading');

      if (simulateArtifactRefreshLifecycle) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 180));

        if (requestToken !== artifactRefreshRequestToken) {
          return;
        }

        this.setArtifactStatus(targetArtifactId, 'streaming');

        await new Promise((resolve) => globalThis.setTimeout(resolve, 260));

        if (requestToken !== artifactRefreshRequestToken) {
          return;
        }
      }

      try {
        const refreshedArtifact = await client.refreshArtifact(targetArtifactId);

        if (requestToken !== artifactRefreshRequestToken) {
          return;
        }

        if (!refreshedArtifact) {
          this.setArtifactStatus(targetArtifactId, 'error');
          this.errorMessage = 'Artifact refresh returned no revision payload.';
          return;
        }

        this.upsertArtifactRecord(refreshedArtifact);
        this.errorMessage = null;
      } catch (error) {
        if (requestToken !== artifactRefreshRequestToken) {
          return;
        }

        this.setArtifactStatus(targetArtifactId, 'error');
        this.errorMessage = error instanceof Error ? error.message : 'Unknown artifact refresh error';
      }
    },
    async saveProfileDraft(nextProfile: ProfileRecord) {
      await this.initialize();
      this.profileSaveStatus = 'loading';
      this.errorMessage = null;

      try {
        const savedProfile = await client.updateProfile(nextProfile);
        const refreshedProfileSummary = await client.getArtifact('artifact-profile-summary');

        this.profile = savedProfile;

        if (refreshedProfileSummary) {
          this.upsertArtifactRecord(refreshedProfileSummary);

          if (this.activeArtifactId === refreshedProfileSummary.id) {
            this.activeArtifactId = refreshedProfileSummary.id;
          }
        }

        this.profileSaveStatus = 'ready';
        return savedProfile;
      } catch (error) {
        this.profileSaveStatus = 'error';
        this.errorMessage = error instanceof Error ? error.message : 'Unknown profile save error';
        throw error;
      }
    },
    async submitDraftMessage(submission: DraftMessageSubmission | string) {
      const nextSubmission = typeof submission === 'string'
        ? { content: submission, attachments: [] }
        : submission;
      const content = nextSubmission.content.trim();
      const attachments = nextSubmission.attachments;

      if (!this.activeThreadId || (!content && attachments.length === 0)) {
        return;
      }

      if (this.messageSubmitStatus === 'loading') {
        return;
      }

      const targetThreadId = this.activeThreadId;
      const timestamp = formatLocalTimestamp(new Date());
      const pendingMessageId = createMessageId('pending-user');
      const media = attachments
        .filter((attachment) => attachment.kind === 'image')
        .map((attachment) => ({
          id: attachment.id,
          kind: 'image' as const,
          url: attachment.url,
          title: attachment.name,
          alt: `用户上传图片：${attachment.name}`,
          mimeType: attachment.mimeType,
          caption: '正在上传并发送...',
        }));
      const files = attachments
        .filter((attachment) => attachment.kind === 'file')
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        }));

      if (this.messagesStatus !== 'ready') {
        this.messagesStatus = 'ready';
      }
      this.messageSubmitStatus = 'loading';
      this.errorMessage = null;
      this.messages.push({
        id: pendingMessageId,
        threadId: targetThreadId,
        role: 'user',
        kind: 'markdown',
        content: content || '（已添加附件）',
        media: media.length ? media : undefined,
        files: files.length ? files : undefined,
        createdAt: timestamp,
      });

      const reportSubmissionError = (
        stage: 'upload' | 'send' | 'refresh',
        error: unknown,
      ) => {
        if (this.activeThreadId !== targetThreadId) {
          return;
        }

        const rawMessage = error instanceof Error ? error.message : 'Unknown message sending error';
        const stageMessage = stage === 'upload'
          ? '附件上传失败'
          : stage === 'send'
            ? '消息发送失败'
            : '消息已发送，但刷新消息列表失败';

        this.messagesStatus = 'ready';
        this.messageSubmitStatus = 'error';
        this.errorMessage = rawMessage;
        this.messages.push({
          id: createMessageId('send-error'),
          threadId: targetThreadId,
          role: 'system',
          kind: 'status',
          content: `${stageMessage}：${rawMessage}`,
          createdAt: formatLocalTimestamp(new Date()),
        });
      };

      let uploadedFiles;
      try {
        uploadedFiles = await Promise.all(
          attachments.map((attachment) => client.uploadThreadFile(targetThreadId, attachment)),
        );
      } catch (error) {
        reportSubmissionError('upload', error);
        return;
      }

      const clientRequestId = createMessageId('request');
      try {
        const sendResult = await client.sendMessage(targetThreadId, {
          kind: 'markdown',
          content: content || '（已添加附件）',
          attachmentAssetIds: uploadedFiles.map((file) => file.assetId),
          clientRequestId,
        });

        if (!sendResult.accepted || sendResult.status === 'failed') {
          reportSubmissionError(
            'send',
            new Error(!sendResult.accepted ? '消息未被服务端接受' : '消息发送失败'),
          );
          return;
        }
      } catch (error) {
        reportSubmissionError('send', error);
        return;
      }

      let nextMessages;
      try {
        nextMessages = await client.getThreadMessages(targetThreadId);
      } catch (error) {
        reportSubmissionError('refresh', error);
        return;
      }

      if (this.activeThreadId !== targetThreadId) {
        return;
      }

      revokeLocalMessageResources(this.messages);
      this.messages = nextMessages;
      this.messagesStatus = 'ready';
      this.messageSubmitStatus = 'ready';
    },
    closeArtifact() {
      this.artifactPaneOpen = false;
      this.activeArtifactId = null;
      this.artifactViewMode = 'pane';
    },
  },
});
