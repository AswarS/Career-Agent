# 多模态工具配置

ImageGenerate 和 VideoGenerate 两个工具从 harness 的配置目录读取 API 信息。

## 配置文件位置

```
$CLAUDE_CONFIG_DIR/multimodal_config.json
```
该文件不在 git 仓库内，需手动创建。参考模板：`/multimodal_config.example.json`。

## 字段说明

```jsonc
{
  // 图像生成
  "image_url": "https://openrouter.ai/api",   // API base URL（OpenAI 兼容）
  "image_key": "sk-or-v1-...",                // API Key
  "image_default_model": "bytedance-seed/seedream-4.5",  // 未指定 model 时的默认值
  "image_models": [                            // 可选：模型白名单，空数组表示不限制
    "bytedance-seed/seedream-4.5",
    "black-forest-labs/flux.2-klein-4b",
    "sourceful/riverflow-v2-fast"
  ],

  // 视频生成
  "video_url": "https://openrouter.ai/api",
  "video_key": "sk-or-v1-...",
  "video_default_model": "alibaba/wan-2.6",
  "video_models": [
    "alibaba/wan-2.6",
    "bytedance/seedance-2.0-fast",
    "alibaba/wan-2.7"
  ]
}
```

## 工具行为

### ImageGenerate

支持两种模式：
- **文生图**：只提供 `prompt`
- **图生图**：同时提供 `image_url`（公网 URL 或本地文件路径）

API 调用顺序：
1. 先尝试 OpenRouter chat-modality：`POST /v1/chat/completions`（`modalities: ['image']`）
2. 失败后回退到 OpenAI images API：`POST /v1/images/generations`

生成结果保存到当前项目的 `image_generated/` 目录。

### VideoGenerate

异步三步流程：提交任务 → 轮询状态（每 30s，最多 30 分钟）→ 下载视频。

支持参数：`resolution`（480p/720p/1080p）、`aspect_ratio`、`duration`、`generate_audio`、`frame_image`（图生视频）。

生成结果保存到当前项目的 `video_generated/` 目录。

### 模型模糊匹配

指定 `model` 时，按以下优先级在白名单中匹配：
1. 精确匹配
2. 后缀匹配（如 `seedream-4.5` 匹配 `bytedance-seed/seedream-4.5`）
3. 子串匹配

白名单为空时直接使用传入的 model 字符串。
