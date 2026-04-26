import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from './workspace';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('closes the active artifact when switching threads', async () => {
    const workspaceStore = useWorkspaceStore();

    await workspaceStore.setActiveThread('thread-001');
    await workspaceStore.openArtifact('artifact-mock-interview', 'immersive');

    expect(workspaceStore.artifactPaneOpen).toBe(true);
    expect(workspaceStore.activeArtifactId).toBe('artifact-mock-interview');
    expect(workspaceStore.artifactViewMode).toBe('immersive');

    await workspaceStore.setActiveThread('thread-002');

    expect(workspaceStore.activeThreadId).toBe('thread-002');
    expect(workspaceStore.artifactPaneOpen).toBe(false);
    expect(workspaceStore.activeArtifactId).toBeNull();
    expect(workspaceStore.artifactViewMode).toBe('pane');
  });

  it('falls back to the first known thread when a route thread id is unknown', async () => {
    const workspaceStore = useWorkspaceStore();

    const activeThreadId = await workspaceStore.setActiveThread('unknown-thread');

    expect(activeThreadId).toBe('thread-001');
    expect(workspaceStore.activeThreadId).toBe('thread-001');
    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messages.length).toBeGreaterThan(0);
  });

  it('creates a local mock thread with provided summary seed and leaves messages idle for route-driven loading', async () => {
    const workspaceStore = useWorkspaceStore();

    await workspaceStore.initialize();
    const thread = await workspaceStore.createThread({
      title: '测试会话',
      preview: '用于验证首页首发起草稿。',
    });

    expect(thread.title).toBe('测试会话');
    expect(thread.preview).toBe('用于验证首页首发起草稿。');
    expect(workspaceStore.threads[0]?.id).toBe(thread.id);
    expect(workspaceStore.activeThreadId).toBe(thread.id);
    expect(workspaceStore.threadCreateStatus).toBe('ready');
    expect(workspaceStore.messages).toEqual([]);
    expect(workspaceStore.messagesStatus).toBe('idle');
  });

  it('creates a thread from the first submission and sends the draft immediately', async () => {
    const workspaceStore = useWorkspaceStore();

    await workspaceStore.initialize();
    const thread = await workspaceStore.startThreadFromDraft({
      content: '请帮我梳理本周重点工作和学习安排',
      attachments: [],
    });

    expect(thread).not.toBeNull();
    expect(thread?.title).toBe('请帮我梳理本周重点工作和学习安排');
    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messages).toHaveLength(2);
    expect(workspaceStore.messages[0]).toMatchObject({
      threadId: thread!.id,
      role: 'user',
      content: '请帮我梳理本周重点工作和学习安排',
    });

    await workspaceStore.setActiveThread(thread!.id);

    expect(workspaceStore.messagesStatus).toBe('ready');
    expect(workspaceStore.messages).toHaveLength(2);
    expect(workspaceStore.messages[0]).toMatchObject({
      threadId: thread!.id,
      role: 'user',
      content: '请帮我梳理本周重点工作和学习安排',
    });
    expect(workspaceStore.messages[1]?.role).toBe('assistant');
  });

  it('uploads local image media and file attachments when submitting a draft message', async () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.activeThreadId = 'thread-001';

    await workspaceStore.submitDraftMessage({
      content: '',
      attachments: [
        {
          id: 'local-image-001',
          kind: 'image',
          name: 'diagram.png',
          url: 'blob:http://localhost/image',
          mimeType: 'image/png',
          sizeBytes: 2048,
        },
        {
          id: 'local-file-001',
          kind: 'file',
          name: 'resume.pdf',
          url: 'blob:http://localhost/file',
          mimeType: 'application/pdf',
          sizeBytes: 4096,
        },
      ],
    });

    const sentMessage = workspaceStore.messages.find((message) => message.content === '（已添加附件）');

    expect(sentMessage).toMatchObject({
      role: 'user',
      content: '（已添加附件）',
      media: [
        {
          id: expect.any(String),
          kind: 'image',
          url: 'blob:http://localhost/image',
          title: 'diagram.png',
          mimeType: 'image/png',
        },
      ],
      files: [
        {
          id: expect.any(String),
          name: 'resume.pdf',
          url: 'blob:http://localhost/file',
          mimeType: 'application/pdf',
          sizeBytes: 4096,
        },
      ],
    });
    expect(workspaceStore.messages[workspaceStore.messages.length - 1]?.role).toBe('assistant');
  });

  it('revokes local blob attachment urls before clearing messages on thread switch', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const workspaceStore = useWorkspaceStore();

    workspaceStore.activeThreadId = 'thread-001';
    workspaceStore.messages = [
      {
        id: 'message-local-attachment',
        threadId: 'thread-001',
        role: 'user',
        kind: 'markdown',
        content: '本地附件',
        media: [
          {
            id: 'local-image',
            kind: 'image',
            url: 'blob:http://localhost/image',
            posterUrl: 'blob:http://localhost/poster',
          },
        ],
        files: [
          {
            id: 'local-file',
            name: 'resume.pdf',
            url: 'blob:http://localhost/file',
          },
        ],
        createdAt: '2026-04-20 16:00',
      },
    ];

    await workspaceStore.setActiveThread('thread-002');

    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/image');
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/poster');
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/file');

    revokeSpy.mockRestore();
  });
});
