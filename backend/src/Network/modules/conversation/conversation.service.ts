import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repository } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';
import { ConversationEntity } from './entities/conversation.entity';
import { MessageEntity } from './entities/message.entity';

export interface MessageAction {
  id: string;
  kind: string;
  label: string;
  artifact_id?: string;
  artifactId?: string;
  view_mode?: string;
  viewMode?: string;
}

export interface MessageMedia {
  id: string;
  kind: 'image' | 'video' | 'file';
  url: string;
  title?: string;
  caption?: string;
  alt?: string;
  mime_type?: string;
  mimeType?: string;
  storage_path?: string;
  storagePath?: string;
  size_bytes?: number;
  sizeBytes?: number;
  created_at?: string;
  createdAt?: string;
}

export interface ConversationMessage {
  id: string;
  thread_id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  kind: string;
  content: string;
  reasoning?: string;
  agent_id?: string;
  agentId?: string;
  agent_name?: string;
  agentName?: string;
  agent_accent?: string;
  agentAccent?: string;
  actions?: MessageAction[];
  media?: MessageMedia[];
  attachments?: MessageMedia[];
  client_request_id?: string;
  clientRequestId?: string;
  created_at: string;
  createdAt: string;
}

export interface UploadedConversationFile {
  asset_id: string;
  assetId: string;
  kind: 'image' | 'video' | 'file';
  url: string;
  title: string;
  mime_type: string;
  mimeType: string;
  size_bytes: number;
  sizeBytes: number;
  created_at: string;
  createdAt: string;
  storage_path: string;
  storagePath: string;
  stored_file_name: string;
  storedFileName: string;
  original_name: string;
  originalName: string;
}

interface RuntimeJsonlEvent {
  type?: string;
  uuid?: string;
  timestamp?: string;
  promptId?: string;
  sessionId?: string;
  toolUseResult?: unknown;
  message?: {
    id?: string;
    role?: 'user' | 'assistant' | 'system';
    content?: unknown;
  };
}

const networkRootDir = fileURLToPath(new URL('../../', import.meta.url));
const userDataRootDir = join(networkRootDir, 'user');
const conversationFilesRootDir = join(networkRootDir, 'files');
const maxUploadBytes = 20 * 1024 * 1024;
const manifestFileName = '_manifest.json';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageResourceRepo: Repository<MessageEntity>,
    private readonly agentService: AgentService,
  ) {}

  async createConversation(dto: CreateConversationDto) {
    const now = new Date();
    const userId = dto.userId ?? 1;
    const agentConversation = await this.agentService.createConversation({
      userId: String(userId),
      title: dto.title,
      preview: dto.preview,
    });

    const conversation = this.conversationRepo.create({
      id: agentConversation.conversationId,
      userId,
      title: agentConversation.title,
      preview: agentConversation.preview,
      status: agentConversation.status,
      createdAt: new Date(agentConversation.createdAt),
      updatedAt: dto.updatedAt ?? new Date(agentConversation.updatedAt),
    });
    const savedConversation = await this.conversationRepo.save(conversation);

    await this.ensureConversationFileManifest(
      savedConversation.userId,
      savedConversation.id,
    );

    return this.toThreadSummary(savedConversation);
  }

  async listConversations(uid: number) {
    const conversations = await this.conversationRepo.find({
      where: { userId: uid },
      order: { updatedAt: 'DESC' },
    });

    return conversations.map((conversation) => this.toThreadSummary(conversation));
  }

  async listMessages(conversationId: string) {
    const conversation = await this.getConversationByIdentifier(conversationId);
    return this.readRuntimeSessionMessages(conversation.id);
  }

  async uploadConversationFile(
    conversationId: string,
    file: Express.Multer.File,
  ) {
    const conversation = await this.getConversationByIdentifier(conversationId);

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (file.size > maxUploadBytes) {
      throw new BadRequestException('file is too large');
    }
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
    const originalName = file.originalname;
    const mimeType = file.mimetype || 'application/octet-stream';
    const extension = extname(originalName);
    const storedFileName = `${Date.now()}-${randomUUID()}${extension}`;
    const conversationDir = this.getConversationFilesDirectory(
      conversation.userId,
      conversation.id,
    );
    const absolutePath = join(conversationDir, storedFileName);
    const relativePath = this.toPublicFilePath(conversation.id, storedFileName);
    const createdAt = new Date().toISOString();

    this.resolveAssetKind(mimeType);
    await mkdir(conversationDir, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const fileStats = await stat(absolutePath);
    const assetId = `asset-${randomUUID()}`;
    const uploadedFile: UploadedConversationFile = {
      asset_id: assetId,
      assetId,
      kind: this.resolveAssetKind(mimeType),
      url: relativePath,
      title: file.originalname,
      mime_type: mimeType,
      mimeType,
      size_bytes: fileStats.size,
      sizeBytes: fileStats.size,
      created_at: createdAt,
      createdAt,
      storage_path: relativePath,
      storagePath: relativePath,
      stored_file_name: storedFileName,
      storedFileName: storedFileName,
      original_name: originalName,
      originalName: originalName,
    };

    const manifest = await this.readConversationFileManifest(
      conversation.userId,
      conversation.id,
    );
    manifest.push(uploadedFile);
    await this.writeConversationFileManifest(
      conversation.userId,
      conversation.id,
      manifest,
    );
    await this.touchConversation(conversation, `Uploaded file: ${originalName}`);

    return uploadedFile;
  }

  async getConversationFile(conversationId: string, fileName: string) {
    const conversation = await this.getConversationByIdentifier(conversationId);
    const manifest = await this.readConversationFileManifest(
      conversation.userId,
      conversation.id,
    );
    const asset = manifest.find(
      (entry) =>
        entry.stored_file_name === fileName || entry.storedFileName === fileName,
    );

    if (!asset) {
      throw new NotFoundException(`File ${fileName} not found`);
    }

    return {
      asset,
      absolutePath: join(
        this.getConversationFilesDirectory(conversation.userId, conversation.id),
        fileName,
      ),
    };
  }

  async sendMessage(conversationId: string, dto: SendMultimodalMessageDto) {
    const conversation = await this.getConversationByIdentifier(conversationId);
    const attachmentIds = dto.attachment_asset_ids ?? dto.attachmentAssetIds ?? [];
    const attachments = await this.resolveAttachments(conversation.id, attachmentIds);
    const agentResponse = await this.agentService.sendMessage({
      conversationId: conversation.id,
      userId: String(conversation.userId),
      content: dto.content,
      kind: dto.kind,
      attachments: attachments.map((attachment) => ({
        assetId: attachment.id,
        path: attachment.storage_path ?? attachment.storagePath ?? attachment.url,
        title: attachment.title,
        mimeType: attachment.mime_type ?? attachment.mimeType,
      })),
      context: dto.context,
      clientRequestId: dto.client_request_id ?? dto.clientRequestId,
    });

    await this.replaceMessageResourceMappings(
      conversation.id,
      agentResponse.userMessageId,
      attachments,
    );

    const replyFiles = this.normalizeReplyFiles(agentResponse.file);
    await this.replaceMessageResourceMappings(
      conversation.id,
      agentResponse.assistantMessageId,
      replyFiles,
    );
    await this.touchConversation(conversation, dto.content);

    return {
      accepted: agentResponse.accepted,
      status: agentResponse.status,
      conversation_id: agentResponse.conversationId,
      conversationId: agentResponse.conversationId,
      message_id: agentResponse.userMessageId,
      messageId: agentResponse.userMessageId,
      assistant_message_id: agentResponse.assistantMessageId,
      assistantMessageId: agentResponse.assistantMessageId,
      reply: agentResponse.reply,
      file: agentResponse.file,
      raw: agentResponse.raw,
    };
  }

  private async getConversationByIdentifier(identifier: string) {
    const byAgentId = await this.conversationRepo.findOne({ where: { id: identifier } });
    if (byAgentId) {
      return byAgentId;
    }

    const numericId = Number(identifier);
    if (Number.isInteger(numericId)) {
      const byCid = await this.conversationRepo.findOne({ where: { cid: numericId } });
      if (byCid) {
        return byCid;
      }
    }

    throw new NotFoundException(`Conversation ${identifier} not found`);
  }

  private toThreadSummary(conversation: ConversationEntity) {
    const updatedAt = this.toIsoString(conversation.updatedAt);

    return {
      id: conversation.id,
      cid: conversation.cid,
      title: conversation.title ?? 'New Conversation',
      preview: conversation.preview ?? '',
      status: conversation.status ?? 'active',
      updated_at: updatedAt,
      updatedAt,
    };
  }

  private async touchConversation(
    conversation: ConversationEntity,
    contentPreview: string,
  ) {
    conversation.preview = contentPreview.slice(0, 120);
    conversation.updatedAt = new Date();

    if (!conversation.title?.trim()) {
      conversation.title = contentPreview.slice(0, 20) || 'New Conversation';
    }

    await this.conversationRepo.save(conversation);
  }

  private async resolveAttachments(
    conversationId: string,
    assetIds: string[],
  ): Promise<MessageMedia[]> {
    const attachments: MessageMedia[] = [];
    const conversation = await this.getConversationByIdentifier(conversationId)
    for (const assetId of assetIds) {
      const asset = await this.getConversationAsset(conversation, assetId);
      attachments.push(this.toMessageMedia(asset));
    }

    return attachments;
  }

  private toMessageMedia(asset: UploadedConversationFile): MessageMedia {
    return {
      id: asset.asset_id,
      kind: asset.kind,
      url: asset.url,
      title: asset.title,
      mime_type: asset.mime_type,
      mimeType: asset.mimeType,
      storage_path: asset.storage_path,
      storagePath: asset.storagePath,
      size_bytes: asset.size_bytes,
      sizeBytes: asset.sizeBytes,
      created_at: asset.created_at,
      createdAt: asset.createdAt,
    };
  }

  private normalizeReplyFiles(fileField: unknown): MessageMedia[] {
    if (!fileField) {
      return [];
    }

    const items = Array.isArray(fileField) ? fileField : [fileField];
    const normalized: MessageMedia[] = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }

      const typedItem = item as Record<string, unknown>;
      const id =
        typeof typedItem.assetId === 'string'
          ? typedItem.assetId
          : typeof typedItem.id === 'string'
            ? typedItem.id
            : `asset-${randomUUID()}`;
      const path =
        typeof typedItem.path === 'string'
          ? typedItem.path
          : typeof typedItem.url === 'string'
            ? typedItem.url
            : undefined;

      if (!path) {
        continue;
      }

      normalized.push({
        id,
        kind:
          typedItem.kind === 'image' ||
          typedItem.kind === 'video' ||
          typedItem.kind === 'file'
            ? typedItem.kind
            : 'file',
        url: path,
        title: typeof typedItem.title === 'string' ? typedItem.title : undefined,
        mime_type:
          typeof typedItem.mimeType === 'string'
            ? typedItem.mimeType
            : typeof typedItem.mime_type === 'string'
              ? typedItem.mime_type
              : undefined,
        storage_path: path,
        size_bytes:
          typeof typedItem.sizeBytes === 'number'
            ? typedItem.sizeBytes
            : typeof typedItem.size_bytes === 'number'
              ? typedItem.size_bytes
              : undefined,
        created_at: new Date().toISOString(),
      });
    }

    return normalized;
  }

  private async getConversationAsset(
    conversation: ConversationEntity,
    assetId: string,
  ): Promise<UploadedConversationFile> {
    const manifest = await this.readConversationFileManifest(
      conversation.userId,
      conversation.id,
    );
    const asset = manifest.find(
      (entry) => entry.asset_id === assetId || entry.assetId === assetId,
    );

    if (!asset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    return asset;
  }

  private getConversationFilesDirectory(userId: number, conversationId: string) {
    return join(conversationFilesRootDir, String(userId), conversationId);
  }

  private getConversationManifestPath(userId: number, conversationId: string) {
    return join(
      this.getConversationFilesDirectory(userId, conversationId),
      manifestFileName,
    );
  }

  private async readRuntimeSessionMessages(
    sessionId: string,
  ): Promise<ConversationMessage[]> {
    const sessionFilePath = await this.findRuntimeSessionFile(sessionId);
    const rawContent = await readFile(sessionFilePath, 'utf8');
    const lines = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const messageOrder: string[] = [];
    const messageMap = new Map<string, ConversationMessage>();
    const mediaByMessageId = await this.getMessageResourceMappings(sessionId);

    for (const line of lines) {
      const event = JSON.parse(line) as RuntimeJsonlEvent;
      this.consumeRuntimeEvent(event, sessionId, messageMap, messageOrder);
    }

    return messageOrder
      .map((id) => {
        const message = messageMap.get(id);
        if (!message) {
          return null;
        }
        const media = mediaByMessageId.get(id) ?? [];
        return {
          ...message,
          media: media.length ? media : undefined,
          attachments: media.length ? media : undefined,
        };
      })
      .filter((message): message is ConversationMessage => Boolean(message));
  }

  private consumeRuntimeEvent(
    event: RuntimeJsonlEvent,
    sessionId: string,
    messageMap: Map<string, ConversationMessage>,
    messageOrder: string[],
  ) {
    if (event.type === 'user') {
      const normalized = this.normalizeRuntimeUserEvent(event, sessionId);
      if (normalized) {
        this.upsertRuntimeMessage(normalized, messageMap, messageOrder);
      }
      return;
    }

    if (event.type === 'assistant') {
      const normalized = this.normalizeRuntimeAssistantEvent(event, sessionId);
      if (normalized) {
        this.upsertRuntimeMessage(normalized, messageMap, messageOrder);
      }
    }
  }

  private normalizeRuntimeUserEvent(
    event: RuntimeJsonlEvent,
    sessionId: string,
  ): ConversationMessage | null {
    const role = event.message?.role;
    const createdAt = event.timestamp ?? new Date().toISOString();

    if (role !== 'user') {
      return null;
    }

    const content = event.message?.content;

    if (typeof content === 'string') {
      return {
        id:
          event.message?.id ??
          event.uuid ??
          event.promptId ??
          `user-${randomUUID()}`,
        thread_id: sessionId,
        threadId: sessionId,
        role: 'user',
        kind: 'markdown',
        content,
        created_at: createdAt,
        createdAt,
      };
    }

    if (Array.isArray(content)) {
      const toolResultTexts = content
        .map((item) => {
          if (typeof item !== 'object' || item === null) {
            return null;
          }
          const typedItem = item as Record<string, unknown>;
          return typeof typedItem.content === 'string' ? typedItem.content : null;
        })
        .filter((item): item is string => Boolean(item));

      if (!toolResultTexts.length) {
        return null;
      }

      return {
        id:
          event.message?.id ??
          event.uuid ??
          event.promptId ??
          `tool-result-${randomUUID()}`,
        thread_id: sessionId,
        threadId: sessionId,
        role: 'system',
        kind: 'status',
        content: toolResultTexts.join('\n'),
        created_at: createdAt,
        createdAt,
      };
    }

    return null;
  }

  private normalizeRuntimeAssistantEvent(
    event: RuntimeJsonlEvent,
    sessionId: string,
  ): ConversationMessage | null {
    const assistantMessageId = event.message?.id ?? event.uuid;
    const createdAt = event.timestamp ?? new Date().toISOString();

    if (!assistantMessageId || event.message?.role !== 'assistant') {
      return null;
    }

    const contentBlocks = Array.isArray(event.message?.content)
      ? event.message.content
      : [];
    const textParts: string[] = [];
    const reasoningParts: string[] = [];

    for (const block of contentBlocks) {
      if (typeof block !== 'object' || block === null) {
        continue;
      }

      const typedBlock = block as Record<string, unknown>;
      if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
        textParts.push(typedBlock.text);
      }

      if (typedBlock.type === 'thinking' && typeof typedBlock.thinking === 'string') {
        reasoningParts.push(typedBlock.thinking);
      }

      if (typedBlock.type === 'tool_use') {
        const toolName = typeof typedBlock.name === 'string' ? typedBlock.name : 'tool';
        textParts.push(`[Tool Use] ${toolName}`);
      }
    }

    const content = textParts.join('\n').trim();
    const reasoning = reasoningParts.join('\n').trim();

    if (!content && !reasoning) {
      return null;
    }

    return {
      id: assistantMessageId,
      thread_id: sessionId,
      threadId: sessionId,
      role: 'assistant',
      kind: content ? 'markdown' : 'status',
      content: content || 'Assistant is thinking...',
      reasoning: reasoning || undefined,
      created_at: createdAt,
      createdAt,
    };
  }

  private upsertRuntimeMessage(
    message: ConversationMessage,
    messageMap: Map<string, ConversationMessage>,
    messageOrder: string[],
  ) {
    const existing = messageMap.get(message.id);

    if (!existing) {
      messageMap.set(message.id, message);
      messageOrder.push(message.id);
      return;
    }

    messageMap.set(message.id, {
      ...existing,
      content:
        message.content && message.content !== 'Assistant is thinking...'
          ? message.content
          : existing.content,
      reasoning: message.reasoning ?? existing.reasoning,
      kind: message.kind === 'markdown' ? 'markdown' : existing.kind,
      created_at: existing.created_at,
      createdAt: existing.createdAt,
    });
  }

  private async findRuntimeSessionFile(sessionId: string) {
    const userDirs = await readdir(userDataRootDir, { withFileTypes: true });

    for (const dir of userDirs) {
      if (!dir.isDirectory()) {
        continue;
      }

      const candidate = join(userDataRootDir, dir.name, `${sessionId}.jsonl`);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    throw new NotFoundException(`Runtime session ${sessionId} not found`);
  }

  private async ensureConversationFileManifest(
    userId: number,
    conversationId: string,
  ) {
    const manifestPath = this.getConversationManifestPath(userId, conversationId);
    const conversationDir = this.getConversationFilesDirectory(userId, conversationId);

    await mkdir(conversationDir, { recursive: true });

    try {
      await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (!this.isEnoent(error)) {
        throw error;
      }

      await writeFile(manifestPath, '[]\n', 'utf8');
    }
  }

  private async readConversationFileManifest(
    userId: number,
    conversationId: string,
  ): Promise<UploadedConversationFile[]> {
    const manifestPath = this.getConversationManifestPath(userId, conversationId);
    await this.ensureConversationFileManifest(userId, conversationId);

    const rawContent = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(rawContent) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`Conversation file manifest is invalid: ${manifestPath}`);
    }

    return parsed as UploadedConversationFile[];
  }

  private async writeConversationFileManifest(
    userId: number,
    conversationId: string,
    assets: UploadedConversationFile[],
  ) {
    const manifestPath = this.getConversationManifestPath(userId, conversationId);
    await this.ensureConversationFileManifest(userId, conversationId);
    await writeFile(manifestPath, JSON.stringify(assets, null, 2) + '\n', 'utf8');
  }

  private async getMessageResourceMappings(conversationId: string) {
    const rows = await this.messageResourceRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const mapping = new Map<string, MessageMedia[]>();

    for (const row of rows) {
      if (!row.messageId || !row.resourceId || !row.resourcePath || !row.resourceKind) {
        continue;
      }

      const existing = mapping.get(row.messageId) ?? [];
      existing.push({
        id: row.resourceId,
        kind: row.resourceKind as MessageMedia['kind'],
        url: row.resourcePath,
        title: row.title,
        mime_type: row.mimeType,
        mimeType: row.mimeType,
        storage_path: row.resourcePath,
        storagePath: row.resourcePath,
        size_bytes: row.sizeBytes,
        sizeBytes: row.sizeBytes,
        created_at: row.createdAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      });
      mapping.set(row.messageId, existing);
    }

    return mapping;
  }

  private async replaceMessageResourceMappings(
    conversationId: string,
    messageId: string,
    resources: MessageMedia[],
  ) {
    await this.messageResourceRepo.delete({ conversationId, messageId });

    if (!resources.length) {
      return;
    }

    const rows = resources.map((resource) =>
      this.messageResourceRepo.create({
        messageId,
        conversationId,
        resourceId: resource.id,
        resourceKind: resource.kind,
        resourcePath: resource.storage_path ?? resource.storagePath ?? resource.url,
        mimeType: resource.mime_type ?? resource.mimeType,
        title: resource.title,
        sizeBytes: resource.size_bytes ?? resource.sizeBytes,
        createdAt: new Date(
          resource.created_at ?? resource.createdAt ?? new Date().toISOString(),
        ),
      }),
    );

    await this.messageResourceRepo.save(rows);
  }

  private sanitizeFileName(fileName: string) {
    const cleaned = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned || `upload-${Date.now()}.bin`;
  }

  private resolveAssetKind(mimeType: string): 'image' | 'video' | 'file' {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }

    if (mimeType.startsWith('video/')) {
      return 'video';
    }

    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/pdf' ||
      mimeType.includes('json') ||
      mimeType.includes('word') ||
      mimeType.includes('sheet') ||
      mimeType.includes('presentation') ||
      mimeType.includes('zip') ||
      mimeType === 'application/octet-stream'
    ) {
      return 'file';
    }

    throw new UnsupportedMediaTypeException(`Unsupported mime type: ${mimeType}`);
  }

  private toPublicFilePath(conversationId: string, storedFileName: string) {
    return `/api/career-agent/threads/${conversationId}/files/${storedFileName}`;
  }

  private isEnoent(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }

  private toIsoString(value: string | Date | undefined) {
    if (!value) {
      return new Date().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
