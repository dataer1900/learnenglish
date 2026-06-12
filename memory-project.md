---
name: learn-english-project
description: Ogden Basic English 850词学习手册项目
type: project
originSessionId: 63fa935d-8456-4202-9b3a-ef3f1b9010e0
---
## 项目概述
基于 Ogden Basic English 的 850 词英语学习网页应用，参考 https://ogden.munch.love/ 的设计。

**文件结构：**
- `index.html` — 页面结构
- `style.css` — 样式（Cormorant Garamond + Inter + Noto Serif SC 字体）
- `script.js` — 交互逻辑
- `data.js` — 850 词数据 + IPA 音标 + 同义词详细对比

## 已实现功能
- 850 词分 5 类展示（op/gt/pt/qg/qo）
- 搜索（/快捷键）、分类筛选 pills
- IPA 音标显示（卡片 + 闪卡正面）
- 同义词对比面板（含发音按钮 + IPA + 详细释义区别场景）
- 卡片练习模式（浏览/拼写/四选一，翻转卡片，自动发音，打乱顺序，键盘导航）
- 生词标记系统（localStorage 持久化，统计进度条）
- 生词短文生成（本地模板，支持复制/导出 TXT/重新生成）
- 发音朗读（点击任意英文可发音）
- 所有术语中英双语对照

## TTS 发音方案（重要）
- **主引擎：浏览器 speechSynthesis API**（不依赖外部服务，国内可用）
- 语音预加载：监听 `voiceschanged` 事件，缓存语音列表
- 语音匹配：优先找 en-GB/en-US，找不到就用系统默认语音
- Chrome 冻结 bug：每 5 秒调 `resume()` 防止 ~15 秒卡死
- 多重重试：语音没加载完等 300ms 再试
- 兜底：speechSynthesis 失败时去掉语言约束再试一次
- ~~Google TTS~~ 已移除（translate.googleapis.com 在中国被墙）

## 关键注意事项
1. **发音依赖系统语音包**：中文 Windows 需手动安装英语语音包，或用 Edge 浏览器
2. **不要改变原有页面的发音逻辑**：用户明确要求只修改不工作的部分
3. **Edit 工具字符串匹配**：old_string 必须与文件内容完全一致（含缩进空格）
4. **CSS 变量**：--serif, --sans, --zh-serif 控制字体；op/gt/pt/qg/qo 控制分类颜色
5. **事件委托**：发音点击通过 document 级别 click 委托处理（.speak-text / .speak 类）
