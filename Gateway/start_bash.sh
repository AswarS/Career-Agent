set "TRAINING_ENV=C:\git\Career-Agent\Gateway\.env.training"
bun install --frozen-lockfile && bun --env-file="%TRAINING_ENV%" run network:migrate && bun --env-file="%TRAINING_ENV%" run network:start

# 新终端
node --env-file=Gateway\.env.training Gateway\src\server.ts

# 新终端
python C:\git\Career-Agent\Gateway\scripts\batch_test_cases.py