import { resolve } from 'node:path'
import { getGlobalSkillsRoot } from '../skills/globalSkillPaths.js'
import { getBundledSkillsRoot } from '../utils/permissions/filesystem.js'
import {
  NETWORK_READ_ONLY_FILE_TOOLS,
  type SessionFilesystemRoot,
  type SessionReadOnlyRoot,
} from './filesystemPolicyTypes.js'

function readOnlyRoot(id: string, root: string): SessionReadOnlyRoot {
  return Object.freeze({
    id,
    root: resolve(root),
    allowedTools: NETWORK_READ_ONLY_FILE_TOOLS,
  })
}

/**
 * Application-owned resources that are intentionally public to every Network
 * user. Adding an entry here is a security decision: all content below it must
 * be safe for every tenant to read.
 */
export function getNetworkSharedReadOnlyRoots(): readonly SessionReadOnlyRoot[] {
  return Object.freeze([
    readOnlyRoot('career-agent-global-skills', getGlobalSkillsRoot()),
    readOnlyRoot('bundled-skill-cache', getBundledSkillsRoot()),
  ])
}

/**
 * Dynamic selected-skill grants may only narrow one of these application-owned
 * catalogs. A skill cannot turn an arbitrary absolute path into a capability.
 */
export function getNetworkTrustedSkillCatalogRoots(): readonly SessionFilesystemRoot[] {
  return getNetworkSharedReadOnlyRoots().map(({ id, root }) =>
    Object.freeze({ id, root }),
  )
}

