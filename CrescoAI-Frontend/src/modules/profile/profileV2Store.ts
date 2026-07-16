import { defineStore } from 'pinia';
import { createCareerAgentClient } from '../../services/createCareerAgentClient';
import type {
  BaseProfilePatch,
  BaseProfileRecord,
  ProfileChangeProposalRecord,
  ProfileMemoryRecord,
  ProfileRevisionRecord,
  ProfileStateRecord,
  CreateProfileMemoryInput,
  ReplaceProfileMemoryInput,
} from './profileV2Types';

const client = createCareerAgentClient();

export const useProfileV2Store = defineStore('profile-v2', {
  state: () => ({
    baseProfile: null as BaseProfileRecord | null,
    memories: [] as ProfileMemoryRecord[],
    proposals: [] as ProfileChangeProposalRecord[],
    history: [] as ProfileRevisionRecord[],
    profileState: null as ProfileStateRecord | null,
    loading: false,
    saving: false,
    error: null as string | null,
  }),
  actions: {
    async loadBaseProfile() {
      if (!client.getBaseProfile) return null;
      this.loading = true;
      this.error = null;
      try {
        this.baseProfile = await client.getBaseProfile();
        return this.baseProfile;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '基础 Profile 加载失败';
        return null;
      } finally {
        this.loading = false;
      }
    },
    async saveBaseProfile(patch: BaseProfilePatch) {
      if (!client.updateBaseProfile || !this.baseProfile) return null;
      this.saving = true;
      this.error = null;
      try {
        this.baseProfile = await client.updateBaseProfile(patch, this.baseProfile.version);
        if (client.getProfileState) {
          this.profileState = await client.getProfileState();
        }
        return this.baseProfile;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '基础 Profile 保存失败';
        return null;
      } finally {
        this.saving = false;
      }
    },
    async loadMemoryWorkspace() {
      try {
        const requests = [
          Promise.all([
            client.listProfileMemories?.({ status: 'active' }) ?? Promise.resolve([]),
            client.listProfileMemories?.({ status: 'superseded' }) ?? Promise.resolve([]),
            client.listProfileMemories?.({ status: 'expired' }) ?? Promise.resolve([]),
            client.listProfileMemories?.({ status: 'deleted' }) ?? Promise.resolve([]),
          ]).then((groups) => groups.flat()),
          client.listProfileProposals?.() ?? Promise.resolve([]),
          client.listProfileHistory?.() ?? Promise.resolve([]),
          client.getProfileState?.() ?? Promise.resolve(null),
        ] as const;
        const [memories, proposals, history, profileState] = await Promise.all(requests);
        this.memories = memories;
        this.proposals = proposals;
        this.history = history;
        this.profileState = profileState;
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile Memory 加载失败';
      }
    },
    async createMemory(input: CreateProfileMemoryInput) {
      if (!client.createProfileMemory || !this.profileState) return;
      try {
        await client.createProfileMemory(input, this.profileState.aggregateVersion);
        await this.loadMemoryWorkspace();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile Memory 创建失败';
      }
    },
    async updateMemory(id: string, patch: Partial<ProfileMemoryRecord>) {
      if (!client.updateProfileMemory || !this.profileState) return;
      try {
        await client.updateProfileMemory(id, patch, this.profileState.aggregateVersion);
        await this.loadMemoryWorkspace();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile Memory 更新失败';
      }
    },
    async replaceMemory(profileIndex: string, input: ReplaceProfileMemoryInput) {
      if (!client.replaceProfileMemory || !this.profileState) return;
      try {
        await client.replaceProfileMemory(profileIndex, input, this.profileState.aggregateVersion);
        await this.loadMemoryWorkspace();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile Memory 替换失败，请刷新后重试';
        await this.loadMemoryWorkspace();
      }
    },
    async deleteMemory(id: string) {
      if (!client.deleteProfileMemory || !this.profileState) return;
      try {
        await client.deleteProfileMemory(id, this.profileState.aggregateVersion);
        await this.loadMemoryWorkspace();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile Memory 删除失败';
      }
    },
    async resolveProposal(id: string, action: 'accept' | 'reject') {
      if (!client.resolveProfileProposal) return;
      try {
        await client.resolveProfileProposal(id, action);
        await Promise.all([this.loadBaseProfile(), this.loadMemoryWorkspace()]);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Profile 提案处理失败';
      }
    },
  },
});
