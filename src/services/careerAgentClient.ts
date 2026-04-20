import type {
  ArtifactRecord,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

export interface CreateThreadInput {
  title?: string;
  preview?: string;
}

export interface CareerAgentClient {
  listThreads(): Promise<ThreadSummary[]>;
  createThread(input?: CreateThreadInput): Promise<ThreadSummary>;
  getThreadMessages(threadId: string): Promise<ThreadMessage[]>;
  getProfile(): Promise<ProfileRecord>;
  updateProfile(profile: ProfileRecord): Promise<ProfileRecord>;
  listProfileSuggestions(): Promise<ProfileSuggestion[]>;
  listArtifacts(): Promise<ArtifactRecord[]>;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
  refreshArtifact(artifactId: string): Promise<ArtifactRecord | null>;
}
