<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { BaseProfilePatch, BaseProfileRecord, EducationBackgroundItem } from './profileV2Types';

const props = defineProps<{ profile: BaseProfileRecord; saving?: boolean }>();
const emit = defineEmits<{ save: [patch: BaseProfilePatch] }>();
const draft = reactive<BaseProfilePatch>({});
const emptyEducation = (): EducationBackgroundItem => ({ school: '', major: '', degree: '', graduationDate: null, description: '' });
const education = reactive(emptyEducation());

watch(
  () => props.profile,
  (profile) => {
    Object.assign(draft, {
      name: profile.name,
      gender: profile.gender,
      birthDate: profile.birthDate,
      educationLevel: profile.educationLevel,
      currentCity: profile.currentCity,
      currentStatus: profile.currentStatus,
      currentRole: profile.currentRole,
      currentIndustry: profile.currentIndustry,
      yearsOfExperience: profile.yearsOfExperience,
      contactLanguage: profile.contactLanguage,
    });
    Object.assign(education, profile.educationBackground[0] ?? emptyEducation());
  },
  { immediate: true },
);

function submit() {
  emit('save', {
    ...draft,
    birthDate: draft.birthDate || null,
    educationBackground: Object.values(education).some(Boolean)
      ? [{ ...education, graduationDate: education.graduationDate || null }]
      : [],
  });
}
</script>

<template>
  <form class="base-profile-form" @submit.prevent="submit">
    <header>
      <div>
        <p class="eyebrow">PROFILE V2</p>
        <h2>基础资料</h2>
        <p>这些字段由你维护；Agent 只能在获得确认后修改。</p>
      </div>
      <span>版本 {{ profile.version }}</span>
    </header>
    <p v-if="profile.missingRequiredFields.length" class="notice">
      尚未补充：{{ profile.missingRequiredFields.join('、') }}。不影响使用其他功能。
    </p>
    <div class="fields">
      <label>姓名<input v-model="draft.name" /></label>
      <label>性别<input v-model="draft.gender" /></label>
      <label>出生日期<input v-model="draft.birthDate" type="date" /></label>
      <label>最高学历<input v-model="draft.educationLevel" /></label>
      <label>当前城市<input v-model="draft.currentCity" /></label>
      <label>当前状态<input v-model="draft.currentStatus" /></label>
      <label>当前岗位<input v-model="draft.currentRole" /></label>
      <label>当前行业<input v-model="draft.currentIndustry" /></label>
      <label>工作年限<input :value="draft.yearsOfExperience ?? ''" type="number" min="0" max="80" step="0.5" @input="draft.yearsOfExperience = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)" /></label>
      <label>交流语言<input v-model="draft.contactLanguage" /></label>
      <label>学校<input v-model="education.school" /></label>
      <label>专业<input v-model="education.major" /></label>
      <label>学位<input v-model="education.degree" /></label>
      <label>毕业日期<input v-model="education.graduationDate" type="date" /></label>
      <label class="wide">教育背景补充<input v-model="education.description" /></label>
    </div>
    <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '保存基础资料' }}</button>
  </form>
</template>

<style scoped>
.base-profile-form { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); }
header { display: flex; justify-content: space-between; gap: 12px; }
h2, p { margin: 0; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
label { display: grid; gap: 6px; color: var(--color-text-muted); }
.wide { grid-column: 1 / -1; }
input { padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-surface-strong); color: var(--color-text); }
.notice { padding: 10px 12px; border-radius: 10px; background: var(--color-warning-soft); }
button { justify-self: end; padding: 10px 16px; border: 0; border-radius: 999px; background: var(--color-primary); color: var(--color-on-primary); font-weight: 700; }
@media (max-width: 720px) { .fields { grid-template-columns: 1fr; } }
</style>
