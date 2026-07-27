<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MobileRailTrigger from '../modules/navigation/MobileRailTrigger.vue';
import ProfileSnapshotCard from '../modules/profile/ProfileSnapshotCard.vue';
import ProfileSuggestionCard from '../modules/profile/ProfileSuggestionCard.vue';
import BaseProfileForm from '../modules/profile/BaseProfileForm.vue';
import ProfileMemoryWorkspace from '../modules/profile/ProfileMemoryWorkspace.vue';
import ProfileProposalPanel from '../modules/profile/ProfileProposalPanel.vue';
import ProfileHistoryPanel from '../modules/profile/ProfileHistoryPanel.vue';
import { useProfileV2Store } from '../modules/profile/profileV2Store';
import type {
  BaseProfilePatch,
  CreateProfileMemoryInput,
  ProfileMemoryRecord,
  ReplaceProfileMemoryInput,
} from '../modules/profile/profileV2Types';
import {
  buildProfileSnapshotSections,
  formatRequiredLevel,
  getRequirementKind,
  getWritePolicyKind,
  getWritePolicyLabel,
  isRequiredProfileField,
  profileFieldGroups,
  profileFields,
  readProfileField,
  writeProfileField,
  type ProfileFieldConfig,
  type ProfileFieldRequirementKind,
} from '../modules/profile/profileFields';
import { useWorkspaceStore } from '../stores/workspace';
import type { DeepPartial, ProfileRecord, ProfileSuggestion } from '../types/entities';

const workspaceStore = useWorkspaceStore();
const profileV2Store = useProfileV2Store();
const {
  baseProfile,
  saving: baseProfileSaving,
  error: profileV2Error,
  memories: profileMemories,
  profileState,
  proposals: profileV2Proposals,
  history: profileV2History,
} = storeToRefs(profileV2Store);
const {
  activeThread,
  artifacts,
  errorMessage,
  profile,
  profileSaveStatus,
  profileStatus,
  profileSuggestions,
  profileSuggestionsStatus,
} = storeToRefs(workspaceStore);

const draftProfile = ref<ProfileRecord | null>(null);
const isEditing = ref(false);
const localSaveMessage = ref<string | null>(null);
const appliedSuggestionRowId = ref<number | null>(null);

type EditorProfileField = ProfileFieldConfig;

const requirementSortOrder: Record<ProfileFieldRequirementKind, number> = {
  required: 0,
  conditional: 1,
  recommended: 2,
  optional: 3,
};

onMounted(() => {
  void workspaceStore.initialize();
  void profileV2Store.loadBaseProfile();
  void profileV2Store.loadMemoryWorkspace();
});

async function saveBaseProfile(patch: BaseProfilePatch) {
  await profileV2Store.saveBaseProfile(patch);
}

async function createProfileMemory(input: CreateProfileMemoryInput) {
  await profileV2Store.createMemory(input);
}

async function updateProfileMemory(id: string, patch: Partial<ProfileMemoryRecord>) {
  await profileV2Store.updateMemory(id, patch);
}

async function replaceProfileMemory(profileIndex: string, input: ReplaceProfileMemoryInput) {
  await profileV2Store.replaceMemory(profileIndex, input);
}

async function deleteProfileMemory(id: string) {
  await profileV2Store.deleteMemory(id);
}

async function resolveProfileProposal(id: string, action: 'accept' | 'reject') {
  await profileV2Store.resolveProposal(id, action);
}

watch(
  profile,
  (nextProfile) => {
    if (!nextProfile || isEditing.value) {
      return;
    }

    draftProfile.value = cloneProfile(nextProfile);
  },
  { immediate: true },
);

const snapshotSections = computed(() => {
  if (!profile.value) {
    return [];
  }

  return buildProfileSnapshotSections(profile.value);
});

const hasUnsavedChanges = computed(() => {
  if (!profile.value || !draftProfile.value) {
    return false;
  }

  return JSON.stringify(profile.value) !== JSON.stringify(draftProfile.value);
});

const profileCompletion = computed(() => {
  const requiredFields = profileFields.filter(isRequiredProfileField);
  const completionProfile = isEditing.value ? draftProfile.value : profile.value;

  if (!completionProfile) {
    return { completed: 0, total: requiredFields.length };
  }

  const completedFields = requiredFields.filter((field) => {
    const value = readProfileField(completionProfile, field);
    return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
  }).length;

  return {
    completed: completedFields,
    total: requiredFields.length,
  };
});

const orderedProfileFields = computed<EditorProfileField[]>(() => (
  [...profileFields].sort((left, right) => {
    const leftGroupIndex = profileFieldGroups.findIndex((group) => group.key === left.groupKey);
    const rightGroupIndex = profileFieldGroups.findIndex((group) => group.key === right.groupKey);
    const groupDelta = leftGroupIndex - rightGroupIndex;

    if (groupDelta !== 0) {
      return groupDelta;
    }

    const leftKind = getRequirementKind(left.requiredLevel);
    const rightKind = getRequirementKind(right.requiredLevel);
    const requirementDelta = requirementSortOrder[leftKind] - requirementSortOrder[rightKind];

    if (requirementDelta !== 0) {
      return requirementDelta;
    }

    return profileFields.indexOf(left) - profileFields.indexOf(right);
  })
));

const editorFieldGroups = computed(() => (
  profileFieldGroups
    .map((group) => ({
      ...group,
      fields: orderedProfileFields.value.filter((field) => field.groupKey === group.key),
    }))
    .filter((group) => group.fields.length > 0)
));

const hasProfileSummary = computed(() => (
  artifacts.value.some((artifact) => artifact.id === 'artifact-profile-summary')
));

const primaryProfileSuggestion = computed(() => profileSuggestions.value[0] ?? null);

function cloneProfile(input: ProfileRecord): ProfileRecord {
  return JSON.parse(JSON.stringify(toRaw(input))) as ProfileRecord;
}

function beginEditing() {
  if (!profile.value) {
    return;
  }

  draftProfile.value = cloneProfile(profile.value);
  isEditing.value = true;
  localSaveMessage.value = null;
}

function cancelEditing() {
  if (profile.value) {
    draftProfile.value = cloneProfile(profile.value);
  }

  isEditing.value = false;
  appliedSuggestionRowId.value = null;
  localSaveMessage.value = '已放弃草稿。';
}

function updateScalarField(field: ProfileFieldConfig, value: string) {
  if (!draftProfile.value) {
    return;
  }

  isEditing.value = true;
  draftProfile.value = writeProfileField(draftProfile.value, field, value);
}

function updateListField(field: ProfileFieldConfig, value: string) {
  if (!draftProfile.value) {
    return;
  }

  isEditing.value = true;
  draftProfile.value = writeProfileField(
    draftProfile.value,
    field,
    value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function getScalarFieldValue(field: ProfileFieldConfig) {
  if (!draftProfile.value) {
    return '';
  }

  const value = readProfileField(draftProfile.value, field);
  return Array.isArray(value) ? value.join('\n') : value;
}

function getListFieldValue(field: ProfileFieldConfig) {
  if (!draftProfile.value) {
    return '';
  }

  const value = readProfileField(draftProfile.value, field);
  return Array.isArray(value) ? value.join('\n') : value;
}

function getFieldHelp(field: { description: string; example: string }) {
  return `${field.description} 示例：${field.example}`;
}

function getScalarPlaceholder(field: { input: 'text' | 'textarea'; label: string; example: string }) {
  if (field.input === 'textarea') {
    return `请填写${field.label}`;
  }

  const shortExample = field.example
    .split(/[；;，,、。]/)[0]
    .trim();
  return shortExample ? `例：${shortExample}` : '';
}

function getListPlaceholder(field: { example: string }) {
  return field.example
    .split(/[；;，,、。]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n') || '每行一项';
}

function getCompactExample(field: { example: string }) {
  const example = field.example.trim();
  return example.length > 44 ? `${example.slice(0, 44)}...` : example;
}

function hasEditorFieldValue(field: EditorProfileField) {
  if (!draftProfile.value) {
    return false;
  }

  const value = readProfileField(draftProfile.value, field);

  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

function mergeProfilePatch(base: ProfileRecord, patch: DeepPartial<ProfileRecord>) {
  const nextProfile = cloneProfile(base);

  for (const [sectionKey, sectionPatch] of Object.entries(patch) as Array<[keyof ProfileRecord, unknown]>) {
    if (sectionKey === 'schemaVersion') {
      continue;
    }

    if (
      typeof sectionPatch === 'object'
      && sectionPatch !== null
      && !Array.isArray(sectionPatch)
      && typeof nextProfile[sectionKey] === 'object'
      && nextProfile[sectionKey] !== null
    ) {
      nextProfile[sectionKey] = {
        ...(nextProfile[sectionKey] as object),
        ...(sectionPatch as object),
      } as never;
    }
  }

  return nextProfile;
}

function applySuggestion(suggestion: ProfileSuggestion) {
  if (!profile.value) {
    return;
  }

  const baseProfile = draftProfile.value ? cloneProfile(draftProfile.value) : cloneProfile(profile.value);
  draftProfile.value = mergeProfilePatch(baseProfile, suggestion.patch);
  appliedSuggestionRowId.value = suggestion.rowId ?? null;
  isEditing.value = true;
  localSaveMessage.value = `已应用建议：${suggestion.title}。请先检查草稿，再决定是否正式保存。`;
}

function applyPrimarySuggestion() {
  if (!primaryProfileSuggestion.value) {
    return;
  }

  applySuggestion(primaryProfileSuggestion.value);
}

async function saveProfile() {
  if (!draftProfile.value || !hasUnsavedChanges.value) {
    return;
  }

  try {
    const savedProfile = await workspaceStore.saveProfileDraft(
      cloneProfile(draftProfile.value),
      appliedSuggestionRowId.value ?? undefined,
    );
    draftProfile.value = cloneProfile(savedProfile);
    isEditing.value = false;
    appliedSuggestionRowId.value = null;
    localSaveMessage.value = '画像已保存。';
  } catch {
    localSaveMessage.value = '画像保存失败。当前草稿仍保留在本地，可以继续重试。';
  }
}

function resolveSourceLabel(suggestion: ProfileSuggestion) {
  if (!suggestion.sourceThreadId) {
    return null;
  }

  return suggestion.sourceThreadId === activeThread.value?.id ? '当前会话' : suggestion.sourceThreadId.replace('thread-', '会话 ');
}

function formatSuggestionStatus(status: typeof profileSuggestionsStatus.value) {
  switch (status) {
    case 'idle':
      return '未加载';
    case 'loading':
      return '加载中';
    case 'ready':
      return `已就绪 ${profileSuggestions.value.length} 条`;
    case 'error':
      return '加载失败';
    default:
      return status;
  }
}
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div class="page-heading">
        <MobileRailTrigger />
        <div>
          <p class="eyebrow">轻量画像</p>
          <h1>{{ baseProfile?.name || profile?.basicInfo.fullName || (profile ? '我的职业画像' : '正在加载画像...') }}</h1>
        </div>
      </div>
      <div class="header-actions">
        <div class="action-group">
          <button
            v-if="hasProfileSummary"
            class="secondary-button"
            @click="workspaceStore.openArtifact('artifact-profile-summary')"
          >
            打开画像摘要
          </button>
          <button
            v-if="!profileState && !isEditing"
            class="secondary-button"
            :disabled="!primaryProfileSuggestion || profileSaveStatus === 'loading'"
            @click="applyPrimarySuggestion"
          >
            应用ai建议
          </button>
          <button v-if="!profileState && !isEditing" class="primary-button" :disabled="!profile" @click="beginEditing">
            开始编辑
          </button>
          <template v-else-if="!profileState">
            <button class="secondary-button" @click="cancelEditing">放弃草稿</button>
            <button
              class="primary-button"
              :disabled="!hasUnsavedChanges || profileSaveStatus === 'loading'"
              @click="saveProfile"
            >
              {{ profileSaveStatus === 'loading' ? '保存中...' : '保存画像' }}
            </button>
          </template>
        </div>
      </div>
    </header>

    <BaseProfileForm
      v-if="baseProfile"
      :profile="baseProfile"
      :saving="baseProfileSaving"
      @save="saveBaseProfile"
    />
    <p v-if="profileV2Error" class="notice-copy">{{ profileV2Error }}</p>
    <ProfileMemoryWorkspace
      v-if="profileState"
      :memories="profileMemories"
      :profile-state="profileState"
      @create="createProfileMemory"
      @update="updateProfileMemory"
      @replace="replaceProfileMemory"
      @delete="deleteProfileMemory"
    />
    <ProfileProposalPanel
      v-if="profileState"
      :proposals="profileV2Proposals"
      @resolve="resolveProfileProposal"
    />
    <ProfileHistoryPanel v-if="profileState" :history="profileV2History" />

    <section v-if="profileStatus === 'loading'" class="state-card">
      <p class="eyebrow">加载中</p>
      <h2>正在加载结构化画像...</h2>
    </section>

    <section v-else-if="profileStatus === 'error'" class="state-card error">
      <p class="eyebrow">错误</p>
      <h2>画像加载失败。</h2>
      <p>{{ errorMessage ?? '发生未知画像错误。' }}</p>
      <button class="secondary-button retry-button" @click="workspaceStore.initialize()">重新加载</button>
    </section>

    <section v-else-if="profile && draftProfile && !profileState" class="profile-layout" :class="{ editing: isEditing }">
      <div v-if="!isEditing" class="snapshot-grid">
        <ProfileSnapshotCard
          v-for="section in snapshotSections"
          :key="section.title"
          :title="section.title"
          :eyebrow="section.eyebrow"
          :description="section.description"
          :write-policy-label="section.writePolicyLabel"
          :write-policy-kind="section.writePolicyKind"
          :items="section.items"
        />
      </div>

      <div class="editor-stack">
        <section class="editor-card">
          <div class="editor-head">
            <div>
              <p class="eyebrow">画像编辑</p>
              <h2>编辑画像</h2>
              <p class="completion-copy">
                必填 {{ profileCompletion.completed }} / {{ profileCompletion.total }}
              </p>
            </div>
            <span class="status-chip" :class="{ active: isEditing }">
              {{ isEditing ? '草稿编辑中' : '已与正式数据同步' }}
            </span>
          </div>

          <p v-if="localSaveMessage" class="notice-copy">{{ localSaveMessage }}</p>

          <div v-if="isEditing" class="form-sections">
            <section
              v-for="group in editorFieldGroups"
              :key="group.key"
              class="form-section"
            >
              <header class="form-section-head">
                <div>
                  <p class="eyebrow">{{ group.eyebrow }}</p>
                  <h3>{{ group.title }}</h3>
                  <p>{{ group.description }}</p>
                </div>
                <span class="policy-chip" :class="group.writePolicyKind">
                  {{ group.writePolicyLabel }}
                </span>
              </header>

              <div class="form-grid">
                <label
                  v-for="field in group.fields"
                  :key="field.key"
                  class="field-block"
                  :class="`requirement-${getRequirementKind(field.requiredLevel)}`"
                >
                  <span class="field-label" :title="getFieldHelp(field)">
                    {{ field.label }}
                    <span class="field-label-chips">
                      <small
                        class="requirement-chip"
                        :class="getRequirementKind(field.requiredLevel)"
                      >
                        {{ formatRequiredLevel(field.requiredLevel) }}
                      </small>
                    </span>
                  </span>
                  <input
                    v-if="field.valueType === 'scalar' && field.input === 'text'"
                    :value="getScalarFieldValue(field)"
                    :disabled="!isEditing"
                    :aria-label="field.label"
                    :aria-required="isRequiredProfileField(field)"
                    :placeholder="getScalarPlaceholder(field)"
                    @input="updateScalarField(field, ($event.target as HTMLInputElement).value)"
                  />
                  <textarea
                    v-else-if="field.valueType === 'scalar'"
                    :value="getScalarFieldValue(field)"
                    :disabled="!isEditing"
                    :aria-label="field.label"
                    :aria-required="isRequiredProfileField(field)"
                    :placeholder="getScalarPlaceholder(field)"
                    @input="updateScalarField(field, ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                  <textarea
                    v-else
                    :value="getListFieldValue(field)"
                    :disabled="!isEditing"
                    :aria-label="field.label"
                    :aria-required="isRequiredProfileField(field)"
                    :placeholder="getListPlaceholder(field)"
                    @input="updateListField(field, ($event.target as HTMLTextAreaElement).value)"
                  ></textarea>
                  <span v-if="!hasEditorFieldValue(field)" class="field-example">例：{{ getCompactExample(field) }}</span>
                </label>
              </div>
            </section>
          </div>
        </section>

        <section v-if="!isEditing" class="suggestions-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">对话建议</p>
              <h2>待确认更新</h2>
            </div>
            <span class="status-chip">
              {{ formatSuggestionStatus(profileSuggestionsStatus) }}
            </span>
          </div>

          <section v-if="profileSuggestionsStatus === 'loading'" class="state-card compact">
            <h2>正在加载建议...</h2>
          </section>

          <section v-else-if="profileSuggestionsStatus === 'error'" class="state-card compact error">
            <h2>建议加载失败。</h2>
          </section>

          <div v-else class="suggestion-list">
            <section v-if="profileSuggestions.length === 0" class="state-card compact">
              <h2>暂无待确认建议</h2>
              <p>后续从对话中识别到可靠信息时，会在这里生成可审阅的画像更新。</p>
            </section>
            <ProfileSuggestionCard
              v-for="suggestion in profileSuggestions"
              :key="suggestion.rowId || suggestion.id"
              :suggestion="suggestion"
              :source-label="resolveSourceLabel(suggestion)"
            />
          </div>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.page-heading {
  flex: 1 1 auto;
  width: auto;
}

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(360px, 1.1fr);
  gap: 12px;
}

.profile-layout.editing {
  grid-template-columns: minmax(0, 1fr);
}

.snapshot-grid,
.editor-stack,
.suggestion-list {
  display: grid;
  gap: 10px;
}

.editor-card,
.state-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.state-card.error {
  background: color-mix(in srgb, var(--color-warning-soft) 62%, white);
}

.state-card.compact h2 {
  font-size: 1rem;
}

.header-actions {
  flex: 0 0 auto;
  display: grid;
  justify-items: end;
  gap: 10px;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.primary-button,
.secondary-button {
  border-radius: 999px;
  padding: 0.56rem 0.76rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.primary-button {
  border: 0;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: var(--color-on-primary);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-text);
}

.editor-head,
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.editor-head h2,
.panel-head h2,
.state-card h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 700;
}

.status-chip {
  align-self: flex-start;
  padding: 0.3rem 0.54rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.status-chip.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.editor-copy,
.completion-copy,
.notice-copy,
.state-card p:not(.eyebrow) {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.completion-copy {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.retry-button {
  margin-top: 12px;
}

.notice-copy {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-subtle) 76%, white);
}

.form-sections,
.form-grid,
.list-grid {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}

.form-section {
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.form-section:first-child {
  padding-top: 0;
  border-top: 0;
}

.form-section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.form-section-head h3 {
  margin: 2px 0 3px;
  color: var(--color-text);
  font-size: 1rem;
}

.form-section-head p:not(.eyebrow) {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.45;
  font-size: 0.82rem;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 18px;
  row-gap: 16px;
}

.field-block {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;
}

.field-label {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 700;
}

.field-label-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: flex-end;
}

.requirement-chip {
  padding: 0.08rem 0.34rem;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.3;
}

.requirement-chip.required {
  background: transparent;
  color: var(--color-success);
}

.requirement-chip.recommended {
  background: transparent;
  color: var(--color-secondary-strong);
}

.requirement-chip.conditional {
  background: transparent;
  color: var(--color-warning);
}

.requirement-chip.optional {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}

.policy-chip {
  align-self: flex-start;
  padding: 0.18rem 0.48rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
}

.policy-chip.user {
  background: color-mix(in srgb, var(--color-primary) 12%, white);
  color: var(--color-primary);
}

.policy-chip.agent {
  background: color-mix(in srgb, #2563eb 12%, white);
  color: #2563eb;
}

.policy-chip.conditional {
  background: color-mix(in srgb, var(--color-warning) 14%, white);
  color: var(--color-warning);
}

.policy-chip.sensitive {
  background: color-mix(in srgb, #b42318 12%, white);
  color: #b42318;
}

.field-example {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  line-height: 1.45;
}

.field-example {
  color: color-mix(in srgb, var(--color-text-muted) 86%, var(--color-text));
}

.field-block input,
.field-block textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 7px 9px;
  background: color-mix(in srgb, var(--color-surface) 78%, var(--color-bg-subtle));
  color: var(--color-text);
  font: inherit;
  font-size: 0.88rem;
}

.field-block textarea {
  min-height: 58px;
  resize: vertical;
}

.field-block input::placeholder,
.field-block textarea::placeholder {
  color: color-mix(in srgb, var(--color-text-muted) 70%, transparent);
}

.suggestions-panel {
  display: grid;
  gap: 10px;
}

@media (max-width: 860px) {
  .profile-layout,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .header-actions {
    justify-items: stretch;
  }

  .action-group {
    justify-content: flex-start;
  }

  .editor-head,
  .panel-head,
  .form-section-head {
    flex-direction: column;
  }
}
</style>
