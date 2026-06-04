export const VIDEO_GENERATE_TOOL_NAME = 'VideoGenerate'

export const DESCRIPTION = `Generate videos from a text prompt using the configured video generation API.

The API credentials are configured per-user in the application settings (Settings → Multimodal API).
Just call this tool directly — no manual config file setup is needed.

Video generation is async (submit → poll → download). The tool handles all three steps automatically.
Note: generation typically takes 1–5 minutes. The tool will wait for completion before returning.

Supported options:
  - prompt:        Text description of the video (required)
  - model:         e.g. alibaba/wan-2.6, google/veo-3.1
  - resolution:    480p / 720p / 1080p / 1K / 2K / 4K
  - aspect_ratio:  16:9 / 9:16 / 1:1 etc.
  - duration:      length in seconds (alibaba/wan-2.6 supports 5 or 10 only)
  - generate_audio: whether to generate audio (default true)
  - frame_image:   URL or local path for first-frame image (image-to-video mode)

Generated videos are saved to the video_generated/ directory in the current project.`
