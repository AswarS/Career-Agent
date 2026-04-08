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
    purpose: 'Populate the left-side thread rail.',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.threadMessages,
    purpose: 'Load the active thread timeline.',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profile,
    purpose: 'Read the structured profile source of truth.',
  },
  {
    method: 'PUT',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profile,
    purpose: 'Persist explicit profile edits from the frontend.',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.profileSuggestions,
    purpose: 'Load non-destructive profile suggestions linked to conversation context.',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.listArtifacts,
    purpose: 'Load the artifact catalog and revisions.',
  },
  {
    method: 'GET',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.artifact,
    purpose: 'Open a single artifact in the host pane.',
  },
  {
    method: 'POST',
    path: CAREER_AGENT_API_ROUTE_PATTERNS.refreshArtifact,
    purpose: 'Request a fresh artifact revision.',
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
