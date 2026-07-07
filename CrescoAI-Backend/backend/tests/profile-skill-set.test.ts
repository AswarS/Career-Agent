import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry } from '../src/Network/modules/skill/skill.registry.js';
import { SkillService } from '../src/Network/modules/skill/skill.service.js';
import { listExternalSkills } from '../src/Network/modules/skill/skill-file-store.js';

const externalSkillDirsEnv = 'CAREER_AGENT_EXTERNAL_SKILL_DIRS';

const fixtureSkills = [
  ['career_profile_building', 'Builds a structured career profile snapshot.'],
  ['career_stage_identification', 'Identifies career stage and next action.'],
  ['career_motivation_preference_analysis', 'Analyzes career motivation and work preferences.'],
  ['career_risk_assessment', 'Assesses career risks and mitigation actions.'],
] as const;

async function createExternalProfileSkillSetFixture() {
  const root = await mkdtemp(join(tmpdir(), 'career-agent-profile-skills-'));

  for (const [name, description] of fixtureSkills) {
    const skillDir = join(root, name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nReturn an API-compatible profile_suggestion when grounded profile facts are available.\n`,
      'utf-8',
    );
  }

  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function withExternalProfileSkillSet(root: string) {
  const previous = process.env[externalSkillDirsEnv];
  process.env[externalSkillDirsEnv] = root;

  return () => {
    if (previous === undefined) {
      delete process.env[externalSkillDirsEnv];
    } else {
      process.env[externalSkillDirsEnv] = previous;
    }
  };
}

describe('external profile skill set', () => {
  test('does not load external skills unless explicitly configured', async () => {
    const previous = process.env[externalSkillDirsEnv];
    delete process.env[externalSkillDirsEnv];
    try {
      await expect(listExternalSkills()).resolves.toEqual([]);
      const service = new SkillService(new SkillRegistry());
      const skills = await service.listSkills(1);
      expect(skills.map((skill) => skill.name)).not.toContain('career-profile-building');
    } finally {
      if (previous === undefined) {
        delete process.env[externalSkillDirsEnv];
      } else {
        process.env[externalSkillDirsEnv] = previous;
      }
    }
  });

  test('loads configured user_profile_skill_set skills from an external directory', async () => {
    const fixture = await createExternalProfileSkillSetFixture();
    const restore = withExternalProfileSkillSet(fixture.root);
    try {
      const skills = await listExternalSkills();
      const skillNames = skills.map((skill) => skill.name).sort();

      expect(skillNames).toContain('career_profile_building');
      expect(skillNames).toContain('career_stage_identification');
      expect(skillNames).toContain('career_motivation_preference_analysis');
      expect(skillNames).toContain('career_risk_assessment');
    } finally {
      restore();
      await fixture.cleanup();
    }
  });

  test('registers configured external profile skills for a user', async () => {
    const fixture = await createExternalProfileSkillSetFixture();
    const restore = withExternalProfileSkillSet(fixture.root);
    try {
      const service = new SkillService(new SkillRegistry());
      const skills = await service.listSkills(1);
      const skillNames = skills.map((skill) => skill.name);

      expect(skillNames).toContain('career-profile-building');
      expect(skillNames).toContain('career-stage-identification');
      expect(skillNames).toContain('career-motivation-preference-analysis');
      expect(skillNames).toContain('career-risk-assessment');
    } finally {
      restore();
      await fixture.cleanup();
    }
  });

  test('fast routes career profile requests to career profile building', async () => {
    const fixture = await createExternalProfileSkillSetFixture();
    const restore = withExternalProfileSkillSet(fixture.root);
    const settingsService = {
      getApiSettings: async () => ({
        apiKey: 'test-api-key',
        baseUrl: 'http://localhost:1',
        model: 'test-model',
      }),
    };
    const agentService = {};
    const service = new SkillService(
      new SkillRegistry(),
      settingsService as never,
      agentService as never,
    );

    try {
      const decision = await service.autoSelectSkill(
        '请根据我的背景帮我整理一版职业画像',
        1,
        'thread-profile-skill-test',
      );

      expect(decision.useSkill).toBe(true);
      expect(decision.skillName).toBe('career-profile-building');
    } finally {
      restore();
      await fixture.cleanup();
    }
  });
});
