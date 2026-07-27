# Career Agent database migrations

Run migrations once during deployment, before starting any Career Agent
application instances:

```sh
bun run network:migrate
```

Set `CAREER_AGENT_DATABASE_PATH` to the same SQLite database used by the
application. Production mode disables TypeORM schema synchronization by
default. `CAREER_AGENT_SCHEMA_SYNC=true` is intended only for disposable
development databases. A new production database must receive the existing
baseline schema before this incremental migration is run.
