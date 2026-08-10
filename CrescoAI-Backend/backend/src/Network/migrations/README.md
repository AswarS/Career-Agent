# Career Agent database migrations

Run migrations once during deployment, before starting any Career Agent
application instances:

```sh
bun run network:migrate
```

Set `CAREER_AGENT_DATABASE_PATH` to the same SQLite database used by the
application. Production mode disables TypeORM schema synchronization by
default. `CAREER_AGENT_SCHEMA_SYNC=true` is intended only for disposable
development databases.

The migration chain contains a frozen legacy baseline followed by incremental
schema changes. It supports both a completely empty database and a recognized
legacy Career Agent database. It does not derive a production schema from the
current TypeORM entities.

If the database contains application tables but has no `users` table, the
baseline migration stops instead of guessing how to repair a partially
initialized database. Run migrations once before starting any application
instances.

Profile V2 is the only authoritative profile store. The authenticated
`GET /api/career-agent/profile/snapshot` response is generated directly from
`profile_states`, `user_profiles`, and active `profile_memory_items`; its
`profileVersion` is the Profile V2 aggregate version and its content hash is
calculated from a canonical projection. The legacy `career_profile_versions`
table is removed by the migration chain.

The old periodic `profileJson` migration is disabled by default because it can
overwrite newer Profile V2 edits. If an installation predates Profile V2 and
still needs the compatibility import, enable
`CAREER_AGENT_PROFILE_LEGACY_MIGRATION=true` for one controlled migration run,
verify the snapshot, and disable it again.

Praxis behavior facts are accepted into the idempotent
`praxis_behavior_events` Inbox. Receiving an event never mutates Profile V2
directly: the stored evidence disposition is only an audit decision or a
future Profile review signal. See
`docs/praxis-behavior-event-receiver.md` for the closed contract and evidence
policy.

Production startup also requires `CAREER_AGENT_JWT_SECRET` (or the legacy
`JWT_SECRET`) to contain at least 32 characters. Set
`CAREER_AGENT_FILE_DOWNLOAD_TOKEN_SECRET` separately when file download tokens
must use a different signing key.
