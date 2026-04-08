import type {
  ArtifactRecord,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

export interface CareerAgentClient {
  listThreads(): Promise<ThreadSummary[]>;
  getThreadMessages(threadId: string): Promise<ThreadMessage[]>;
  getProfile(): Promise<ProfileRecord>;
  updateProfile(profile: ProfileRecord): Promise<ProfileRecord>;
  listProfileSuggestions(): Promise<ProfileSuggestion[]>;
  listArtifacts(): Promise<ArtifactRecord[]>;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
}
