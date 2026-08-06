import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

type MemoryRow = {
  id: string;
  userId: number;
  profileIndex: string | null;
  profileLevel: string;
  itemVersion: number;
  timeScope: string;
  priority: string;
  sourceType: string;
  supersedesId: string | null;
  createdAt: string;
};

type RollbackRow = {
  memoryId: string;
  profileIndex: string;
  profileLevel: string;
  itemVersion: number;
};

type RevisionRow = {
  targetId: string;
  updateLevel: string;
};

export class ProfileIndexedMemory1760000004000 implements MigrationInterface {
  name = 'ProfileIndexedMemory1760000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hadProfileIndex = await queryRunner.hasColumn(
      'profile_memory_items',
      'profileIndex',
    );
    const hadProfileLevel = await queryRunner.hasColumn(
      'profile_memory_items',
      'profileLevel',
    );
    const hadItemVersion = await queryRunner.hasColumn(
      'profile_memory_items',
      'itemVersion',
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_memory_index_rollback" (
      "memoryId" varchar PRIMARY KEY NOT NULL,
      "profileIndex" varchar NOT NULL,
      "profileLevel" varchar NOT NULL,
      "itemVersion" integer NOT NULL DEFAULT (1)
    )`);

    if (!hadProfileIndex) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'profileIndex',
        type: 'varchar',
        isNullable: true,
      }));
    }
    if (!hadProfileLevel) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'profileLevel',
        type: 'varchar',
        default: "'L2'",
      }));
    }
    if (!hadItemVersion) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'itemVersion',
        type: 'integer',
        default: 1,
      }));
    }
    if (!(await queryRunner.hasColumn('profile_states', 'nextProfileIndex'))) {
      await queryRunner.addColumn('profile_states', new TableColumn({
        name: 'nextProfileIndex',
        type: 'integer',
        default: 1,
      }));
    }

    const memories = await queryRunner.query(`
      SELECT "id", "userId", "profileIndex", "profileLevel", "itemVersion",
             "timeScope", "priority", "sourceType", "supersedesId", "createdAt"
      FROM "profile_memory_items"
      ORDER BY "userId" ASC, "createdAt" ASC, "id" ASC
    `) as MemoryRow[];
    const rollbackRows = await queryRunner.query(
      'SELECT "memoryId", "profileIndex", "profileLevel", "itemVersion" FROM "profile_memory_index_rollback"',
    ) as RollbackRow[];
    const revisions = await queryRunner.query(`
      SELECT "targetId", "updateLevel"
      FROM "profile_revisions"
      WHERE "targetType" = 'memory' AND "updateLevel" IN ('L1', 'L2', 'L3')
      ORDER BY "aggregateVersion" DESC, "id" DESC
    `) as RevisionRow[];

    const rollbackById = new Map(rollbackRows.map((row) => [row.memoryId, row]));
    const revisionLevelById = new Map<string, string>();
    for (const revision of revisions) {
      if (!revisionLevelById.has(revision.targetId)) {
        revisionLevelById.set(revision.targetId, revision.updateLevel);
      }
    }

    const nextByUser = new Map<number, number>();
    const usedByUser = new Map<number, Set<number>>();
    const assignedById = new Map<string, number>();

    // Older development deployments used TypeORM schema synchronization. In
    // those databases these columns and the active-index uniqueness constraint
    // can already exist even though this migration is not in the migration
    // ledger. Reserve every valid existing index before assigning missing ones
    // so the compatibility backfill never renumbers live profile memories into
    // an occupied index.
    if (hadProfileIndex) {
      for (const memory of memories) {
        const sequence = this.profileSequence(memory.profileIndex);
        if (sequence === undefined) continue;
        const used = usedByUser.get(memory.userId) ?? new Set<number>();
        used.add(sequence);
        usedByUser.set(memory.userId, used);
        nextByUser.set(
          memory.userId,
          Math.max(nextByUser.get(memory.userId) ?? 1, sequence + 1),
        );
      }
    }

    for (const memory of memories) {
      const used = usedByUser.get(memory.userId) ?? new Set<number>();
      usedByUser.set(memory.userId, used);
      const rollback = rollbackById.get(memory.id);
      const rollbackSequence = rollback
        ? this.profileSequence(rollback.profileIndex)
        : undefined;
      const existingSequence = hadProfileIndex
        ? this.profileSequence(memory.profileIndex)
        : undefined;
      const inheritedSequence = memory.supersedesId
        ? assignedById.get(memory.supersedesId)
        : undefined;
      const restored = rollbackSequence !== undefined;
      const existing = existingSequence !== undefined;
      const inherited = inheritedSequence !== undefined;
      let sequence = restored
        ? rollbackSequence!
        : existing
          ? existingSequence!
          : inherited
            ? inheritedSequence!
            : nextByUser.get(memory.userId) ?? 1;
      if (!restored && !existing && !inherited) {
        while (used.has(sequence)) sequence += 1;
      }
      used.add(sequence);
      assignedById.set(memory.id, sequence);
      nextByUser.set(
        memory.userId,
        Math.max(nextByUser.get(memory.userId) ?? 1, sequence + 1),
      );

      const revisionLevel = revisionLevelById.get(memory.id);
      const derivedLevel = memory.priority === 'hard_constraint'
        ? 'L3'
        : memory.timeScope === 'short_term'
          && ['user_explicit', 'user_confirmed'].includes(memory.sourceType)
          ? 'L1'
          : 'L2';
      const existingLevel = existing
        && hadProfileLevel
        && ['L1', 'L2', 'L3'].includes(memory.profileLevel)
        ? memory.profileLevel
        : undefined;
      const profileLevel = rollback?.profileLevel
        ?? existingLevel
        ?? (
          revisionLevel && ['L1', 'L2', 'L3'].includes(revisionLevel)
            ? revisionLevel
            : derivedLevel
        );
      const existingItemVersion = existing
        && hadItemVersion
        && Number.isInteger(memory.itemVersion)
        && memory.itemVersion > 0
        ? memory.itemVersion
        : undefined;
      const profileIndex = `P${String(sequence).padStart(6, '0')}`;
      await queryRunner.query(
        'UPDATE "profile_memory_items" SET "profileIndex" = ?, "profileLevel" = ?, "itemVersion" = ? WHERE "id" = ?',
        [
          profileIndex,
          profileLevel,
          rollback?.itemVersion ?? existingItemVersion ?? 1,
          memory.id,
        ],
      );
    }

    for (const [userId, nextProfileIndex] of nextByUser) {
      await queryRunner.query(
        'UPDATE "profile_states" SET "nextProfileIndex" = ? WHERE "userId" = ?',
        [nextProfileIndex, userId],
      );
    }
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_profile_memory_active_public_index"
      ON "profile_memory_items" ("userId", "profileIndex")
      WHERE "status" = 'active' AND "profileIndex" IS NOT NULL`);
  }

  private profileSequence(profileIndex: string | null | undefined) {
    if (!profileIndex || !/^P\d{6}$/.test(profileIndex)) return undefined;
    const sequence = Number.parseInt(profileIndex.slice(1), 10);
    return Number.isInteger(sequence) && sequence > 0 ? sequence : undefined;
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('profile_memory_items', 'profileIndex')) {
      await queryRunner.query(`INSERT OR REPLACE INTO "profile_memory_index_rollback"
        ("memoryId", "profileIndex", "profileLevel", "itemVersion")
        SELECT "id", "profileIndex", "profileLevel", "itemVersion"
        FROM "profile_memory_items"
        WHERE "profileIndex" IS NOT NULL`);
    }
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_profile_memory_active_public_index"');
    if (await queryRunner.hasColumn('profile_memory_items', 'profileLevel')) {
      await queryRunner.dropColumn('profile_memory_items', 'profileLevel');
    }
    if (await queryRunner.hasColumn('profile_memory_items', 'profileIndex')) {
      await queryRunner.dropColumn('profile_memory_items', 'profileIndex');
    }
    if (await queryRunner.hasColumn('profile_memory_items', 'itemVersion')) {
      await queryRunner.dropColumn('profile_memory_items', 'itemVersion');
    }
    if (await queryRunner.hasColumn('profile_states', 'nextProfileIndex')) {
      await queryRunner.dropColumn('profile_states', 'nextProfileIndex');
    }
  }
}
