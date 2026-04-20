import { defineStore } from 'pinia';
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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
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
  artifactPaneOpen: boolean;
  artifactViewMode: ArtifactViewMode;
  threadsStatus: LoadState;
  threadCreateStatus: LoadState;
  messagesStatus: LoadState;
  profileStatus: LoadState;
  profileSuggestionsStatus: LoadState;
  profileSaveStatus: LoadState;
  artifactsStatus: LoadState;
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
    artifactPaneOpen: false,
    artifactViewMode: 'pane',
    threadsStatus: 'idle',
    threadCreateStatus: 'idle',
    messagesStatus: 'idle',
    profileStatus: 'idle',
    profileSuggestionsStatus: 'idle',
    profileSaveStatus: 'idle',
    artifactsStatus: 'idle',
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
    async createThread() {
      await this.initialize();

      if (!this.initialized) {
        throw new Error(this.errorMessage ?? 'Workspace is not initialized.');
      }

      this.threadCreateStatus = 'loading';
      this.errorMessage = null;

      try {
        const nextThread = await client.createThread({
          title: '新对话',
          preview: '',
        });

        this.threads = [
          nextThread,
          ...this.threads.filter((thread) => thread.id !== nextThread.id),
        ];
        this.activeThreadId = nextThread.id;
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
    async openArtifact(artifactId: string, viewMode: ArtifactViewMode = 'pane') {
      await this.initialize();

      const artifact = await client.getArtifact(artifactId);

      if (!artifact) {
        return;
      }

      this.upsertArtifactRecord(artifact);

      this.activeArtifactId = artifact.id;
      this.artifactPaneOpen = true;
      this.artifactViewMode = viewMode;
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
    submitDraftMessage(submission: DraftMessageSubmission | string) {
      const nextSubmission = typeof submission === 'string'
        ? { content: submission, attachments: [] }
        : submission;
      const content = nextSubmission.content.trim();
      const attachments = nextSubmission.attachments;

      if (!this.activeThreadId || (!content && attachments.length === 0)) {
        return;
      }

      const timestamp = formatLocalTimestamp(new Date());
      const media = attachments
        .filter((attachment) => attachment.kind === 'image')
        .map((attachment) => ({
          id: attachment.id,
          kind: 'image' as const,
          url: attachment.url,
          title: attachment.name,
          alt: `用户上传图片：${attachment.name}`,
          mimeType: attachment.mimeType,
          caption: '本地待上传图片；当前仅用于前端预览，尚未上传到服务端。',
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

      this.messages.push({
        id: createMessageId('local-user'),
        threadId: this.activeThreadId,
        role: 'user',
        kind: 'markdown',
        content: content || '（已添加附件）',
        media: media.length ? media : undefined,
        files: files.length ? files : undefined,
        createdAt: timestamp,
      });

      this.messages.push({
        id: createMessageId('local-system'),
        threadId: this.activeThreadId,
        role: 'system',
        kind: 'status',
        content: attachments.length
          ? '上游发送链路和真实上传接口尚未接通。当前消息与附件仅保存在本地，用于验证前端输入区、附件预览和消息渲染流程。'
          : '上游发送链路尚未接通。当前消息仅保存在本地，用于验证前端输入区和消息渲染流程。',
        createdAt: timestamp,
      });
    },
    closeArtifact() {
      this.artifactPaneOpen = false;
      this.activeArtifactId = null;
      this.artifactViewMode = 'pane';
    },
  },
});
