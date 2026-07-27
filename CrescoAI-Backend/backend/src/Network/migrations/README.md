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

For a completely empty database, `network:migrate` first initializes the
complete current schema and then records/applies incremental migrations. This
is the only production path that performs baseline synchronization; normal
application startup still uses `synchronize: false`.

If the database contains application tables but has no `users` table, the
command stops instead of guessing how to repair a partially initialized
database. Run this command once before starting any application instances.
