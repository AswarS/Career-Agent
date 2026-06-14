import type {
  ArtifactRecord,
  DraftMessageAttachment,
  ProfileRecord,
  ProfileSuggestion,
  SendThreadMessageInput,
  SendThreadMessageResult,
  ThreadMessageStreamEvent,
  ThreadMessage,
  ThreadSummary,
  UploadedConversationFile,
} from '../types/entities';

export interface CreateThreadInput {
  title?: string;
  preview?: string;
}

export class MessageStreamUnavailableError extends Error {
  constructor(message = 'Streaming message API is unavailable.') {
    super(message);
    this.name = 'MessageStreamUnavailableError';
  }
}

export interface StreamThreadMessageOptions {
  signal?: AbortSignal;
}

export interface CareerAgentClient {
  listThreads(): Promise<ThreadSummary[]>;
  createThread(input?: CreateThreadInput): Promise<ThreadSummary>;
  deleteThread(threadId: string): Promise<void>;
  getThreadMessages(threadId: string): Promise<ThreadMessage[]>;
  uploadThreadFile(threadId: string, attachment: DraftMessageAttachment | File): Promise<UploadedConversationFile>;
  sendMessage(threadId: string, input: SendThreadMessageInput): Promise<SendThreadMessageResult>;
  streamMessage?(
    threadId: string,
    input: SendThreadMessageInput,
    options?: StreamThreadMessageOptions,
  ): AsyncIterable<ThreadMessageStreamEvent>;
  getProfile(): Promise<ProfileRecord>;
  updateProfile(profile: ProfileRecord): Promise<ProfileRecord>;
  listProfileSuggestions(): Promise<ProfileSuggestion[]>;
  listArtifacts(): Promise<ArtifactRecord[]>;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
  refreshArtifact(artifactId: string): Promise<ArtifactRecord | null>;
}
