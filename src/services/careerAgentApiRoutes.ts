const CAREER_AGENT_API_BASE_PATH = '/api/career-agent';

export const CAREER_AGENT_API_ROUTE_PATTERNS = {
  listThreads: `${CAREER_AGENT_API_BASE_PATH}/threads`,
  threadMessages: `${CAREER_AGENT_API_BASE_PATH}/threads/:threadId/messages`,
  profile: `${CAREER_AGENT_API_BASE_PATH}/profile`,
  profileSuggestions: `${CAREER_AGENT_API_BASE_PATH}/profile/suggestions`,
  listArtifacts: `${CAREER_AGENT_API_BASE_PATH}/artifacts`,
  artifact: `${CAREER_AGENT_API_BASE_PATH}/artifacts/:artifactId`,
  refreshArtifact: `${CAREER_AGENT_API_BASE_PATH}/artifacts/:artifactId/refresh`,
} as const;

export const CAREER_AGENT_API_ROUTE_DESCRIPTORS = [
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.listThreads,
    purpose: '填充左侧会话导航栏。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages,
    purpose: '加载当前会话的消息时间线。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profile,
    purpose: '读取结构化画像正式数据。',
  },
  {
    method: 'PUT',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profile,
    purpose: '持久化前端显式提交的画像编辑。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profileSuggestions,
    purpose: '加载与对话上下文关联的非破坏式画像建议。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.listArtifacts,
    purpose: '加载工件目录及其版本信息。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.artifact,
    purpose: '在宿主面板中打开单个工件。',
  },
  {
    method: 'POST',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.refreshArtifact,
    purpose: '请求新的工件版本。',
  },
] as const;

export const CAREER_AGENT_API_ROUTES = {
  listThreads() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.listThreads;
  },
  threadMessages(threadId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages.replace(':threadId', encodeURIComponent(threadId));
  },
  profile() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.profile;
  },
  profileSuggestions() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.profileSuggestions;
  },
  listArtifacts() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.listArtifacts;
  },
  artifact(artifactId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.artifact.replace(':artifactId', encodeURIComponent(artifactId));
  },
  refreshArtifact(artifactId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.refreshArtifact.replace(':artifactId', encodeURIComponent(artifactId));
  },
} as const;
