import type { CareerAgentClient } from './careerAgentClient';
import type {
  ArtifactRecord,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

const threads: ThreadSummary[] = [
  {
    id: 'thread-001',
    title: 'Weekly Planning',
    preview: 'Clarify this week’s priorities and open the plan artifact.',
    updatedAt: '2026-04-08T09:00:00Z',
    status: 'active',
  },
  {
    id: 'thread-002',
    title: 'Career Direction',
    preview: 'Review target roles, risks, and next milestones.',
    updatedAt: '2026-04-07T18:20:00Z',
    status: 'active',
  },
];

const messagesByThread: Record<string, ThreadMessage[]> = {
  'thread-001': [
    {
      id: 'message-001',
      threadId: 'thread-001',
      role: 'user',
      kind: 'markdown',
      content: 'I need a **weekly plan** that balances current delivery work, study time, and recovery.',
      createdAt: '2026-04-08 09:00',
    },
    {
      id: 'message-002',
      threadId: 'thread-001',
      role: 'assistant',
      kind: 'markdown',
      content:
        'I can map that into a weekly artifact.\n\n- Protect shell work first\n- Keep profile updates explicit\n- Use the artifact host for plan rendering\n\nThe frontend currently hosts the artifact shell, while upstream systems will later provide realtime payload updates.',
      createdAt: '2026-04-08 09:01',
    },
  ],
  'thread-002': [
    {
      id: 'message-003',
      threadId: 'thread-002',
      role: 'user',
      kind: 'markdown',
      content: 'Compare **frontend platform roles** with **AI-product-facing frontend roles**.',
      createdAt: '2026-04-07 18:20',
    },
    {
      id: 'message-004',
      threadId: 'thread-002',
      role: 'assistant',
      kind: 'markdown',
      content:
        'The roadmap artifact will later summarize medium-term career direction, skill gaps, and sequencing.\n\n`career-roadmap` is currently the third locked artifact type.',
      createdAt: '2026-04-07 18:21',
    },
  ],
};

let profile: ProfileRecord = {
  displayName: 'Fancy',
  locale: 'zh-CN',
  timezone: 'Asia/Singapore',
  currentRole: 'Frontend-focused builder',
  employmentStatus: 'Exploring next role while shipping side work',
  experienceSummary: 'Frontend implementation, API coordination, and AI-assisted delivery.',
  educationSummary: 'Structured self-learning with product-driven practice.',
  locationRegion: 'Singapore / remote-friendly',
  targetRole: 'AI product frontend engineer',
  targetIndustries: ['AI tools', 'developer products', 'career tooling'],
  shortTermGoal: 'Ship the first agent workspace frontend slice with stable contracts.',
  longTermGoal: 'Grow into a frontend lead for AI-native products.',
  weeklyTimeBudget: '10-12 focused hours outside fixed work',
  constraints: ['Need sustainable pacing', 'Cannot rely on unstable backend contracts'],
  workPreferences: ['Calm workspace', 'Clear contracts', 'Visible product outcomes'],
  learningPreferences: ['Learn by shipping', 'Prefer one slice at a time'],
  keyStrengths: ['Frontend implementation', 'API coordination', 'Product-oriented iteration'],
  riskSignals: ['Over-scoping too early', 'Too many parallel directions'],
  portfolioLinks: ['https://example.com/portfolio'],
};

const profileSuggestions: ProfileSuggestion[] = [
  {
    id: 'suggestion-target-role',
    title: 'Tighten the target role wording',
    rationale: 'Thread feedback suggests the current target should emphasize AI-native product delivery rather than generic frontend scope.',
    sourceThreadId: 'thread-002',
    patch: {
      targetRole: 'AI-native frontend engineer for developer and career products',
    },
  },
  {
    id: 'suggestion-short-term-goal',
    title: 'Make the short-term goal more concrete',
    rationale: 'The current workspace slice is already clear enough to turn into a tighter execution goal.',
    sourceThreadId: 'thread-001',
    patch: {
      shortTermGoal: 'Ship profile-lite and artifact-host flows with stable typed adapters and explicit save boundaries.',
    },
  },
  {
    id: 'suggestion-strengths',
    title: 'Sharpen the strengths cluster',
    rationale: 'Your strongest positioning is not only implementation but shipping with AI-assisted iteration discipline.',
    sourceThreadId: 'thread-002',
    patch: {
      keyStrengths: ['Frontend implementation', 'API coordination', 'AI-assisted product delivery'],
    },
  },
];

function cloneProfileRecord(input: ProfileRecord): ProfileRecord {
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

function cloneProfileSuggestionPatch(patch: Partial<ProfileRecord>) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  ) as Partial<ProfileRecord>;
}

function cloneArtifactRecord(input: ArtifactRecord): ArtifactRecord {
  return {
    ...input,
    payload: {
      ...input.payload,
    },
  };
}

function buildProfileSummaryArtifact(nextProfile: ProfileRecord, revision: number): ArtifactRecord {
  return {
    id: 'artifact-profile-summary',
    type: 'profile-summary',
    title: 'Profile Summary',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt: new Date().toISOString(),
    summary: `Structured summary for ${nextProfile.displayName} based on explicit profile fields.`,
    payload: {
      html: `
        <html lang="en">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffcf7;color:#23313b;">
            <div style="padding:24px;">
              <h1 style="margin:0 0 12px;font-size:24px;">Profile Summary</h1>
              <p style="margin:0 0 8px;color:#61707c;">Target role: ${nextProfile.targetRole}</p>
              <p style="margin:0 0 8px;color:#61707c;">Strengths: ${nextProfile.keyStrengths.join(', ')}</p>
              <p style="margin:0;color:#61707c;">Risk: ${nextProfile.riskSignals[0] ?? 'No primary risk signal recorded'}</p>
            </div>
          </body>
        </html>`,
    },
  };
}

const artifacts: ArtifactRecord[] = [
  {
    id: 'artifact-weekly-plan',
    type: 'weekly-plan',
    title: 'Weekly Plan',
    status: 'ready',
    renderMode: 'html',
    revision: 3,
    updatedAt: '2026-04-08T09:04:00Z',
    summary: 'Short-horizon plan balancing delivery, study, and recovery.',
    payload: {
      html: `
        <html lang="en">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
            <div style="padding:24px;">
              <div style="padding:18px;border:1px solid rgba(96,114,126,0.16);border-radius:18px;background:#fffcf7;">
                <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Weekly Plan</p>
                <h1 style="margin:0;font-size:26px;line-height:1.1;">Protect delivery time, keep study focused, preserve recovery.</h1>
                <ul style="margin:18px 0 0;padding-left:18px;line-height:1.8;color:#61707c;">
                  <li>Mon-Tue: shell and route skeleton</li>
                  <li>Wed: profile-lite and typed adapters</li>
                  <li>Thu: artifact host and iframe path</li>
                  <li>Fri: integration review with upstream team</li>
                </ul>
              </div>
            </div>
          </body>
        </html>`,
    },
  },
  buildProfileSummaryArtifact(profile, 1),
  {
    id: 'artifact-career-roadmap',
    type: 'career-roadmap',
    title: 'Career Roadmap',
    status: 'stale',
    renderMode: 'html',
    revision: 2,
    updatedAt: '2026-04-07T18:21:00Z',
    summary: 'Medium-term direction artifact reserved as the third supported type.',
    payload: {
      html: `
        <html lang="en">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
            <div style="padding:24px;">
              <h1 style="margin:0 0 14px;font-size:24px;">Career Roadmap</h1>
              <ol style="margin:0;padding-left:18px;line-height:1.8;color:#61707c;">
                <li>Stabilize the agent workspace shell</li>
                <li>Ship one end-to-end artifact workflow</li>
                <li>Use shipped work to strengthen portfolio narrative</li>
              </ol>
            </div>
          </body>
        </html>`,
    },
  },
];

export function createMockCareerAgentClient(): CareerAgentClient {
  return {
    async listThreads() {
      return threads;
    },
    async getThreadMessages(threadId: string) {
      return messagesByThread[threadId] ?? [];
    },
    async getProfile() {
      return cloneProfileRecord(profile);
    },
    async updateProfile(nextProfile) {
      profile = cloneProfileRecord(nextProfile);

      const artifactIndex = artifacts.findIndex((artifact) => artifact.id === 'artifact-profile-summary');

      if (artifactIndex >= 0) {
        const currentArtifact = artifacts[artifactIndex];
        artifacts[artifactIndex] = buildProfileSummaryArtifact(profile, currentArtifact.revision + 1);
      }

      return cloneProfileRecord(profile);
    },
    async listProfileSuggestions() {
      return profileSuggestions.map((suggestion) => ({
        ...suggestion,
        patch: cloneProfileSuggestionPatch(suggestion.patch),
      }));
    },
    async listArtifacts() {
      return artifacts.map(cloneArtifactRecord);
    },
    async getArtifact(artifactId: string) {
      const artifact = artifacts.find((entry) => entry.id === artifactId);

      return artifact ? cloneArtifactRecord(artifact) : null;
    },
  };
}
