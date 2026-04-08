import type {
  ArtifactRecord,
  ProfileRecord,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

export interface CareerAgentClient {
  listThreads(): Promise<ThreadSummary[]>;
  getThreadMessages(threadId: string): Promise<ThreadMessage[]>;
  getProfile(): Promise<ProfileRecord>;
  listArtifacts(): Promise<ArtifactRecord[]>;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
}
