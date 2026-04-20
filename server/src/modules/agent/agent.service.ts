import { Injectable } from '@nestjs/common';
import { AgentRunInput, AgentRunResult, runAgent } from './agent.runtime';

@Injectable()
export class AgentService {
  run(input: AgentRunInput): AgentRunResult {
    return runAgent(input);
  }
}
