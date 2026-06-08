import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { TextDecoder } from 'node:util';
import { detectOutputType } from '../../utils/detectOutputType.js';
import { skillLogger } from '../../utils/skillLogger.js';
import { fileURLToPath } from 'node:url';
import { Repository } from 'typeorm';
import { AgentService } from '../agent/agent.service';
import { SkillService } from '../skill/skill.service';
import { ArtifactService } from '../artifact/artifact.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMultimodalMessageDto } from './dto/send-multimodal-message.dto';
import { ConversationEntity } from './entities/conversation.entity';
import { ResourceEntity } from '../resource/entities/resource.entity';
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

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
  kind: 'image' | 'video' | 'html' | 'app' | 'file';
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
  kind: 'image' | 'video' | 'html' | 'app' | 'file';
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
    actions?: MessageAction[];
  };
}

const networkRootDir = fileURLToPath(new URL('../../', import.meta.url));
const userDataRootDir = join(networkRootDir, 'user');
const conversationFilesRootDir = join(networkRootDir, 'files');
const maxUploadBytes = 20 * 1024 * 1024;
const manifestFileName = '_manifest.json';
const maxInjectedTextChars = 20_000;

type SupportedUploadKind = 'image' | 'video' | 'text';

interface UploadPolicy {
  kind: SupportedUploadKind;
  extension: string;
  allowedMimeTypes: readonly string[];
  maxBytes: number;
}

interface PreparedAttachmentPayload {
  content: string;
  attachmentsForAgent: Array<{
    assetId: string;
    path: string;
    title?: string;
    mimeType?: string;
  }>;
}

const uploadPolicies: Record<string, UploadPolicy> = {
  '.png': {
    kind: 'image',
    extension: '.png',
    allowedMimeTypes: ['image/png'],
    maxBytes: maxUploadBytes,
  },
  '.jpg': {
    kind: 'image',
    extension: '.jpg',
    allowedMimeTypes: ['image/jpeg'],
    maxBytes: maxUploadBytes,
  },
  '.jpeg': {
    kind: 'image',
    extension: '.jpeg',
    allowedMimeTypes: ['image/jpeg'],
    maxBytes: maxUploadBytes,
  },
  '.webp': {
    kind: 'image',
    extension: '.webp',
    allowedMimeTypes: ['image/webp'],
    maxBytes: maxUploadBytes,
  },
  '.gif': {
    kind: 'image',
    extension: '.gif',
    allowedMimeTypes: ['image/gif'],
    maxBytes: maxUploadBytes,
  },
  '.mp4': {
    kind: 'video',
    extension: '.mp4',
    allowedMimeTypes: ['video/mp4'],
    maxBytes: maxUploadBytes,
  },
  '.txt': {
    kind: 'text',
    extension: '.txt',
    allowedMimeTypes: ['text/plain'],
    maxBytes: maxUploadBytes,
  },
  '.md': {
    kind: 'text',
    extension: '.md',
    allowedMimeTypes: ['text/markdown', 'text/plain'],
    maxBytes: maxUploadBytes,
  },
  '.pdf': {
    kind: 'text',
    extension: '.pdf',
    allowedMimeTypes: ['application/pdf'],
    maxBytes: maxUploadBytes,
  },
};

const genericUploadMimeTypes = new Set(['application/octet-stream', '']);

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepo: Repository<ConversationEntity>,
    @InjectRepository(ResourceEntity)
    private readonly messageResourceRepo: Repository<ResourceEntity>,
    private readonly agentService: AgentService,
    private readonly skillService: SkillService,
    private readonly artifactService: ArtifactService,
  ) {}

  async createConversation(dto: CreateConversationDto, requestUserId?: number) {
    const now = new Date();
    const userId = requestUserId ?? dto.userId ?? 1;
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

  async listConversations(userId: number) {
    const conversations = await this.conversationRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    return conversations.map((conversation) => this.toThreadSummary(conversation));
  }

  async listMessages(conversationId: string, requestUserId?: number) {
    const conversation = await this.getConversationByIdentifier(conversationId, requestUserId);
    return this.readRuntimeSessionMessages(conversation.id, conversation.userId);
  }

  async uploadConversationFile(
    conversationId: string,
    file: Express.Multer.File,
    requestUserId?: number,
  ) {
    const conversation = await this.getConversationByIdentifier(conversationId, requestUserId);

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (file.size > maxUploadBytes) {
      throw new BadRequestException('file is too large');
    }
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalName = file.originalname;
    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    const validation = this.validateUpload(file, originalName, mimeType);
    const extension = validation.policy.extension;
    const storedFileName = `${Date.now()}-${randomUUID()}${extension}`;
    const conversationDir = this.getConversationFilesDirectory(
      conversation.userId,
      conversation.id,
    );
    const absolutePath = join(conversationDir, storedFileName);
    const relativePath = this.toLocalFilePath(conversation.id, storedFileName, conversation.userId);
    const url = this.toPublicFilePath(conversation.id, storedFileName);
    const createdAt = new Date().toISOString();

    await mkdir(conversationDir, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const fileStats = await stat(absolutePath);
    const assetId = `asset-${randomUUID()}`;
    const uploadedFile: UploadedConversationFile = {
      asset_id: assetId,
      assetId,
      kind: this.resolveAssetKind(validation.policy.kind),
      url: url,
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

  async getConversationFile(conversationId: string, fileName: string, requestUserId?: number) {
    const conversation = await this.getConversationByIdentifier(conversationId, requestUserId);
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

  async sendMessage(conversationId: string, dto: SendMultimodalMessageDto, requestUserId?: number) {
    const conversation = await this.getConversationByIdentifier(conversationId, requestUserId);
    const attachmentIds = dto.attachment_asset_ids ?? dto.attachmentAssetIds ?? [];
    let attachments = await this.resolveAttachments(conversation.id, attachmentIds);
    if (attachments.length === 0) {
      attachments = await this.resolveImplicitAttachments(conversation, dto.content);
    }

    const createSkillCommand = this.parseCreateSkillCommand(dto.content);
    if (createSkillCommand) {
      const created = await this.skillService.createCustomSkill(
        conversation.userId,
        createSkillCommand.name,
        createSkillCommand.description,
        createSkillCommand.content,
        createSkillCommand.category,
        createSkillCommand.arguments,
      );

      const reply =
        `Skill \`/${created.name}\` created successfully.\n\n` +
        `You can now invoke it with \`/${created.name}\`.\n` +
        `Stored at: ${created.filePath}`;

      const userMessageId = `msg_user_skill_${Date.now()}`;
      const assistantMessageId = `msg_assistant_skill_${Date.now()}`;
      const now = new Date();
      const sessionFilePath = await this.findOrCreateRuntimeSessionFile(
        conversation.id,
        conversation.userId,
      );

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'user', message: { id: userMessageId, role: 'user', content: dto.content }, uuid: randomUUID(), timestamp: now.toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );
      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'assistant', message: { id: assistantMessageId, role: 'assistant', content: [{ type: 'text', text: reply }] }, uuid: randomUUID(), timestamp: new Date(now.getTime() + 100).toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );
      await this.touchConversation(conversation, dto.content);

      return {
        accepted: true,
        status: 'done',
        conversation_id: conversation.id,
        conversationId: conversation.id,
        message_id: userMessageId,
        messageId: userMessageId,
        assistant_message_id: assistantMessageId,
        assistantMessageId: assistantMessageId,
        reply,
        raw: { source: 'skill:create', skillName: created.name, filePath: created.filePath },
      };
    }

    const skillInvocation = this.skillService.parseSkillInvocation(dto.content);
    if (skillInvocation && skillInvocation.skillName === 'skills') {
      const skills = await this.skillService.listSkills(conversation.userId);
      const byCategory = new Map<string, typeof skills>();
      for (const s of skills) {
        const cat = (s.category as string | undefined) ?? 'utility';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(s);
      }

      const sections: string[] = ['**Available Skills**\n'];
      const categoryLabels: Record<string, string> = {
        search: '🔍 Search',
        analysis: '🔬 Analysis',
        generation: '🎨 Generation',
        utility: '🛠 Utility',
      };

      for (const [cat, items] of byCategory) {
        const label = categoryLabels[cat] ?? cat;
        sections.push(`**${label}**`);
        for (const s of items) {
          const params = s.parameters as Array<{ name: string }> | undefined;
          const paramHint = params?.length
            ? ` — params: ${params.map((p) => p.name).join(', ')}`
            : '';
          sections.push(`- \`/${s.name}\` — ${s.description}${paramHint}`);
        }
        sections.push('');
      }

      sections.push('Type `/help` for usage information.');
      const reply = sections.join('\n');

      const userMessageId = `msg_user_skill_${Date.now()}`;
      const assistantMessageId = `msg_assistant_skill_${Date.now()}`;
      const now = new Date();
      const sessionFilePath = await this.findOrCreateRuntimeSessionFile(conversation.id, conversation.userId);

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'user', message: { id: userMessageId, role: 'user', content: dto.content }, uuid: randomUUID(), timestamp: now.toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );
      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'assistant', message: { id: assistantMessageId, role: 'assistant', content: [{ type: 'text', text: reply }] }, uuid: randomUUID(), timestamp: new Date(now.getTime() + 100).toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );
      await this.touchConversation(conversation, dto.content);

      return {
        accepted: true,
        status: 'done',
        conversation_id: conversation.id,
        conversationId: conversation.id,
        message_id: userMessageId,
        messageId: userMessageId,
        assistant_message_id: assistantMessageId,
        assistantMessageId: assistantMessageId,
        reply,
        raw: { source: 'skill-list', skillCount: skills.length },
      };
    }

    if (skillInvocation && await this.skillService.skillExists(skillInvocation.skillName, conversation.userId)) {
      const skillContext = await this.skillService.buildExecutionContext(
        conversation.userId,
        conversation.id,
      );
      const skillResult = await this.skillService.invokeSkill(
        skillInvocation.skillName,
        skillInvocation.args,
        { ...dto.context, ...skillContext },
      );

      const userMessageId = `msg_user_skill_${Date.now()}`;
      const assistantMessageId = `msg_assistant_skill_${Date.now()}`;
      const now = new Date();
      const userEventUuid = randomUUID();
      const replyEventUuid = randomUUID();
      const sessionFilePath = await this.findOrCreateRuntimeSessionFile(conversation.id, conversation.userId);

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'user', message: { id: userMessageId, role: 'user', content: dto.content }, uuid: userEventUuid, timestamp: now.toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );

      // For skill results with output files (e.g. games), show a concise description
      // and tuck the full AI reply into a collapsible "thinking" block.
      const hasOutputFiles = Boolean(skillResult.outputFiles?.length);
      const visibleReply = hasOutputFiles
        ? (skillResult.outputFiles![0].title ?? '应用已生成，请点击「打开应用」查看。')
        : skillResult.reply;
      const thinkingContent = hasOutputFiles ? skillResult.reply : undefined;

      const assistantContentBlocks: Array<Record<string, unknown>> = [];
      if (thinkingContent) {
        assistantContentBlocks.push({ type: 'thinking', thinking: thinkingContent });
      }
      assistantContentBlocks.push({ type: 'text', text: visibleReply });

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'assistant', message: { id: assistantMessageId, role: 'assistant', content: assistantContentBlocks }, uuid: replyEventUuid, timestamp: new Date(now.getTime() + 500).toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );

      if (skillResult.outputFiles?.length) {
        skillLogger.info('ConversationService', 'Skill outputFiles:', skillResult.outputFiles);
        const media = this.skillOutputFilesToMedia(skillResult.outputFiles, conversation.userId);
        skillLogger.info('ConversationService', 'Mapped media:', media.map(m => ({ id: m.id, kind: m.kind, url: m.url })));
        await this.replaceMessageResourceMappings(conversation.userId, conversation.id, assistantMessageId, media);

        // Create artifact and add "open-artifact" action to the message
        const firstFile = skillResult.outputFiles[0];
        const artifactKind = firstFile.kind ?? 'html';
        const artifactUrl = media[0]?.url ?? '';
        try {
          const artifact = await this.artifactService.createArtifact({
            userId: conversation.userId,
            type: artifactKind === 'app' ? 'app-example' : 'generated-html',
            title: firstFile.title ?? basename(firstFile.path),
            renderMode: 'url',
            payloadPath: artifactUrl,
            summary: `Generated ${artifactKind} application`,
          });
          skillLogger.info('ConversationService', `Artifact created: id=${artifact.id} url=${artifactUrl}`);

          // Re-write assistant event with actions
          const actionsPayload = [{
            id: `action-open-artifact-${artifact.id}`,
            kind: 'open_artifact',
            label: '打开应用',
            artifact_id: String(artifact.id),
            artifactId: String(artifact.id),
            view_mode: 'focus',
            viewMode: 'focus',
          }];
          const updatedEvent = JSON.stringify({
            type: 'assistant',
            message: { id: assistantMessageId, role: 'assistant', content: assistantContentBlocks, actions: actionsPayload },
            uuid: replyEventUuid,
            timestamp: new Date(now.getTime() + 500).toISOString(),
            sessionId: conversation.id,
          });
          const sessionContent = await readFile(sessionFilePath, 'utf8');
          const lines = sessionContent.trimEnd().split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const parsed = JSON.parse(lines[i]);
              if (parsed.type === 'assistant' && parsed.message?.id === assistantMessageId) {
                lines[i] = updatedEvent;
                break;
              }
            } catch { /* skip */ }
          }
          await writeFile(sessionFilePath, lines.join('\n') + '\n', 'utf8');
        } catch (err: any) {
          skillLogger.error('ConversationService', `Failed to create artifact: ${err.message}`);
        }
      } else {
        skillLogger.warn('ConversationService', 'No outputFiles returned from skill');
      }

      await this.touchConversation(conversation, dto.content);

      return {
        accepted: true,
        status: 'done',
        conversation_id: conversation.id,
        conversationId: conversation.id,
        message_id: userMessageId,
        messageId: userMessageId,
        assistant_message_id: assistantMessageId,
        assistantMessageId: assistantMessageId,
        reply: visibleReply,
        raw: { source: 'skill', skillName: skillInvocation.skillName, ...skillResult.metadata },
      };
    }

    // Auto skill routing: user does not need to type `/skill`.
    // Let model decide whether a suitable skill should be used.
    const autoRoute = await this.skillService.autoSelectSkill(
      dto.content,
      conversation.userId,
      conversation.id,
    );
    console.log(
      `[ConversationService] autoSkill useSkill=${autoRoute.useSkill} skillName=${autoRoute.skillName ?? 'none'} reason=${autoRoute.reason ?? 'n/a'} userId=${conversation.userId} conversationId=${conversation.id}`,
    );
    if (autoRoute.useSkill && autoRoute.skillName) {
      const skillContext = await this.skillService.buildExecutionContext(
        conversation.userId,
        conversation.id,
      );
      const skillResult = await this.skillService.invokeSkill(
        autoRoute.skillName,
        autoRoute.args ?? dto.content,
        { ...dto.context, ...skillContext },
      );

      const userMessageId = `msg_user_skill_${Date.now()}`;
      const assistantMessageId = `msg_assistant_skill_${Date.now()}`;
      const now = new Date();
      const userEventUuid = randomUUID();
      const replyEventUuid = randomUUID();
      const sessionFilePath = await this.findOrCreateRuntimeSessionFile(conversation.id, conversation.userId);

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'user', message: { id: userMessageId, role: 'user', content: dto.content }, uuid: userEventUuid, timestamp: now.toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );

      // For skill results with output files (e.g. games), show a concise description
      // and tuck the full AI reply into a collapsible "thinking" block.
      const hasOutputFiles = Boolean(skillResult.outputFiles?.length);
      const visibleReply = hasOutputFiles
        ? (skillResult.outputFiles![0].title ?? '应用已生成，请点击「打开应用」查看。')
        : skillResult.reply;
      const thinkingContent = hasOutputFiles ? skillResult.reply : undefined;

      const assistantContentBlocks: Array<Record<string, unknown>> = [];
      if (thinkingContent) {
        assistantContentBlocks.push({ type: 'thinking', thinking: thinkingContent });
      }
      assistantContentBlocks.push({ type: 'text', text: visibleReply });

      await appendFile(
        sessionFilePath,
        `${JSON.stringify({ type: 'assistant', message: { id: assistantMessageId, role: 'assistant', content: assistantContentBlocks }, uuid: replyEventUuid, timestamp: new Date(now.getTime() + 500).toISOString(), sessionId: conversation.id })}\n`,
        'utf8',
      );

      if (skillResult.outputFiles?.length) {
        skillLogger.info('ConversationService', 'Skill outputFiles:', skillResult.outputFiles);
        const media = this.skillOutputFilesToMedia(skillResult.outputFiles, conversation.userId);
        skillLogger.info('ConversationService', 'Mapped media:', media.map(m => ({ id: m.id, kind: m.kind, url: m.url })));
        await this.replaceMessageResourceMappings(conversation.userId, conversation.id, assistantMessageId, media);

        // Create artifact and add "open-artifact" action to the message
        const firstFile = skillResult.outputFiles[0];
        const artifactKind = firstFile.kind ?? 'html';
        const artifactUrl = media[0]?.url ?? '';
        try {
          const artifact = await this.artifactService.createArtifact({
            userId: conversation.userId,
            type: artifactKind === 'app' ? 'app-example' : 'generated-html',
            title: firstFile.title ?? basename(firstFile.path),
            renderMode: 'url',
            payloadPath: artifactUrl,
            summary: `Generated ${artifactKind} application`,
          });
          skillLogger.info('ConversationService', `Artifact created: id=${artifact.id} url=${artifactUrl}`);

          // Re-write assistant event with actions
          const actionsPayload = [{
            id: `action-open-artifact-${artifact.id}`,
            kind: 'open_artifact',
            label: '打开应用',
            artifact_id: String(artifact.id),
            artifactId: String(artifact.id),
            view_mode: 'focus',
            viewMode: 'focus',
          }];
          const updatedEvent = JSON.stringify({
            type: 'assistant',
            message: { id: assistantMessageId, role: 'assistant', content: assistantContentBlocks, actions: actionsPayload },
            uuid: replyEventUuid,
            timestamp: new Date(now.getTime() + 500).toISOString(),
            sessionId: conversation.id,
          });
          const sessionContent = await readFile(sessionFilePath, 'utf8');
          const lines = sessionContent.trimEnd().split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              const parsed = JSON.parse(lines[i]);
              if (parsed.type === 'assistant' && parsed.message?.id === assistantMessageId) {
                lines[i] = updatedEvent;
                break;
              }
            } catch { /* skip */ }
          }
          await writeFile(sessionFilePath, lines.join('\n') + '\n', 'utf8');
        } catch (err: any) {
          skillLogger.error('ConversationService', `Failed to create artifact: ${err.message}`);
        }
      } else {
        skillLogger.warn('ConversationService', 'No outputFiles returned from skill');
      }

      await this.touchConversation(conversation, dto.content);

      return {
        accepted: true,
        status: 'done',
        conversation_id: conversation.id,
        conversationId: conversation.id,
        message_id: userMessageId,
        messageId: userMessageId,
        assistant_message_id: assistantMessageId,
        assistantMessageId: assistantMessageId,
        reply: visibleReply,
        raw: {
          source: 'skill:auto',
          skillName: autoRoute.skillName,
          routerReason: autoRoute.reason,
          ...skillResult.metadata,
        },
      };
    }

    const preparedAttachments = await this.prepareAttachmentsForModel(
      conversation,
      dto.content,
      attachments,
    );

    const agentResponse = await this.agentService.sendMessage({
      conversationId: conversation.id,
      userId: String(conversation.userId),
      content: preparedAttachments.content,
      userVisibleContent: dto.content,
      kind: dto.kind,
      attachments: preparedAttachments.attachmentsForAgent,
      context: dto.context,
      clientRequestId: dto.client_request_id ?? dto.clientRequestId,
      apiKey: undefined,
      baseUrl: undefined,
      model: undefined,
    });

    await this.replaceMessageResourceMappings(
      conversation.userId,
      conversation.id,
      agentResponse.userMessageId,
      attachments,
    );

    const replyFiles = this.normalizeReplyFiles(agentResponse.file);
    const toolGeneratedMedia = agentResponse.generatedFiles?.length
      ? this.skillOutputFilesToMedia(agentResponse.generatedFiles, conversation.userId)
      : [];
    await this.replaceMessageResourceMappings(
      conversation.userId,
      conversation.id,
      agentResponse.assistantMessageId,
      [...replyFiles, ...toolGeneratedMedia],
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

  private async getConversationByIdentifier(identifier: string, requestUserId?: number) {
    const byAgentId = await this.conversationRepo.findOne({ where: { id: identifier } });
    if (byAgentId) {
      if (requestUserId !== undefined && byAgentId.userId !== requestUserId) {
        throw new ForbiddenException('You do not have access to this conversation');
      }
      return byAgentId;
    }

    const numericId = Number(identifier);
    if (Number.isInteger(numericId)) {
      const byCid = await this.conversationRepo.findOne({ where: { cid: numericId } });
      if (byCid) {
        if (requestUserId !== undefined && byCid.userId !== requestUserId) {
          throw new ForbiddenException('You do not have access to this conversation');
        }
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

  private async resolveImplicitAttachments(
    conversation: ConversationEntity,
    content: string,
  ): Promise<MessageMedia[]> {
    const normalized = content.toLowerCase();
    const asksForDocument =
      normalized.includes('pdf') ||
      normalized.includes('paper') ||
      normalized.includes('论文') ||
      normalized.includes('文档') ||
      normalized.includes('这篇') ||
      normalized.includes('这个文件');

    if (!asksForDocument) {
      return [];
    }

    const manifest = await this.readConversationFileManifest(
      conversation.userId,
      conversation.id,
    );
    if (manifest.length === 0) {
      return [];
    }

    const latest = manifest[manifest.length - 1];
    return [this.toMessageMedia(latest)];
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
    userId?: number,
  ): Promise<ConversationMessage[]> {
    let sessionFilePath: string;
    try {
      sessionFilePath = await this.findOrCreateRuntimeSessionFile(sessionId, userId, true);
    } catch {
      return [];
    }
    const rawContent = await readFile(sessionFilePath, 'utf8');
    const lines = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const messageOrder: string[] = [];
    const messageMap = new Map<string, ConversationMessage>();
    const mediaByMessageId = await this.getMessageResourceMappings(sessionId, userId);

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
      .filter(Boolean) as ConversationMessage[];
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
      actions: Array.isArray(event.message?.actions) && event.message.actions.length
        ? event.message.actions
        : undefined,
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

  private async findOrCreateRuntimeSessionFile(sessionId: string, userId?: number, readOnly = false) {
    if (userId !== undefined) {
      const directPath = join(userDataRootDir, String(userId), `${sessionId}.jsonl`);
      try {
        await stat(directPath);
        return directPath;
      } catch {
        // Fall through to legacy scan
      }
    }

    const { readdir } = await import('node:fs/promises');
    const userDirs = await readdir(userDataRootDir, { withFileTypes: true });

    for (const dir of userDirs) {
      if (!dir.isDirectory()) continue;
      const candidate = join(userDataRootDir, dir.name, `${sessionId}.jsonl`);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    if (readOnly) {
      throw new NotFoundException(`Runtime session ${sessionId} not found`);
    }

    // Session file doesn't exist — create it under the user's directory
    const targetDir = join(userDataRootDir, String(userId ?? 1));
    await mkdir(targetDir, { recursive: true });
    const newPath = join(targetDir, `${sessionId}.jsonl`);
    await writeFile(newPath, '', 'utf8');
    return newPath;
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

  private async getMessageResourceMappings(conversationId: string, userId?: number) {
    const where = userId !== undefined
      ? { conversationId, userId }
      : { conversationId };
    const rows = await this.messageResourceRepo.find({
      where,
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

  private skillOutputFilesToMedia(
    outputFiles: Array<{ path: string; kind?: string; title?: string }>,
    userId?: number,
  ): MessageMedia[] {
    const media: MessageMedia[] = [];
    const uid = userId ?? '';
    for (const f of outputFiles) {
      const kind = (f.kind ?? detectOutputType(f.path)) as MessageMedia['kind'];
      const filename = basename(f.path);
      const url =
        kind === 'app'
          ? `/api/career-agent/generated/${uid}/app/${filename}/`
          : `/api/career-agent/generated/${uid}/${kind}/${filename}`;
      media.push({
        id: `asset-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        kind,
        url,
        title: f.title ?? filename,
        storage_path: f.path,
        storagePath: f.path,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
    return media;
  }

  private async replaceMessageResourceMappings(
    userId: number,
    conversationId: string,
    messageId: string,
    resources: MessageMedia[],
  ) {
    await this.messageResourceRepo.delete({ userId, conversationId, messageId });

    if (!resources.length) {
      return;
    }

    const rows = resources.map((resource) =>
      this.messageResourceRepo.create({
        userId,
        messageId,
        conversationId,
        resourceId: resource.id,
        resourceKind: resource.kind,
        resourcePath: resource.url,
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

  private validateUpload(
    file: Express.Multer.File,
    originalName: string,
    mimeType: string,
  ) {
    const extension = extname(originalName).toLowerCase();
    const policy = uploadPolicies[extension];

    if (!policy) {
      throw new UnsupportedMediaTypeException(
        'Unsupported file type. Allowed: image, mp4, txt, md, pdf.',
      );
    }

    if (file.size > policy.maxBytes) {
      throw new BadRequestException(
        `File exceeds size limit for ${extension} uploads (${policy.maxBytes} bytes).`,
      );
    }

    if (
      mimeType &&
      !genericUploadMimeTypes.has(mimeType) &&
      !policy.allowedMimeTypes.includes(mimeType)
    ) {
      throw new UnsupportedMediaTypeException(
        `Mime type ${mimeType} does not match file extension ${extension}.`,
      );
    }

    return { policy };
  }

  private async prepareAttachmentsForModel(
    conversation: ConversationEntity,
    userContent: string,
    attachments: MessageMedia[],
  ): Promise<PreparedAttachmentPayload> {
    if (!attachments.length) {
      return { content: userContent, attachmentsForAgent: [] };
    }

    const textBlocks: string[] = [];
    const attachmentsForAgent: PreparedAttachmentPayload['attachmentsForAgent'] = [];

    for (const attachment of attachments) {
      const descriptor = await this.describeAttachmentForModel(conversation, attachment);
      if (descriptor.injectedText) {
        textBlocks.push(descriptor.injectedText);
      }
      if (descriptor.forwardToAgent) {
        attachmentsForAgent.push({
          assetId: attachment.id,
          path: attachment.storage_path ?? attachment.storagePath ?? attachment.url,
          title: attachment.title,
          mimeType: attachment.mime_type ?? attachment.mimeType,
        });
      }
    }

    if (!textBlocks.length) {
      return { content: userContent, attachmentsForAgent };
    }

    const attachmentContext = [
      '<attachment_context>',
      ...textBlocks,
      '</attachment_context>',
    ].join('\n');

    return {
      content: [userContent, '', attachmentContext].join('\n').trim(),
      attachmentsForAgent,
    };
  }

  private async describeAttachmentForModel(
    conversation: ConversationEntity,
    attachment: MessageMedia,
  ) {
    const filePath = this.resolveAttachmentDiskPath(
      conversation.userId,
      conversation.id,
      attachment,
    );
    const fileName = attachment.title ?? basename(filePath);
    const mimeType = (attachment.mime_type ?? attachment.mimeType ?? '').toLowerCase();
    const extension = extname(fileName).toLowerCase();
    const policy = uploadPolicies[extension];
    const fileStats = await stat(filePath);

    if (!policy) {
      return {
        injectedText: this.createAttachmentFallbackBlock(
          fileName,
          mimeType,
          fileStats.size,
        ),
        forwardToAgent: true,
      };
    }

    if (policy.kind === 'image') {
      return {
        injectedText: '',
        forwardToAgent: true,
      };
    }

    if (policy.kind === 'video') {
      return {
        injectedText: [
          `[Video attachment]`,
          `name: ${fileName}`,
          `mime: ${mimeType || 'unknown'}`,
          `size_bytes: ${fileStats.size}`,
          `The uploaded video is attached. Use this metadata and request additional details if direct video understanding is unavailable.`,
        ].join('\n'),
        forwardToAgent: true,
      };
    }

    if (extension === '.pdf') {
      return {
        injectedText: '',
        forwardToAgent: true,
      };
    }

    const extractedText = await this.extractTextAttachmentContent(
      filePath,
      extension,
      fileName,
    );
    return {
      injectedText: [
        `[Text attachment]`,
        `name: ${fileName}`,
        `mime: ${mimeType || 'unknown'}`,
        `size_bytes: ${fileStats.size}`,
        extractedText,
      ].join('\n'),
      forwardToAgent: false,
    };
  }

  private async extractTextAttachmentContent(
    filePath: string,
    extension: string,
    fileName: string,
  ): Promise<string> {
    if (extension === '.txt' || extension === '.md') {
      const content = await this.readTextFileWithEncodingFallback(filePath);
      return this.wrapExtractedText(content);
    }

    if (extension === '.docx') {
      const content = await this.extractDocxText(filePath);
      if (content.trim()) {
        return this.wrapExtractedText(content);
      }
    }

    if (extension === '.doc') {
      const docSnippet = await this.extractBinaryTextSnippet(filePath, 10_000);
      if (docSnippet.trim()) {
        return this.wrapExtractedText(docSnippet);
      }
      return this.wrapExtractedText(
        `[The legacy .doc file ${fileName} could not be fully decoded. Filename and file metadata were preserved for the model.]`,
      );
    }

    const fallback = await this.extractBinaryTextSnippet(filePath, 8_000);
    return this.wrapExtractedText(
      fallback || `[No readable text could be extracted from ${fileName}.]`,
    );
  }

  private async extractDocxText(filePath: string): Promise<string> {
    const shell = process.platform === 'win32' ? 'powershell' : 'pwsh';
    const escapedPath = filePath.replace(/'/g, "''");
    const script = [
      `Add-Type -AssemblyName System.IO.Compression.FileSystem`,
      `$zip = [System.IO.Compression.ZipFile]::OpenRead('${escapedPath}')`,
      `try {`,
      `  $entry = $zip.GetEntry('word/document.xml')`,
      `  if ($null -eq $entry) { exit 0 }`,
      `  $reader = New-Object System.IO.StreamReader($entry.Open())`,
      `  try {`,
      `    $xml = $reader.ReadToEnd()`,
      `    [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($xml))`,
      `  } finally { $reader.Dispose() }`,
      `} finally { $zip.Dispose() }`,
    ].join('; ');

    const result = await execFileNoThrow(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 10_000,
      useCwd: false,
    });

    if (result.code !== 0 || !result.stdout.trim()) {
      return this.extractBinaryTextSnippet(filePath, 10_000);
    }

    let xmlContent = '';
    try {
      xmlContent = Buffer.from(result.stdout.trim(), 'base64').toString('utf8');
    } catch {
      xmlContent = result.stdout;
    }

    return this.decodeXmlEntities(
      xmlContent
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
  }

  private async extractBinaryTextSnippet(filePath: string, maxChars: number) {
    const buffer = await readFile(filePath);
    const asciiMatches = buffer
      .toString('latin1')
      .match(/[ -~\r\n\t]{4,}/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) ?? [];

    const utf16Matches = buffer
      .toString('utf16le')
      .match(/[^\u0000-\u001f]{4,}/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) ?? [];

    const unique = Array.from(new Set([...asciiMatches, ...utf16Matches]));
    const joined = unique.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return this.truncateExtractedText(joined, maxChars);
  }

  private async readTextFileWithEncodingFallback(filePath: string) {
    const buffer = await readFile(filePath);

    if (buffer.length >= 2) {
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.toString('utf16le');
      }
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.allocUnsafe(buffer.length - 2);
        for (let i = 2; i + 1 < buffer.length; i += 2) {
          swapped[i - 2] = buffer[i + 1]!;
          swapped[i - 1] = buffer[i]!;
        }
        return swapped.toString('utf16le');
      }
    }

    const decoders = [
      new TextDecoder('utf-8', { fatal: true }),
      new TextDecoder('gb18030', { fatal: true }),
      new TextDecoder('utf-16le', { fatal: true }),
    ];

    for (const decoder of decoders) {
      try {
        return decoder.decode(buffer);
      } catch {}
    }

    return buffer.toString('utf8');
  }

  private wrapExtractedText(content: string) {
    return ['<parsed_content>', this.truncateExtractedText(content, maxInjectedTextChars), '</parsed_content>'].join(
      '\n',
    );
  }

  private truncateExtractedText(content: string, limit: number) {
    const normalized = content.replace(/\u0000/g, '').trim();
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit)}\n[truncated]`;
  }

  private decodeXmlEntities(content: string) {
    return content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private createAttachmentFallbackBlock(
    fileName: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    return [
      `[Attachment]`,
      `name: ${fileName}`,
      `mime: ${mimeType || 'unknown'}`,
      `size_bytes: ${sizeBytes}`,
      `The file was uploaded, but no specialized parser is registered for this type.`,
    ].join('\n');
  }

  private resolveAttachmentDiskPath(
    userId: number,
    conversationId: string,
    attachment: MessageMedia,
  ) {
    const storedPath = attachment.storage_path ?? attachment.storagePath ?? attachment.url;
    if (storedPath.startsWith('/api/career-agent/threads/')) {
      const fileName = storedPath.split('/').pop() ?? '';
      return join(conversationFilesRootDir, String(userId), conversationId, fileName);
    }

    const normalized = storedPath.replaceAll('\\', '/');
    const marker = '/src/Network/';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      const relative = normalized.slice(markerIndex + marker.length);
      return join(networkRootDir, relative);
    }

    if (normalized.startsWith('./src/Network/')) {
      return join(networkRootDir, normalized.replace('./src/Network/', ''));
    }

    return normalized;
  }

  private parseCreateSkillCommand(content: string) {
    const trimmed = content.trim();
    if (!trimmed.toLowerCase().startsWith('/create-skill')) {
      return null;
    }

    const args = trimmed.slice('/create-skill'.length).trim();
    if (!args) {
      throw new BadRequestException(
        'Usage: /create-skill {"name":"...","description":"...","content":"...","category":"utility","arguments":"arg1 arg2"}',
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args) as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        'Invalid /create-skill payload. Expected JSON like {"name":"...","description":"...","content":"..."}',
      );
    }

    const name = String(parsed.name ?? '').trim();
    const description = String(parsed.description ?? '').trim();
    const skillContent = String(parsed.content ?? '').trim();
    const category = String(parsed.category ?? 'utility').trim() || 'utility';
    const argumentNames =
      parsed.arguments === undefined || parsed.arguments === null
        ? undefined
        : String(parsed.arguments).trim();

    if (!name || !description || !skillContent) {
      throw new BadRequestException(
        'Invalid /create-skill payload. Fields "name", "description", and "content" are required.',
      );
    }

    return {
      name,
      description,
      content: skillContent,
      category,
      arguments: argumentNames,
    };
  }

  private sanitizeFileName(fileName: string) {
    const cleaned = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned || `upload-${Date.now()}.bin`;
  }

  private resolveAssetKind(kind: SupportedUploadKind): 'image' | 'video' | 'file' {
    if (kind === 'image') {
      return 'image';
    }

    if (kind === 'video') {
      return 'video';
    }

    if (kind === 'text') {
      return 'file';
    }

    throw new UnsupportedMediaTypeException(`Unsupported upload kind: ${kind}`);
  }

  private toPublicFilePath(conversationId: string, storedFileName: string) {
    return `/api/career-agent/threads/${conversationId}/files/${storedFileName}`;
  }
  private toLocalFilePath(conversationId: string, storedFileName: string, userId: number) {
    return `./src/Network/files/${userId}/${conversationId}/${storedFileName}`;
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
