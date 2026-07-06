import type { ProfileRecord } from '../../types/entities';

export type ProfileFieldRequirement =
  | 'required'
  | 'required_for_resume'
  | 'required_for_matching'
  | 'required_for_chinese_resume'
  | 'recommended'
  | 'conditional'
  | 'optional';

export type ProfileFieldRequirementKind = 'required' | 'recommended' | 'conditional' | 'optional';
export type ProfileFieldValueType = 'scalar' | 'list';
export type ProfileFieldInputType = 'text' | 'textarea';
export type ProfileFieldWritePolicy = 'user_only' | 'agent_suggested' | 'agent_derived' | 'sensitive_user_confirmed';

export interface ProfileFieldGroup {
  key: string;
  title: string;
  eyebrow: string;
  description: string;
  writePolicyLabel: string;
  writePolicyKind: 'user' | 'agent' | 'conditional' | 'sensitive';
}

export interface ProfileFieldConfig {
  key: string;
  path: readonly string[];
  groupKey: string;
  label: string;
  input: ProfileFieldInputType;
  valueType: ProfileFieldValueType;
  description: string;
  example: string;
  requiredLevel: ProfileFieldRequirement;
  writePolicy: ProfileFieldWritePolicy;
}

export interface ProfileSnapshotItem {
  label: string;
  value: string | string[];
  writePolicy: ProfileFieldWritePolicy;
}

export interface ProfileSnapshotSection {
  key: string;
  title: string;
  eyebrow: string;
  description: string;
  writePolicyLabel: string;
  writePolicyKind: ProfileFieldGroup['writePolicyKind'];
  items: ProfileSnapshotItem[];
}

export const profileFieldGroups: ProfileFieldGroup[] = [
  {
    key: 'basicInfo',
    title: '基础信息',
    eyebrow: 'USER MAINTAINED',
    description: '低画像影响字段，主要由用户直接维护。',
    writePolicyLabel: '用户维护',
    writePolicyKind: 'user',
  },
  {
    key: 'careerProfile',
    title: '职业画像基础字段',
    eyebrow: 'PROFILE FACTS',
    description: '职业事实、标签和阶段判断，agent 可提出待审阅建议。',
    writePolicyLabel: 'AI 可建议',
    writePolicyKind: 'agent',
  },
  {
    key: 'intentConstraints',
    title: '当前目标与约束',
    eyebrow: 'GOAL & CONSTRAINTS',
    description: '影响推荐、计划、投递和约束校验的当前目标。',
    writePolicyLabel: 'AI 可建议',
    writePolicyKind: 'agent',
  },
  {
    key: 'activityRecords',
    title: '活动记录',
    eyebrow: 'ACTIVITY RECORDS',
    description: '学习、项目、投递、面试和 Offer 的时间序列记录。',
    writePolicyLabel: 'AI 可整理',
    writePolicyKind: 'conditional',
  },
  {
    key: 'artifacts',
    title: '职业制品',
    eyebrow: 'CAREER ARTIFACTS',
    description: '简历、作品集、项目材料和求职信等可编辑材料。',
    writePolicyLabel: '需材料',
    writePolicyKind: 'conditional',
  },
  {
    key: 'feedbackSignals',
    title: '反馈信号',
    eyebrow: 'FEEDBACK SIGNALS',
    description: '来自用户、面试官、导师、主管或系统评估器的反馈。',
    writePolicyLabel: 'AI 可整理',
    writePolicyKind: 'conditional',
  },
  {
    key: 'planState',
    title: '计划状态',
    eyebrow: 'PLAN STATE',
    description: '已经生成并需要持续执行或更新的计划。',
    writePolicyLabel: 'AI 可建议',
    writePolicyKind: 'agent',
  },
  {
    key: 'chinaResumeSupplement',
    title: '中文求职材料',
    eyebrow: 'CHINA RESUME',
    description: '中文简历和国内投递材料使用，敏感字段只在场景需要时填写。',
    writePolicyLabel: '用户确认',
    writePolicyKind: 'sensitive',
  },
];

export const requiredProfileLevels = new Set<ProfileFieldRequirement>([
  'required',
  'required_for_resume',
  'required_for_matching',
  'required_for_chinese_resume',
]);

export const profileFields: ProfileFieldConfig[] = [
  {
    key: 'fullName',
    path: ['basicInfo', 'fullName'],
    groupKey: 'basicInfo',
    label: '姓名',
    input: 'text',
    valueType: 'scalar',
    description: '用户希望用于简历、投递材料和系统展示的姓名。',
    example: '王一然',
    requiredLevel: 'required',
    writePolicy: 'user_only',
  },
  {
    key: 'contactEmail',
    path: ['basicInfo', 'contactEmail'],
    groupKey: 'basicInfo',
    label: '联系邮箱',
    input: 'text',
    valueType: 'scalar',
    description: '用于简历和投递材料的专业邮箱。',
    example: 'yiran.wang@example.com',
    requiredLevel: 'required_for_resume',
    writePolicy: 'user_only',
  },
  {
    key: 'phoneOrPreferredContact',
    path: ['basicInfo', 'phoneOrPreferredContact'],
    groupKey: 'basicInfo',
    label: '电话 / 微信',
    input: 'text',
    valueType: 'scalar',
    description: '手机号、微信或其他首选联系方式。',
    example: '13800000000 / WeChat: yiran-career',
    requiredLevel: 'recommended',
    writePolicy: 'user_only',
  },
  {
    key: 'currentCity',
    path: ['basicInfo', 'currentCity'],
    groupKey: 'basicInfo',
    label: '当前城市',
    input: 'text',
    valueType: 'scalar',
    description: '当前所在城市，用于判断通勤、面试和本地机会。',
    example: '天津',
    requiredLevel: 'recommended',
    writePolicy: 'user_only',
  },
  {
    key: 'candidateType',
    path: ['careerProfile', 'candidateType'],
    groupKey: 'careerProfile',
    label: '用户类型',
    input: 'text',
    valueType: 'scalar',
    description: '如在校学生、应届毕业生、转行用户、在职提升、再就业等。',
    example: '应届毕业生；社招转行；在职提升',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'currentRole',
    path: ['careerProfile', 'currentRole'],
    groupKey: 'careerProfile',
    label: '当前角色',
    input: 'text',
    valueType: 'scalar',
    description: '当前身份、岗位或主要职业状态，如在校生、自由职业者、在职岗位。',
    example: '2026 届市场营销本科生；P6 全栈开发工程师',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'employmentStatus',
    path: ['careerProfile', 'employmentStatus'],
    groupKey: 'careerProfile',
    label: '就业状态',
    input: 'text',
    valueType: 'scalar',
    description: '在校、待业、在职、离职求职、自由职业、校招求职等状态。',
    example: '校招求职中；在职看机会；自由职业',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'careerStage',
    path: ['careerProfile', 'careerStage'],
    groupKey: 'careerProfile',
    label: '职业阶段',
    input: 'text',
    valueType: 'scalar',
    description: '当前职业发展阶段，例如探索、定位、能力补齐、求职转化、面试、Offer、入职或晋升。',
    example: '求职转化期',
    requiredLevel: 'recommended',
    writePolicy: 'agent_derived',
  },
  {
    key: 'educationBackground',
    path: ['careerProfile', 'educationBackground'],
    groupKey: 'careerProfile',
    label: '教育背景',
    input: 'textarea',
    valueType: 'scalar',
    description: '学历、学校、专业、毕业时间、课程、证书或培训背景。',
    example: '市场营销本科，2026 届；相关课程：消费者行为、市场调研。',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'workExperience',
    path: ['careerProfile', 'workExperience'],
    groupKey: 'careerProfile',
    label: '工作 / 实习经历',
    input: 'textarea',
    valueType: 'scalar',
    description: '工作、实习、校园组织、自由职业等经历摘要。',
    example: '校园公众号运营，负责选题、发文、活动传播和数据复盘。',
    requiredLevel: 'required_for_resume',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'projectExperience',
    path: ['careerProfile', 'projectExperience'],
    groupKey: 'careerProfile',
    label: '项目经历',
    input: 'textarea',
    valueType: 'scalar',
    description: '项目背景、任务、方法、结果和交付物。',
    example: '3 个月校园公众号涨粉 2000，沉淀选题和活动复盘。',
    requiredLevel: 'required_for_matching',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'skills',
    path: ['careerProfile', 'skills'],
    groupKey: 'careerProfile',
    label: '技能标签',
    input: 'textarea',
    valueType: 'list',
    description: '专业技能、工具技能、软技能和语言能力等。',
    example: '内容选题；公众号运营；活动复盘；Excel 数据分析',
    requiredLevel: 'required_for_matching',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'interests',
    path: ['careerProfile', 'interests'],
    groupKey: 'careerProfile',
    label: '兴趣方向',
    input: 'textarea',
    valueType: 'list',
    description: '感兴趣的行业、岗位、工作方式或价值方向。',
    example: '互联网内容；教育科技；用户增长',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'strengthTags',
    path: ['careerProfile', 'strengthTags'],
    groupKey: 'careerProfile',
    label: '优势标签',
    input: 'textarea',
    valueType: 'list',
    description: '基于经历、项目、技能、成果或重复行为提炼出的优势。',
    example: '内容表达；校园用户理解；结果意识',
    requiredLevel: 'recommended',
    writePolicy: 'agent_derived',
  },
  {
    key: 'weaknessTags',
    path: ['careerProfile', 'weaknessTags'],
    groupKey: 'careerProfile',
    label: '短板标签',
    input: 'textarea',
    valueType: 'list',
    description: '缺失证据、能力差距、不清晰区域或阻塞约束。',
    example: '商业项目证据不足；数据分析深度不足',
    requiredLevel: 'recommended',
    writePolicy: 'agent_derived',
  },
  {
    key: 'personalityTraits',
    path: ['careerProfile', 'personalityTraits'],
    groupKey: 'careerProfile',
    label: '性格与行为倾向',
    input: 'textarea',
    valueType: 'list',
    description: '只作为可审阅假设，不应从少量对话中形成固定人格结论。',
    example: '偏稳定；需要明确反馈；不偏好强销售压力',
    requiredLevel: 'optional',
    writePolicy: 'agent_derived',
  },
  {
    key: 'targetIndustry',
    path: ['intentConstraints', 'targetIndustry'],
    groupKey: 'intentConstraints',
    label: '目标行业',
    input: 'text',
    valueType: 'scalar',
    description: '当前主要探索或求职行业。',
    example: '互联网；教育科技；本地生活',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'targetIndustries',
    path: ['intentConstraints', 'targetIndustries'],
    groupKey: 'intentConstraints',
    label: '目标行业列表',
    input: 'textarea',
    valueType: 'list',
    description: '用户正在考虑的多个目标行业，用于保留旧 persona 的多行业偏好。',
    example: '互联网；教育科技；本地生活',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'targetRole',
    path: ['intentConstraints', 'targetRole'],
    groupKey: 'intentConstraints',
    label: '目标岗位',
    input: 'text',
    valueType: 'scalar',
    description: '用于岗位匹配、能力诊断、简历优化和学习计划。',
    example: '新媒体运营；用户运营',
    requiredLevel: 'required',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'targetCity',
    path: ['intentConstraints', 'targetCity'],
    groupKey: 'intentConstraints',
    label: '目标城市',
    input: 'text',
    valueType: 'scalar',
    description: '目标城市、通勤范围或远程/异地限制。',
    example: '北京；接受天津通勤或短期过渡',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'expectedSalary',
    path: ['intentConstraints', 'expectedSalary'],
    groupKey: 'intentConstraints',
    label: '薪资期望',
    input: 'text',
    valueType: 'scalar',
    description: '国内求职中常用的月薪、年包或底线预期。',
    example: '8k-12k / 月',
    requiredLevel: 'optional',
    writePolicy: 'sensitive_user_confirmed',
  },
  {
    key: 'availableTime',
    path: ['intentConstraints', 'availableTime'],
    groupKey: 'intentConstraints',
    label: '可投入时间',
    input: 'textarea',
    valueType: 'scalar',
    description: '每周学习、项目、投递或面试准备时间。',
    example: '每周 10 小时优化简历与补项目。',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'jobSearchStatus',
    path: ['intentConstraints', 'jobSearchStatus'],
    groupKey: 'intentConstraints',
    label: '求职状态',
    input: 'text',
    valueType: 'scalar',
    description: '未开始、投递中、面试中、Offer 阶段、入职准备等。',
    example: '投递中，面试反馈偏少。',
    requiredLevel: 'recommended',
    writePolicy: 'agent_derived',
  },
  {
    key: 'constraints',
    path: ['intentConstraints', 'constraints'],
    groupKey: 'intentConstraints',
    label: '现实约束',
    input: 'textarea',
    valueType: 'list',
    description: '时间、地域、学历、家庭、通勤、加班、出差或不可接受条件。',
    example: '暂不接受强销售压力岗位；只能周五线下面试',
    requiredLevel: 'recommended',
    writePolicy: 'sensitive_user_confirmed',
  },
  {
    key: 'workPreferences',
    path: ['intentConstraints', 'workPreferences'],
    groupKey: 'intentConstraints',
    label: '工作偏好',
    input: 'textarea',
    valueType: 'list',
    description: '团队环境、工作方式、强度、稳定性、成长性等偏好。',
    example: '偏稳定团队；希望有明确反馈；不偏好强销售压力',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'learningPreferences',
    path: ['intentConstraints', 'learningPreferences'],
    groupKey: 'intentConstraints',
    label: '学习偏好',
    input: 'textarea',
    valueType: 'list',
    description: '偏好的学习方式、节奏、资源形式和训练方式。',
    example: '案例拆解；短周期项目练习；每周固定复盘',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'careerGoal',
    path: ['intentConstraints', 'careerGoal'],
    groupKey: 'intentConstraints',
    label: '职业目标',
    input: 'textarea',
    valueType: 'scalar',
    description: '短期或长期职业目标。',
    example: '3 个月内拿到内容/用户运营 offer。',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'learningRecords',
    path: ['activityRecords', 'learningRecords'],
    groupKey: 'activityRecords',
    label: '学习记录',
    input: 'textarea',
    valueType: 'list',
    description: '课程、训练、阅读、练习和学习成果记录。',
    example: '完成运营数据分析入门课程',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'projectRecords',
    path: ['activityRecords', 'projectRecords'],
    groupKey: 'activityRecords',
    label: '项目记录',
    input: 'textarea',
    valueType: 'list',
    description: '项目推进、成果、复盘和证据材料记录。',
    example: '公众号增长复盘已补充后台数据截图',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'applicationRecords',
    path: ['activityRecords', 'applicationRecords'],
    groupKey: 'activityRecords',
    label: '投递记录',
    input: 'textarea',
    valueType: 'list',
    description: '投递岗位、公司、简历版本、反馈和转化情况。',
    example: '已投递 18 个岗位，2 个 HR 回复',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'interviewRecords',
    path: ['activityRecords', 'interviewRecords'],
    groupKey: 'activityRecords',
    label: '面试记录',
    input: 'textarea',
    valueType: 'list',
    description: '面试类型、问题、反馈、结果和复盘。',
    example: '一面被问到活动转化指标，回答不充分',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'offerRecords',
    path: ['activityRecords', 'offerRecords'],
    groupKey: 'activityRecords',
    label: 'Offer 记录',
    input: 'textarea',
    valueType: 'list',
    description: 'Offer 条件、薪资、岗位、风险点和决策状态。',
    example: 'A 公司运营助理 offer，薪资 9k，试用期 3 个月',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'resumeSummary',
    path: ['artifacts', 'resumeSummary'],
    groupKey: 'artifacts',
    label: '简历摘要',
    input: 'textarea',
    valueType: 'scalar',
    description: '当前简历的结构、核心内容和主要问题摘要。',
    example: '经历完整，但项目成果和数据指标不足。',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'portfolioLinks',
    path: ['artifacts', 'portfolioLinks'],
    groupKey: 'artifacts',
    label: '作品集与公开链接',
    input: 'textarea',
    valueType: 'list',
    description: '作品集、项目 demo、文档、视频、公众号或公开链接。',
    example: '公众号案例链接；项目复盘文档',
    requiredLevel: 'recommended',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'projectMaterials',
    path: ['artifacts', 'projectMaterials'],
    groupKey: 'artifacts',
    label: '项目材料',
    input: 'textarea',
    valueType: 'list',
    description: '项目文档、截图、数据表、PRD、复盘或作品材料。',
    example: '公众号后台截图；校园活动复盘 PDF',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'userFeedback',
    path: ['feedbackSignals', 'userFeedback'],
    groupKey: 'feedbackSignals',
    label: '用户反馈',
    input: 'textarea',
    valueType: 'list',
    description: '用户对建议、方向、计划或结果的反馈。',
    example: '不接受长期加班；希望岗位更稳定',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'interviewFeedback',
    path: ['feedbackSignals', 'interviewFeedback'],
    groupKey: 'feedbackSignals',
    label: '面试反馈',
    input: 'textarea',
    valueType: 'list',
    description: '面试官、HR 或复盘得出的反馈信号。',
    example: '缺少用户分层和数据复盘案例',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'learningPlan',
    path: ['planState', 'learningPlan'],
    groupKey: 'planState',
    label: '学习计划',
    input: 'textarea',
    valueType: 'scalar',
    description: '当前需要持续执行的学习计划。',
    example: '两周内补完运营数据分析和用户分层案例。',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'applicationPlan',
    path: ['planState', 'applicationPlan'],
    groupKey: 'planState',
    label: '投递计划',
    input: 'textarea',
    valueType: 'scalar',
    description: '岗位分层、投递节奏、简历版本和复盘节点。',
    example: '每周投 20 个匹配岗位，周末复盘 JD 关键词。',
    requiredLevel: 'optional',
    writePolicy: 'agent_suggested',
  },
  {
    key: 'jobIntentionStatement',
    path: ['chinaResumeSupplement', 'jobIntentionStatement'],
    groupKey: 'chinaResumeSupplement',
    label: '求职意向表述',
    input: 'textarea',
    valueType: 'scalar',
    description: '中文简历中直接展示的求职意向。',
    example: '求职意向：新媒体运营，目标城市北京。',
    requiredLevel: 'required_for_chinese_resume',
    writePolicy: 'sensitive_user_confirmed',
  },
  {
    key: 'educationDetail',
    path: ['chinaResumeSupplement', 'educationDetail'],
    groupKey: 'chinaResumeSupplement',
    label: '中文简历教育信息',
    input: 'textarea',
    valueType: 'scalar',
    description: '中文简历可直接展示的学校、专业、时间、课程和成绩。',
    example: '2022.09-2026.06，某大学，市场营销，本科。',
    requiredLevel: 'required_for_chinese_resume',
    writePolicy: 'sensitive_user_confirmed',
  },
  {
    key: 'awardsCertificatesHighlights',
    path: ['chinaResumeSupplement', 'awardsCertificatesHighlights'],
    groupKey: 'chinaResumeSupplement',
    label: '荣誉奖励与证书',
    input: 'textarea',
    valueType: 'scalar',
    description: '中文简历中常见的荣誉、证书、竞赛或可加分经历。',
    example: '校级优秀学生干部；普通话二甲；英语四级。',
    requiredLevel: 'optional',
    writePolicy: 'sensitive_user_confirmed',
  },
  {
    key: 'conditionalFields',
    path: ['chinaResumeSupplement', 'conditionalFields'],
    groupKey: 'chinaResumeSupplement',
    label: '国内条件字段',
    input: 'textarea',
    valueType: 'scalar',
    description: '政治面貌、户籍、照片、婚育等只在岗位或用户主动提供时填写。',
    example: '应聘国企时用户主动提供：中共党员。',
    requiredLevel: 'conditional',
    writePolicy: 'sensitive_user_confirmed',
  },
];

export function isRequiredProfileField(field: { requiredLevel: ProfileFieldRequirement }) {
  return requiredProfileLevels.has(field.requiredLevel);
}

export function formatRequiredLevel(level: ProfileFieldRequirement) {
  switch (level) {
    case 'required':
      return '必填';
    case 'required_for_resume':
      return '简历必填';
    case 'required_for_matching':
      return '匹配必填';
    case 'required_for_chinese_resume':
      return '中文简历必填';
    case 'recommended':
      return '建议填写';
    case 'conditional':
      return '条件填写';
    case 'optional':
      return '选填';
    default:
      return level;
  }
}

export function getRequirementKind(level: ProfileFieldRequirement): ProfileFieldRequirementKind {
  if (requiredProfileLevels.has(level)) {
    return 'required';
  }

  if (level === 'conditional') {
    return 'conditional';
  }

  if (level === 'recommended') {
    return 'recommended';
  }

  return 'optional';
}

export function getWritePolicyLabel(policy: ProfileFieldWritePolicy) {
  switch (policy) {
    case 'user_only':
      return '用户维护';
    case 'agent_suggested':
      return 'AI 可建议';
    case 'agent_derived':
      return 'AI 判断';
    case 'sensitive_user_confirmed':
      return '用户确认';
    default:
      return policy;
  }
}

export function getWritePolicyKind(policy: ProfileFieldWritePolicy) {
  switch (policy) {
    case 'user_only':
      return 'user';
    case 'agent_suggested':
    case 'agent_derived':
      return 'agent';
    case 'sensitive_user_confirmed':
      return 'sensitive';
    default:
      return 'conditional';
  }
}

export function readProfileField(profile: ProfileRecord, field: ProfileFieldConfig) {
  let cursor: unknown = profile;

  for (const segment of field.path) {
    if (typeof cursor !== 'object' || cursor === null) {
      return field.valueType === 'list' ? [] : '';
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (field.valueType === 'list') {
    return Array.isArray(cursor) ? cursor.filter((item): item is string => typeof item === 'string') : [];
  }

  return typeof cursor === 'string' ? cursor : '';
}

export function writeProfileField(
  profile: ProfileRecord,
  field: ProfileFieldConfig,
  value: string | string[],
) {
  const nextProfile = JSON.parse(JSON.stringify(profile)) as ProfileRecord;
  let cursor: Record<string, unknown> = nextProfile as unknown as Record<string, unknown>;

  for (const segment of field.path.slice(0, -1)) {
    const nextCursor = cursor[segment];
    if (typeof nextCursor !== 'object' || nextCursor === null || Array.isArray(nextCursor)) {
      cursor[segment] = {};
    }

    cursor = cursor[segment] as Record<string, unknown>;
  }

  cursor[field.path[field.path.length - 1]] = value;
  return nextProfile;
}

export function buildProfileSnapshotSections(profile: ProfileRecord): ProfileSnapshotSection[] {
  return profileFieldGroups.map((group) => ({
    ...group,
    items: profileFields
      .filter((field) => field.groupKey === group.key)
      .map((field) => ({
        label: field.label,
        value: readProfileField(profile, field),
        writePolicy: field.writePolicy,
      })),
  }));
}
