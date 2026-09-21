# Web App Dev Result Contract v1.0

`app-coordinator` returns exactly one of these result variants through `ReturnSkillResult`.
Do not return the renderer's internal `web-app-renderer-result/1.0` schema from
the coordinator, even if it was the most recent intermediate result.

## Delivered

```json
{
  "schema": "web-app-dev-result/1.0",
  "status": "delivered",
  "output": {
    "kind": "app",
    "directory": "$OUTPUT_DIR",
    "entry_file": "$OUTPUT_DIR/index.html",
    "manifest_file": "$OUTPUT_DIR/output.json",
    "title": "App title"
  }
}
```

`$OUTPUT_DIR` is documentation notation only. Replace it with the exact
absolute `output_dir` supplied in `<skill-action-input>`; never send the literal
`$OUTPUT_DIR` token. Copy `output` produced under the loaded
`develop-web-game` instructions. The paths must remain exactly equal to the
Harness-bound output directory; do not invent, translate, shorten, or discover
them.

## No App

```json
{
  "schema": "web-app-dev-result/1.0",
  "status": "no_app",
  "reason": "Why interaction would not materially improve the outcome"
}
```

## Needs user input

```json
{
  "schema": "web-app-dev-result/1.0",
  "status": "needs_user_input",
  "request_id": "correlation-id",
  "missing_set_id": "sorted|missing|paths",
  "questions": ["One focused question"],
  "missing": [{"path": "goal.successCriteria", "reason": "Why it blocks"}]
}
```

Return at most three questions. The parent Agent owns asking them and may invoke `WebAppDev` again after the user answers.

## Error

```json
{
  "schema": "web-app-dev-result/1.0",
  "status": "error",
  "code": "stable_error_code",
  "message": "Concise technical failure"
}
```

Never include raw user memory, transcripts, credentials, or internal telemetry events in this envelope.
