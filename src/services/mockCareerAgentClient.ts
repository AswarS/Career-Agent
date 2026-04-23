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

const htmlAppExampleUrl = runtimeConfig.htmlAppExampleUrl?.trim() || null;
const nodeAppExampleUrl = runtimeConfig.nodeAppExampleUrl?.trim() || null;

const htmlAppExampleThreads: ThreadSummary[] = htmlAppExampleUrl
  ? [
      {
        id: 'thread-009',
        title: '弹跳小球应用',
        preview: '打开静态应用画布。',
        updatedAt: '2026-04-14T13:10:00Z',
        status: 'active',
      },
    ]
  : [];

const nodeAppExampleThreads: ThreadSummary[] = nodeAppExampleUrl
  ? [
      {
        id: 'thread-010',
        title: '求导挑战应用',
        preview: '打开交互练习画布。',
        updatedAt: '2026-04-14T13:16:00Z',
        status: 'active',
      },
    ]
  : [];

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
    preview: '回看门店运营路线、风险项和下一阶段里程碑。',
    updatedAt: '2026-04-07T18:20:00Z',
    status: 'active',
  },
  {
    id: 'thread-003',
    title: '模拟面试',
    preview: '进入咖啡店店长面试练习室，体验倒计时和提示。',
    updatedAt: '2026-04-10T13:10:00Z',
    status: 'active',
  },
  {
    id: 'thread-004',
    title: '排队题演练',
    preview: '打开终端风格的博物馆排队评测器。',
    updatedAt: '2026-04-10T13:18:00Z',
    status: 'active',
  },
  {
    id: 'thread-005',
    title: '二次函数可视化',
    preview: '拖动参数，观察抛物线形状和交点变化。',
    updatedAt: '2026-04-10T13:26:00Z',
    status: 'active',
  },
  {
    id: 'thread-006',
    title: '图片观察',
    preview: '查看图片素材并整理观察建议。',
    updatedAt: '2026-04-14T11:18:00Z',
    status: 'active',
  },
  {
    id: 'thread-007',
    title: '视频回放',
    preview: '查看视频素材并提炼关键片段。',
    updatedAt: '2026-04-14T11:22:00Z',
    status: 'active',
  },
  {
    id: 'thread-008',
    title: '第二视频回放',
    preview: '打开第二段视频素材。',
    updatedAt: '2026-04-14T11:48:00Z',
    status: 'active',
  },
  ...htmlAppExampleThreads,
  ...nodeAppExampleThreads,
];

const htmlAppExampleMessages: ThreadMessage[] = htmlAppExampleUrl
  ? [
      {
        id: 'message-018',
        threadId: 'thread-009',
        role: 'user',
        kind: 'markdown',
        content: '请打开弹跳小球应用画布。',
        createdAt: '2026-04-14 13:10',
      },
      {
        id: 'message-019',
        threadId: 'thread-009',
        role: 'assistant',
        kind: 'markdown',
        agentId: 'agent-canvas',
        agentName: '画布助手',
        agentAccent: 'amber',
        content:
          '已准备好弹跳小球应用画布。你可以在独立工作区查看运行状态，并按需要切换到聚焦视图。',
        actions: [
          {
            id: 'action-open-html-app-example',
            kind: 'open-artifact',
            label: '打开应用画布',
            artifactId: 'artifact-html-app-example',
            viewMode: 'focus',
          },
        ],
        createdAt: '2026-04-14 13:11',
      },
    ]
  : [];

const nodeAppExampleMessages: ThreadMessage[] = nodeAppExampleUrl
  ? [
      {
        id: 'message-020',
        threadId: 'thread-010',
        role: 'user',
        kind: 'markdown',
        content: '请打开求导挑战应用画布。',
        createdAt: '2026-04-14 13:16',
      },
      {
        id: 'message-021',
        threadId: 'thread-010',
        role: 'assistant',
        kind: 'markdown',
        agentId: 'agent-canvas',
        agentName: '画布助手',
        agentAccent: 'blue',
        content:
          '已准备好求导挑战应用画布。它会在工作区中打开，便于边练习边回到会话继续调整。',
        actions: [
          {
            id: 'action-open-node-app-example',
            kind: 'open-artifact',
            label: '打开应用画布',
            artifactId: 'artifact-node-app-example',
            viewMode: 'focus',
          },
        ],
        createdAt: '2026-04-14 13:17',
      },
    ]
  : [];

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
        '我可以把这些要求整理成一个周计划。\n\n- 优先保障交付任务\n- 保留学习和复盘时间\n- 给恢复安排明确边界',
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
        '如果你想进一步拆解某个任务，我可以把结果切到独立工作画布，方便持续操作。',
      createdAt: '2026-04-08 09:02',
    },
  ],
  'thread-002': [
    {
      id: 'message-004',
      threadId: 'thread-002',
      role: 'user',
      kind: 'markdown',
      content: '请帮我梳理从**咖啡师**到**门店店长**的成长路线。',
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
      reasoning:
        '先把路线拆成服务能力、班次管理、库存与客诉处理三个阶段，再判断每一阶段适合观察哪些证据。',
      content:
        '路线图会先汇总中期职业方向、能力缺口和推进顺序。\n\n第一版先用餐饮门店场景做验证：从稳定服务、带班协作，到库存、排班和客诉处理。',
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
      content: '我想模拟一次 **咖啡店店长** 面试，最好能进入更沉浸的界面。',
      createdAt: '2026-04-10 13:10',
    },
    {
      id: 'message-007',
      threadId: 'thread-003',
      role: 'assistant',
      kind: 'markdown',
      reasoning:
        '模拟面试需要连续回答和计时压力，不适合被旁边信息打断。这里优先打开独立练习室，让问题、提示和记录都围绕同一个面试场景。',
      content:
        '可以。这个场景适合进入 **沉浸式面试练习室**：计时、问题切换、提示和要点检查都集中在同一块界面里。',
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
      content: '我想练一道偏逻辑的排队题，题目最好和普通生活场景有关。',
      createdAt: '2026-04-10 13:18',
    },
    {
      id: 'message-009',
      threadId: 'thread-004',
      role: 'assistant',
      kind: 'markdown',
      content:
        '可以用一个 **终端风格评测器** 来做：题目是博物馆售票窗口的排队整理，界面只保留说明、编辑区、样例结果和提示。',
      actions: [
        {
          id: 'action-open-coding-assessment',
          kind: 'open-artifact',
          label: '打开排队评测器',
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
      content: '我想用更直观的方式理解二次函数图像，不要只是公式解释。',
      createdAt: '2026-04-10 13:26',
    },
    {
      id: 'message-011',
      threadId: 'thread-005',
      role: 'assistant',
      kind: 'markdown',
      content:
        '可以先用一个 **函数图像实验台**：拖动 a、b、c，直接观察开口方向、顶点、对称轴和 x 轴交点。',
      actions: [
        {
          id: 'action-open-visual-learning',
          kind: 'open-artifact',
          label: '打开函数实验台',
          artifactId: 'artifact-visual-learning',
          viewMode: 'pane',
        },
      ],
      createdAt: '2026-04-10 13:27',
    },
  ],
  'thread-006': [
    {
      id: 'message-012',
      threadId: 'thread-006',
      role: 'user',
      kind: 'markdown',
      content: '请查看这张图片，并给出下一步建议。',
      createdAt: '2026-04-14 11:18',
    },
    {
      id: 'message-013',
      threadId: 'thread-006',
      role: 'assistant',
      kind: 'markdown',
      agentId: 'agent-media',
      agentName: '多模态助手',
      agentAccent: 'teal',
      content:
        '我已收到图片，并在当前消息里展示。可以基于图片内容继续补充观察、标注或行动建议。',
      media: [
        {
          id: 'media-test-image',
          kind: 'image',
          url: '/mock-media/test_image.png',
          title: '图片素材',
          caption: '用于当前会话分析的图片。',
          alt: '图片素材预览',
          mimeType: 'image/png',
        },
      ],
      createdAt: '2026-04-14 11:19',
    },
  ],
  'thread-007': [
    {
      id: 'message-014',
      threadId: 'thread-007',
      role: 'user',
      kind: 'markdown',
      content: '请查看这段视频，并帮我提炼关键片段。',
      createdAt: '2026-04-14 11:22',
    },
    {
      id: 'message-015',
      threadId: 'thread-007',
      role: 'assistant',
      kind: 'markdown',
      agentId: 'agent-media',
      agentName: '多模态助手',
      agentAccent: 'teal',
      content:
        '我已收到视频，并在当前消息里提供播放控件。你可以继续要求我按时间点整理重点。',
      media: [
        {
          id: 'media-test-video',
          kind: 'video',
          url: '/mock-media/test_video.mp4',
          title: '视频素材',
          caption: '用于当前会话分析的视频。',
          alt: '视频素材播放器',
          mimeType: 'video/mp4',
        },
      ],
      createdAt: '2026-04-14 11:23',
    },
  ],
  'thread-008': [
    {
      id: 'message-016',
      threadId: 'thread-008',
      role: 'user',
      kind: 'markdown',
      content: '请查看第二段视频，并继续整理观察结果。',
      createdAt: '2026-04-14 11:48',
    },
    {
      id: 'message-017',
      threadId: 'thread-008',
      role: 'assistant',
      kind: 'markdown',
      agentId: 'agent-media',
      agentName: '多模态助手',
      agentAccent: 'teal',
      content:
        '我已收到第二段视频，并在当前消息里提供播放控件。可以继续按片段总结要点。',
      media: [
        {
          id: 'media-test-video-2',
          kind: 'video',
          url: '/mock-media/test_video2.mp4',
          title: '第二段视频素材',
          caption: '用于当前会话分析的视频。',
          alt: '第二段视频素材播放器',
          mimeType: 'video/mp4',
        },
      ],
      createdAt: '2026-04-14 11:49',
    },
  ],
  ...(htmlAppExampleMessages.length ? { 'thread-009': htmlAppExampleMessages } : {}),
  ...(nodeAppExampleMessages.length ? { 'thread-010': nodeAppExampleMessages } : {}),
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
          allowScripts: input.payload.allowScripts,
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
    title: '咖啡店店长面试间',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt,
    summary: '可直接演练 3 道咖啡店店长面试题，支持计时、提示和本地回答检查。',
    payload: {
      html: `
        <!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              :root {
                --bg: #07111f;
                --surface: #101d32;
                --surface-strong: #16243f;
                --border: rgba(148, 163, 184, 0.35);
                --text: #f8fafc;
                --muted: #94a3b8;
                --teal: #ff6b35;
                --amber: #ffd166;
                --red: #ef476f;
              }

              * { box-sizing: border-box; }

              body {
                margin: 0;
                font-family: "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif;
                background:
                  radial-gradient(circle at 80% 0%, rgba(255, 107, 53, 0.22), transparent 34%),
                  linear-gradient(135deg, #04070f 0%, var(--bg) 48%, #111827 100%);
                color: var(--text);
              }

              button,
              textarea {
                font: inherit;
              }

              button {
                border: 1px solid var(--border);
                border-radius: 2px;
                background: var(--surface-strong);
                color: var(--text);
                cursor: pointer;
                font-weight: 700;
                padding: 10px 12px;
              }

              button.primary {
                border-color: var(--teal);
                background: var(--teal);
                color: #050816;
              }

              main {
                min-height: 100vh;
                display: grid;
                grid-template-rows: auto 1fr;
                gap: 18px;
                padding: 24px;
              }

              .topbar,
              .question,
              .side,
              .answer-box,
              .log {
                border: 1px solid var(--border);
                border-radius: 2px;
                background: linear-gradient(160deg, rgba(16, 29, 50, 0.98), rgba(7, 17, 31, 0.92));
              }

              .topbar {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 16px;
                padding: 22px;
                border-left: 8px solid var(--teal);
              }

              .eyebrow {
                margin: 0 0 8px;
                color: var(--muted);
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 0.18em;
                text-transform: uppercase;
              }

              h1,
              h2 {
                margin: 0;
                line-height: 1.2;
                text-transform: uppercase;
              }

              h1 {
                font-size: clamp(24px, 3vw, 36px);
              }

              h2 {
                font-size: 22px;
              }

              p,
              li {
                color: var(--muted);
                line-height: 1.65;
              }

              .timer {
                min-width: 150px;
                text-align: right;
              }

              .timer strong {
                display: block;
                color: var(--amber);
                font-family: "SFMono-Regular", Consolas, monospace;
                font-size: 38px;
              }

              .layout {
                display: grid;
                grid-template-columns: minmax(300px, 0.75fr) minmax(0, 1.25fr);
                gap: 18px;
              }

              .main-stack,
              .side {
                display: grid;
                gap: 14px;
              }

              .side {
                order: -1;
              }

              .question,
              .side,
              .answer-box,
              .log {
                padding: 18px;
              }

              .question-nav {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 14px;
              }

              .question-nav button.active {
                border-color: var(--teal);
                box-shadow: inset 0 0 0 2px rgba(22, 117, 111, 0.18);
              }

              textarea {
                width: 100%;
                min-height: 170px;
                resize: vertical;
                border: 1px solid var(--border);
                border-radius: 2px;
                color: var(--text);
                background: #050816;
                padding: 14px;
              }

              .actions,
              .status-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
              }

              .badge {
                border-radius: 8px;
                background: rgba(255, 209, 102, 0.16);
                color: var(--amber);
                display: inline-flex;
                font-size: 13px;
                font-weight: 800;
                padding: 7px 10px;
              }

              .score {
                color: var(--amber);
                font-size: 28px;
                font-weight: 800;
              }

              .rubric {
                display: grid;
                gap: 10px;
                margin: 12px 0 0;
                padding: 0;
                list-style: none;
              }

              .rubric li {
                border-left: 3px solid rgba(148, 163, 184, 0.36);
                margin: 0;
                padding-left: 10px;
              }

              .rubric li.done {
                border-color: var(--teal);
                color: var(--text);
              }

              .hint {
                border-left: 3px solid var(--amber);
                margin: 12px 0 0;
                padding-left: 12px;
              }

              .log-list {
                margin: 10px 0 0;
                padding-left: 18px;
              }

              @media (max-width: 820px) {
                main { padding: 14px; }
                .topbar,
                .layout { grid-template-columns: 1fr; }
                .topbar { display: grid; }
                .timer { text-align: left; }
              }
            </style>
          </head>
          <body>
            <main>
              <section class="topbar">
                <div>
                  <p class="eyebrow">Service Interview</p>
                  <h1>咖啡店店长模拟面试</h1>
                  <p>请在倒计时内完成回答；可以请求提示、切换问题，并查看回答要点检查。</p>
                </div>
                <div class="timer">
                  <p class="eyebrow">倒计时</p>
                  <strong id="timerText">18:00</strong>
                  <button id="timerToggle" class="primary" type="button">开始</button>
                  <button id="timerReset" type="button">重置</button>
                </div>
              </section>

              <section class="layout">
                <div class="main-stack">
                  <article class="question">
                    <p class="eyebrow">当前问题</p>
                    <h2 id="questionTitle"></h2>
                    <p id="questionPrompt"></p>
                    <div id="questionTags" class="status-row"></div>
                    <div class="question-nav">
                      <button class="active" type="button" data-question="0">问题 1</button>
                      <button type="button" data-question="1">问题 2</button>
                      <button type="button" data-question="2">问题 3</button>
                    </div>
                  </article>

                  <article class="answer-box">
                    <p class="eyebrow">回答草稿</p>
                    <textarea id="answerInput" placeholder="用 3-6 句话回答。可以先写框架，再补充取舍。"></textarea>
                    <div class="actions">
                      <button id="checkAnswer" class="primary" type="button">检查回答</button>
                      <button id="hintButton" type="button">给我一个提示</button>
                      <button id="nextQuestion" type="button">下一题</button>
                    </div>
                  </article>
                </div>

                <aside class="side">
                  <section>
                    <p class="eyebrow">本地反馈</p>
                    <div class="score" id="scoreText">0 / 3</div>
                    <ul id="rubricList" class="rubric"></ul>
                    <p id="hintText" class="hint">先选择一个问题，写下你的回答，再点检查回答。</p>
                  </section>

                  <section class="log">
                    <p class="eyebrow">练习记录</p>
                    <span class="badge">第 ${revision} 场练习</span>
                    <ol id="logList" class="log-list">
                      <li>面试已准备好。</li>
                    </ol>
                  </section>
                </aside>
              </section>
            </main>

            <script>
              const questions = [
                {
                  title: '周末早高峰突然排长队，你怎么安排人手？',
                  prompt: '请从收银、出杯、备料和现场沟通回答。',
                  tags: ['shift', 'queue', 'service'],
                  checks: ['提到岗位分工', '提到等待沟通', '提到备料或出杯节奏'],
                  keywords: [['分工', '收银', '出杯'], ['等待', '沟通', '解释'], ['备料', '节奏', '补货']]
                },
                {
                  title: '熟客投诉拿错饮品，你会怎么处理？',
                  prompt: '请说明安抚、核对、补救和复盘。',
                  tags: ['complaint', 'recover', 'review'],
                  checks: ['提到先安抚顾客', '提到核对订单', '提到补救和复盘'],
                  keywords: [['安抚', '道歉', '情绪'], ['核对', '订单', '小票'], ['补救', '复盘', '记录']]
                },
                {
                  title: '新品试卖一周后销量低，你会看哪些信号？',
                  prompt: '请从试饮反馈、陈列、定价和员工话术回答。',
                  tags: ['launch', 'feedback', 'sales'],
                  checks: ['提到顾客反馈', '提到陈列或动线', '提到定价或话术'],
                  keywords: [['反馈', '试饮', '顾客'], ['陈列', '动线', '海报'], ['定价', '话术', '推荐']]
                }
              ];

              let activeQuestion = 0;
              let secondsLeft = 18 * 60;
              let timerId = null;

              const timerText = document.getElementById('timerText');
              const timerToggle = document.getElementById('timerToggle');
              const timerReset = document.getElementById('timerReset');
              const questionTitle = document.getElementById('questionTitle');
              const questionPrompt = document.getElementById('questionPrompt');
              const questionTags = document.getElementById('questionTags');
              const answerInput = document.getElementById('answerInput');
              const scoreText = document.getElementById('scoreText');
              const rubricList = document.getElementById('rubricList');
              const hintText = document.getElementById('hintText');
              const logList = document.getElementById('logList');

              function renderTimer() {
                const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
                const seconds = String(secondsLeft % 60).padStart(2, '0');
                timerText.textContent = minutes + ':' + seconds;
              }

              function addLog(text) {
                const item = document.createElement('li');
                item.textContent = text;
                logList.prepend(item);
              }

              function renderQuestion() {
                const question = questions[activeQuestion];
                questionTitle.textContent = question.title;
                questionPrompt.textContent = question.prompt;
                questionTags.innerHTML = '';
                question.tags.forEach((tag) => {
                  const badge = document.createElement('span');
                  badge.className = 'badge';
                  badge.textContent = tag;
                  questionTags.appendChild(badge);
                });

                rubricList.innerHTML = '';
                question.checks.forEach((check) => {
                  const item = document.createElement('li');
                  item.textContent = check;
                  rubricList.appendChild(item);
                });

                document.querySelectorAll('[data-question]').forEach((button) => {
                  button.classList.toggle('active', Number(button.dataset.question) === activeQuestion);
                });

                scoreText.textContent = '0 / ' + question.checks.length;
                hintText.textContent = '提示会根据当前问题给出。';
                answerInput.value = '';
              }

              function checkAnswer() {
                const value = answerInput.value.trim().toLowerCase();
                const question = questions[activeQuestion];
                let score = 0;

                Array.from(rubricList.children).forEach((item, index) => {
                  const matched = question.keywords[index].some((keyword) => value.includes(keyword.toLowerCase()));
                  item.classList.toggle('done', matched);
                  if (matched) score += 1;
                });

                scoreText.textContent = score + ' / ' + question.checks.length;
                hintText.textContent = score === question.checks.length
                  ? '回答覆盖了核心点。下一步可以补一个具体取舍。'
                  : '还可以补充：' + question.checks.filter((_, index) => !rubricList.children[index].classList.contains('done')).join('、');
                addLog('已检查问题 ' + (activeQuestion + 1) + '，命中 ' + score + ' 个要点。');
              }

              timerToggle.addEventListener('click', () => {
                if (timerId) {
                  clearInterval(timerId);
                  timerId = null;
                  timerToggle.textContent = '继续';
                  addLog('计时已暂停。');
                  return;
                }

                timerToggle.textContent = '暂停';
                addLog('计时已开始。');
                timerId = window.setInterval(() => {
                  secondsLeft = Math.max(0, secondsLeft - 1);
                  renderTimer();
                  if (secondsLeft === 0 && timerId) {
                    clearInterval(timerId);
                    timerId = null;
                    timerToggle.textContent = '结束';
                    addLog('面试时间到。');
                  }
                }, 1000);
              });

              timerReset.addEventListener('click', () => {
                if (timerId) clearInterval(timerId);
                timerId = null;
                secondsLeft = 18 * 60;
                timerToggle.textContent = '开始';
                renderTimer();
                addLog('计时已重置。');
              });

              document.getElementById('checkAnswer').addEventListener('click', checkAnswer);
              document.getElementById('hintButton').addEventListener('click', () => {
                const question = questions[activeQuestion];
                hintText.textContent = '先回答这个点：' + question.checks[0];
                addLog('已请求问题 ' + (activeQuestion + 1) + ' 的提示。');
              });
              document.getElementById('nextQuestion').addEventListener('click', () => {
                activeQuestion = (activeQuestion + 1) % questions.length;
                renderQuestion();
                addLog('已切到问题 ' + (activeQuestion + 1) + '。');
              });
              document.querySelectorAll('[data-question]').forEach((button) => {
                button.addEventListener('click', () => {
                  activeQuestion = Number(button.dataset.question);
                  renderQuestion();
                  addLog('已切到问题 ' + (activeQuestion + 1) + '。');
                });
              });

              renderTimer();
              renderQuestion();
            </script>
          </body>
        </html>`,
      allowScripts: true,
    },
  };
}

function buildVisualLearningArtifact(revision: number, updatedAt = '2026-04-10T13:28:00Z'): ArtifactRecord {
  return {
    id: 'artifact-visual-learning',
    type: 'visual-learning',
    title: '二次函数图像实验台',
    status: 'ready',
    renderMode: 'html',
    revision,
    updatedAt,
    summary: '拖动 a、b、c 三个参数，实时观察抛物线、顶点、对称轴和交点变化。',
    payload: {
      html: `
        <!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              :root {
                --bg: #151022;
                --surface: #fff4bf;
                --ink: #1b1028;
                --muted: #654c7d;
                --grid: rgba(27, 16, 40, 0.13);
                --pink: #ff4f9a;
                --cyan: #00c2ff;
                --lime: #a8ff3e;
                --orange: #ff9f1c;
              }

              * { box-sizing: border-box; }

              body {
                margin: 0;
                font-family: "Avenir Next", "Trebuchet MS", Arial, sans-serif;
                background:
                  radial-gradient(circle at 16% 12%, rgba(255, 79, 154, 0.33), transparent 26%),
                  radial-gradient(circle at 92% 18%, rgba(0, 194, 255, 0.28), transparent 24%),
                  linear-gradient(135deg, #25153a, #0f132f 62%, #07251f),
                  var(--bg);
                color: var(--ink);
              }

              button,
              input {
                font: inherit;
              }

              button {
                border: 2px solid var(--ink);
                border-radius: 999px;
                background: var(--lime);
                color: var(--ink);
                cursor: pointer;
                font-weight: 850;
                padding: 10px 14px;
                box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.28);
              }

              main {
                min-height: 100vh;
                display: grid;
                grid-template-columns: minmax(360px, 0.9fr) minmax(0, 1.35fr);
                gap: 18px;
                padding: 20px;
              }

              .hero,
              .graph-card,
              .control-card,
              .fact-card {
                border: 2px solid var(--ink);
                border-radius: 28px;
                background: var(--surface);
                box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.24);
              }

              .side {
                display: grid;
                gap: 14px;
              }

              .hero {
                padding: 24px;
              }

              .graph-card {
                min-height: calc(100vh - 40px);
                padding: 18px;
                display: grid;
                grid-template-rows: auto 1fr auto;
                gap: 12px;
              }

              .control-card,
              .fact-card {
                padding: 18px;
              }

              .eyebrow {
                margin: 0 0 8px;
                color: var(--muted);
                font-size: 12px;
                font-weight: 900;
                letter-spacing: 0.16em;
                text-transform: uppercase;
              }

              h1,
              h2,
              p {
                margin-top: 0;
              }

              h1 {
                font-family: "Arial Black", "Trebuchet MS", Arial, sans-serif;
                font-size: clamp(34px, 5vw, 64px);
                line-height: 0.95;
                margin-bottom: 14px;
                text-transform: uppercase;
              }

              h2 {
                font-size: 22px;
                line-height: 1.2;
              }

              p,
              li {
                color: var(--muted);
                line-height: 1.68;
              }

              .formula {
                display: inline-flex;
                margin: 8px 0 0;
                border: 2px solid var(--ink);
                border-radius: 18px;
                background: #ffffff;
                padding: 10px 14px;
                color: var(--pink);
                font-family: "SFMono-Regular", Consolas, monospace;
                font-size: 18px;
                font-weight: 900;
              }

              .slider {
                display: grid;
                gap: 8px;
                margin: 14px 0;
              }

              .slider label {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                color: var(--ink);
                font-weight: 850;
              }

              input[type='range'] {
                width: 100%;
                accent-color: var(--pink);
              }

              .facts {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
              }

              .metric {
                border: 2px dashed rgba(27, 16, 40, 0.35);
                border-radius: 18px;
                background: #fff9dc;
                padding: 12px;
              }

              .metric strong {
                display: block;
                color: var(--pink);
                font-size: 18px;
                margin-top: 4px;
              }

              svg {
                width: 100%;
                height: 100%;
                min-height: 430px;
                border: 2px solid var(--ink);
                border-radius: 24px;
                background:
                  linear-gradient(90deg, var(--grid) 1px, transparent 1px),
                  linear-gradient(0deg, var(--grid) 1px, transparent 1px),
                  #fffdf0;
                background-size: 28px 28px;
              }

              .axis {
                stroke: var(--ink);
                stroke-width: 2;
              }

              #curveLine {
                stroke: var(--pink);
                stroke-width: 5;
                stroke-linecap: round;
                stroke-linejoin: round;
                filter: drop-shadow(0 5px 0 rgba(0, 0, 0, 0.18));
              }

              #vertexDot {
                fill: var(--cyan);
                stroke: var(--ink);
                stroke-width: 3;
              }

              .root-dot {
                fill: var(--orange);
                stroke: var(--ink);
                stroke-width: 3;
              }

              .caption {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
              }

              .chip {
                border: 2px solid var(--ink);
                border-radius: 999px;
                background: #ffffff;
                color: var(--ink);
                font-weight: 850;
                padding: 8px 11px;
              }

              @media (max-width: 900px) {
                main {
                  grid-template-columns: 1fr;
                }

                .graph-card {
                  min-height: 560px;
                }
              }
            </style>
          </head>
          <body>
            <main>
              <section class="side">
                <article class="hero">
                  <p class="eyebrow">Parabola Lab</p>
                  <h1>二次函数图像实验台</h1>
                  <p>拖动三个参数，观察抛物线如何翻转、变窄、平移，并同步查看顶点和交点。</p>
                  <span class="formula" id="formulaText">y = ax² + bx + c</span>
                </article>

                <article class="control-card">
                  <p class="eyebrow">参数控制</p>
                  <div class="slider">
                    <label for="aInput">a：开口与宽窄 <span id="aValue"></span></label>
                    <input id="aInput" type="range" min="-2" max="2" step="0.1" value="0.6" />
                  </div>
                  <div class="slider">
                    <label for="bInput">b：左右倾斜 <span id="bValue"></span></label>
                    <input id="bInput" type="range" min="-5" max="5" step="0.1" value="-1.2" />
                  </div>
                  <div class="slider">
                    <label for="cInput">c：上下平移 <span id="cValue"></span></label>
                    <input id="cInput" type="range" min="-6" max="6" step="0.1" value="-2" />
                  </div>
                  <button id="resetButton" type="button">重置成标准例子</button>
                </article>

                <article class="fact-card">
                  <p class="eyebrow">观察结果</p>
                  <div class="facts">
                    <div class="metric">顶点 <strong id="vertexMetric"></strong></div>
                    <div class="metric">对称轴 <strong id="axisMetric"></strong></div>
                    <div class="metric">开口方向 <strong id="openMetric"></strong></div>
                    <div class="metric">x 轴交点 <strong id="rootMetric"></strong></div>
                  </div>
                </article>
              </section>

              <section class="graph-card">
                <div>
                  <p class="eyebrow">实时图像</p>
                  <h2>看图比背公式更快</h2>
                </div>
                <svg id="graph" viewBox="0 0 720 520" role="img" aria-label="二次函数图像">
                  <line class="axis" x1="40" y1="260" x2="680" y2="260"></line>
                  <line class="axis" x1="360" y1="30" x2="360" y2="490"></line>
                  <polyline id="curveLine" fill="none" points=""></polyline>
                  <g id="rootsLayer"></g>
                  <circle id="vertexDot" r="8" cx="360" cy="260"></circle>
                </svg>
                <div class="caption">
                  <span class="chip">粉色曲线：y = ax² + bx + c</span>
                  <span class="chip">蓝点：顶点</span>
                  <span class="chip">橙点：x 轴交点</span>
                </div>
              </section>
            </main>

            <script>
              const width = 720;
              const height = 520;
              const paddingX = 40;
              const paddingY = 30;
              const xMin = -6;
              const xMax = 6;
              const yMin = -8;
              const yMax = 8;
              const aInput = document.getElementById('aInput');
              const bInput = document.getElementById('bInput');
              const cInput = document.getElementById('cInput');
              const curveLine = document.getElementById('curveLine');
              const vertexDot = document.getElementById('vertexDot');
              const rootsLayer = document.getElementById('rootsLayer');

              function mapX(x) {
                return paddingX + ((x - xMin) / (xMax - xMin)) * (width - paddingX * 2);
              }

              function mapY(y) {
                return height - paddingY - ((y - yMin) / (yMax - yMin)) * (height - paddingY * 2);
              }

              function formatNumber(value) {
                return Number(value).toFixed(2).replace(/\\.00$/, '').replace(/0$/, '');
              }

              function renderGraph() {
                let a = Number(aInput.value);
                const b = Number(bInput.value);
                const c = Number(cInput.value);
                if (Math.abs(a) < 0.05) {
                  a = a < 0 ? -0.05 : 0.05;
                  aInput.value = String(a);
                }

                const points = [];
                for (let i = 0; i <= 180; i += 1) {
                  const x = xMin + (i / 180) * (xMax - xMin);
                  const y = a * x * x + b * x + c;
                  points.push(mapX(x).toFixed(1) + ',' + mapY(y).toFixed(1));
                }
                curveLine.setAttribute('points', points.join(' '));

                const vertexX = -b / (2 * a);
                const vertexY = a * vertexX * vertexX + b * vertexX + c;
                vertexDot.setAttribute('cx', String(mapX(vertexX)));
                vertexDot.setAttribute('cy', String(mapY(vertexY)));

                const discriminant = b * b - 4 * a * c;
                rootsLayer.innerHTML = '';
                let rootText = '无实数交点';
                if (discriminant >= 0) {
                  const sqrt = Math.sqrt(discriminant);
                  const roots = [(-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a)];
                  rootText = roots.map(formatNumber).join('，');
                  roots.forEach((root) => {
                    if (root >= xMin && root <= xMax) {
                      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                      dot.setAttribute('class', 'root-dot');
                      dot.setAttribute('r', '7');
                      dot.setAttribute('cx', String(mapX(root)));
                      dot.setAttribute('cy', String(mapY(0)));
                      rootsLayer.appendChild(dot);
                    }
                  });
                }

                document.getElementById('aValue').textContent = formatNumber(a);
                document.getElementById('bValue').textContent = formatNumber(b);
                document.getElementById('cValue').textContent = formatNumber(c);
                document.getElementById('formulaText').textContent =
                  'y = ' + formatNumber(a) + 'x² ' + (b >= 0 ? '+ ' : '- ') + formatNumber(Math.abs(b)) + 'x ' + (c >= 0 ? '+ ' : '- ') + formatNumber(Math.abs(c));
                document.getElementById('vertexMetric').textContent =
                  '(' + formatNumber(vertexX) + ', ' + formatNumber(vertexY) + ')';
                document.getElementById('axisMetric').textContent = 'x = ' + formatNumber(vertexX);
                document.getElementById('openMetric').textContent = a > 0 ? '向上' : '向下';
                document.getElementById('rootMetric').textContent = rootText;
              }

              [aInput, bInput, cInput].forEach((input) => input.addEventListener('input', renderGraph));
              document.getElementById('resetButton').addEventListener('click', () => {
                aInput.value = '0.6';
                bInput.value = '-1.2';
                cInput.value = '-2';
                renderGraph();
              });
              renderGraph();
            </script>
          </body>
        </html>`,
      allowScripts: true,
    },
  };
}

function buildCodingAssessmentArtifact(revision: number, updatedAt = '2026-04-10T13:20:00Z'): ArtifactRecord {
  return {
    id: 'artifact-coding-assessment',
    type: 'coding-assessment',
    title: '博物馆排队评测器',
    status: 'ready',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: '用博物馆排队题验证终端风格评测界面。',
    payload: {
      url: buildCanvasFixtureUrl({ revision, scenario: 'coding-assessment' }),
    },
  };
}

function buildCareerRoadmapArtifact(revision: number, updatedAt = '2026-04-07T18:21:00Z'): ArtifactRecord {
  return {
    id: 'artifact-career-roadmap',
    type: 'career-roadmap',
    title: '门店运营职业路线图',
    status: 'stale',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: '用独立页面呈现从咖啡师到门店店长的阶段路线。',
    payload: {
      url: buildCanvasFixtureUrl({ revision, scenario: 'career-roadmap' }),
    },
  };
}

function buildHtmlAppExampleArtifact(revision: number, updatedAt = '2026-04-14T13:11:00Z'): ArtifactRecord {
  const url = htmlAppExampleUrl ?? '';

  return {
    id: 'artifact-html-app-example',
    type: 'app-example',
    title: '弹跳小球应用',
    status: url ? 'ready' : 'error',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: url
      ? '在工作画布中打开弹跳小球应用。'
      : '应用地址未配置，暂时无法打开。',
    payload: {
      url,
    },
  };
}

function buildNodeAppExampleArtifact(revision: number, updatedAt = '2026-04-14T13:17:00Z'): ArtifactRecord {
  const url = nodeAppExampleUrl ?? '';

  return {
    id: 'artifact-node-app-example',
    type: 'app-example',
    title: '求导挑战应用',
    status: url ? 'ready' : 'error',
    renderMode: 'url',
    revision,
    updatedAt,
    summary: url
      ? '在工作画布中打开求导挑战应用。'
      : '应用地址未配置，暂时无法打开。',
    payload: {
      url,
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
      summary: '门店运营职业路线图已刷新到新版本。',
      payload: {
        url: buildCanvasFixtureUrl({ revision: nextRevision, scenario: 'career-roadmap' }),
      },
    };
  }

  if (currentArtifact.id === 'artifact-html-app-example') {
    return buildHtmlAppExampleArtifact(nextRevision, refreshedAt);
  }

  if (currentArtifact.id === 'artifact-node-app-example') {
    return buildNodeAppExampleArtifact(nextRevision, refreshedAt);
  }

  if (currentArtifact.id === 'artifact-weekly-plan') {
    return {
      ...currentArtifact,
      renderMode: 'html',
      revision: nextRevision,
      status: 'ready',
      updatedAt: refreshedAt,
      summary: '周计划已刷新。',
      payload: {
        html: `
          <html lang="zh-CN">
            <body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#fffaf2;color:#23313b;">
              <div style="padding:24px;">
                <div style="padding:18px;border:1px solid rgba(96,114,126,0.16);border-radius:18px;background:#fffcf7;">
                  <p style="margin:0 0 10px;color:#61707c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">周计划</p>
                  <h1 style="margin:0;font-size:26px;line-height:1.1;">交付优先级保持不变，但计划已经刷新。</h1>
                  <p style="margin:14px 0 0;color:#61707c;line-height:1.7;">已于 ${refreshedAt} 更新。</p>
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
    summary: `${currentArtifact.title} 已刷新。`,
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
  ...(htmlAppExampleUrl ? [buildHtmlAppExampleArtifact(1)] : []),
  ...(nodeAppExampleUrl ? [buildNodeAppExampleArtifact(1)] : []),
];

export function createMockCareerAgentClient(): CareerAgentClient {
  return {
    async listThreads() {
      return threads;
    },
    async createThread(input) {
      const nextThread: ThreadSummary = {
        id: `thread-local-${Date.now()}`,
        title: input?.title ?? '新对话',
        preview: input?.preview ?? '新的会话。',
        updatedAt: new Date().toISOString(),
        status: 'active',
      };

      threads.unshift(nextThread);
      messagesByThread[nextThread.id] = [];

      return { ...nextThread };
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
