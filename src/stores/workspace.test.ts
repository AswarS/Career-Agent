import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
