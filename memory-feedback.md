---
name: tts-and-development-notes
description: TTS发音问题教训和开发注意点
type: feedback
originSessionId: 63fa935d-8456-4202-9b3a-ef3f1b9010e0
---
## TTS 发音踩坑记录

**问题：** 中文 Windows 上 speechSynthesis 没有英语语音，导致发音静默失败。
**根因：** speechSynthesis.getVoices() 在中文系统上可能只有中文语音（如 Microsoft Huihui），找不到 en-GB/en-US 语音就什么都不做。

**解决方案：**
1. 代码层面：多重重试 + 降级策略（找不到英语语音就用默认语音）
2. 用户层面：安装英语语音包，或使用 Edge 浏览器

**Why:** Google TTS（translate.googleapis.com）在中国被墙，无法作为备选。
**How to apply:** 以后涉及 TTS 的功能，始终以 speechSynthesis 为主引擎，不依赖外部 API。

## 开发注意点

1. **用户明确说"不要改变原来页面的发音逻辑"** — 修改发音相关代码时，只修有问题的部分，不要重构整个 speak() 函数的行为方式
2. **用户在中文环境** — 所有依赖 Google 服务的功能都可能不可用
3. **Edit 工具要求精确匹配** — 修改前先 Read 确认内容，缩进和空格必须完全一致
4. **用户偏好中文回复** — 技术解释用中文
