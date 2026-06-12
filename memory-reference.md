---
name: project-full-experience
description: 整个项目从头到尾的制作经验和踩坑记录
type: reference
originSessionId: 63fa935d-8456-4202-9b3a-ef3f1b9010e0
---
## 一、数据层

### 850 词数据来源
- 从参考站 ogden.munch.love 通过 Node.js 脚本抓取
- 每个词包含：w(单词), c(分类), zh(中文), en(英文释义), ex(例句), exz(例句中文), s(近义词数组)
- 分类：op(操作词), gt(通用词), pt(图示词), qg(性质词), qo(反义对)
- IPA 音标数据单独存储在 IPA_DATA 对象中，分 uk/us 两种
- 同义词详细对比在 SYNS_DETAIL 中（def/vs/use 三个字段）

### data.js 文件大小
- 约 310KB，包含所有数据
- 不要尝试用 Edit 工具编辑这个文件，太大容易出错

## 二、页面结构

### 字体方案
- Cormorant Garamond — 英文单词/标题（衬线）
- Inter — UI 元素/标签（无衬线）
- Noto Serif SC — 中文内容（宋体）

### 颜色体系
- 5 个分类各有独立颜色：op(琥珀), gt(绿), pt(黄), qg(蓝), qo(紫)
- 通过 CSS 变量 --op/--gt/--pt/--qg/--qo 和 --op-bg 等控制
- 深色模式仅用于 flash card overlay（#100f0d 背景）

### 卡片布局
- CSS Grid，auto-fill, minmax(280px, 1fr)
- 左侧 3px 色条标识分类
- 卡片包含：单词、IPA、标签、中文释义、英文释义、例句、近义词

## 三、交互功能

### 搜索
- / 快捷键聚焦搜索框
- 同时搜索单词、释义、例句内容
- 与分类 pills 组合过滤

### 发音系统
- **核心教训：必须用 speechSynthesis，不能依赖 Google TTS**
- 语音预加载：voiceschanged 事件 + 缓存
- 语音匹配策略：精确匹配 → 前缀匹配 → 默认语音 → 去掉约束重试
- Chrome bug：~15秒冻结，用 setInterval 每5秒 resume() 修复
- 事件委托：document 级 click 监听 .speak-text 和 .speak 类
- 点击 .speak 按钮如果已在播放则停止（toggle 行为）

### 卡片练习（Flash Cards）
- 三种模式：浏览(翻转卡片)、拼写(输入检查)、四选一
- 生词标记：localStorage 持久化 unknownWords Set
- 自动发音：翻页时自动朗读当前词
- 打乱顺序：Fisher-Yates 洗牌
- 键盘快捷键：←→ 翻页、空格/回车翻转、1认识/2不认识、Esc退出
- 练习完成后显示统计（正确率）

### 生词短文
- 本地模板生成，不依赖 API
- 按词性分类设计模板（op/gt/pt/qg/qo）
- 每个生词生成 2 句：1 句通用 + 1 句分类特定
- 过渡词连接（First, Then, Also, Finally）
- 每 5 个词一段，超出分多段
- 支持：重新生成、复制全文、导出 TXT
- 朗读本段：读整段长文本

### 同义词对比面板
- 点击近义词按钮展开
- 显示：发音按钮 + IPA、释义 Definition、区别 Difference、场景 Usage
- 数据来自 SYNS_DETAIL，没有数据时显示"详细对比补充中"

## 四、踩坑和教训

### Google TTS 被墙
- translate.googleapis.com 在中国 ERR_CONNECTION_CLOSED
- 不要尝试修复 Google TTS，直接移除依赖
- 之前多次"修复"导致原有发音也失效，用户明确说不要改原有逻辑

### speechSynthesis 静默失败
- 中文 Windows 无英语语音包 → getVoices() 只有中文语音
- 找不到 en-GB/en-US 就无声失败，不抛错
- 解决：安装英语语音包 或 用 Edge 浏览器

### speechSynthesis.cancel() 竞态
- cancel() 后立即 speak() 在移动端可能失败
- 需要确保 cancel 完成后再调 speak

### Edit 工具精确匹配
- old_string 必须与文件内容完全一致
- 包括缩进（tab vs spaces）、尾部空格、换行
- 修改前必须 Read 确认精确内容
- 有多个匹配时用 replace_all 或提供更多上下文

### 不要过度重构
- 用户说"不要改变原来页面的发音逻辑"时要严格执行
- 只修改不工作的部分，不要"顺便"重构其他代码
- 改坏已工作功能会严重损害信任

## 五、移动端适配

- 响应式断点：640px
- 搜索框全宽、pills 横向滚动
- 卡片单列
- 按钮最小高度 40px 方便点击
- 使用 100dvh（动态视口高度）处理移动端地址栏

## 六、localStorage 使用
- key: ogdenUnknownWords
- 存储格式：JSON 数组
- 用途：持久化生词标记状态
- try/catch 包裹防止隐私模式报错
