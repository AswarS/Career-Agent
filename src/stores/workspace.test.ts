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

  it('adds local image media and file attachments when submitting a draft message', () => {
    const workspaceStore = useWorkspaceStore();
    workspaceStore.activeThreadId = 'thread-001';

    workspaceStore.submitDraftMessage({
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

    expect(workspaceStore.messages[0]).toMatchObject({
      role: 'user',
      content: '（已添加附件）',
      media: [
        {
          id: 'local-image-001',
          kind: 'image',
          url: 'blob:http://localhost/image',
          title: 'diagram.png',
          mimeType: 'image/png',
        },
      ],
      files: [
        {
          id: 'local-file-001',
          name: 'resume.pdf',
          url: 'blob:http://localhost/file',
          mimeType: 'application/pdf',
          sizeBytes: 4096,
        },
      ],
    });
    expect(workspaceStore.messages[1]?.content).toContain('真实上传接口尚未接通');
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
