# 语音播放延迟问题排查与修复记录

## 问题总览

本次主要解决三类语音播放延迟问题：**英文释义**、**近义词**、**多词近义词**。

---

## 问题 1：英文释义播放慢

**现象**：点击 "move toward the speaker or a place" 等释义文本，要等几秒才有声音。

**原因**：
- 释义按钮缺少 `data-word` 和 `data-accent="en"` 属性
- 导致走了浏览器 `speechSynthesis` 兜底（本身有延迟）
- 后来加了 `data-word` 后，`getWordAudioUrl` 把整句释义文本当成文件名去匹配（如 `move-toward-the-speaker-or-a-place.mp3`），文件不存在，等 3 秒超时才降级

**修复**：
1. 给释义按钮添加 `data-word` 和 `data-accent="en"` 属性
2. 新增 `getEnAudioUrl(word)` 函数，读取 `audio/en/{uk|us}/{word}.mp3`
3. 当 `accent === 'en'` 时跳过 `wordUrl`，直接用 `enUrl`
4. 用 `edge-tts` 生成 850 个释义音频（`audio/en/uk/` + `audio/en/us/`，共 1700 个文件）

**涉及文件**：`script.js`（第 105-106 行按钮、第 235-238 行函数、第 351-354 行逻辑、第 438-443 行闪卡）

---

## 问题 2：近义词点击有延迟

**现象**：点击 "arrive"、"obtain" 等近义词按钮，要等几秒才发音。

**原因**：
- 近义词不在 850 词表中，没有对应的音频文件
- `getWordAudioUrl` 返回了 URL 但文件不存在，等超时后降级到 `speechSynthesis`

**修复**：
1. 用 `gen-syns.py` 生成 1793 个近义词音频，存入 `audio/words/uk/` 和 `audio/words/us/`
2. `playAudioFile` 改用 `oncanplay` 事件触发播放（而非立刻 `play()`），避免浏览器缓冲不足导致的延迟
3. 新增 `textToFilename(text)` 统一文件名转换逻辑（去撇号、空格转连字符）

---

## 问题 3：多词近义词无法读取音频

**现象**："a few"、"as soon as"、"12 months" 等含空格的近义词无法发音。

**原因**：
- `getWordAudioUrl` 的正则 `^[a-z][a-z-]*$` 不匹配含空格的文本
- 这些词直接返回空字符串，走 `speechSynthesis` 兜底

**修复**：
- `getWordAudioUrl` 增加多词处理分支：空格转连字符后匹配 `^[a-z0-9][a-z0-9-]*$`
- 例：`"a few"` → `"a-few"` → `./audio/words/us/a-few.mp3`

---

## 问题 4：`playAudioFile` 播放时序问题

**现象**：`new Audio(url)` 后立刻调用 `play()`，浏览器可能还没加载完音频数据。

**修复**：
- 改为 `oncanplay` 事件触发 `play()`（浏览器缓冲足够时才播放）
- `readyState >= 3`（已缓存）时立即播放
- 新增 3 秒超时兜底，超时未播放则降级 `speechSynthesis`
- `onplaying` 确认播放后清除超时，防止重复触发

---

## 附带优化

| 优化项 | 说明 |
|---|---|
| 服务器缓存头 | `serve.js` 给 MP3 文件加 `Cache-Control: public, max-age=86400` |
| 闪卡背面按钮 | `spk()` 函数支持可选 `word` 和 `accent` 参数 |
| 生成脚本 | 新增 `gen-en.py`（释义音频）、`gen-syns.py`（近义词音频） |

---

## 最终音频文件统计

| 目录 | 数量 | 内容 |
|---|---|---|
| `audio/words/uk/` | 2643 | 850 词 + 1793 近义词 |
| `audio/words/us/` | 2643 | 同上（美音） |
| `audio/sentences/uk/` | 850 | 例句 |
| `audio/sentences/us/` | 850 | 例句（美音） |
| `audio/en/uk/` | 850 | 英文释义 |
| `audio/en/us/` | 850 | 英文释义（美音） |
| **总计** | **8726** | |
