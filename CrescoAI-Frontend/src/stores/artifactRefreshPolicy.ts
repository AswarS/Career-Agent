import type { RuntimeConfig } from '../config/runtime';

export function shouldSimulateArtifactRefreshLifecycle(config: RuntimeConfig) {
  return config.artifactTransport === 'mock';
}
