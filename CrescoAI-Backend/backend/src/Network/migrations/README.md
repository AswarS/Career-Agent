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

Production startup also requires `CAREER_AGENT_JWT_SECRET` (or the legacy
`JWT_SECRET`) to contain at least 32 characters. Set
`CAREER_AGENT_FILE_DOWNLOAD_TOKEN_SECRET` separately when file download tokens
must use a different signing key.
