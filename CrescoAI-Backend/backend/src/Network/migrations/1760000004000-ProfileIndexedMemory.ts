import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

type MemoryRow = {
  id: string;
  userId: number;
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
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "profile_memory_index_rollback" (
      "memoryId" varchar PRIMARY KEY NOT NULL,
      "profileIndex" varchar NOT NULL,
      "profileLevel" varchar NOT NULL,
      "itemVersion" integer NOT NULL DEFAULT (1)
    )`);

    if (!(await queryRunner.hasColumn('profile_memory_items', 'profileIndex'))) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'profileIndex',
        type: 'varchar',
        isNullable: true,
      }));
    }
    if (!(await queryRunner.hasColumn('profile_memory_items', 'profileLevel'))) {
      await queryRunner.addColumn('profile_memory_items', new TableColumn({
        name: 'profileLevel',
        type: 'varchar',
        default: "'L2'",
      }));
    }
    if (!(await queryRunner.hasColumn('profile_memory_items', 'itemVersion'))) {
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
      SELECT "id", "userId", "timeScope", "priority", "sourceType", "supersedesId", "createdAt"
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
    for (const memory of memories) {
      const used = usedByUser.get(memory.userId) ?? new Set<number>();
      usedByUser.set(memory.userId, used);
      const rollback = rollbackById.get(memory.id);
      const rollbackSequence = rollback
        ? Number.parseInt(rollback.profileIndex.replace(/^P/, ''), 10)
        : Number.NaN;
      const inheritedSequence = memory.supersedesId
        ? assignedById.get(memory.supersedesId)
        : undefined;
      const restored = Number.isInteger(rollbackSequence) && rollbackSequence > 0;
      const inherited = inheritedSequence !== undefined;
      let sequence = restored
        ? rollbackSequence
        : inherited
          ? inheritedSequence!
          : nextByUser.get(memory.userId) ?? 1;
      if (!restored && !inherited) {
        while (used.has(sequence)) sequence += 1;
      }
      used.add(sequence);
      assignedById.set(memory.id, sequence);
      nextByUser.set(memory.userId, Math.max(nextByUser.get(memory.userId) ?? 1, sequence + 1));

      const revisionLevel = revisionLevelById.get(memory.id);
      const derivedLevel = memory.priority === 'hard_constraint'
        ? 'L3'
        : memory.timeScope === 'short_term'
          && ['user_explicit', 'user_confirmed'].includes(memory.sourceType)
          ? 'L1'
          : 'L2';
      const profileLevel = rollback?.profileLevel
        ?? (revisionLevel && ['L1', 'L2', 'L3'].includes(revisionLevel) ? revisionLevel : derivedLevel);
      const profileIndex = `P${String(sequence).padStart(6, '0')}`;
      await queryRunner.query(
        'UPDATE "profile_memory_items" SET "profileIndex" = ?, "profileLevel" = ?, "itemVersion" = ? WHERE "id" = ?',
        [profileIndex, profileLevel, rollback?.itemVersion ?? 1, memory.id],
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
