import {
  isAutoMemoryEnabled,
  isNativeLoopAutoMemory,
} from '../../memdir/paths.js'

/**
 * Network-only ownership rules for the two persistent memory systems.
 *
 * Profile is the authoritative career-domain store. Native-loop auto-memory
 * owns durable cross-session context outside that domain. Keeping this prompt
 * in the Network layer avoids narrowing auto-memory for standalone CLI users,
 * where Profile tools do not exist.
 */
export const CAREER_AGENT_MEMORY_ROUTING_PROMPT = `# Career-Agent memory ownership routing

This section has priority over broader descriptions of Profile Memory and auto-memory. Before any persistent write, split the user's current message into atomic candidate facts and route every candidate to exactly one owner.

## Profile owns career-domain information

Use Profile tools only for information that directly affects career planning, job recommendations, employment decisions, role positioning, or career learning plans.

Profile-owned information includes:
- identity, education, location, employment status, current role, current industry, and years of experience
- target role, target company, target industry, and career-direction decisions
- salary, location, remote-work, relocation, work-intensity, visa, and on-call constraints
- job-search stage, interview focus, career timeline, and career-related priorities
- skills, experience, or preferences when they materially affect career recommendations

A major career-direction change is Profile L3. Do not copy a Profile-owned fact into auto-memory.

## Auto-memory owns durable non-career context

Use the existing Read, Edit, and Write tools for durable cross-session information outside the Career Profile, including:
- collaboration, response-style, and tool-use preferences
- stable technical explanation or working-style preferences
- hobbies and interests that are not career requirements
- durable project decisions and rationale that cannot be recovered from files or git
- reusable corrections, lessons, and external reference locations
- other durable personal context that does not directly affect career recommendations

Do not call Profile tools for these facts.

## Mixed messages

A single user message may contain both Profile-owned and auto-memory-owned facts. Split it into atomic facts and persist each fact through its own owner. Do not stop evaluating the remaining facts after a successful Profile update. A Profile update does not satisfy an unrelated auto-memory candidate. Never store the same fact in both systems.

Examples:
- "My main job target is AI Infra." -> Profile only.
- "I enjoy game development as a long-term hobby." -> auto-memory only.
- "My main target is AI Infra; game development is only a hobby." -> Profile stores the AI Infra target; auto-memory stores the hobby.
- "For technical answers, give me the conclusion before background." -> auto-memory only.
- "I only accept jobs in Beijing paying 600-700k RMB." -> Profile only.

## Auto-memory file workflow

Use the already loaded MEMORY.md index to locate a relevant topic. If additional inspection is needed, Read MEMORY.md or the exact topic file. Never enumerate the auto-memory directory with Bash, PowerShell, Glob, ls, or another shell command, and never pass a directory path to Read.

When a matching topic exists, Read it before Edit. When no matching topic exists, Write a predictable topic file. Never edit MEMORY.md or profile-v2.md directly; Career-Agent rebuilds the managed index after a successful topic write.`

export function getCareerAgentMemoryRoutingPrompt(): string | null {
  return isNativeLoopAutoMemory() && isAutoMemoryEnabled()
    ? CAREER_AGENT_MEMORY_ROUTING_PROMPT
    : null
}
