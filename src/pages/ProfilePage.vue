<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import ProfileSnapshotCard from '../modules/profile/ProfileSnapshotCard.vue';
import ProfileSuggestionCard from '../modules/profile/ProfileSuggestionCard.vue';
import {
  buildProfileSnapshotSections,
  listProfileFields,
  scalarProfileFields,
  type ListProfileFieldKey,
  type ScalarProfileFieldKey,
} from '../modules/profile/profileFields';
import { useWorkspaceStore } from '../stores/workspace';
import type { ProfileRecord, ProfileSuggestion } from '../types/entities';

const workspaceStore = useWorkspaceStore();
const {
  activeThread,
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

onMounted(() => {
  void workspaceStore.initialize();
});

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

function cloneProfile(input: ProfileRecord): ProfileRecord {
  return {
    ...input,
    targetIndustries: [...input.targetIndustries],
    constraints: [...input.constraints],
    workPreferences: [...input.workPreferences],
    learningPreferences: [...input.learningPreferences],
    keyStrengths: [...input.keyStrengths],
    riskSignals: [...input.riskSignals],
    portfolioLinks: [...input.portfolioLinks],
  };
}

function beginEditing() {
  if (!profile.value) {
    return;
  }

  draftProfile.value = cloneProfile(profile.value);
  isEditing.value = true;
  localSaveMessage.value = 'Draft editing started. Profile data will not change until you save explicitly.';
}

function cancelEditing() {
  if (profile.value) {
    draftProfile.value = cloneProfile(profile.value);
  }

  isEditing.value = false;
  localSaveMessage.value = 'Draft changes were discarded. Structured profile remains unchanged.';
}

function updateScalarField(key: ScalarProfileFieldKey, value: string) {
  if (!draftProfile.value) {
    return;
  }

  isEditing.value = true;
  draftProfile.value = {
    ...draftProfile.value,
    [key]: value,
  };
}

function updateListField(key: ListProfileFieldKey, value: string) {
  if (!draftProfile.value) {
    return;
  }

  isEditing.value = true;
  draftProfile.value = {
    ...draftProfile.value,
    [key]: value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function getScalarFieldValue(key: ScalarProfileFieldKey) {
  return draftProfile.value?.[key] ?? '';
}

function getListFieldValue(key: ListProfileFieldKey) {
  return draftProfile.value?.[key]?.join('\n') ?? '';
}

function applySuggestion(suggestion: ProfileSuggestion) {
  if (!profile.value) {
    return;
  }

  const baseProfile = draftProfile.value ? cloneProfile(draftProfile.value) : cloneProfile(profile.value);
  const normalizedPatch = Object.fromEntries(
    Object.entries(suggestion.patch).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  ) as Partial<ProfileRecord>;

  draftProfile.value = {
    ...baseProfile,
    ...normalizedPatch,
  };
  isEditing.value = true;
  localSaveMessage.value = `Applied suggestion: ${suggestion.title}. Review the draft, then save explicitly if it looks right.`;
}

async function saveProfile() {
  if (!draftProfile.value || !hasUnsavedChanges.value) {
    return;
  }

  try {
    const savedProfile = await workspaceStore.saveProfileDraft(cloneProfile(draftProfile.value));
    draftProfile.value = cloneProfile(savedProfile);
    isEditing.value = false;
    localSaveMessage.value = 'Profile saved through the typed adapter. Structured data is now updated.';
  } catch {
    localSaveMessage.value = 'Profile save failed. The draft is still local and can be retried.';
  }
}

function resolveSourceLabel(suggestion: ProfileSuggestion) {
  if (!suggestion.sourceThreadId) {
    return null;
  }

  return suggestion.sourceThreadId === activeThread.value?.id ? 'Active thread' : suggestion.sourceThreadId.replace('thread-', 'Thread ');
}
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Profile Lite</p>
        <h1>{{ profile?.displayName ?? 'Loading profile...' }}</h1>
      </div>
      <div class="header-actions">
        <p class="support-copy">
          Structured profile data is the source of truth. Conversation suggestions can enter a local draft, but cannot silently rewrite this view.
        </p>
        <div class="action-group">
          <button class="secondary-button" @click="workspaceStore.openArtifact('artifact-profile-summary')">
            Open Profile Summary
          </button>
          <button v-if="!isEditing" class="primary-button" :disabled="!profile" @click="beginEditing">
            Start Editing
          </button>
          <template v-else>
            <button class="secondary-button" @click="cancelEditing">Discard Draft</button>
            <button
              class="primary-button"
              :disabled="!hasUnsavedChanges || profileSaveStatus === 'loading'"
              @click="saveProfile"
            >
              {{ profileSaveStatus === 'loading' ? 'Saving...' : 'Save Profile' }}
            </button>
          </template>
        </div>
      </div>
    </header>

    <section v-if="profileStatus === 'loading'" class="state-card">
      <p class="eyebrow">Loading</p>
      <h2>Loading structured profile...</h2>
    </section>

    <section v-else-if="profileStatus === 'error'" class="state-card error">
      <p class="eyebrow">Error</p>
      <h2>Profile could not be loaded.</h2>
      <p>{{ errorMessage ?? 'Unknown profile error.' }}</p>
    </section>

    <section v-else-if="profile && draftProfile" class="profile-layout">
      <div class="snapshot-grid">
        <ProfileSnapshotCard
          v-for="section in snapshotSections"
          :key="section.title"
          :title="section.title"
          :items="section.items"
        />
      </div>

      <div class="editor-stack">
        <section class="editor-card">
          <div class="editor-head">
            <div>
              <p class="eyebrow">Editable Draft</p>
              <h2>Explicit changes only</h2>
            </div>
            <span class="status-chip" :class="{ active: isEditing }">
              {{ isEditing ? 'Draft active' : 'Read synced' }}
            </span>
          </div>

          <p class="editor-copy">
            Suggestions can be applied to this draft, but nothing becomes source-of-truth until you click `Save Profile`.
          </p>

          <p v-if="localSaveMessage" class="notice-copy">{{ localSaveMessage }}</p>

          <div class="form-grid">
            <label v-for="field in scalarProfileFields" :key="field.key" class="field-block">
              <span>{{ field.label }}</span>
              <input
                v-if="field.input === 'text'"
                :value="getScalarFieldValue(field.key)"
                :disabled="!isEditing"
                :aria-label="field.label"
                @input="updateScalarField(field.key, ($event.target as HTMLInputElement).value)"
              />
              <textarea
                v-else
                :value="getScalarFieldValue(field.key)"
                :disabled="!isEditing"
                :aria-label="field.label"
                @input="updateScalarField(field.key, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <small>{{ field.description }}</small>
            </label>
          </div>

          <div class="list-grid">
            <label v-for="field in listProfileFields" :key="field.key" class="field-block">
              <span>{{ field.label }}</span>
              <textarea
                :value="getListFieldValue(field.key)"
                :disabled="!isEditing"
                :aria-label="field.label"
                @input="updateListField(field.key, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <small>{{ field.description }} Use one item per line.</small>
            </label>
          </div>
        </section>

        <section class="suggestions-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Conversation Suggestions</p>
              <h2>Non-destructive profile updates</h2>
            </div>
            <span class="status-chip">
              {{ profileSuggestionsStatus === 'ready' ? `${profileSuggestions.length} ready` : profileSuggestionsStatus }}
            </span>
          </div>

          <section v-if="profileSuggestionsStatus === 'loading'" class="state-card compact">
            <h2>Loading suggestions...</h2>
          </section>

          <section v-else-if="profileSuggestionsStatus === 'error'" class="state-card compact error">
            <h2>Suggestions could not be loaded.</h2>
          </section>

          <div v-else class="suggestion-list">
            <ProfileSuggestionCard
              v-for="suggestion in profileSuggestions"
              :key="suggestion.id"
              :suggestion="suggestion"
              :source-label="resolveSourceLabel(suggestion)"
              :disabled="profileSaveStatus === 'loading'"
              @apply="applySuggestion"
            />
          </div>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.95fr);
  gap: 16px;
}

.snapshot-grid,
.editor-stack,
.suggestion-list {
  display: grid;
  gap: 14px;
}

.editor-card,
.state-card {
  padding: 22px;
  border-radius: 24px;
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
  display: grid;
  justify-items: end;
  gap: 12px;
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
  padding: 0.82rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
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
  margin-bottom: 12px;
}

.editor-head h2,
.panel-head h2,
.state-card h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.28rem;
}

.status-chip {
  align-self: flex-start;
  padding: 0.42rem 0.68rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.status-chip.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.editor-copy,
.notice-copy,
.state-card p:not(.eyebrow) {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.notice-copy {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-bg-subtle) 76%, white);
}

.form-grid,
.list-grid {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-block {
  display: grid;
  gap: 8px;
}

.field-block span {
  color: var(--color-text);
  font-size: 0.88rem;
  font-weight: 700;
}

.field-block input,
.field-block textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 12px 14px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font: inherit;
}

.field-block textarea {
  min-height: 112px;
  resize: vertical;
}

.field-block small {
  color: var(--color-text-muted);
  line-height: 1.5;
}

.suggestions-panel {
  display: grid;
  gap: 14px;
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
  .panel-head {
    flex-direction: column;
  }
}
</style>
