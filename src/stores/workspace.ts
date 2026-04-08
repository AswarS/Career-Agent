import { defineStore } from 'pinia';
import { createMockCareerAgentClient } from '../services/mockCareerAgentClient';
import type {
  ArtifactRecord,
  ProfileRecord,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

const client = createMockCareerAgentClient();

interface WorkspaceState {
  initialized: boolean;
  threads: ThreadSummary[];
  messages: ThreadMessage[];
  profile: ProfileRecord | null;
  artifacts: ArtifactRecord[];
  activeThreadId: string | null;
  activeArtifactId: string | null;
  artifactPaneOpen: boolean;
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

      const [threads, profile, artifacts] = await Promise.all([
        client.listThreads(),
        client.getProfile(),
        client.listArtifacts(),
      ]);

      this.threads = threads;
      this.profile = profile;
      this.artifacts = artifacts;
      this.activeThreadId = threads[0]?.id ?? null;
      this.initialized = true;

      if (this.activeThreadId) {
        this.messages = await client.getThreadMessages(this.activeThreadId);
      }
    },
    async setActiveThread(threadId: string) {
      await this.initialize();
      this.activeThreadId = threadId;
      this.messages = await client.getThreadMessages(threadId);
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
    closeArtifact() {
      this.artifactPaneOpen = false;
      this.activeArtifactId = null;
    },
  },
});
