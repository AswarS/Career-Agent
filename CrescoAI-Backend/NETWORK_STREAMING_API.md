# Network Streaming Message API

## POST `/api/career-agent/threads/:id/messages/stream`

Streams an agent response with Server-Sent Events.

Request body is the same as:

`POST /api/career-agent/threads/:id/messages`

```json
{
  "kind": "markdown",
  "content": "Please analyze this file.",
  "attachment_asset_ids": ["asset-..."],
  "client_request_id": "request-..."
}
```

Response headers:

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

The server also writes an SSE comment heartbeat (`: keepalive`) every 15 seconds while a long-running skill is active. Clients should ignore comment frames.

Each SSE frame includes `event`, `id`, and JSON `data`.

## Event Types

```ts
type StreamEvent =
  | {
      type: 'message.created';
      conversationId: string;
      messageId: string;
      assistantMessageId: string;
      createdAt: string;
    }
  | {
      type: 'reasoning.delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'reply.delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'artifact.created';
      messageId: string;
      media: MessageMedia[];
      actions?: MessageAction[];
    }
  | {
      type: 'message.completed';
      accepted: boolean;
      status: string;
      conversationId: string;
      messageId: string;
      assistantMessageId: string;
      reply: string;
      reasoning?: string;
      media?: MessageMedia[];
      actions?: MessageAction[];
    }
  | {
      type: 'error';
      message: string;
      code?: string;
    };
```

## Rules

- `message.created` fixes the user message id and assistant message id for the entire stream.
- `reasoning.delta` contains thinking/ReAct reasoning text plus separated tool-call/tool-result process sections.
- `reply.delta` contains assistant-visible reply text.
- Tool calls are shown as `[工具调用]` with a generic "正在调用工具" message; tool names, command lines, arguments, and internal call ids are not included in client-visible payloads.
- Tool results are shown as `[工具返回]` with displayable result text. The backend silently processes common sensitive values before returning the text.
- `artifact.created` is emitted only after generated resources are persisted as artifacts/resources.
- Standalone image, audio, video, and HTML files written by an agent directly into its user workspace are staged into the corresponding controlled `*_generated` directory before `artifact.created` is emitted. This keeps generic file-tool output on the same artifact/media path as outputs produced by dedicated multimodal tools.
- Server filesystem paths are internal-only. Reply/reasoning text replaces them with a filename or generic resource label; media, upload, and artifact API payloads omit `storage_path` / `storagePath` and expose only public URLs.
- `message.completed` contains the final persisted message payload shape.
- Uploaded file resources are linked to the real user message id when `message.created` is emitted; `replaceMessageResourceMappings()` is not used for uploaded user attachments.

## Stored Message Phases

Assistant JSONL content is stored in explicit phases while keeping the frontend response shape unchanged:

- Process trajectory: `{ "type": "thinking", "phase": "process", "thinking": "<process trajectory text>" }`, returned to clients as `reasoning` / `think`.
- Final answer: `{ "type": "text", "phase": "final", "text": "<final answer text>" }`, returned to clients as `content` / `reply`.
- Legacy records without `phase` are still supported: `thinking` / `reasoning` blocks are treated as process trajectory, and `text` blocks are treated as final answers.

## Skill Streaming

The same endpoint also streams skill flows:

- `/create-skill ...` emits `message.created`, a `reasoning.delta` describing skill creation, `reply.delta` chunks for the final command result, then `message.completed`.
- `/skills` emits `message.created`, a `reasoning.delta` describing the listing step, `reply.delta` chunks for the skill list, then `message.completed`.
- Explicit `/skill-name ...` invocations emit `message.created` before skill execution and forward unified-agent reasoning/reply deltas while the skill is running. Generated output files are then persisted as artifacts/resources, followed by `artifact.created` and `message.completed`.
- Auto skill routing is evaluated once in the streaming path. If a skill is selected, the stream includes `reasoning.delta` with the selected skill and router reason.
- `/develop-web-game` streams its unified-agent output as process reasoning, requires a structured generated file before reporting success, and retries once when the first execution produces no usable artifact.
- LLM-backed built-in and custom skills share the same progress callback. Non-streaming external image/video APIs remain connected through SSE heartbeat and emit their final artifact when the provider call completes.
