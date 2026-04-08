import { defineStore } from 'pinia';
import { createMockCareerAgentClient } from '../services/mockCareerAgentClient';
import type {
  ArtifactRecord,
  LoadState,
  ProfileRecord,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

const client = createMockCareerAgentClient();
let initializePromise: Promise<void> | null = null;
let threadLoadRequestToken = 0;

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

interface WorkspaceState {
  initialized: boolean;
  threads: ThreadSummary[];
  messages: ThreadMessage[];
  profile: ProfileRecord | null;
  artifacts: ArtifactRecord[];
  activeThreadId: string | null;
  activeArtifactId: string | null;
  artifactPaneOpen: boolean;
  threadsStatus: LoadState;
  messagesStatus: LoadState;
  profileStatus: LoadState;
  artifactsStatus: LoadState;
  errorMessage: string | null;
}

export const useWorkspaceStore = defineStore('workspace', {
  state: (): WorkspaceState => ({
    initialized: false,
    threads: [],
    messages: [],
    profile: null,
    artifacts: [],
    activeThreadId: null,
    activeArtifactId: null,
    artifactPaneOpen: false,
    threadsStatus: 'idle',
    messagesStatus: 'idle',
    profileStatus: 'idle',
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
  },
  actions: {
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
        this.artifactsStatus = 'loading';
        this.errorMessage = null;

        try {
          const [threads, profile, artifacts] = await Promise.all([
            client.listThreads(),
            client.getProfile(),
            client.listArtifacts(),
          ]);

          this.threads = threads;
          this.profile = profile;
          this.artifacts = artifacts;
          this.activeThreadId ??= threads[0]?.id ?? null;
          this.initialized = true;

          this.threadsStatus = 'ready';
          this.profileStatus = 'ready';
          this.artifactsStatus = 'ready';
          this.messagesStatus = 'idle';
        } catch (error) {
          this.threadsStatus = 'error';
          this.profileStatus = 'error';
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
        return;
      }

      const requestToken = ++threadLoadRequestToken;

      this.activeThreadId = threadId;
      this.messagesStatus = 'loading';
      this.errorMessage = null;
      this.messages = [];

      await this.initialize();

      if (!this.initialized || requestToken !== threadLoadRequestToken || this.activeThreadId !== threadId) {
        return;
      }

      try {
        const nextMessages = await client.getThreadMessages(threadId);

        if (requestToken !== threadLoadRequestToken || this.activeThreadId !== threadId) {
          return;
        }

        this.messages = nextMessages;
        this.messagesStatus = 'ready';
      } catch (error) {
        if (requestToken !== threadLoadRequestToken || this.activeThreadId !== threadId) {
          return;
        }

        this.messages = [];
        this.messagesStatus = 'error';
        this.errorMessage = error instanceof Error ? error.message : 'Unknown message loading error';
      }
    },
    async openArtifact(artifactId: string) {
      await this.initialize();

      const artifact = await client.getArtifact(artifactId);

      if (!artifact) {
        return;
      }

      const artifactIndex = this.artifacts.findIndex((item) => item.id === artifact.id);

      if (artifactIndex >= 0) {
        this.artifacts[artifactIndex] = artifact;
      } else {
        this.artifacts.push(artifact);
      }

      this.activeArtifactId = artifact.id;
      this.artifactPaneOpen = true;
    },
    submitDraftMessage(content: string) {
      if (!this.activeThreadId || !content.trim()) {
        return;
      }

      const timestamp = formatLocalTimestamp(new Date());

      this.messages.push({
        id: createMessageId('local-user'),
        threadId: this.activeThreadId,
        role: 'user',
        kind: 'markdown',
        content,
        createdAt: timestamp,
      });

      this.messages.push({
        id: createMessageId('local-system'),
        threadId: this.activeThreadId,
        role: 'system',
        kind: 'status',
        content: 'Upstream send path is not connected yet. This turn is stored locally to validate frontend composer and message rendering.',
        createdAt: timestamp,
      });
    },
    closeArtifact() {
      this.artifactPaneOpen = false;
      this.activeArtifactId = null;
    },
  },
});
