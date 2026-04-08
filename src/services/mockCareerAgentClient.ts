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
    title: '本周规划',
    preview: '梳理本周重点，并打开周计划工件。',
    updatedAt: '2026-04-08T09:00:00Z',
    status: 'active',
  },
  {
    id: 'thread-002',
    title: '职业方向',
    preview: '回看目标岗位、风险项和下一阶段里程碑。',
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
      content: '我需要一份能够平衡当前交付工作、学习投入和恢复节奏的**周计划**。',
      createdAt: '2026-04-08 09:00',
    },
    {
      id: 'message-002',
      threadId: 'thread-001',
      role: 'assistant',
      kind: 'markdown',
      content:
        '我可以把这些要求整理成一个周计划工件。\n\n- 优先保障工作台外壳交付\n- 保持画像更新必须显式确认\n- 使用工件宿主面板承载计划展示\n\n当前前端已经托管工件外壳，后续再由上游系统提供实时载荷更新。',
      createdAt: '2026-04-08 09:01',
    },
  ],
  'thread-002': [
    {
      id: 'message-003',
      threadId: 'thread-002',
      role: 'user',
      kind: 'markdown',
      content: '请比较**前端平台型岗位**和**面向 AI 产品的一线前端岗位**。',
      createdAt: '2026-04-07 18:20',
    },
    {
      id: 'message-004',
      threadId: 'thread-002',
      role: 'assistant',
      kind: 'markdown',
      content:
        '路线图工件后续会汇总中期职业方向、能力缺口和推进顺序。\n\n`career-roadmap` 目前是第三种预留工件类型。',
      createdAt: '2026-04-07 18:21',
    },
  ],
};

let profile: ProfileRecord = {
  displayName: 'Fancy',
  locale: 'zh-CN',
  timezone: 'Asia/Singapore',
  currentRole: '偏前端实现的产品构建者',
  employmentStatus: '在持续推进副项目的同时探索下一份角色机会',
  experienceSummary: '擅长前端实现、API 协调和 AI 辅助交付。',
  educationSummary: '以产品驱动实践为核心的结构化自学。',
  locationRegion: '新加坡 / 可远程协作',
  targetRole: 'AI 产品前端工程师',
  targetIndustries: ['AI 工具', '开发者产品', '职业规划工具'],
  shortTermGoal: '交付首个具备稳定契约的智能体工作台前端切片。',
  longTermGoal: '成长为 AI 原生产品方向的前端负责人。',
  weeklyTimeBudget: '固定工作之外每周可投入 10-12 小时',
  constraints: ['需要可持续推进节奏', '不能依赖不稳定的后端契约'],
  workPreferences: ['低干扰工作环境', '契约清晰', '产品结果可见'],
  learningPreferences: ['通过交付来学习', '偏好一次推进一个切片'],
  keyStrengths: ['前端实现', 'API 协调', '面向产品的迭代能力'],
  riskSignals: ['过早铺得太大', '并行方向过多'],
  portfolioLinks: ['https://example.com/portfolio'],
};

const profileSuggestions: ProfileSuggestion[] = [
  {
    id: 'suggestion-target-role',
    title: '收紧目标角色表述',
    rationale: '会话反馈表明，当前目标更应强调面向 AI 原生产品的交付能力，而不是泛前端范围。',
    sourceThreadId: 'thread-002',
    patch: {
      targetRole: '面向开发者产品和职业规划产品的 AI 原生前端工程师',
    },
  },
  {
    id: 'suggestion-short-term-goal',
    title: '让短期目标更具体',
    rationale: '当前工作台切片已经足够明确，可以进一步收敛成更可执行的近期目标。',
    sourceThreadId: 'thread-001',
    patch: {
      shortTermGoal: '交付轻量画像与工件宿主流程，并确保类型化适配层稳定、保存边界清晰。',
    },
  },
  {
    id: 'suggestion-strengths',
    title: '强化优势组合表达',
    rationale: '你最强的定位不只是实现能力，还包括借助 AI 辅助迭代把产品真正交付出去。',
    sourceThreadId: 'thread-002',
    patch: {
      keyStrengths: ['前端实现', 'API 协调', 'AI 辅助产品交付'],
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
    title: '画像摘要',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt: new Date().toISOString(),
    summary: `基于显式画像字段整理出的 ${nextProfile.displayName} 结构化摘要。`,
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffcf7;color:#23313b;">
            <div style="padding:24px;">
              <h1 style="margin:0 0 12px;font-size:24px;">画像摘要</h1>
              <p style="margin:0 0 8px;color:#61707c;">目标角色：${nextProfile.targetRole}</p>
              <p style="margin:0 0 8px;color:#61707c;">核心优势：${nextProfile.keyStrengths.join('、')}</p>
              <p style="margin:0;color:#61707c;">主要风险：${nextProfile.riskSignals[0] ?? '暂无首要风险记录'}</p>
            </div>
          </body>
        </html>`,
    },
  };
}

function buildRefreshedArtifact(currentArtifact: ArtifactRecord): ArtifactRecord {
  const nextRevision = currentArtifact.revision + 1;
  const refreshedAt = new Date().toISOString();

  if (currentArtifact.id === 'artifact-profile-summary') {
    return buildProfileSummaryArtifact(profile, nextRevision);
  }

  if (currentArtifact.id === 'artifact-weekly-plan') {
    return {
      ...currentArtifact,
      revision: nextRevision,
      status: 'ready',
      updatedAt: refreshedAt,
      summary: '周计划已通过 mock 工件链路刷新。',
      payload: {
        html: `
          <html lang="zh-CN">
            <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
              <div style="padding:24px;">
                <div style="padding:18px;border:1px solid rgba(96,114,126,0.16);border-radius:18px;background:#fffcf7;">
                  <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">周计划</p>
                  <h1 style="margin:0;font-size:26px;line-height:1.1;">交付优先级保持不变，但计划已经刷新。</h1>
                  <p style="margin:14px 0 0;color:#61707c;line-height:1.7;">已于 ${refreshedAt} 通过 mock 流式刷新路径更新。</p>
                  <ul style="margin:18px 0 0;padding-left:18px;line-height:1.8;color:#61707c;">
                    <li>复查路由与面板外壳稳定性</li>
                    <li>继续保证画像保存边界显式清晰</li>
                    <li>为下一轮前端迭代准备工件聚焦模式</li>
                  </ul>
                </div>
              </div>
            </body>
          </html>`,
      },
    };
  }

  return {
    ...currentArtifact,
    revision: nextRevision,
    status: 'ready',
    updatedAt: refreshedAt,
    summary: '职业路线图已从旧版本状态刷新完成。',
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
            <div style="padding:24px;">
              <h1 style="margin:0 0 14px;font-size:24px;">职业路线图</h1>
              <p style="margin:0 0 12px;color:#61707c;">这个工件已于 ${refreshedAt} 刷新。</p>
              <ol style="margin:0;padding-left:18px;line-height:1.8;color:#61707c;">
                <li>稳定工作台外壳与工件聚焦模式</li>
                <li>打通一条完整的上游刷新链路</li>
                <li>把已交付切片沉淀为更有说服力的作品叙事</li>
              </ol>
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
    title: '周计划',
    status: 'ready',
    renderMode: 'html',
    revision: 3,
    updatedAt: '2026-04-08T09:04:00Z',
    summary: '平衡交付、学习和恢复节奏的短周期计划。',
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
            <div style="padding:24px;">
              <div style="padding:18px;border:1px solid rgba(96,114,126,0.16);border-radius:18px;background:#fffcf7;">
                <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">周计划</p>
                <h1 style="margin:0;font-size:26px;line-height:1.1;">优先保护交付时间，聚焦学习节奏，保留恢复空间。</h1>
                <ul style="margin:18px 0 0;padding-left:18px;line-height:1.8;color:#61707c;">
                  <li>周一至周二：完成外壳与路由骨架</li>
                  <li>周三：推进轻量画像与类型化适配层</li>
                  <li>周四：完善工件宿主与 iframe 路径</li>
                  <li>周五：与上游团队进行集成评审</li>
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
    title: '职业路线图',
    status: 'stale',
    renderMode: 'html',
    revision: 2,
    updatedAt: '2026-04-07T18:21:00Z',
    summary: '作为第三种支持类型预留的中期方向工件。',
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
            <div style="padding:24px;">
              <h1 style="margin:0 0 14px;font-size:24px;">职业路线图</h1>
              <ol style="margin:0;padding-left:18px;line-height:1.8;color:#61707c;">
                <li>稳定智能体工作台外壳</li>
                <li>交付一条端到端工件工作流</li>
                <li>用已上线成果强化作品叙事</li>
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
    async refreshArtifact(artifactId: string) {
      const artifactIndex = artifacts.findIndex((entry) => entry.id === artifactId);

      if (artifactIndex < 0) {
        return null;
      }

      artifacts[artifactIndex] = buildRefreshedArtifact(artifacts[artifactIndex]);
      return cloneArtifactRecord(artifacts[artifactIndex]);
    },
  };
}
