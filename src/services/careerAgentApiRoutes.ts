const CAREER_AGENT_API_BASE_PATH = '/api/career-agent';

export const CAREER_AGENT_API_ROUTE_PATTERNS = {
  createThread: `${CAREER_AGENT_API_BASE_PATH}/threads`,
  listThreads: `${CAREER_AGENT_API_BASE_PATH}/threads/:userId`,
  threadMessages: `${CAREER_AGENT_API_BASE_PATH}/threads/:threadId/messages`,
  threadFiles: `${CAREER_AGENT_API_BASE_PATH}/threads/:threadId/files`,
  threadFile: `${CAREER_AGENT_API_BASE_PATH}/threads/:threadId/files/:fileName`,
  profile: `${CAREER_AGENT_API_BASE_PATH}/profile`,
  profileSuggestions: `${CAREER_AGENT_API_BASE_PATH}/profile/suggestions`,
  listArtifacts: `${CAREER_AGENT_API_BASE_PATH}/artifacts/:userId`,
  artifact: `${CAREER_AGENT_API_BASE_PATH}/artifacts/:artifactId`,
  refreshArtifact: `${CAREER_AGENT_API_BASE_PATH}/artifacts/:artifactId/refresh`,
} as const;

export const CAREER_AGENT_API_ROUTE_DESCRIPTORS = [
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.listThreads,
    purpose: '按用户填充左侧会话导航栏。',
  },
  {
    method: 'POST',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.createThread,
    purpose: '为当前用户创建新会话，并加入左侧导航。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages,
    purpose: '加载当前会话的消息时间线。',
  },
  {
    method: 'POST',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages,
    purpose: '向当前会话发送文本或带附件引用的消息。',
  },
  {
    method: 'POST',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadFiles,
    purpose: '向当前会话直传单个文件，并返回发送消息可引用的 asset id。',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadFile,
    purpose: '读取当前会话已经上传的文件流。',
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
    purpose: '按用户加载工件目录及其版本信息；当前 server 以 :userId 参数实现。',
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
  createThread() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.createThread;
  },
  listThreads(userId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.listThreads.replace(':userId', encodeURIComponent(userId));
  },
  threadMessages(threadId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages.replace(':threadId', encodeURIComponent(threadId));
  },
  sendThreadMessage(threadId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages.replace(':threadId', encodeURIComponent(threadId));
  },
  threadFiles(threadId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.threadFiles.replace(':threadId', encodeURIComponent(threadId));
  },
  threadFile(threadId: string, fileName: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.threadFile
      .replace(':threadId', encodeURIComponent(threadId))
      .replace(':fileName', encodeURIComponent(fileName));
  },
  profile() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.profile;
  },
  profileSuggestions() {
    return CAREER_AGENT_API_ROUTE_PATTERNS.profileSuggestions;
  },
  listArtifacts(userId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.listArtifacts.replace(':userId', encodeURIComponent(userId));
  },
  artifact(artifactId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.artifact.replace(':artifactId', encodeURIComponent(artifactId));
  },
  refreshArtifact(artifactId: string) {
    return CAREER_AGENT_API_ROUTE_PATTERNS.refreshArtifact.replace(':artifactId', encodeURIComponent(artifactId));
  },
} as const;
