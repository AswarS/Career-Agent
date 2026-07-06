import { describe, expect, it } from 'vitest';
import { sanitizeProfileRecord } from './upstreamContracts';

const legacyPersonaImportSamples = [
  {
    id: 'career-switcher-to-backend',
    payload: {
      _meta: { personaId: 'career-switcher-to-backend', archetype: '转行者' },
      profile: {
        displayName: '陈思远',
        currentRole: '前产品经理，转行学后端开发中',
        employmentStatus: '已离职，全职转行准备',
        educationSummary: '英语专业本科毕业，2019 年。产品经理期间考过 PMP。',
        experienceSummary: '在教育公司做过三年产品经理，半年前开始自学 Python。',
        targetRole: 'Python 后端开发工程师',
        targetIndustries: ['教育科技', 'SaaS', '企业服务'],
        shortTermGoal: '两个月内完成一个能拿得出手的后端项目，然后开始投简历',
        longTermGoal: '一年内稳定入职后端岗位',
        weeklyTimeBudget: '50 小时（全职学习）',
        constraints: ['非科班出身', '积蓄支撑约 4 个月'],
        workPreferences: ['倾向中小型公司', '希望业务和之前产品经验能互补'],
        learningPreferences: ['需要项目驱动', '每天需要明确产出'],
        keyStrengths: ['产品思维强', '写文档和沟通能力是优势'],
        riskSignals: ['算法薄弱', '没有协作开发经验'],
        timezone: 'Asia/Shanghai',
        locationRegion: '北京',
      },
    },
    expected: {
      fullName: '陈思远',
      currentRole: '前产品经理，转行学后端开发中',
      employmentStatus: '已离职，全职转行准备',
      targetRole: 'Python 后端开发工程师',
      targetIndustry: '教育科技',
      firstWorkPreference: '倾向中小型公司',
    },
  },
  {
    id: 'freelancer-indie-developer',
    payload: {
      _meta: { personaId: 'freelancer-indie-developer', archetype: '自由职业' },
      profile: {
        displayName: '苏远',
        currentRole: '独立开发者 / 自由职业全栈工程师',
        employmentStatus: '自由职业，接外包项目 + 做独立产品',
        educationSummary: '普通本科计算机专业，2020 年毕业。',
        experienceSummary: '五年开发经验，目前有一个小工具产品月收入约 8000 元。',
        targetRole: '全职独立开发者 / 技术合伙人',
        targetIndustries: ['开发者工具', '效率工具', 'AI 应用层'],
        shortTermGoal: '把现有产品的 MRR 从 8000 做到 30000 元',
        longTermGoal: '两年内实现独立产品月入 5 万以上',
        weeklyTimeBudget: '35 小时（自己分配，但需要兼顾外包交付）',
        constraints: ['收入不稳定', '一个人精力有限'],
        workPreferences: ['完全远程，时间自由', '偏好小而美的产品'],
        learningPreferences: ['边做边学，需求驱动', '喜欢看别人的产品拆解和收入报告'],
        keyStrengths: ['全栈能力覆盖面广', '执行力强'],
        riskSignals: ['技术深度不够', '商业化能力不足'],
        timezone: 'Asia/Shanghai',
        locationRegion: '成都（远程工作）',
      },
    },
    expected: {
      fullName: '苏远',
      currentRole: '独立开发者 / 自由职业全栈工程师',
      employmentStatus: '自由职业，接外包项目 + 做独立产品',
      targetRole: '全职独立开发者 / 技术合伙人',
      targetIndustry: '开发者工具',
      firstWorkPreference: '完全远程，时间自由',
    },
  },
  {
    id: 'junior-frontend-graduate',
    payload: {
      _meta: { personaId: 'junior-frontend-graduate', archetype: '应届生' },
      profile: {
        displayName: '林小宇',
        currentRole: '计算机科学本科应届毕业生',
        employmentStatus: '应届求职中',
        educationSummary: '某 211 大学计算机科学与技术专业，2025 年 6 月毕业。',
        experienceSummary: '大三暑期做过两个月前端实习，毕业设计是 React 校园二手交易平台。',
        targetRole: '前端开发工程师',
        targetIndustries: ['互联网', 'SaaS', '金融科技'],
        shortTermGoal: '三个月内拿到一线互联网公司或优质中厂的前端 offer',
        longTermGoal: '三年内成长为能独立负责业务线的前端技术骨干',
        weeklyTimeBudget: '40 小时（全职求职状态）',
        constraints: ['没有大厂实习背景', '算法刷题量不够'],
        workPreferences: ['偏好有技术氛围的团队', '喜欢做 C 端产品'],
        learningPreferences: ['边做项目边学效果最好', '需要明确的学习路线和每日任务'],
        keyStrengths: ['React 基础扎实', 'CSS 布局能力不错'],
        riskSignals: ['面试经验少', '工程化了解很浅'],
        timezone: 'Asia/Shanghai',
        locationRegion: '上海',
      },
    },
    expected: {
      fullName: '林小宇',
      currentRole: '计算机科学本科应届毕业生',
      employmentStatus: '应届求职中',
      targetRole: '前端开发工程师',
      targetIndustry: '互联网',
      firstWorkPreference: '偏好有技术氛围的团队',
    },
  },
  {
    id: 'mid-level-fullstack-promotion',
    payload: {
      _meta: { personaId: 'mid-level-fullstack-promotion', archetype: '在职晋升' },
      profile: {
        displayName: '张明远',
        currentRole: '全栈开发工程师（P6）',
        employmentStatus: '在职，某中型互联网公司',
        educationSummary: '985 大学软件工程本科，2021 年毕业。',
        experienceSummary: '四年全栈开发经验，主导过用户邀请系统重构。',
        targetRole: '高级全栈工程师 / 技术 TL（P7）',
        targetIndustries: ['互联网', '企业服务', '出海产品'],
        shortTermGoal: '下个晋升周期冲 P7',
        longTermGoal: '三年内成为能带 5-8 人团队的技术 TL',
        weeklyTimeBudget: '10 小时（工作日晚上 + 周末，在职状态）',
        constraints: ['在职时间有限', '晋升答辩需要体现技术深度和业务价值'],
        workPreferences: ['喜欢有挑战的核心业务', '希望有更多架构决策权'],
        learningPreferences: ['看书 + 实际项目结合', '写技术博客倒逼输出'],
        keyStrengths: ['全栈能力均衡', '有高并发实战经验'],
        riskSignals: ['系统设计回答不够结构化', '技术影响力不足'],
        timezone: 'Asia/Shanghai',
        locationRegion: '杭州',
      },
    },
    expected: {
      fullName: '张明远',
      currentRole: '全栈开发工程师（P6）',
      employmentStatus: '在职，某中型互联网公司',
      targetRole: '高级全栈工程师 / 技术 TL（P7）',
      targetIndustry: '互联网',
      firstWorkPreference: '喜欢有挑战的核心业务',
    },
  },
  {
    id: 'overseas-remote-rust-engineer',
    payload: {
      _meta: { personaId: 'overseas-remote-rust-engineer', archetype: '资深跳槽' },
      profile: {
        displayName: '李骁',
        currentRole: 'C++ 引擎开发工程师',
        employmentStatus: '在职，准备跳槽到海外远程岗位',
        educationSummary: '985 大学计算机本科，2019 年毕业。',
        experienceSummary: '六年系统级开发经验，一年前开始学 Rust 并贡献开源 PR。',
        targetRole: 'Rust Systems Engineer（Remote）',
        targetIndustries: ['区块链基础设施', '数据库/存储引擎', 'WebAssembly 运行时'],
        shortTermGoal: '三个月内拿到一个海外远程 Rust 岗位的 offer',
        longTermGoal: '成为 Rust 生态的核心贡献者之一',
        weeklyTimeBudget: '12 小时（工作日晚上 + 周末，在职状态）',
        constraints: ['英文口语面试是最大短板', '海外远程岗位竞争激烈'],
        workPreferences: ['纯远程，async-first 的团队文化', '技术驱动而非业务驱动'],
        learningPreferences: ['通过实现小型项目学习', '读源码是主要学习方式'],
        keyStrengths: ['系统编程基础扎实', '性能优化经验丰富'],
        riskSignals: ['英文沟通能力未经面试验证', '没有 Rust 的商业项目经验'],
        timezone: 'Asia/Shanghai',
        locationRegion: '深圳（目标远程工作，对时区有一定灵活度）',
      },
    },
    expected: {
      fullName: '李骁',
      currentRole: 'C++ 引擎开发工程师',
      employmentStatus: '在职，准备跳槽到海外远程岗位',
      targetRole: 'Rust Systems Engineer（Remote）',
      targetIndustry: '区块链基础设施',
      firstWorkPreference: '纯远程，async-first 的团队文化',
    },
  },
  {
    id: 'senior-backend-job-hopping',
    payload: {
      _meta: { personaId: 'senior-backend-job-hopping', archetype: '资深跳槽' },
      profile: {
        displayName: '王立恒',
        currentRole: '后端技术专家（P7）',
        employmentStatus: '在职，计划跳槽',
        educationSummary: '985 大学计算机科学硕士，2018 年毕业。',
        experienceSummary: '七年后端开发经验，负责过内部 RPC 框架和全链路压测。',
        targetRole: '后端架构师 / 技术总监',
        targetIndustries: ['出海独角兽', 'AI 基础设施', '云服务'],
        shortTermGoal: '两个月内拿到目标公司的面试，三个月内完成跳槽',
        longTermGoal: '五年内做到技术 VP 或者合伙人级别',
        weeklyTimeBudget: '15 小时（工作日晚间 + 周末集中准备）',
        constraints: ['在职跳槽，面试时间需要协调请假', '家庭因素，996 公司不考虑'],
        workPreferences: ['希望有实际业务价值', '喜欢技术驱动的公司文化'],
        learningPreferences: ['通过系统设计 Mock 面试练习', '整理项目经验为 STAR 格式'],
        keyStrengths: ['分布式系统设计经验丰富', '性能优化和稳定性治理是强项'],
        riskSignals: ['业务 sense 相对弱', '行为面试准备不足'],
        timezone: 'Asia/Shanghai',
        locationRegion: '北京（可接受远程或搬去上海/杭州）',
      },
    },
    expected: {
      fullName: '王立恒',
      currentRole: '后端技术专家（P7）',
      employmentStatus: '在职，计划跳槽',
      targetRole: '后端架构师 / 技术总监',
      targetIndustry: '出海独角兽',
      firstWorkPreference: '希望有实际业务价值',
    },
  },
];

describe('legacy persona profile import samples', () => {
  it.each(legacyPersonaImportSamples)('imports $id without losing core profile fields', ({ payload, expected }) => {
    const profile = sanitizeProfileRecord(payload);

    expect(profile.schemaVersion).toBe('career_profile_v1');
    expect(profile).not.toHaveProperty('_meta');
    expect(profile.basicInfo.fullName).toBe(expected.fullName);
    expect(profile.basicInfo.currentCity).toBe('Asia/Shanghai');
    expect(profile.careerProfile.currentRole).toBe(expected.currentRole);
    expect(profile.careerProfile.employmentStatus).toBe(expected.employmentStatus);
    expect(profile.careerProfile.educationBackground).not.toBe('');
    expect(profile.careerProfile.workExperience).not.toBe('');
    expect(profile.careerProfile.skills.length).toBeGreaterThan(0);
    expect(profile.careerProfile.weaknessTags.length).toBeGreaterThan(0);
    expect(profile.intentConstraints.targetRole).toBe(expected.targetRole);
    expect(profile.intentConstraints.targetIndustry).toBe(expected.targetIndustry);
    expect(profile.intentConstraints.targetIndustries[0]).toBe(expected.targetIndustry);
    expect(profile.intentConstraints.availableTime).not.toBe('');
    expect(profile.intentConstraints.constraints.length).toBeGreaterThan(0);
    expect(profile.intentConstraints.workPreferences[0]).toBe(expected.firstWorkPreference);
    expect(profile.intentConstraints.learningPreferences.length).toBeGreaterThan(0);
    expect(profile.intentConstraints.careerGoal).not.toBe('');
  });
});
