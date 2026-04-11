import { runtimeConfig } from '../config/runtime';
import type { CareerAgentClient } from './careerAgentClient';
import type {
  ArtifactRecord,
  ProfileRecord,
  ProfileSuggestion,
  ThreadMessage,
  ThreadSummary,
} from '../types/entities';

function buildCanvasFixtureUrl(options: { revision?: number; scenario?: string } = {}): string {
  const baseUrl = runtimeConfig.nodeCanvasFixtureUrl ?? '/mock-node-canvas/index.html';

  try {
    const parsedUrl = baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
      ? new URL(baseUrl)
      : new URL(baseUrl, 'http://fixture.local');

    if (options.revision !== undefined) {
      parsedUrl.searchParams.set('revision', String(options.revision));
    }

    if (options.scenario) {
      parsedUrl.searchParams.set('scenario', options.scenario);
    }

    if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
      return parsedUrl.toString();
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return baseUrl;
  }
}

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
  {
    id: 'thread-003',
    title: '模拟面试',
    preview: '进入沉浸式面试画布，验证问答、计时和反馈状态。',
    updatedAt: '2026-04-10T13:10:00Z',
    status: 'active',
  },
  {
    id: 'thread-004',
    title: '代码题演练',
    preview: '打开 URL 型代码题工作台，模拟后端 node 项目嵌入。',
    updatedAt: '2026-04-10T13:18:00Z',
    status: 'active',
  },
  {
    id: 'thread-005',
    title: '可视化学习',
    preview: '用学习画布验证步骤推进、反馈事件和解释节奏。',
    updatedAt: '2026-04-10T13:26:00Z',
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
      agentId: 'agent-planner',
      agentName: '规划助手',
      agentAccent: 'teal',
      reasoning: '先判断用户是在做短周期计划，而不是长期路线图。\n\n再把约束拆成工作交付、学习投入和恢复节奏三类。\n\n最后优先输出一个可执行的周计划工件，而不是继续追问太多背景。',
      content:
        '我可以把这些要求整理成一个周计划工件。\n\n- 优先保障工作台外壳交付\n- 保持画像更新必须显式确认\n- 使用工件宿主面板承载计划展示\n\n当前前端已经托管工件外壳，后续再由上游系统提供实时载荷更新。',
      actions: [
        {
          id: 'action-open-weekly-plan',
          kind: 'open-artifact',
          label: '打开周计划画布',
          artifactId: 'artifact-weekly-plan',
          viewMode: 'pane',
        },
      ],
      createdAt: '2026-04-08 09:01',
    },
    {
      id: 'message-003',
      threadId: 'thread-001',
      role: 'assistant',
      kind: 'markdown',
      agentId: 'agent-execution',
      agentName: '执行助手',
      agentAccent: 'amber',
      content:
        '如果你下一步要进入更接近真实项目的工作面，我也可以把结果切到 **URL 型工作画布**，用来承载 node 应用或交互式面试界面。',
      createdAt: '2026-04-08 09:02',
    },
  ],
  'thread-002': [
    {
      id: 'message-004',
      threadId: 'thread-002',
      role: 'user',
      kind: 'markdown',
      content: '请比较**前端平台型岗位**和**面向 AI 产品的一线前端岗位**。',
      createdAt: '2026-04-07 18:20',
    },
    {
      id: 'message-005',
      threadId: 'thread-002',
      role: 'assistant',
      kind: 'markdown',
      agentId: 'agent-direction',
      agentName: '方向助手',
      agentAccent: 'blue',
      content:
        '<think>先比较岗位职责中心，再判断哪条路径更贴合当前的前端和 AI 协作背景。</think>\n\n路线图工件后续会汇总中期职业方向、能力缺口和推进顺序。\n\n`career-roadmap` 目前也是 URL 型工作画布的首个 mock 入口。',
      actions: [
        {
          id: 'action-open-career-roadmap',
          kind: 'open-artifact',
          label: '打开职业路线图',
          artifactId: 'artifact-career-roadmap',
          viewMode: 'focus',
        },
      ],
      createdAt: '2026-04-07 18:21',
    },
  ],
  'thread-003': [
    {
      id: 'message-006',
      threadId: 'thread-003',
      role: 'user',
      kind: 'markdown',
      content: '我想模拟一次 **AI 产品前端工程师** 面试，最好能进入更沉浸的界面。',
      createdAt: '2026-04-10 13:10',
    },
    {
      id: 'message-007',
      threadId: 'thread-003',
      role: 'assistant',
      kind: 'markdown',
      reasoning:
        '模拟面试属于高沉浸任务，不适合继续保留左侧导航和普通对话密度。应优先打开 immersive canvas，并让后续回答、提示、评分都作为结构化事件回传给上游。',
      content:
        '可以。这个场景适合使用 **沉浸式工作画布**：左侧导航隐藏，对话区让位给面试室，后续再把你的回答、请求提示、跳题等行为回传给 agent。\n\n第一版先验证画布承载和入口流程，不在前端实现真正评分。',
      actions: [
        {
          id: 'action-open-mock-interview',
          kind: 'open-artifact',
          label: '进入模拟面试',
          artifactId: 'artifact-mock-interview',
          viewMode: 'immersive',
        },
      ],
      createdAt: '2026-04-10 13:11',
    },
  ],
  'thread-004': [
    {
      id: 'message-008',
      threadId: 'thread-004',
      role: 'user',
      kind: 'markdown',
      content: '我想练一道接近线上面试的前端代码题，最好能像真实测评系统一样打开。',
      createdAt: '2026-04-10 13:18',
    },
    {
      id: 'message-009',
      threadId: 'thread-004',
      role: 'assistant',
      kind: 'markdown',
      content:
        '这类场景更接近 **node/web 项目型工作画布**。前端只负责接收上游返回的 URL，并在右侧 work canvas 里嵌入；题目运行、判题、保存草稿仍应由上游项目或 agent runtime 负责。',
      actions: [
        {
          id: 'action-open-coding-assessment',
          kind: 'open-artifact',
          label: '打开代码题工作台',
          artifactId: 'artifact-coding-assessment',
          viewMode: 'focus',
        },
      ],
      createdAt: '2026-04-10 13:19',
    },
  ],
  'thread-005': [
    {
      id: 'message-010',
      threadId: 'thread-005',
      role: 'user',
      kind: 'markdown',
      content: '我想把“从 Vue 前端到 AI 产品协作”做成更有趣的可视化学习流程。',
      createdAt: '2026-04-10 13:26',
    },
    {
      id: 'message-011',
      threadId: 'thread-005',
      role: 'assistant',
      kind: 'markdown',
      content:
        '可以先用一个 **可视化学习画布** 验证节奏：步骤推进、卡点记录、请求解释、完成反馈都应该变成结构化事件，而不是只停留在聊天文本里。',
      actions: [
        {
          id: 'action-open-visual-learning',
          kind: 'open-artifact',
          label: '打开学习画布',
          artifactId: 'artifact-visual-learning',
          viewMode: 'pane',
        },
      ],
      createdAt: '2026-04-10 13:27',
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
  switch (input.renderMode) {
    case 'html':
      return {
        ...input,
        payload: {
          html: input.payload.html,
        },
      };
    case 'url':
      return {
        ...input,
        payload: {
          url: input.payload.url,
        },
      };
    case 'markdown':
      return {
        ...input,
        payload: {
          markdown: input.payload.markdown,
        },
      };
    case 'cards':
      return {
        ...input,
        payload: {
          cards: [...input.payload.cards],
        },
      };
  }
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

function buildMockInterviewArtifact(revision: number, updatedAt = '2026-04-10T13:12:00Z'): ArtifactRecord {
  return {
    id: 'artifact-mock-interview',
    type: 'mock-interview',
    title: '模拟面试室',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt,
    summary: '用于验证沉浸式面试、计时、题目和反馈区的 HTML 工作画布。',
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#f6f0e4;color:#23313b;">
            <main style="min-height:100vh;padding:28px;display:grid;gap:18px;grid-template-rows:auto 1fr;">
              <section style="padding:22px;border:1px solid rgba(96,114,126,.16);border-radius:26px;background:#fffaf2;">
                <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Mock Interview</p>
                <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;">AI 产品前端工程师模拟面试</h1>
                <p style="margin:12px 0 0;color:#61707c;line-height:1.7;">当前画布只验证前端宿主能力。真实评分、追问和难度调整应由上游 agent 根据结构化事件返回。</p>
              </section>
              <section style="display:grid;grid-template-columns:1.15fr .85fr;gap:18px;">
                <article style="padding:22px;border:1px solid rgba(96,114,126,.16);border-radius:26px;background:#fffaf2;">
                  <p style="margin:0 0 8px;color:#61707c;font-weight:700;">当前问题</p>
                  <h2 style="margin:0;font-size:24px;">如何设计一个能承载 agent 生成页面的前端 work canvas？</h2>
                  <ul style="margin:18px 0 0;padding-left:20px;color:#61707c;line-height:1.9;">
                    <li>说明 iframe / URL / HTML 三种边界</li>
                    <li>说明如何把交互事件反馈给 agent</li>
                    <li>说明沉浸模式什么时候优于并排模式</li>
                  </ul>
                </article>
                <aside style="padding:22px;border:1px solid rgba(96,114,126,.16);border-radius:26px;background:#fffaf2;">
                  <p style="margin:0 0 8px;color:#61707c;font-weight:700;">面试状态</p>
                  <div style="display:grid;gap:12px;color:#61707c;">
                    <span>计时：18:00</span>
                    <span>阶段：系统设计追问</span>
                    <span>版本：${revision}</span>
                    <span>后续事件：answer_submitted / hint_requested</span>
                  </div>
                </aside>
              </section>
            </main>
          </body>
        </html>`,
    },
  };
}

function buildVisualLearningArtifact(revision: number, updatedAt = '2026-04-10T13:28:00Z'): ArtifactRecord {
  return {
    id: 'artifact-visual-learning',
    type: 'visual-learning',
    title: '可视化学习路径',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt,
    summary: '用于验证可视化学习、步骤推进和解释请求的 HTML 工作画布。',
    payload: {
      html: `
        <html lang="zh-CN">
          <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fbf6ed;color:#23313b;">
            <main style="min-height:100vh;padding:28px;">
              <section style="padding:24px;border:1px solid rgba(96,114,126,.16);border-radius:28px;background:#fffaf2;">
                <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Visual Learning</p>
                <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;">从 Vue 前端到 AI 产品协作</h1>
                <p style="margin:12px 0 0;color:#61707c;line-height:1.7;">这个画布用于模拟可交互学习路径。真实阶段完成、反思记录和请求讲解后续应作为结构化事件回传。</p>
              </section>
              <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px;">
                ${['理解职责边界', '设计 work canvas', '回传交互事件'].map((title, index) => `
                  <article style="padding:20px;border:1px solid rgba(96,114,126,.16);border-radius:24px;background:#fffaf2;">
                    <p style="margin:0 0 10px;color:#1d736d;font-weight:800;">Step ${index + 1}</p>
                    <h2 style="margin:0;font-size:22px;">${title}</h2>
                    <p style="margin:12px 0 0;color:#61707c;line-height:1.7;">事件示例：step_completed / explanation_requested</p>
                  </article>
                `).join('')}
              </section>
            </main>
          </body>
        </html>`,
    },
  };
}

function buildCodingAssessmentArtifact(revision: number, updatedAt = '2026-04-10T13:20:00Z'): ArtifactRecord {
  return {
    id: 'artifact-coding-assessment',
    type: 'coding-assessment',
    title: '代码题工作台',
    status: 'ready',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: '用于验证后端 node/web 项目以 URL 形式嵌入右侧工作画布。',
    payload: {
      url: buildCanvasFixtureUrl({ revision, scenario: 'coding-assessment' }),
    },
  };
}

function buildCareerRoadmapArtifact(revision: number, updatedAt = '2026-04-07T18:21:00Z'): ArtifactRecord {
  return {
    id: 'artifact-career-roadmap',
    type: 'career-roadmap',
    title: '职业路线图工作台',
    status: 'stale',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: '用 URL 型工作画布模拟 node/web 应用承载的职业路线图或面试工作台。',
    payload: {
      url: buildCanvasFixtureUrl({ revision, scenario: 'career-roadmap' }),
    },
  };
}

function buildRefreshedArtifact(currentArtifact: ArtifactRecord): ArtifactRecord {
  const nextRevision = currentArtifact.revision + 1;
  const refreshedAt = new Date().toISOString();

  if (currentArtifact.id === 'artifact-profile-summary') {
    return buildProfileSummaryArtifact(profile, nextRevision);
  }

  if (currentArtifact.id === 'artifact-mock-interview') {
    return buildMockInterviewArtifact(nextRevision, refreshedAt);
  }

  if (currentArtifact.id === 'artifact-visual-learning') {
    return buildVisualLearningArtifact(nextRevision, refreshedAt);
  }

  if (currentArtifact.id === 'artifact-coding-assessment') {
    return buildCodingAssessmentArtifact(nextRevision, refreshedAt);
  }

  if (currentArtifact.id === 'artifact-career-roadmap') {
    return {
      ...currentArtifact,
      renderMode: 'url',
      revision: nextRevision,
      status: 'ready',
      updatedAt: refreshedAt,
      summary: '职业路线图 URL 工作画布已刷新到新版本。',
      payload: {
        url: buildCanvasFixtureUrl({ revision: nextRevision, scenario: 'career-roadmap' }),
      },
    };
  }

  if (currentArtifact.id === 'artifact-weekly-plan') {
    return {
      ...currentArtifact,
      renderMode: 'html',
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
    summary: `${currentArtifact.title} 已通过 mock 工件链路刷新。`,
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
  buildCareerRoadmapArtifact(2),
  buildMockInterviewArtifact(1),
  buildCodingAssessmentArtifact(1),
  buildVisualLearningArtifact(1),
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
