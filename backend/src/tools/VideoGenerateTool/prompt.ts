export const VIDEO_GENERATE_TOOL_NAME = 'VideoGenerate'

export const DESCRIPTION = `Generate videos from a text prompt using a configured video generation API (e.g. OpenRouter).

The API endpoint and key are read from $CLAUDE_CONFIG_DIR/multimodal_config.json (harness config dir):
  "video_url": "https://openrouter.ai/api"   (or any compatible base URL)
  "video_key": "sk-or-v1-..."
  "video_default_model": "alibaba/wan-2.6"
  "video_models": ["alibaba/wan-2.6", ...]   (optional allowlist)

Video generation is async (submit → poll → download). The tool handles all three steps automatically.

Supported options:
  - prompt:        Text description of the video (required)
  - model:         e.g. google/veo-3.1, alibaba/wan-2.7
  - resolution:    480p / 720p / 1080p / 1K / 2K / 4K
  - aspect_ratio:  16:9 / 9:16 / 1:1 etc.
  - duration:      length in seconds
  - generate_audio: whether to generate audio (default true)
  - frame_image:   URL or local path for first-frame image (image-to-video mode)

Generated videos are saved to the video_generated/ directory in the current project.`
