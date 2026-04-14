# 2026-04-14 Multimodal Message Fixtures

## Scope

This iteration adds the first display-only multimodal path for conversation
messages.

## What Changed

- Added typed message media support for `image` and `video`
- Added upstream normalization for `media` / `attachments`
- Added two mock threads:
  - `thread-006`: image display
  - `thread-007`: local video playback
  - `thread-008`: second local video playback
- Moved local test assets into `public/mock-media/` so Vite can serve them as
  browser-accessible URLs
- Added conversation message rendering for image cards and video controls
- Documented the separation between media display and future upload support in
  `docs/zh/team-sync.md`

## Boundary

This is not file upload support.

The current contract assumes that the AI / backend has already produced a
browser-accessible media URL, and the frontend only renders it inside the
conversation.

## Upload Recommendation

Defer upload until the composer request lifecycle and backend file contract are
stable.

The upload contract should decide:

- storage or temporary file service
- size and mime-type limits
- binding to `thread_id` / `message_id`
- cancel / retry / failed-send behavior
- safety scanning, transcoding, thumbnailing, and cleanup policy

## Verified

Run:

- `npm run test`
- `npm run build`

Browser checks:

- `/threads/thread-006`: image loads from `/mock-media/test_image.png`
- `/threads/thread-007`: video loads from `/mock-media/test_video.mp4`
- `/threads/thread-008`: video loads from `/mock-media/test_video2.mp4`

## Artifact Note

Images and videos can appear inside artifacts when they are part of a result
page. In that case, keep using the existing artifact `html` / `url` host path
and reference media as page resources.

Do not add a separate artifact type just because a result page contains media.
Message-level media is for conversation attachments and context references.
