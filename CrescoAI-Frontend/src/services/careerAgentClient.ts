import type {
  ArtifactRecord,
  AskQuestionResponse,
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
import type {
  BaseProfilePatch,
  BaseProfileRecord,
  ProfileChangeProposalRecord,
  ProfileMemoryRecord,
  ProfileRevisionRecord,
  ProfileStateRecord,
  CreateProfileMemoryInput,
  ReplaceProfileMemoryInput,
} from '../modules/profile/profileV2Types';
import type {
  CareerProfileProductView,
  ProfileProductMutationInput,
  ProfileRefreshJob,
  ProfileEvidenceView,
  ProfileEvidenceNavigation,
} from '../modules/profile/profileProductTypes';

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
  respondToInteractiveTool?(
    threadId: string,
    toolUseId: string,
    response: AskQuestionResponse,
  ): Promise<void>;
  streamMessage?(
    threadId: string,
    input: SendThreadMessageInput,
    options?: StreamThreadMessageOptions,
  ): AsyncIterable<ThreadMessageStreamEvent>;
  getProfile(): Promise<ProfileRecord>;
  updateProfile(
    profile: ProfileRecord,
    options?: { suggestionRowId?: number },
  ): Promise<ProfileRecord>;
  listProfileSuggestions(): Promise<ProfileSuggestion[]>;
  getProductProfile?(): Promise<CareerProfileProductView>;
  mutateProductProfile?(input: ProfileProductMutationInput): Promise<CareerProfileProductView>;
  createProfileRefreshJob?(clientRequestId?: string): Promise<ProfileRefreshJob>;
  getCurrentProfileRefreshJob?(): Promise<ProfileRefreshJob | null>;
  getProfileRefreshJob?(jobId: string): Promise<ProfileRefreshJob>;
  getProfileEvidence?(evidenceRef: string): Promise<ProfileEvidenceView>;
  getProfileEvidenceNavigation?(evidenceRef: string): Promise<ProfileEvidenceNavigation>;
  getBaseProfile?(): Promise<BaseProfileRecord>;
  updateBaseProfile?(patch: BaseProfilePatch, expectedVersion: number): Promise<BaseProfileRecord>;
  listProfileMemories?(filters?: Record<string, string>): Promise<ProfileMemoryRecord[]>;
  getProfileState?(): Promise<ProfileStateRecord>;
  createProfileMemory?(input: CreateProfileMemoryInput, expectedVersion: number): Promise<ProfileMemoryRecord>;
  replaceProfileMemory?(profileIndex: string, input: ReplaceProfileMemoryInput, expectedVersion: number): Promise<ProfileMemoryRecord>;
  updateProfileMemory?(id: string, patch: Partial<ProfileMemoryRecord>, expectedVersion: number): Promise<ProfileMemoryRecord>;
  deleteProfileMemory?(id: string, expectedVersion: number): Promise<void>;
  listProfileProposals?(): Promise<ProfileChangeProposalRecord[]>;
  resolveProfileProposal?(id: string, action: 'accept' | 'reject'): Promise<ProfileChangeProposalRecord>;
  listProfileHistory?(): Promise<ProfileRevisionRecord[]>;
  listArtifacts(): Promise<ArtifactRecord[]>;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
  refreshArtifact(artifactId: string): Promise<ArtifactRecord | null>;
}
