export const IMAGE_GENERATE_TOOL_NAME = 'ImageGenerate'

export const DESCRIPTION = `Generate images from a text prompt using the configured image generation API.

The API credentials are configured per-user in the application settings (Settings → Multimodal API).
Just call this tool directly — no manual config file setup is needed.

Supported API formats (tried in order):
  1. OpenRouter / chat-modality: POST /v1/chat/completions with modalities:['image']
  2. OpenAI images API:          POST /v1/images/generations

Generated images are saved to the image_generated/ directory in the current project.
Always specify a model when using OpenRouter (e.g. bytedance-seed/seedream-4.5).`
