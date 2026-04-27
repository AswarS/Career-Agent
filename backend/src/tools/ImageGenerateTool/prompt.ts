export const IMAGE_GENERATE_TOOL_NAME = 'ImageGenerate'

export const DESCRIPTION = `Generate images from a text prompt using a configured image generation API.

The API endpoint and key are read from $CLAUDE_CONFIG_DIR/multimodal_config.json (harness config dir):
  "image_url": "https://openrouter.ai/api"   (or any OpenAI-compatible base URL)
  "image_key": "sk-or-v1-..."
  "image_default_model": "bytedance-seed/seedream-4.5"
  "image_models": ["bytedance-seed/seedream-4.5", ...]   (optional allowlist)

Supported API formats (tried in order):
  1. OpenRouter / chat-modality: POST /v1/chat/completions with modalities:['image']
  2. OpenAI images API:          POST /v1/images/generations

Generated images are saved to the image_generated/ directory in the current project.
Always specify a model when using OpenRouter.`
