import { describe, expect, test } from 'bun:test';
import { ProfileService } from '../src/Network/modules/profile/profile.service.js';
import type { ProfileSuggestionEntity } from '../src/Network/modules/profile/entities/profile-suggestion.entity.js';

type StoredSuggestion = ProfileSuggestionEntity & { createdAt: Date };

function createService() {
  const rows: StoredSuggestion[] = [];
  const userRepo = {
    findOne: async ({ where }: { where: { id: number } }) =>
      where.id ? { id: where.id, displayName: 'Test User', profileJson: '{}' } : null,
  };
  const suggestionRepo = {
    create: (input: Partial<ProfileSuggestionEntity>) => input,
    save: async (input: Partial<ProfileSuggestionEntity>) => {
      if (input.rowId) {
        const existingIndex = rows.findIndex((row) => row.rowId === input.rowId);
        if (existingIndex !== -1) {
          rows[existingIndex] = { ...rows[existingIndex], ...input } as StoredSuggestion;
          return rows[existingIndex];
        }
      }
      const row = {
        rowId: rows.length + 1,
        createdAt: new Date(Date.UTC(2026, 6, 7, 0, rows.length, 0)),
        ...input,
      } as StoredSuggestion;
      rows.push(row);
      return row;
    },
    find: async ({ where }: { where: { userId: number; status: string } }) =>
      rows.filter(
        (row) => row.userId === where.userId && row.status === where.status,
      ),
    findOne: async ({
      where,
    }: {
      where: {
        userId: number;
        id: string;
        sourceThreadId: string | null;
        status: string;
      };
    }) =>
      rows.find(
        (row) =>
          row.userId === where.userId &&
          row.id === where.id &&
          row.sourceThreadId === where.sourceThreadId &&
          row.status === where.status,
      ) ?? null,
  };

  return {
    rows,
    service: new ProfileService(userRepo as never, suggestionRepo as never),
  };
}

describe('ProfileService suggestions', () => {
  test('returns [] when no pending suggestions exist', async () => {
    const { service } = createService();

    await expect(service.listSuggestions(1)).resolves.toEqual([]);
  });

  test('returns ProfileSuggestion[] when a structured suggestion exists', async () => {
    const { service } = createService();

    await service.saveSuggestionsFromOutput({
      userId: 1,
      sourceThreadId: 'thread-001',
      output: {
        profile_suggestion: {
          id: 'suggestion-target-role',
          title: '收紧目标角色',
          rationale: '来自本次会话中的明确目标岗位表达。',
          patch: {
            intentConstraints: {
              targetRole: 'AI 产品经理',
            },
          },
        },
      },
    });

    await expect(service.listSuggestions(1)).resolves.toEqual([
      {
        id: 'suggestion-target-role',
        title: '收紧目标角色',
        rationale: '来自本次会话中的明确目标岗位表达。',
        sourceThreadId: 'thread-001',
        patch: {
          intentConstraints: {
            targetRole: 'AI 产品经理',
          },
        },
      },
    ]);
  });

  test('does not persist unsupported patch fields', async () => {
    const { service } = createService();

    await service.saveSuggestionsFromOutput({
      userId: 1,
      sourceThreadId: 'thread-002',
      output: {
        profile_suggestion: {
          id: 'suggestion-clean-patch',
          title: '更新阶段',
          rationale: '阶段判断来自用户最新求职状态。',
          patch: {
            careerProfile: {
              careerStage: '求职转化期',
              stage_reasoning: 'unsupported',
            },
            risk_items: ['unsupported'],
            preference_ranking: ['unsupported'],
            intentConstraints: {
              target_role: '增长产品经理',
              non_negotiables: ['不接受长期大小周'],
            },
          },
        },
      },
    });

    const [suggestion] = await service.listSuggestions(1);
    expect(suggestion.patch).toEqual({
      careerProfile: {
        careerStage: '求职转化期',
      },
      intentConstraints: {
        targetRole: '增长产品经理',
        constraints: ['不接受长期大小周'],
      },
    });
    expect(JSON.stringify(suggestion.patch)).not.toContain('risk_items');
    expect(JSON.stringify(suggestion.patch)).not.toContain('preference_ranking');
    expect(JSON.stringify(suggestion.patch)).not.toContain('stage_reasoning');
    expect(JSON.stringify(suggestion.patch)).not.toContain('non_negotiables');
  });

  test('isolates pending suggestions by userId', async () => {
    const { service } = createService();

    await service.saveSuggestionsFromOutput({
      userId: 1,
      sourceThreadId: 'thread-user-1',
      output: {
        profile_suggestion: {
          id: 'suggestion-user-1',
          title: '用户 1 建议',
          rationale: '来自用户 1 的会话。',
          patch: { intentConstraints: { targetRole: '产品经理' } },
        },
      },
    });
    await service.saveSuggestionsFromOutput({
      userId: 2,
      sourceThreadId: 'thread-user-2',
      output: {
        profile_suggestion: {
          id: 'suggestion-user-2',
          title: '用户 2 建议',
          rationale: '来自用户 2 的会话。',
          patch: { intentConstraints: { targetRole: '数据分析师' } },
        },
      },
    });

    expect((await service.listSuggestions(1)).map((item) => item.id)).toEqual([
      'suggestion-user-1',
    ]);
    expect((await service.listSuggestions(2)).map((item) => item.id)).toEqual([
      'suggestion-user-2',
    ]);
  });

  test('supports source_thread_id and sourceThreadId', async () => {
    const { service } = createService();

    await service.saveSuggestionsFromOutput({
      userId: 1,
      output: {
        profile_suggestions: [
          {
            id: 'suggestion-snake-source',
            title: 'snake source',
            rationale: '兼容 source_thread_id。',
            source_thread_id: 'thread-snake',
            patch: { intentConstraints: { targetRole: '运营经理' } },
          },
          {
            id: 'suggestion-camel-source',
            title: 'camel source',
            rationale: '兼容 sourceThreadId。',
            sourceThreadId: 'thread-camel',
            patch: { intentConstraints: { targetCity: '上海' } },
          },
        ],
      },
    });

    const suggestions = await service.listSuggestions(1);
    expect(suggestions.map((item) => item.sourceThreadId)).toEqual([
      'thread-snake',
      'thread-camel',
    ]);
  });

  test('deduplicates repeated suggestions from the same source thread', async () => {
    const { rows, service } = createService();
    const duplicatedSuggestion = {
      id: 'suggestion-duplicate',
      title: '重复建议',
      rationale: '同一 skill 输出中重复出现。',
      patch: { intentConstraints: { targetRole: 'AI 产品经理' } },
    };

    await service.saveSuggestionsFromOutput({
      userId: 1,
      sourceThreadId: 'thread-duplicate',
      output: {
        profile_suggestions: [
          duplicatedSuggestion,
          duplicatedSuggestion,
        ],
      },
    });

    expect(rows).toHaveLength(1);
    expect(await service.listSuggestions(1)).toHaveLength(1);
  });
});
