const TAGS = { op: 'OP', gt: 'GT', pt: 'PT', qg: 'QG', qo: 'OPP' };
const CAT_FULL = { op: 'OP · 操作词', gt: 'GT · 通用词', pt: 'PT · 图示词', qg: 'QG · 性质词', qo: 'OPP · 反义对' };
const CAT_LABELS = {
  op: ['Operations', '操作词 · 动词、介词、代词、连词等'],
  gt: ['General Things', '通用词 · 抽象名词'],
  pt: ['Picturable Things', '可画名词 · 具体可视的事物'],
  qg: ['Qualities — General', '一般性质 · 形容词'],
  qo: ['Qualities — Opposites', '对立性质 · 反义形容词']
};

const SPEAKER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
const SPEAKER_SVG_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

// ====== UNKNOWN WORDS (localStorage) ======
let unknownWords = new Set();
const ARTICLE_ENGINE_VERSION = 2;
const ARTICLE_PACKAGE_KEY = 'ogdenArticlePackageV2';
const ARTICLE_STATS_KEY = 'ogdenArticleWordStatsV1';
const ARTICLE_SELECTED_WORDS_KEY = 'ogdenArticleSelectedWordsV1';
const FLASH_SESSION_KEY = 'ogdenFlashSessionV1';
const LEARNING_ACTIVITY_KEY = 'ogdenLearningActivityV1';
const FLASH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WORD_BY_KEY = new Map(WORDS.map(w => [w.w, w]));
let articleWordStats = {};
let learningActivity = {};
let articlePackageCache = null;
let selectedArticleWords = new Set();
let articleMode = 'auto';
const DAILY_FLASH_TARGET = 12;

function createDefaultWordStats() {
  return {
    seen: 0,
    quizCorrect: 0,
    quizWrong: 0,
    generatedAt: 0,
    lastReviewedAt: 0,
    flashCorrect: 0,
    flashWrong: 0,
    masteryScore: 0,
    status: 'new', // new | known | learning | familiar | mastered
    nextReviewAt: 0,
  };
}

function normalizeWordStatsShape(stats) {
  return { ...createDefaultWordStats(), ...(stats || {}) };
}

function createDefaultLearningActivity() {
  return {
    currentStreak: 0,
    bestStreak: 0,
    lastStudyDate: '',
    totalStudyEvents: 0,
    dates: {},
  };
}

function normalizeLearningActivityShape(activity) {
  const base = createDefaultLearningActivity();
  const merged = { ...base, ...(activity || {}) };
  merged.dates = merged.dates && typeof merged.dates === 'object' ? merged.dates : {};
  merged.currentStreak = Number(merged.currentStreak) || 0;
  merged.bestStreak = Number(merged.bestStreak) || 0;
  merged.totalStudyEvents = Number(merged.totalStudyEvents) || 0;
  return merged;
}

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateKeyToTime(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}

function getDateKeyDiff(fromKey, toKey) {
  const from = dateKeyToTime(fromKey);
  const to = dateKeyToTime(toKey);
  if (!from || !to) return 0;
  return Math.round((to - from) / DAY_MS);
}

function loadLearningActivity() {
  try {
    const stored = localStorage.getItem(LEARNING_ACTIVITY_KEY);
    learningActivity = stored ? normalizeLearningActivityShape(JSON.parse(stored)) : createDefaultLearningActivity();
  } catch {
    learningActivity = createDefaultLearningActivity();
  }
}

function saveLearningActivity() {
  try {
    localStorage.setItem(LEARNING_ACTIVITY_KEY, JSON.stringify(learningActivity));
  } catch {}
}

function recordStudyActivity(count = 1) {
  const today = getLocalDateKey();
  learningActivity = normalizeLearningActivityShape(learningActivity);

  if (learningActivity.lastStudyDate !== today) {
    const dayDiff = getDateKeyDiff(learningActivity.lastStudyDate, today);
    learningActivity.currentStreak = dayDiff === 1 ? learningActivity.currentStreak + 1 : 1;
    learningActivity.lastStudyDate = today;
  } else if (learningActivity.currentStreak < 1) {
    learningActivity.currentStreak = 1;
  }

  learningActivity.dates[today] = (Number(learningActivity.dates[today]) || 0) + count;
  learningActivity.totalStudyEvents += count;
  learningActivity.bestStreak = Math.max(learningActivity.bestStreak, learningActivity.currentStreak);
  saveLearningActivity();
}

function getLearningActivityMetrics() {
  learningActivity = normalizeLearningActivityShape(learningActivity);
  const today = getLocalDateKey();
  const dayDiff = getDateKeyDiff(learningActivity.lastStudyDate, today);
  const currentStreak = !learningActivity.lastStudyDate
    ? 0
    : dayDiff <= 1
      ? learningActivity.currentStreak
      : 0;
  const recentDates = Object.entries(learningActivity.dates)
    .sort(([a], [b]) => b.localeCompare(a));

  return {
    todayCount: Number(learningActivity.dates[today]) || 0,
    currentStreak,
    bestStreak: learningActivity.bestStreak,
    totalStudyEvents: learningActivity.totalStudyEvents,
    activeDays: recentDates.length,
    lastStudyDate: learningActivity.lastStudyDate,
    recentDates,
  };
}

function loadUnknownWords() {
  try {
    const stored = localStorage.getItem('ogdenUnknownWords');
    if (stored) unknownWords = new Set(JSON.parse(stored));
  } catch {}
}

function saveUnknownWords() {
  try { localStorage.setItem('ogdenUnknownWords', JSON.stringify([...unknownWords])); } catch {}
  articlePackageCache = null;
}

function loadSelectedArticleWords() {
  try {
    const stored = localStorage.getItem(ARTICLE_SELECTED_WORDS_KEY);
    if (stored) selectedArticleWords = new Set(JSON.parse(stored));
  } catch {
    selectedArticleWords = new Set();
  }
}

function saveSelectedArticleWords() {
  try {
    localStorage.setItem(ARTICLE_SELECTED_WORDS_KEY, JSON.stringify([...selectedArticleWords]));
  } catch {}
  articlePackageCache = null;
}

function toggleSelectedArticleWord(word) {
  if (selectedArticleWords.has(word)) selectedArticleWords.delete(word);
  else selectedArticleWords.add(word);
  saveSelectedArticleWords();
}

function loadArticleWordStats() {
  try {
    const stored = localStorage.getItem(ARTICLE_STATS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) || {};
      articleWordStats = Object.fromEntries(
        Object.entries(parsed).map(([word, stats]) => [word, normalizeWordStatsShape(stats)])
      );
    }
  } catch {
    articleWordStats = {};
  }
}

function saveArticleWordStats() {
  try {
    localStorage.setItem(ARTICLE_STATS_KEY, JSON.stringify(articleWordStats));
  } catch {}
}

function getWordStats(word) {
  if (!articleWordStats[word]) {
    articleWordStats[word] = createDefaultWordStats();
  } else {
    articleWordStats[word] = normalizeWordStatsShape(articleWordStats[word]);
  }
  return articleWordStats[word];
}

function getWordStatusLabel(word) {
  const stats = getWordStats(word);
  return stats.status || 'new';
}

function getReviewDelayMs(stats) {
  if (stats.masteryScore >= 4) return 7 * 24 * 60 * 60 * 1000;
  if (stats.masteryScore >= 3) return 3 * 24 * 60 * 60 * 1000;
  if (stats.masteryScore >= 2) return 24 * 60 * 60 * 1000;
  if (stats.masteryScore >= 1) return 12 * 60 * 60 * 1000;
  return 0;
}

function syncWordStatus(stats, isUnknown) {
  if (isUnknown) {
    if (stats.masteryScore >= 4) stats.status = 'mastered';
    else if (stats.masteryScore >= 2) stats.status = 'familiar';
    else stats.status = 'learning';
  } else {
    stats.status = stats.masteryScore >= 4 ? 'mastered' : 'known';
  }
}

function recordFlashOutcome(word, outcome) {
  const stats = getWordStats(word);
  const now = Date.now();
  stats.seen += 1;
  stats.lastReviewedAt = now;

  if (outcome === 'correct') {
    stats.flashCorrect += 1;
    stats.masteryScore = Math.min(6, stats.masteryScore + 1);
  } else if (outcome === 'wrong') {
    stats.flashWrong += 1;
    stats.masteryScore = Math.max(0, stats.masteryScore - 2);
  } else if (outcome === 'known') {
    stats.masteryScore = Math.min(6, stats.masteryScore + 2);
  } else if (outcome === 'unknown') {
    stats.masteryScore = Math.max(0, stats.masteryScore - 2);
  }

  syncWordStatus(stats, unknownWords.has(word));
  stats.nextReviewAt = now + getReviewDelayMs(stats);
  recordStudyActivity();
  saveArticleWordStats();
}

function isWordDue(word, now = Date.now()) {
  const stats = getWordStats(word);
  if (!stats.nextReviewAt) return true;
  return stats.nextReviewAt <= now;
}

function rankWordsForFlash(words) {
  const now = Date.now();
  return [...words].sort((a, b) => {
    const sa = getWordStats(a.w);
    const sb = getWordStats(b.w);
    const dueA = isWordDue(a.w, now) ? 0 : 1;
    const dueB = isWordDue(b.w, now) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    if (sa.masteryScore !== sb.masteryScore) return sa.masteryScore - sb.masteryScore;
    if (sa.lastReviewedAt !== sb.lastReviewedAt) return sa.lastReviewedAt - sb.lastReviewedAt;
    return a.w.localeCompare(b.w);
  });
}

function markWordsGenerated(words) {
  const now = Date.now();
  words.forEach(word => {
    const stats = getWordStats(word.w);
    stats.seen += 1;
    stats.generatedAt = now;
  });
  saveArticleWordStats();
}

function recordWordQuizResult(word, isCorrect) {
  if (!word) return;
  const stats = getWordStats(word);
  const now = Date.now();
  stats.seen += 1;
  stats.lastReviewedAt = now;
  if (isCorrect) {
    stats.quizCorrect += 1;
    stats.masteryScore = Math.min(6, stats.masteryScore + 1);
  } else {
    stats.quizWrong += 1;
    stats.masteryScore = Math.max(0, stats.masteryScore - 2);
  }
  syncWordStatus(stats, unknownWords.has(word));
  stats.nextReviewAt = now + getReviewDelayMs(stats);
  recordStudyActivity();
  saveArticleWordStats();
}

function getUnknownWordsSignature() {
  return [...unknownWords].sort().join('|');
}

function getSelectedArticleWordsSignature() {
  return [...selectedArticleWords].sort().join('|');
}

function getSelectedArticleWordObjects() {
  if (selectedArticleWords.size === 0) return [];
  return WORDS.filter(w => selectedArticleWords.has(w.w));
}

function isWordWeakForArticles(word) {
  const stats = getWordStats(word);
  const wrongCount = stats.flashWrong + stats.quizWrong;
  const correctCount = stats.flashCorrect + stats.quizCorrect;
  if (unknownWords.has(word)) return true;
  if ((stats.status === 'learning' || stats.status === 'familiar') && isWordDue(word)) return true;
  if (wrongCount > correctCount && isWordDue(word)) return true;
  return stats.masteryScore <= 1 && stats.lastReviewedAt > 0 && isWordDue(word);
}

function getAutoArticleWordObjects() {
  return WORDS.filter(w => isWordWeakForArticles(w.w));
}

function updateArticleModeState() {
  const autoBtn = document.getElementById('article-auto-btn');
  const selectedBtn = document.getElementById('article-use-selected-btn');
  const hasSelectedWords = selectedArticleWords.size > 0;

  if (autoBtn) autoBtn.classList.toggle('active', articleMode === 'auto');
  if (selectedBtn) {
    selectedBtn.classList.toggle('active', articleMode === 'selected');
    selectedBtn.disabled = !hasSelectedWords;
    selectedBtn.title = hasSelectedWords
      ? `Use ${selectedArticleWords.size} selected words`
      : 'Pick words on cards first';
  }
}

function getFlashTaskSummary(words) {
  let newCount = 0;
  let reviewCount = 0;
  words.forEach(w => {
    const stats = getWordStats(w.w);
    if (stats.status === 'new' || stats.seen === 0) newCount++;
    else reviewCount++;
  });
  return { newCount, reviewCount };
}

function hasReviewMemory(word, stats) {
  return unknownWords.has(word) ||
    stats.seen > 0 ||
    stats.lastReviewedAt > 0 ||
    stats.flashCorrect > 0 ||
    stats.flashWrong > 0 ||
    stats.quizCorrect > 0 ||
    stats.quizWrong > 0;
}

function getReviewMetrics() {
  const now = Date.now();
  const buckets = [
    { key: 'now', label: '现在', count: 0 },
    { key: 'day1', label: '1天', count: 0 },
    { key: 'day3', label: '3天', count: 0 },
    { key: 'day7', label: '7天', count: 0 },
    { key: 'later', label: '更久', count: 0 },
  ];
  let learningCount = 0;
  let masteredCount = 0;
  let nextReviewAt = 0;

  WORDS.forEach(w => {
    const stats = getWordStats(w.w);
    if (stats.status === 'learning' || stats.status === 'familiar') learningCount++;
    if (stats.status === 'mastered' || stats.masteryScore >= 4) masteredCount++;
    if (!hasReviewMemory(w.w, stats)) return;

    const reviewAt = stats.nextReviewAt || (unknownWords.has(w.w) ? now : 0);
    if (!reviewAt) return;

    if (reviewAt <= now) buckets[0].count++;
    else if (reviewAt <= now + DAY_MS) buckets[1].count++;
    else if (reviewAt <= now + 3 * DAY_MS) buckets[2].count++;
    else if (reviewAt <= now + 7 * DAY_MS) buckets[3].count++;
    else buckets[4].count++;

    if (reviewAt > now && (!nextReviewAt || reviewAt < nextReviewAt)) {
      nextReviewAt = reviewAt;
    }
  });

  return {
    dueNow: buckets[0].count,
    learningCount,
    masteredCount,
    nextReviewAt,
    buckets,
  };
}

function formatReviewTime(ts) {
  if (!ts) return '暂无';
  const now = Date.now();
  if (ts <= now) return '现在';
  const diff = ts - now;
  const date = new Date(ts);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (diff < DAY_MS) return `今天 ${time}`;
  if (diff < 2 * DAY_MS) return `明天 ${time}`;
  return `${Math.ceil(diff / DAY_MS)}天后`;
}

function renderReviewCurve(metrics = getReviewMetrics()) {
  const summaryEl = document.getElementById('review-summary');
  const barsEl = document.getElementById('review-bars');
  if (!summaryEl || !barsEl) return;

  const activity = getLearningActivityMetrics();
  summaryEl.textContent = `今日复习 ${metrics.dueNow} · 今日已学 ${activity.todayCount} · 连续 ${activity.currentStreak} 天 · 下次 ${formatReviewTime(metrics.nextReviewAt)}`;
  const maxCount = Math.max(1, ...metrics.buckets.map(b => b.count));
  barsEl.innerHTML = metrics.buckets.map(bucket => {
    const height = bucket.count === 0 ? 6 : 10 + Math.round((bucket.count / maxCount) * 42);
    return `<div class="review-bar" data-bucket="${bucket.key}">
      <span class="review-bar-count">${bucket.count}</span>
      <span class="review-bar-track"><span style="height:${height}px"></span></span>
      <span class="review-bar-label">${bucket.label}</span>
    </div>`;
  }).join('');
}

function escapeMarkdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function formatExportDateTime(ts = Date.now()) {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

function formatExportReviewTime(ts) {
  if (!ts) return '';
  return ts <= Date.now() ? '现在' : formatExportDateTime(ts);
}

function getLearningRecordRows() {
  return WORDS.map(w => {
    const stats = getWordStats(w.w);
    const correct = stats.flashCorrect + stats.quizCorrect;
    const wrong = stats.flashWrong + stats.quizWrong;
    return {
      word: w.w,
      zh: w.zh,
      en: w.en,
      category: TAGS[w.c] || w.c,
      status: unknownWords.has(w.w) ? 'unknown' : (stats.status || 'new'),
      masteryScore: stats.masteryScore,
      seen: stats.seen,
      correct,
      wrong,
      isUnknown: unknownWords.has(w.w),
      nextReviewAt: stats.nextReviewAt || 0,
      lastReviewedAt: stats.lastReviewedAt || 0,
    };
  });
}

function buildWordTable(rows, emptyText = '暂无') {
  if (!rows.length) return `${emptyText}\n`;
  const header = '| 单词 | 释义 | 状态 | 掌握度 | 学习次数 | 正确/错误 | 下次复习 |\n|---|---|---|---:|---:|---:|---|\n';
  const body = rows.map(row =>
    `| ${escapeMarkdownCell(row.word)} | ${escapeMarkdownCell(row.zh)} | ${escapeMarkdownCell(getWordbookStatusText(row))} | ${row.masteryScore} | ${row.seen} | ${row.correct}/${row.wrong} | ${escapeMarkdownCell(formatExportReviewTime(row.nextReviewAt))} |`
  ).join('\n');
  return `${header}${body}\n`;
}

function getLearningRecordData() {
  const rows = getLearningRecordRows();
  const activity = getLearningActivityMetrics();
  const review = getReviewMetrics();
  const total = WORDS.length;
  const unknownCount = unknownWords.size;
  const masteredRows = rows.filter(row => row.status === 'mastered' || row.masteryScore >= 4);
  const unknownRows = rows.filter(row => row.isUnknown);
  const weakRows = rows.filter(row =>
    row.isUnknown ||
    row.wrong > row.correct ||
    ((row.status === 'learning' || row.status === 'familiar') && row.masteryScore < 3)
  ).sort((a, b) => {
    if (b.wrong !== a.wrong) return b.wrong - a.wrong;
    if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
    return a.word.localeCompare(b.word);
  });
  const upcomingRows = rows
    .filter(row => row.nextReviewAt > Date.now())
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  const recentActivity = activity.recentDates.slice(0, 30);

  return {
    rows,
    activity,
    review,
    total,
    unknownCount,
    masteredRows,
    unknownRows,
    weakRows,
    upcomingRows,
    recentActivity,
  };
}

function buildOverviewMarkdown(data) {
  const { activity, review, total, unknownCount, masteredRows } = data;
  let md = `# Ogden Basic English 学习记录\n\n`;
  md += `导出时间：${formatExportDateTime()}\n\n`;
  md += `| 指标 | 数值 |\n|---|---:|\n`;
  md += `| 总词数 | ${total} |\n`;
  md += `| 已认识 | ${total - unknownCount} |\n`;
  md += `| 待练习 | ${unknownCount} |\n`;
  md += `| 已掌握 | ${masteredRows.length} |\n`;
  md += `| 今日复习 | ${review.dueNow} |\n`;
  md += `| 今日已学 | ${activity.todayCount} |\n`;
  md += `| 连续学习天数 | ${activity.currentStreak} |\n`;
  md += `| 最佳连续天数 | ${activity.bestStreak} |\n`;
  md += `| 累计学习动作 | ${activity.totalStudyEvents} |\n`;
  md += `| 有学习记录的日期 | ${activity.activeDays} |\n\n`;
  return md;
}

function buildRecentActivityMarkdown(recentActivity) {
  let md = `# 最近学习日期\n\n`;
  if (recentActivity.length === 0) return `${md}暂无\n`;
  md += `| 日期 | 学习次数 |\n|---|---:|\n`;
  md += recentActivity.map(([date, count]) => `| ${date} | ${count} |`).join('\n') + '\n';
  return md;
}

function buildWordListMarkdown(title, rows, emptyText) {
  return `# ${title}\n\n${buildWordTable(rows, emptyText)}`;
}

function buildLearningRecordFiles() {
  const data = getLearningRecordData();
  const index = `# Ogden Basic English 学习记录\n\n` +
    `导出时间：${formatExportDateTime()}\n\n` +
    `## 文件\n\n` +
    `- [概览](01-overview.md)\n` +
    `- [最近学习日期](02-recent-activity.md)\n` +
    `- [生词](words/unknown.md)\n` +
    `- [薄弱词](words/weak.md)\n` +
    `- [已掌握](words/mastered.md)\n` +
    `- [未来复习安排](review/upcoming.md)\n`;

  return [
    { path: '00-index.md', content: index },
    { path: '01-overview.md', content: buildOverviewMarkdown(data) },
    { path: '02-recent-activity.md', content: buildRecentActivityMarkdown(data.recentActivity) },
    { path: 'words/unknown.md', content: buildWordListMarkdown('待练习 / 生词', data.unknownRows, '暂无生词') },
    { path: 'words/weak.md', content: buildWordListMarkdown('薄弱词', data.weakRows, '暂无薄弱词') },
    { path: 'words/mastered.md', content: buildWordListMarkdown('已掌握', data.masteredRows, '暂无已掌握词') },
    { path: 'review/upcoming.md', content: buildWordListMarkdown('未来复习安排', data.upcomingRows, '暂无未来复习安排') },
  ];
}

function downloadTextFile(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  downloadBlobFile(filename, blob);
}

function downloadBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showAppToast(message, timeout = 3200) {
  const toast = document.createElement('div');
  toast.className = 'tts-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, timeout);
}

async function writeMarkdownFile(dirHandle, pathParts, content) {
  const [first, ...rest] = pathParts;
  if (rest.length === 0) {
    const fileHandle = await dirHandle.getFileHandle(first, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return;
  }

  const nextDir = await dirHandle.getDirectoryHandle(first, { create: true });
  await writeMarkdownFile(nextDir, rest, content);
}

async function exportLearningRecordToFolder(files, folderName) {
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  const exportDir = await root.getDirectoryHandle(folderName, { create: true });
  for (const file of files) {
    await writeMarkdownFile(exportDir, file.path.split('/'), file.content);
  }
}

function buildCombinedLearningRecordMarkdown(files) {
  return files.map(file => `<!-- ${file.path} -->\n\n${file.content.trim()}\n`).join('\n---\n\n');
}

async function exportLearningRecord() {
  const files = buildLearningRecordFiles();
  const folderName = `ogden-learning-record-${getLocalDateKey()}`;

  if ('showDirectoryPicker' in window) {
    try {
      await exportLearningRecordToFolder(files, folderName);
      showAppToast(`已导出到文件夹：${folderName}`);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('Folder export failed, falling back to markdown download.', err);
    }
  }

  downloadTextFile(
    `${folderName}.md`,
    buildCombinedLearningRecordMarkdown(files),
    'text/markdown;charset=utf-8'
  );
  showAppToast('浏览器不支持文件夹导出，已改为单个 Markdown 下载。');
}

let wordbookFilter = 'due';
let wordbookQuery = '';

function getWordbookStatusText(row) {
  if (row.isUnknown) return '生词';
  const labels = {
    new: '新词',
    known: '认识',
    learning: '学习中',
    familiar: '熟悉',
    mastered: '已掌握',
  };
  return labels[row.status] || row.status || '新词';
}

function isWordbookDue(row) {
  const now = Date.now();
  if (row.nextReviewAt) return row.nextReviewAt <= now;
  return row.isUnknown || row.status === 'learning' || row.status === 'familiar';
}

function isWordbookWeak(row) {
  return row.isUnknown ||
    row.wrong > row.correct ||
    ((row.status === 'learning' || row.status === 'familiar') && row.masteryScore < 3);
}

function getWordbookCounts(rows = getLearningRecordRows()) {
  return {
    all: rows.length,
    due: rows.filter(isWordbookDue).length,
    unknown: rows.filter(row => row.isUnknown).length,
    weak: rows.filter(isWordbookWeak).length,
    mastered: rows.filter(row => row.status === 'mastered' || row.masteryScore >= 4).length,
  };
}

function sortWordbookRows(rows, filterName) {
  const list = [...rows];
  if (filterName === 'due') {
    return list.sort((a, b) => {
      const ar = a.nextReviewAt || 0;
      const br = b.nextReviewAt || 0;
      if (ar !== br) return ar - br;
      if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
      return a.word.localeCompare(b.word);
    });
  }
  if (filterName === 'weak') {
    return list.sort((a, b) => {
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      if (a.masteryScore !== b.masteryScore) return a.masteryScore - b.masteryScore;
      return a.word.localeCompare(b.word);
    });
  }
  if (filterName === 'mastered') {
    return list.sort((a, b) => b.masteryScore - a.masteryScore || a.word.localeCompare(b.word));
  }
  return list.sort((a, b) => a.word.localeCompare(b.word));
}

function getFilteredWordbookRows() {
  let rows = getLearningRecordRows();
  if (wordbookFilter === 'due') rows = rows.filter(isWordbookDue);
  else if (wordbookFilter === 'unknown') rows = rows.filter(row => row.isUnknown);
  else if (wordbookFilter === 'weak') rows = rows.filter(isWordbookWeak);
  else if (wordbookFilter === 'mastered') rows = rows.filter(row => row.status === 'mastered' || row.masteryScore >= 4);

  const q = wordbookQuery.trim().toLowerCase();
  if (q) {
    rows = rows.filter(row =>
      row.word.toLowerCase().includes(q) ||
      row.zh.toLowerCase().includes(q) ||
      row.en.toLowerCase().includes(q) ||
      getWordbookStatusText(row).toLowerCase().includes(q)
    );
  }

  return sortWordbookRows(rows, wordbookFilter);
}

function updateWordbookCounts() {
  const counts = getWordbookCounts();
  Object.entries(counts).forEach(([key, count]) => {
    const el = document.getElementById(`wordbook-count-${key}`);
    if (el) el.textContent = count;
  });
}

function renderWordbook() {
  updateWordbookCounts();
  document.querySelectorAll('.wordbook-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === wordbookFilter);
  });

  const listEl = document.getElementById('wordbook-list');
  const emptyEl = document.getElementById('wordbook-empty');
  const metaEl = document.getElementById('wordbook-meta');
  if (!listEl || !emptyEl || !metaEl) return;

  const rows = getFilteredWordbookRows();
  metaEl.textContent = `${rows.length} words`;
  emptyEl.hidden = rows.length > 0;
  listEl.innerHTML = rows.map(row => `
    <article class="wordbook-row">
      <div class="wordbook-row-main">
        <button class="wordbook-word speak-text" data-text="${escapeAttr(row.word)}" data-rate="0.85" type="button">${escapeHtml(row.word)}</button>
        <span class="wordbook-status">${escapeHtml(getWordbookStatusText(row))}</span>
      </div>
      <div class="wordbook-zh">${escapeHtml(row.zh)}</div>
      <div class="wordbook-en">${escapeHtml(row.en)}</div>
      <div class="wordbook-row-meta">
        <span>${escapeHtml(row.category)}</span>
        <span>掌握度 ${row.masteryScore}</span>
        <span>学习 ${row.seen}</span>
        <span>错 ${row.wrong}</span>
        <span>${row.nextReviewAt ? `复习 ${escapeHtml(formatReviewTime(row.nextReviewAt))}` : '未安排'}</span>
      </div>
    </article>
  `).join('');
}

function openWordbook(filterName = wordbookFilter) {
  wordbookFilter = filterName;
  const overlay = document.getElementById('wordbook-overlay');
  const search = document.getElementById('wordbook-search');
  if (!overlay) return;
  renderWordbook();
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  if (search) setTimeout(() => search.focus(), 0);
}

function closeWordbook() {
  const overlay = document.getElementById('wordbook-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  document.body.style.overflow = '';
}

function loadArticlePackageFromStorage() {
  try {
    const stored = localStorage.getItem(ARTICLE_PACKAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || parsed.version !== ARTICLE_ENGINE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveArticlePackageToStorage(pkg) {
  articlePackageCache = pkg;
  try {
    localStorage.setItem(ARTICLE_PACKAGE_KEY, JSON.stringify(pkg));
  } catch {}
}

function renderStats() {
  const total = WORDS.length;
  const unknown = unknownWords.size;
  const known = total - unknown;
  const pct = Math.round((known / total) * 100);
  const reviewMetrics = getReviewMetrics();
  const activityMetrics = getLearningActivityMetrics();
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-known').textContent = known;
  document.getElementById('stat-unknown').textContent = unknown;
  document.getElementById('stat-pct').textContent = pct + '%';
  document.getElementById('stat-progress-bar').style.width = pct + '%';
  const dueEl = document.getElementById('stat-due');
  const masteredEl = document.getElementById('stat-mastered');
  const streakEl = document.getElementById('stat-streak');
  const todayEl = document.getElementById('stat-today');
  if (dueEl) dueEl.textContent = reviewMetrics.dueNow;
  if (masteredEl) masteredEl.textContent = reviewMetrics.masteredCount;
  if (streakEl) streakEl.textContent = activityMetrics.currentStreak;
  if (todayEl) todayEl.textContent = activityMetrics.todayCount;
  renderReviewCurve(reviewMetrics);
  updateWordbookCounts();
  const wordbookOverlay = document.getElementById('wordbook-overlay');
  if (wordbookOverlay && !wordbookOverlay.hidden) renderWordbook();
  updateVocabBadge();
}

// ====== RENDER PILLS ======
function renderPills() {
  const pillsEl = document.getElementById('pills');
  const cats = [
    ['all', '全部 All', WORDS.length],
    ['op', '操作词 Operations', WORDS.filter(w => w.c === 'op').length],
    ['gt', '通用词 General', WORDS.filter(w => w.c === 'gt').length],
    ['pt', '图示词 Picturable', WORDS.filter(w => w.c === 'pt').length],
    ['qg', '性质词 Qualities', WORDS.filter(w => w.c === 'qg').length],
    ['qo', '反义对 Opposites', WORDS.filter(w => w.c === 'qo').length],
  ];
  pillsEl.innerHTML = cats.map(([cat, label, count], i) =>
    `<span class="pill${i === 0 ? ' active' : ''}" data-cat="${cat}">${label}<span class="count">${count}</span></span>`
  ).join('');
}

// ====== RENDER SECTIONS ======
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSections() {
  const sectionsEl = document.getElementById('sections');
  const order = ['op', 'gt', 'pt', 'qg', 'qo'];
  sectionsEl.innerHTML = order.map(cat => {
    const [en, zh] = CAT_LABELS[cat];
    const count = WORDS.filter(w => w.c === cat).length;
    return `
      <section class="section" id="sec-${cat}" data-cat="${cat}">
        <div class="section-header">
          <h2>${en}</h2>
          <span class="zh">${zh}</span>
          <span class="count">${count} 词 WORDS</span>
        </div>
        <div class="grid" id="grid-${cat}"></div>
      </section>`;
  }).join('');
}

function renderCards(wordsList) {
  const grids = { op: [], gt: [], pt: [], qg: [], qo: [] };
  for (const w of wordsList) {
    const synsHtml = (w.s || []).map(s =>
      `<button class="syn" data-syn="${escapeAttr(s)}" data-main="${escapeAttr(w.w)}">${s}</button>`
    ).join('');

    const ipa = getIpa(w.w);
    const ipaHtml = ipa ? `<div class="ipa" data-word="${escapeAttr(w.w)}">${ipa}</div>` : `<div class="ipa" data-word="${escapeAttr(w.w)}"></div>`;
    const isUnknown = unknownWords.has(w.w);
    const isSelectedForArticle = selectedArticleWords.has(w.w);
    const unknownBadge = isUnknown ? '<span class="card-unknown-badge">待练习</span>' : '';
    const articlePickBtn = `<button class="article-pick-btn${isSelectedForArticle ? ' active' : ''}" data-word="${escapeAttr(w.w)}" type="button">${isSelectedForArticle ? '已选短文' : '加入短文'}</button>`;

    const card = `
      <article class="card${isUnknown ? ' card-is-unknown' : ''}" data-cat="${w.c}" data-w="${w.w}">
        <div class="card-head">
          <div class="word-row">
            <button class="word speak-text" data-text="${escapeAttr(w.w)}" data-rate="0.85" aria-label="读单词">${w.w}</button>
            <button class="speak" data-text="${escapeAttr(w.w)}" data-rate="0.85" aria-label="读单词">${SPEAKER_SVG}</button>
          </div>
          ${ipaHtml}
          <span class="tag">${TAGS[w.c]}</span>
          ${unknownBadge}
          ${articlePickBtn}
        </div>
        <div class="def-zh" data-zh="${escapeAttr(w.zh)}">${w.zh}</div>
        <div class="def-en">
          <button class="speak speak-inline" data-text="${escapeAttr(w.en)}" data-rate="0.9" data-word="${escapeAttr(w.w)}" data-accent="en" aria-label="读释义">${SPEAKER_SVG}</button>
          <span class="speak-text" data-text="${escapeAttr(w.en)}" data-rate="0.9" data-word="${escapeAttr(w.w)}" data-accent="en">${w.en}</span>
        </div>
        <div class="example">
          <button class="speak" data-text="${escapeAttr(w.ex)}" data-rate="1.0" data-word="${escapeAttr(w.w)}" aria-label="读例句">${SPEAKER_SVG}</button>
          <div class="en speak-text" data-text="${escapeAttr(w.ex)}" data-rate="1.0" data-word="${escapeAttr(w.w)}">${w.ex}</div>
          <div class="zh" data-zh="${escapeAttr(w.exz)}">${w.exz}</div>
        </div>
        <div class="syns-header">近义词 <em>Synonyms</em> · 点击对比</div>
        <div class="syns">${synsHtml}</div>
        <div class="syn-panel" hidden></div>
      </article>`;
    if (grids[w.c]) grids[w.c].push(card);
  }
  for (const k of Object.keys(grids)) {
    const el = document.getElementById('grid-' + k);
    if (el) el.innerHTML = grids[k].join('');
  }
}

// ====== IPA ======
function getIpa(word) {
  const item = IPA_DATA[word] || IPA_DATA[String(word).toLowerCase()];
  if (!item) return '';
  return item[audioSource === 'us' ? 'us' : 'uk'] || item.uk || item.us || '';
}

// ====== FILTER ======
function filter() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const activeCat = document.querySelector('.pill.active')?.dataset.cat || 'all';
  let visible = 0;
  document.querySelectorAll('.card').forEach(c => {
    const w = c.dataset.w.toLowerCase();
    const text = c.textContent.toLowerCase();
    const matchQ = !q || w.includes(q) || text.includes(q);
    const matchCat = activeCat === 'all' || c.dataset.cat === activeCat;
    const show = matchQ && matchCat;
    c.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.querySelectorAll('.section').forEach(s => {
    const cat = s.dataset.cat;
    const showSec = (activeCat === 'all' || activeCat === cat) &&
      s.querySelectorAll('.card:not([style*="display: none"])').length > 0;
    s.style.display = showSec ? '' : 'none';
  });
  document.getElementById('empty').classList.toggle('show', visible === 0);
}

// ====== TTS (speechSynthesis — works in China, no Google dependency) ======
let audioSource = 'uk';
let currentBtn = null;
let ttsResumeTimer = null;
let cachedVoices = [];
let voicesReady = false;
let speechRunId = 0;
let currentAudio = null;
let articlePageIndex = 0;
const ARTICLE_PAGE_SIZE = 3;

// Pre-load voices (Chrome loads them asynchronously)
function loadVoices() {
  if (!window.speechSynthesis) return;
  const v = window.speechSynthesis.getVoices();
  if (v.length > 0) {
    cachedVoices = v;
    voicesReady = true;
  }
}
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices(); // try immediately

  // Force Chrome to load voices by triggering a silent speak()
  const forceLoadVoices = () => {
    if (voicesReady) return;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      u.onend = () => { loadVoices(); };
      u.onerror = () => { loadVoices(); };
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    } catch {}
  };

  // Try multiple strategies
  setTimeout(loadVoices, 200);
  setTimeout(() => { forceLoadVoices(); }, 500);
  setTimeout(loadVoices, 1000);
  setTimeout(() => { forceLoadVoices(); loadVoices(); }, 2000);

  // Aggressive polling: keep trying every 500ms until voices are ready
  const voicePollTimer = setInterval(() => {
    if (voicesReady) { clearInterval(voicePollTimer); return; }
    loadVoices();
  }, 500);
  // Give up polling after 15 seconds
  setTimeout(() => clearInterval(voicePollTimer), 15000);

  // Also try on first user interaction
  document.addEventListener('click', () => {
    if (!voicesReady) { forceLoadVoices(); loadVoices(); }
  }, { once: true });
}

function findVoice(lang) {
  if (!cachedVoices.length) return null;

  const prefix = lang.split('-')[0];
  const candidates = cachedVoices.filter(v => v.lang === lang || v.lang.startsWith(prefix));
  if (!candidates.length) return null;

  const preferredNames = lang === 'en-GB'
    ? ['Daniel', 'Martha', 'Arthur', 'Serena', 'Oliver', 'Kate']
    : ['Samantha', 'Ava', 'Allison', 'Susan', 'Alex', 'Tom', 'Nicky'];

  const scored = candidates.map(v => {
    const name = v.name || '';
    const preferredIdx = preferredNames.findIndex(n => name.toLowerCase().includes(n.toLowerCase()));
    return {
      voice: v,
      score:
        (v.lang === lang ? 40 : 0) +
        (v.localService ? 10 : 0) +
        (preferredIdx >= 0 ? 30 - preferredIdx : 0) +
        (v.default ? 3 : 0)
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].voice;
}

// Chrome bug workaround: resume every 5s to prevent ~15s freeze
function startTtsResume() {
  stopTtsResume();
  ttsResumeTimer = setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, 5000);
}
function stopTtsResume() {
  if (ttsResumeTimer) { clearInterval(ttsResumeTimer); ttsResumeTimer = null; }
}

function textToFilename(text) {
  return String(text || '').trim().toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-');
}

function getWordAudioUrl(text) {
  const word = String(text || '').trim().toLowerCase();
  if (!/^[a-z][a-z-]*$/.test(word)) {
    // Multi-word: convert spaces to hyphens for filename lookup
    const fname = textToFilename(word);
    if (!fname || !/^[a-z0-9][a-z0-9-]*$/.test(fname)) return '';
    return `./audio/words/${audioSource}/${encodeURIComponent(fname)}.mp3`;
  }
  return `./audio/words/${audioSource}/${encodeURIComponent(word)}.mp3`;
}

function getSentenceAudioUrl(word) {
  if (!word) return '';
  const w = String(word).trim().toLowerCase();
  return `./audio/sentences/${audioSource}/${encodeURIComponent(w)}.mp3`;
}

function getEnAudioUrl(word) {
  if (!word) return '';
  const w = String(word).trim().toLowerCase();
  return `./audio/en/${audioSource}/${encodeURIComponent(w)}.mp3`;
}

function stopAudioFile() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.removeAttribute('src');
  currentAudio.load();
  currentAudio = null;
}

function playAudioFile(url, done, fallback, runId) {
  stopAudioFile();
  const audio = new Audio(url);
  currentAudio = audio;
  let played = false;
  const timeout = setTimeout(() => {
    if (runId !== speechRunId || played) return;
    stopAudioFile();
    fallback();
  }, 3000);
  audio.oncanplay = () => {
    if (runId !== speechRunId || played) return;
    audio.play().then(() => { played = true; clearTimeout(timeout); }).catch(() => {
      clearTimeout(timeout);
      if (runId !== speechRunId) return;
      stopAudioFile();
      fallback();
    });
  };
  audio.onended = () => { clearTimeout(timeout); done(); };
  audio.onerror = () => {
    clearTimeout(timeout);
    if (runId !== speechRunId || played) return;
    stopAudioFile();
    fallback();
  };
  // If already loaded (cached), play immediately
  if (audio.readyState >= 3) {
    audio.play().then(() => { played = true; clearTimeout(timeout); }).catch(() => {});
  }
}

function speak(text, rate, btn, word, accent, skipAudio) {
  if (!text) return;
  const runId = ++speechRunId;
  stopAudioFile();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (currentBtn) currentBtn.classList.remove('playing');
  if (btn) { btn.classList.add('playing'); currentBtn = btn; }

  const done = () => {
    if (runId !== speechRunId) return;
    stopAudioFile();
    if (btn) btn.classList.remove('playing');
    currentBtn = null;
    stopTtsResume();
  };
  const lang = audioSource === 'uk' ? 'en-GB' : 'en-US';
  const spd = rate || 0.85;

  const speakWithTts = () => {
    if (runId !== speechRunId) return;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();

      const doSpeak = () => {
        if (runId !== speechRunId) return;
        // Try to load voices, but don't wait — just speak with whatever we have
        if (!voicesReady) loadVoices();
        doSpeakInner();
      };

      const doSpeakInner = () => {
        if (runId !== speechRunId) return;
        const u = new SpeechSynthesisUtterance(text);
        // Only assign voice if voices are loaded; otherwise use browser default
        if (cachedVoices.length > 0) {
          const voice = findVoice(lang);
          if (voice) {
            u.voice = voice;
            u.lang = voice.lang || lang;
          } else {
            const anyEn = cachedVoices.find(v => v.lang && v.lang.startsWith('en'));
            const anyVoice = anyEn || cachedVoices.find(v => v.default) || cachedVoices[0];
            if (anyVoice) { u.voice = anyVoice; u.lang = anyVoice.lang; }
          }
        }
        u.rate = spd;
        u.pitch = 1;
        u.onend = done;
        u.onerror = () => {
          if (runId !== speechRunId) return;
          tryGoogleTts(text, lang, done, runId);
        };
        if (runId !== speechRunId) return;
        window.speechSynthesis.speak(u);
        startTtsResume();
      };

      if (voicesReady) {
        doSpeak();
      } else {
        // Voices not loaded — try speak anyway with default voice, also keep loading
        loadVoices();
        doSpeak();
      }
      return;
    }

    tryGoogleTts(text, lang, done, runId);
  };

  const wordUrl = accent === 'en' ? '' : getWordAudioUrl(text);
  const enUrl = (accent === 'en' && word) ? getEnAudioUrl(word) : '';
  const sentUrl = word ? getSentenceAudioUrl(word) : '';
  const audioUrl = skipAudio ? '' : (wordUrl || enUrl || sentUrl);
  if (audioUrl) {
    playAudioFile(audioUrl, done, speakWithTts, runId);
    return;
  }

  speakWithTts();
}

// Fallback: try speechSynthesis with default voice (no language constraint)
function tryGoogleTts(text, lang, done, runId) {
  if (runId !== speechRunId) return;
  if (!window.speechSynthesis) { done(); showTtsError(); return; }
  try {
    window.speechSynthesis.cancel();
    if (runId !== speechRunId) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 1;
    u.onend = done;
    u.onerror = () => {
      if (runId !== speechRunId) return;
      done();
      showTtsError();
    };
    window.speechSynthesis.speak(u);
  } catch {
    if (runId !== speechRunId) return;
    done();
    showTtsError();
  }
}

let ttsErrorShown = false;
function showTtsError() {
  if (ttsErrorShown) return;
  ttsErrorShown = true;
  const toast = document.createElement('div');
  toast.className = 'tts-toast';
  toast.innerHTML = '发音不可用。<br>TTS not available.<br><small>请安装英语语音包，或使用带语音的浏览器（如 Edge）。</small>';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 6000);
}

function stopSpeaking() {
  speechRunId++;
  stopAudioFile();
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.pause();
    window.speechSynthesis.cancel();
    setTimeout(() => window.speechSynthesis.cancel(), 0);
    setTimeout(() => window.speechSynthesis.cancel(), 120);
  }
  stopTtsResume();
  if (currentBtn) { currentBtn.classList.remove('playing'); currentBtn = null; }
}

// ====== SYNONYM PANEL ======
function renderSynPanel(syn, main, info) {
  const synIpa = getIpa(syn);
  const mainIpa = getIpa(main);
  const spk = (txt, rate, label) => `<button class="speak speak-inline" data-text="${escapeAttr(txt)}" data-rate="${rate}" aria-label="${label}">${SPEAKER_SVG_SM}</button>`;

  const head = `<div class="syn-panel-head">
    <div class="sp-word-group">
      ${spk(syn, 0.85, '读近义词')}
      <button class="sp-word speak-text" data-text="${escapeAttr(syn)}" data-rate="0.85" aria-label="读近义词">${syn}</button>
      ${synIpa ? `<span class="sp-ipa">${synIpa}</span>` : ''}
    </div>
    <span class="sp-badge">近义词 Synonym</span>
    <span class="sp-vs">vs</span>
    <div class="sp-word-group">
      ${spk(main, 0.85, '读主词')}
      <button class="sp-main speak-text" data-text="${escapeAttr(main)}" data-rate="0.85" aria-label="读主词">${main}</button>
      ${mainIpa ? `<span class="sp-ipa">${mainIpa}</span>` : ''}
    </div>
  </div>`;

  if (!info) {
    return head + `<div class="sp-empty">详细对比补充中，点击单词可先听发音 Pronunciation available — click the word</div>`;
  }

  return head + `
    <div class="sp-row">
      <span class="sp-label">释义<em>Definition</em></span>
      <span class="sp-val">${info.def || ''}</span>
    </div>
    <div class="sp-row">
      <span class="sp-label">区别<em>Difference</em></span>
      <span class="sp-val">${info.vs || ''}</span>
    </div>
    <div class="sp-row">
      <span class="sp-label">场景<em>Usage</em></span>
      <span class="sp-val">${info.use || ''}</span>
    </div>`;
}

// ====== FLASH CARD ======
let flashWords = [];
let flashIdx = 0;
let flashAutoSpeak = true;
let practiceMode = 'browse'; // 'browse' | 'spell' | 'choice'
let unknownOnly = false;
let flashSourceMode = 'review';
let quizScore = { correct: 0, total: 0 };
let practiceAnswered = false;

function saveFlashSession() {
  if (!flashWords.length) return;
  const payload = {
    version: 1,
    words: flashWords.map(w => w.w),
    idx: flashIdx,
    mode: practiceMode,
    source: flashSourceMode,
    unknownOnly,
    quizScore,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(FLASH_SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

function restoreFlashSession(expectedSource) {
  try {
    const stored = localStorage.getItem(FLASH_SESSION_KEY);
    if (!stored) return false;
    const payload = JSON.parse(stored);
    if (!payload || payload.version !== 1) return false;
    if (!payload.updatedAt || Date.now() - payload.updatedAt > FLASH_SESSION_TTL_MS) return false;
    if (expectedSource && payload.source && payload.source !== expectedSource) return false;
    const words = (payload.words || []).map(word => WORD_BY_KEY.get(word)).filter(Boolean);
    if (!words.length) return false;
    flashWords = words;
    flashIdx = Math.max(0, Math.min(Number(payload.idx) || 0, flashWords.length - 1));
    if (['browse', 'spell', 'choice'].includes(payload.mode)) practiceMode = payload.mode;
    flashSourceMode = payload.source || 'review';
    unknownOnly = Boolean(payload.unknownOnly);
    if (payload.quizScore && typeof payload.quizScore === 'object') {
      quizScore = {
        correct: Number(payload.quizScore.correct) || 0,
        total: Number(payload.quizScore.total) || 0,
      };
    }
    return true;
  } catch {
    return false;
  }
}

function clearFlashSession() {
  try { localStorage.removeItem(FLASH_SESSION_KEY); } catch {}
}

function flashBuildBack(w) {
  const ipa = getIpa(w.w);
  const ipaStr = ipa ? `<div class="flash-back-ipa">${ipa}</div>` : '';
  const synsHtml = (w.s || []).map(s =>
    `<button class="flash-back-syn speak-text" data-text="${escapeAttr(s)}" data-rate="0.85" aria-label="读近义词">${s}</button>`
  ).join('');
  const spk = (txt, rate, label, word, accent) => `<button class="speak speak-inline" data-text="${escapeAttr(txt)}" data-rate="${rate}"${word ? ` data-word="${escapeAttr(word)}"` : ''}${accent ? ` data-accent="${accent}"` : ''} aria-label="${label}">${SPEAKER_SVG_SM}</button>`;
  return `<div class="flash-back-word">${spk(w.w, 0.85, '读单词')}<button class="sp-word speak-text" data-text="${escapeAttr(w.w)}" data-rate="0.85" aria-label="读单词">${w.w}</button></div>
    ${ipaStr}
    <div class="flash-back-zh">${w.zh}</div>
    <div class="flash-back-en">${spk(w.en, 0.9, '读释义', w.w, 'en')}<span>${w.en}</span></div>
    <div class="flash-back-ex">${spk(w.ex, 1.0, '读例句', w.w)}<span>${w.ex}</span><br><small style="color:var(--ink-faint);margin-left:22px">${w.exz}</small></div>
    <div class="flash-back-syns" style="margin-top:4px"><span style="font-size:10px;color:var(--ink-faint);letter-spacing:.05em;text-transform:uppercase;margin-right:6px">近义词 Synonyms · 点击发音</span>${synsHtml}</div>
    <button class="flash-back-flip" type="button">回到正面 Back</button>`;
}

function shuffleWordList(words) {
  const list = [...words];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getRandomFlashSource() {
  const pool = WORDS.filter(w => getWordStatusLabel(w.w) !== 'mastered');
  return shuffleWordList(pool.length > 0 ? pool : WORDS).slice(0, DAILY_FLASH_TARGET);
}

function getFlashSource(source = 'review') {
  const unknownPool = WORDS.filter(w => unknownWords.has(w.w));
  if (unknownOnly && unknownPool.length > 0) {
    return source === 'random'
      ? shuffleWordList(unknownPool).slice(0, DAILY_FLASH_TARGET)
      : rankWordsForFlash(unknownPool);
  }

  if (source === 'random') {
    return getRandomFlashSource();
  }

  const now = Date.now();
  const dueUnknown = rankWordsForFlash(unknownPool).filter(w => isWordDue(w.w, now));
  const learningPool = WORDS.filter(w => {
    const status = getWordStatusLabel(w.w);
    return status === 'learning' || status === 'familiar';
  });
  const dueLearning = rankWordsForFlash(learningPool).filter(w => isWordDue(w.w, now) && !unknownWords.has(w.w));

  const combined = [];
  const seen = new Set();
  [...dueUnknown, ...dueLearning].forEach(w => {
    if (!seen.has(w.w)) {
      seen.add(w.w);
      combined.push(w);
    }
  });

  if (combined.length > 0) {
    return combined.slice(0, DAILY_FLASH_TARGET);
  }

  const fallback = rankWordsForFlash(unknownPool.length > 0 ? unknownPool : WORDS.filter(w => getWordStatusLabel(w.w) !== 'mastered'));
  if (fallback.length > 0) return fallback.slice(0, DAILY_FLASH_TARGET);

  return rankWordsForFlash([...WORDS]).slice(0, DAILY_FLASH_TARGET);
}

function flashRender(opts) {
  if (flashWords.length === 0) {
    flashWords = getFlashSource(flashSourceMode);
    flashIdx = 0;
  }
  const w = flashWords[flashIdx];
  if (!w) return;

  const cardWrap = document.getElementById('flash-card-wrap');
  const practiceArea = document.getElementById('practice-area');
  const markRow = document.getElementById('flash-mark-row');

  cardWrap.classList.remove('flipped');
  document.getElementById('fc-word').textContent = w.w;
  document.getElementById('fc-word').dataset.text = w.w;
  document.getElementById('fc-cat').textContent = CAT_FULL[w.c] || '';
  // IPA on front
  const ipaFront = getIpa(w.w);
  const fcIpaEl = document.getElementById('fc-ipa');
  if (fcIpaEl) fcIpaEl.textContent = ipaFront || '';
  document.getElementById('fc-back').innerHTML = flashBuildBack(w);

  // Unknown badge on front
  const frontEl = cardWrap.querySelector('.flash-front');
  const existingBadge = frontEl.querySelector('.flash-unknown-badge');
  if (existingBadge) existingBadge.remove();
  frontEl.classList.toggle('has-unknown', unknownWords.has(w.w));
  if (unknownWords.has(w.w)) {
    const badge = document.createElement('div');
    badge.className = 'flash-unknown-badge';
    badge.textContent = '待练习';
    frontEl.appendChild(badge);
  }

  const prog = `${flashIdx + 1} / ${flashWords.length}`;
  document.getElementById('flash-progress').textContent = prog;
  document.getElementById('flash-counter').textContent = prog;
  const taskMetaEl = document.getElementById('flash-task-meta');
  if (taskMetaEl) {
    const status = getWordStatusLabel(w.w);
    const statusText = status === 'mastered' ? 'Mastered' : status === 'familiar' ? 'Familiar' : status === 'learning' ? 'Learning' : 'New';
    const summary = getFlashTaskSummary(flashWords);
    const sourceText = flashSourceMode === 'random' ? 'Random task' : 'Daily task';
    taskMetaEl.textContent = `${sourceText} · ${flashWords.length} words · ${summary.newCount} new · ${summary.reviewCount} review · ${statusText}`;
  }

  // Practice modes
  practiceAnswered = false;
  if (practiceMode === 'browse') {
    cardWrap.style.display = '';
    practiceArea.hidden = true;
    markRow.style.display = '';
    resetMarkRowState();
  } else if (practiceMode === 'spell') {
    cardWrap.style.display = 'none';
    practiceArea.hidden = false;
    markRow.style.display = 'none';
    renderSpellMode(w);
  } else if (practiceMode === 'choice') {
    cardWrap.style.display = 'none';
    practiceArea.hidden = false;
    markRow.style.display = 'none';
    renderChoiceMode(w);
  }

  saveFlashSession();
  if (opts && opts.autoSpeak && flashAutoSpeak && practiceMode === 'browse') flashSpeakCurrent();
}

// ====== SPELL MODE ======
function renderSpellMode(w) {
  const content = document.getElementById('practice-content');
  const feedback = document.getElementById('practice-feedback');
  feedback.textContent = '';
  feedback.className = 'practice-feedback';
  content.innerHTML = `
    <div class="practice-prompt">${w.zh}</div>
    <div class="practice-hint">${w.exz}</div>
    <div class="practice-input-row">
      <input class="practice-input" id="spell-input" type="text" placeholder="输入英文单词... Type the English word..." autocomplete="off" autofocus>
      <button class="practice-submit" id="spell-submit">检查 Check</button>
    </div>`;
  const input = document.getElementById('spell-input');
  const submit = document.getElementById('spell-submit');
  input.focus();
  submit.addEventListener('click', () => checkSpellAnswer(w));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') checkSpellAnswer(w); });
}

function checkSpellAnswer(w) {
  if (practiceAnswered) return;
  const input = document.getElementById('spell-input');
  const answer = input.value.trim().toLowerCase();
  const feedback = document.getElementById('practice-feedback');
  if (!answer) return;

  practiceAnswered = true;
  quizScore.total++;

  if (answer === w.w.toLowerCase()) {
    quizScore.correct++;
    feedback.className = 'practice-feedback good';
    feedback.innerHTML = `正确！Correct!`;
    unknownWords.delete(w.w);
    saveUnknownWords();
    recordFlashOutcome(w.w, 'correct');
    saveFlashSession();
    renderStats();
    speak(w.w, 0.85, null);
  } else {
    feedback.className = 'practice-feedback bad';
    feedback.innerHTML = `错误 Wrong <div class="correct-answer">正确答案：${w.w}</div>`;
    unknownWords.add(w.w);
    saveUnknownWords();
    recordFlashOutcome(w.w, 'wrong');
    saveFlashSession();
    renderStats();
  }
  feedback.innerHTML += `<br><button class="practice-next-btn" id="practice-next-btn">下一个 Next →</button>`;
  document.getElementById('practice-next-btn').addEventListener('click', flashNext);
}

// ====== CHOICE MODE ======
function renderChoiceMode(w) {
  const content = document.getElementById('practice-content');
  const feedback = document.getElementById('practice-feedback');
  feedback.textContent = '';
  feedback.className = 'practice-feedback';

  // Generate 4 choices: 1 correct + 3 distractors from same category
  const sameCat = WORDS.filter(x => x.c === w.c && x.w !== w.w);
  const shuffled = sameCat.sort(() => Math.random() - 0.5).slice(0, 3);
  const choices = [...shuffled.map(x => ({ text: x.zh, correct: false })), { text: w.zh, correct: true }];
  // Shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  content.innerHTML = `
    <div class="practice-prompt" style="font-family:var(--serif);color:#e7e2d4;font-size:24px;margin-bottom:4px">${w.w}</div>
    <div class="practice-hint" style="font-style:normal;color:#a8a29e">${w.en}</div>
    <div class="choice-grid" id="choice-grid">
      ${choices.map((c, i) => `<button class="choice-btn" data-idx="${i}" data-correct="${c.correct}">${c.text}</button>`).join('')}
    </div>`;

  document.getElementById('choice-grid').addEventListener('click', e => {
    const btn = e.target.closest('.choice-btn');
    if (!btn || practiceAnswered) return;
    checkChoiceAnswer(w, btn);
  });
}

function checkChoiceAnswer(w, btn) {
  if (practiceAnswered) return;
  practiceAnswered = true;
  quizScore.total++;

  const isCorrect = btn.dataset.correct === 'true';
  const feedback = document.getElementById('practice-feedback');
  const allBtns = document.querySelectorAll('.choice-btn');

  // Highlight correct/wrong
  allBtns.forEach(b => {
    if (b.dataset.correct === 'true') b.classList.add('correct');
    else b.classList.add('disabled');
    if (b === btn && !isCorrect) b.classList.add('wrong');
  });

  if (isCorrect) {
    quizScore.correct++;
    feedback.className = 'practice-feedback good';
    feedback.innerHTML = `正确！Correct!`;
    unknownWords.delete(w.w);
    saveUnknownWords();
    recordFlashOutcome(w.w, 'correct');
    saveFlashSession();
    renderStats();
    speak(w.w, 0.85, null);
  } else {
    feedback.className = 'practice-feedback bad';
    feedback.innerHTML = `错误 Wrong <div class="correct-answer">正确答案：${w.zh}</div>`;
    unknownWords.add(w.w);
    saveUnknownWords();
    recordFlashOutcome(w.w, 'wrong');
    saveFlashSession();
    renderStats();
  }
  feedback.innerHTML += `<br><button class="practice-next-btn" id="practice-next-btn">下一个 Next →</button>`;
  document.getElementById('practice-next-btn').addEventListener('click', flashNext);
}

// ====== QUIZ COMPLETE ======
function showQuizComplete() {
  const content = document.getElementById('practice-content');
  const feedback = document.getElementById('practice-feedback');
  document.getElementById('flash-card-wrap').style.display = 'none';
  document.getElementById('flash-mark-row').style.display = 'none';
  clearFlashSession();

  const pct = quizScore.total > 0 ? Math.round((quizScore.correct / quizScore.total) * 100) : 0;
  const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📖';

  content.innerHTML = `
    <div class="quiz-complete">
      <h3>${emoji} 练习完成 Practice Complete</h3>
      <div class="quiz-score">
        共 <strong>${quizScore.total}</strong> 题 Questions<br>
        正确 <span class="good">${quizScore.correct}</span> 题 Correct ·
        错误 <span class="bad">${quizScore.total - quizScore.correct}</span> 题 Wrong<br>
        正确率 <strong>${pct}%</strong> Score
      </div>
      <button class="quiz-retry-btn" id="quiz-retry-btn">重新练习 Retry</button>
    </div>`;
  feedback.textContent = '';

  document.getElementById('quiz-retry-btn').addEventListener('click', () => {
    quizScore = { correct: 0, total: 0 };
    flashWords = getFlashSource(flashSourceMode);
    flashIdx = 0;
    flashRender({ autoSpeak: false });
  });
}

function flashNext() {
  if (flashIdx < flashWords.length - 1) {
    flashIdx++;
    flashRender({ autoSpeak: practiceMode === 'browse' && flashAutoSpeak });
  } else {
    if (practiceMode !== 'browse') {
      showQuizComplete();
    } else {
      flashIdx = 0;
      flashRender({ autoSpeak: true });
    }
  }
}

function flashSpeakCurrent() {
  const w = flashWords[flashIdx];
  if (!w) return;
  speak(w.w, 0.85, document.getElementById('fc-speak-btn'));
}

function updateFlashAutoBtn() {
  const btn = document.getElementById('flash-auto-btn');
  btn.classList.toggle('active', flashAutoSpeak);
  btn.setAttribute('aria-pressed', String(flashAutoSpeak));
}

function updateUnknownOnlyBtn() {
  const btn = document.getElementById('flash-unknown-only-btn');
  btn.classList.toggle('active', unknownOnly);
}

function flashOpen(options = {}) {
  const config = typeof options === 'string' ? { mode: options } : options;
  const source = config.source || 'review';
  const shouldRestore = config.restore !== false && source === 'review' && !config.mode;
  if (config.mode) practiceMode = config.mode;
  const restored = shouldRestore && restoreFlashSession(source);
  if (!restored) {
    flashSourceMode = source;
    flashWords = getFlashSource(source);
    flashIdx = 0;
    quizScore = { correct: 0, total: 0 };
  }
  updateFlashAutoBtn();
  updateUnknownOnlyBtn();
  updateModePills();
  flashRender({ autoSpeak: true });
  document.getElementById('flash-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function flashClose() {
  saveFlashSession();
  document.getElementById('flash-overlay').hidden = true;
  document.body.style.overflow = '';
  stopSpeaking();
  practiceMode = 'browse';
  // Refresh main page cards to reflect unknown status
  renderCards(WORDS);
}

function updateModePills() {
  document.querySelectorAll('.mode-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.mode === practiceMode);
  });
}

// ====== MARK WORD ======
function resetMarkRowState() {
  const row = document.getElementById('flash-mark-row');
  if (!row) return;
  row.querySelectorAll('.mark-btn').forEach(btn => {
    btn.disabled = false;
    btn.hidden = false;
  });
  row.querySelector('.mark-result-note')?.remove();
  row.querySelector('.mark-next-after-answer')?.remove();
}

function showMarkedAnswer(w, known) {
  const row = document.getElementById('flash-mark-row');
  const cardWrap = document.getElementById('flash-card-wrap');
  if (!row || !cardWrap) return;

  cardWrap.classList.add('flipped');
  row.querySelectorAll('.mark-btn').forEach(btn => {
    btn.disabled = true;
    btn.hidden = true;
  });

  const note = document.createElement('div');
  note.className = `mark-result-note ${known ? 'known' : 'unknown'}`;
  note.innerHTML = `<strong>${known ? '已标记认识' : '已标记不认识'}</strong><span>意思：${escapeHtml(w.zh)} · ${escapeHtml(w.en)}</span>`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'mark-next-after-answer';
  nextBtn.type = 'button';
  nextBtn.textContent = '下一个 Next';
  nextBtn.addEventListener('click', () => {
    stopSpeaking();
    flashNext();
  });

  row.append(note, nextBtn);
}

function markWord(known) {
  if (practiceAnswered) return;
  const w = flashWords[flashIdx];
  if (!w) return;
  practiceAnswered = true;
  if (known) {
    unknownWords.delete(w.w);
    recordFlashOutcome(w.w, 'known');
  } else {
    unknownWords.add(w.w);
    recordFlashOutcome(w.w, 'unknown');
  }
  saveUnknownWords();
  renderStats();
  saveFlashSession();
  showMarkedAnswer(w, known);
}

// ====== EVENT LISTENERS ======
function setupEvents() {
  // Search
  document.getElementById('q').addEventListener('input', filter);

  // Pills
  document.getElementById('pills').addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    pill.classList.add('active');
    filter();
  });

  // Audio toggle
  document.querySelectorAll('.audio-toggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.audio-toggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      audioSource = b.dataset.src;
      stopSpeaking();
    });
  });

  // Card clicks (speak, syn)
  document.addEventListener('click', e => {
    const articlePickBtn = e.target.closest('.article-pick-btn');
    if (articlePickBtn) {
      e.stopPropagation();
      toggleSelectedArticleWord(articlePickBtn.dataset.word);
      renderCards(WORDS);
      filter();
      updateArticleEntryState();
      return;
    }

    const speakText = e.target.closest('.speak-text');
    if (speakText) {
      e.stopPropagation();
      const text = speakText.dataset.text || speakText.textContent.trim();
      const rate = parseFloat(speakText.dataset.rate) || 1.0;
      const word = speakText.dataset.word || '';
      const accent = speakText.dataset.accent || '';
      // Article section: skip audio file lookup, use TTS directly
      const inArticle = !!speakText.closest('.article-body');
      speak(text, rate, speakText, word, accent, inArticle);
      return;
    }
    const speakBtn = e.target.closest('.speak');
    if (speakBtn) {
      e.stopPropagation();
      const text = speakBtn.dataset.text;
      const rate = parseFloat(speakBtn.dataset.rate) || 1.0;
      const word = speakBtn.dataset.word || '';
      const accent = speakBtn.dataset.accent || '';
      if (speakBtn.classList.contains('playing')) { stopSpeaking(); return; }
      speak(text, rate, speakBtn, word, accent);
      return;
    }
    const synBtn = e.target.closest('.syn');
    if (synBtn) {
      e.stopPropagation();
      const syn = synBtn.dataset.syn;
      const main = synBtn.dataset.main;
      const card = synBtn.closest('.card');
      const panel = card.querySelector('.syn-panel');
      const wasActive = synBtn.classList.contains('active');
      card.querySelectorAll('.syn.active').forEach(s => s.classList.remove('active'));
      if (wasActive) {
        panel.hidden = true;
        panel.innerHTML = '';
      } else {
        synBtn.classList.add('active');
        const info = (typeof SYNS_DETAIL !== 'undefined' && SYNS_DETAIL[main] && SYNS_DETAIL[main][syn]) || null;
        panel.hidden = false;
        panel.innerHTML = renderSynPanel(syn, main, info);
        speak(syn, 0.85, null);
      }
      return;
    }
  });

  // Flash card open/close
  const reviewStartBtn = document.getElementById('review-start-btn');
  const exportRecordBtn = document.getElementById('export-record-btn');
  if (reviewStartBtn) reviewStartBtn.addEventListener('click', () => flashOpen({ source: 'review' }));
  if (exportRecordBtn) exportRecordBtn.addEventListener('click', exportLearningRecord);
  document.getElementById('flash-close-btn').addEventListener('click', flashClose);

  const dockTodayBtn = document.getElementById('dock-today-btn');
  const dockWordbookBtn = document.getElementById('dock-wordbook-btn');
  const dockArticleBtn = document.getElementById('dock-article-btn');
  const dockExportBtn = document.getElementById('dock-export-btn');
  if (dockTodayBtn) dockTodayBtn.addEventListener('click', () => flashOpen({ source: 'review' }));
  if (dockWordbookBtn) dockWordbookBtn.addEventListener('click', () => openWordbook('due'));
  if (dockArticleBtn) dockArticleBtn.addEventListener('click', () => openArticle('auto'));
  if (dockExportBtn) dockExportBtn.addEventListener('click', exportLearningRecord);

  const wordbookOverlay = document.getElementById('wordbook-overlay');
  const wordbookCloseBtn = document.getElementById('wordbook-close-btn');
  const wordbookSearch = document.getElementById('wordbook-search');
  const wordbookTabs = document.getElementById('wordbook-tabs');
  if (wordbookCloseBtn) wordbookCloseBtn.addEventListener('click', closeWordbook);
  if (wordbookOverlay) {
    wordbookOverlay.addEventListener('click', e => {
      if (e.target === wordbookOverlay) closeWordbook();
    });
  }
  if (wordbookSearch) {
    wordbookSearch.addEventListener('input', () => {
      wordbookQuery = wordbookSearch.value;
      renderWordbook();
    });
  }
  if (wordbookTabs) {
    wordbookTabs.addEventListener('click', e => {
      const tab = e.target.closest('.wordbook-tab');
      if (!tab) return;
      wordbookFilter = tab.dataset.filter || 'due';
      renderWordbook();
    });
  }

  // Article overlay — 发音单独处理，直接用浏览器 speechSynthesis
  document.getElementById('vocab-btn').addEventListener('click', openArticle);
  const articleCloseBtn = document.getElementById('article-close-btn');
  articleCloseBtn.addEventListener('pointerdown', stopSpeaking);
  articleCloseBtn.addEventListener('touchstart', stopSpeaking, { passive: true });
  articleCloseBtn.addEventListener('click', closeArticle);
  document.getElementById('article-prev-btn').addEventListener('click', () => {
    if (articlePageIndex === 0) return;
    articlePageIndex--;
    stopSpeaking();
    renderArticle();
  });
  document.getElementById('article-next-btn').addEventListener('click', () => {
    articlePageIndex++;
    stopSpeaking();
    renderArticle();
  });
  document.getElementById('article-regen-btn').addEventListener('click', () => {
    articlePageIndex = 0;
    ensureArticlePackage(true, articleMode);
    renderArticle();
  });
  document.getElementById('article-auto-btn').addEventListener('click', () => {
    articleMode = 'auto';
    articlePageIndex = 0;
    ensureArticlePackage(false, articleMode);
    renderArticle();
  });
  document.getElementById('article-use-selected-btn').addEventListener('click', () => {
    if (selectedArticleWords.size === 0) return;
    articleMode = 'selected';
    articlePageIndex = 0;
    ensureArticlePackage(false, articleMode);
    renderArticle();
  });
  document.getElementById('article-clear-selected-btn').addEventListener('click', () => {
    selectedArticleWords.clear();
    saveSelectedArticleWords();
    articleMode = 'auto';
    updateArticleEntryState();
    renderCards(WORDS);
    filter();
    articlePageIndex = 0;
    ensureArticlePackage(true, articleMode);
    renderArticle();
  });
  // Article body: use main speak() with skipAudio=true to avoid audio file lookup
  document.getElementById('article-body').addEventListener('click', e => {
    const quizBtn = e.target.closest('.article-quiz-option');
    if (quizBtn) {
      const quiz = quizBtn.closest('.article-quiz');
      if (!quiz || quiz.dataset.answered === '1') return;
      quiz.dataset.answered = '1';
      const options = [...quiz.querySelectorAll('.article-quiz-option')];
      options.forEach(btn => {
        const isCorrect = btn.dataset.correct === '1';
        btn.disabled = true;
        btn.classList.add(isCorrect ? 'correct' : 'muted');
      });
      if (quizBtn.dataset.correct === '1') {
        quizBtn.classList.add('selected-correct');
      } else {
        quizBtn.classList.add('selected-wrong');
      }
      const feedback = quiz.querySelector('.article-quiz-feedback');
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = quizBtn.dataset.correct === '1' ? 'Correct.' : `Answer: ${feedback.textContent.replace(/^Answer:\s*/, '')}`;
      }
      const quizWord = quiz.dataset.word || '';
      recordWordQuizResult(quizWord, quizBtn.dataset.correct === '1');
      renderStats();
      updateArticleEntryState();
      return;
    }

    const el = e.target.closest('.speak-text');
    if (!el) return;
    e.stopPropagation();
    const text = el.dataset.text || el.textContent.trim();
    if (!text) return;
    const rate = parseFloat(el.dataset.rate) || 0.9;
    speak(text, rate, el, null, null, true); // skipAudio=true → TTS only
  });
  document.getElementById('article-copy-btn').addEventListener('click', () => {
    const text = getArticlePlainText();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('article-copy-btn');
      btn.classList.add('copied');
      btn.textContent = 'Copied ✓';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy All';
      }, 1500);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });
  document.getElementById('article-export-btn').addEventListener('click', () => {
    const text = getArticlePlainText();
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vocab_article_' + new Date().toISOString().slice(0, 10) + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Auto speak toggle
  document.getElementById('flash-auto-btn').addEventListener('click', () => {
    flashAutoSpeak = !flashAutoSpeak;
    updateFlashAutoBtn();
    if (flashAutoSpeak) flashSpeakCurrent();
    else stopSpeaking();
  });

  // Unknown only toggle
  document.getElementById('flash-unknown-only-btn').addEventListener('click', () => {
    unknownOnly = !unknownOnly;
    updateUnknownOnlyBtn();
    flashWords = getFlashSource(flashSourceMode);
    flashIdx = 0;
    if (flashWords.length === 0) {
      flashWords = [...WORDS];
      unknownOnly = false;
      updateUnknownOnlyBtn();
    }
    flashRender({ autoSpeak: practiceMode === 'browse' && flashAutoSpeak });
  });

  // Mode pills
  document.getElementById('mode-pills').addEventListener('click', e => {
    const pill = e.target.closest('.mode-pill');
    if (!pill) return;
    practiceMode = pill.dataset.mode;
    updateModePills();
    quizScore = { correct: 0, total: 0 };
    flashRender({ autoSpeak: false });
  });

  // Mark buttons
  document.getElementById('mark-known-btn').addEventListener('click', () => markWord(true));
  document.getElementById('mark-unknown-btn').addEventListener('click', () => markWord(false));

  // Card flip
  const flashCardWrap = document.getElementById('flash-card-wrap');
  flashCardWrap.addEventListener('click', e => {
    if (e.target.closest('.flash-flip-btn, .flash-back-flip')) {
      flashCardWrap.classList.toggle('flipped');
      return;
    }
    if (e.target.closest('.flash-speak-front, .speak, .speak-text, button')) return;
    if (e.target.closest('.flash-front')) flashCardWrap.classList.toggle('flipped');
  });

  document.getElementById('fc-speak-btn').addEventListener('click', e => {
    e.stopPropagation();
    flashSpeakCurrent();
  });

  // Navigation
  document.getElementById('flash-prev').addEventListener('click', () => {
    stopSpeaking();
    if (flashIdx > 0) { flashIdx--; flashRender({ autoSpeak: practiceMode === 'browse' && flashAutoSpeak }); }
  });
  document.getElementById('flash-next').addEventListener('click', () => {
    stopSpeaking();
    flashNext();
  });

  // Shuffle
  document.getElementById('flash-shuffle-btn').addEventListener('click', () => {
    for (let i = flashWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashWords[i], flashWords[j]] = [flashWords[j], flashWords[i]];
    }
    flashIdx = 0;
    flashRender({ autoSpeak: practiceMode === 'browse' && flashAutoSpeak });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
  });
  window.addEventListener('pagehide', stopSpeaking);
  window.addEventListener('beforeunload', stopSpeaking);
  window.addEventListener('blur', stopSpeaking);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const flashOverlay = document.getElementById('flash-overlay');
    const articleOverlay = document.getElementById('article-overlay');
    const wordbookOverlay = document.getElementById('wordbook-overlay');
    if (wordbookOverlay && !wordbookOverlay.hidden) {
      if (e.key === 'Escape') closeWordbook();
    } else if (!articleOverlay.hidden) {
      if (e.key === 'Escape') { closeArticle(); }
    } else if (!flashOverlay.hidden) {
      if (practiceMode !== 'browse' && !practiceAnswered) return; // Don't intercept when typing
      if (e.key === 'ArrowRight') { document.getElementById('flash-next').click(); }
      else if (e.key === 'ArrowLeft') { document.getElementById('flash-prev').click(); }
      else if (e.key === ' ' || e.key === 'Enter') {
        if (e.target.closest('button, input, textarea, select, a')) return;
        e.preventDefault();
        flashCardWrap.classList.toggle('flipped');
      }
      else if (e.key === 'Escape') { flashClose(); }
      else if (e.key === '1' && practiceMode === 'browse' && !e.target.closest('input, textarea')) { markWord(true); }
      else if (e.key === '2' && practiceMode === 'browse' && !e.target.closest('input, textarea')) { markWord(false); }
    } else {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('q').focus();
      }
      if (e.key === 'Escape') {
        document.getElementById('q').value = '';
        filter();
        document.getElementById('q').blur();
      }
    }
  });
}

// ====== LEGACY PASSAGE ARTICLE GENERATION (not used by current UI) ======
const TEMPLATES = {
  universal: [
    'The word "{{word}}" means: {{en}}.',
    'You can use "{{word}}" in a sentence like this: {{ex}}',
    'Remember "{{word}}" — {{en}}.',
    '"{{word}}" is an important word: {{en}}.',
    'When you see "{{word}}", connect it with this idea: {{en}}.',
    '{{word}}: {{en}}.',
  ],
  op: [
    'Every day, we {{word}} many things without thinking about it.',
    'Let me {{word}} you something important about learning.',
    'You should try to {{word}} this in your daily conversation.',
    'I want to {{word}} a new habit of using English every day.',
    'We need to {{word}} more if we want to improve.',
    'She learned to {{word}} with confidence.',
  ],
  gt: [
    'A {{word}} can be more useful than you think.',
    'Think about the {{word}} in your daily life.',
    'The {{word}} around us teaches us something new every day.',
    'Every {{word}} has a story worth remembering.',
    'I found a new way to think about {{word}}.',
    'The right {{word}} makes all the difference.',
  ],
  pt: [
    'I saw a {{word}} that reminded me of this word.',
    'Picture a {{word}} in your mind right now.',
    'The {{word}} in front of you holds a lesson.',
    'A {{word}} can teach you more than you expect.',
    'Look at the {{word}} and say the word out loud.',
    'Draw a {{word}} and write the word next to it.',
  ],
  qg: [
    'It is {{word}} to learn new words every day.',
    'This way of learning makes everything feel {{word}}.',
    'A {{word}} approach helps you remember more.',
    'Being {{word}} about language opens new doors.',
    'The most {{word}} thing is to keep practicing.',
    'She has a {{word}} way of using English.',
  ],
  qo: [
    'Some things are {{word}}, but practice makes them better.',
    'Learning may feel {{word}} at first, but it gets easier.',
    'A {{word}} start can lead to great results.',
    'What seems {{word}} today will feel natural tomorrow.',
    'Even {{word}} words become familiar with time.',
    'The {{word}} path often teaches the most.',
  ],
};

const TRANSITIONS = [
  'First, ', 'To start, ', 'Let us begin with: ',
  'Next, ', 'Then, ', 'Also, ',
  'In addition, ', 'Moreover, ', 'Another point: ',
  'Furthermore, ', 'Additionally, ', 'Also worth noting: ',
  'Finally, ', 'Lastly, ', 'To wrap up, ',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template, word) {
  return template
    .replace(/\{\{word\}\}/g, word.w)
    .replace(/\{\{zh\}\}/g, word.zh)
    .replace(/\{\{en\}\}/g, word.en)
    .replace(/\{\{ex\}\}/g, word.ex);
}

function generatePassageArticleLegacy() {
  if (typeof PASSAGES === 'undefined') return null;
  const words = WORDS.filter(w => unknownWords.has(w.w));
  if (words.length === 0) return null;

  const unknownSet = new Set(words.map(w => w.w));

  // Score each passage by how many unknown words it covers
  const scored = PASSAGES.map((p, i) => {
    const matched = p.tags.filter(t => unknownSet.has(t));
    return { idx: i, passage: p, matched };
  }).filter(s => s.matched.length > 0);

  // Greedy selection: pick passages that cover the most uncovered words
  // Limit to 2 passages for beginners
  const covered = new Set();
  const selected = [];
  const remaining = [...scored].sort((a, b) => b.matched.length - a.matched.length);
  const MAX_PASSAGES = 2;

  while (remaining.length > 0 && selected.length < MAX_PASSAGES) {
    // Pick the passage that covers the most uncovered words
    let bestIdx = 0;
    let bestNew = 0;
    remaining.forEach((r, i) => {
      const newCount = r.matched.filter(w => !covered.has(w)).length;
      if (newCount > bestNew) { bestNew = newCount; bestIdx = i; }
    });
    if (bestNew === 0) break;
    const pick = remaining.splice(bestIdx, 1)[0];
    pick.matched.forEach(w => covered.add(w));
    selected.push(pick);
  }

  // Words not covered by any passage — fall back to templates
  const uncovered = [...unknownSet].filter(w => !covered.has(w));
  const fallbackWords = WORDS.filter(w => uncovered.includes(w.w));

  // Build result using passage mode
  const passages = selected.map(s => ({
    title: s.passage.title,
    text: s.passage.text,
    matchedWords: s.matched,
  }));

  // Add fallback template section if needed
  let fallback = null;
  if (fallbackWords.length > 0) {
    const sentences = [];
    fallbackWords.forEach(w => {
      const s1 = fillTemplate(pickRandom([...TEMPLATES.universal]), w);
      const s2 = fillTemplate(pickRandom([...TEMPLATES[w.c] || TEMPLATES.universal]), w);
      sentences.push({ word: w, texts: [s1, s2] });
    });
    fallback = { words: fallbackWords, sentences };
  }

  return { words, passages, fallback };
}

function renderPassageArticleLegacy() {
  const body = document.getElementById('article-body');
  const meta = document.getElementById('article-meta');
  const pageIndicator = document.getElementById('article-page-indicator');
  const prevBtn = document.getElementById('article-prev-btn');
  const nextBtn = document.getElementById('article-next-btn');
  updateArticleModeState();
  const result = generatePassageArticleLegacy();

  if (!result) {
    meta.textContent = articleMode === 'selected' ? '0 selected words' : '0 review words';
    pageIndicator.textContent = 'Page 1 / 1';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    const emptyTitle = articleMode === 'selected' ? 'No Selected Words Yet' : 'No Review Words Yet';
    const emptyDesc = articleMode === 'selected'
      ? 'Pick a few words on the cards with "加入短文", then come back here.'
      : 'Words you mark as unknown, keep getting wrong, or reach review time will appear here automatically.';
    const emptyHint = articleMode === 'selected'
      ? 'Selected mode is for custom articles from your own word list.'
      : 'Use the "Don\'t Know" button, spelling mistakes, or choice mistakes to send words into article reinforcement.';
    body.innerHTML = `
      <div class="article-empty">
        <h3>${emptyTitle}</h3>
        <p>${emptyDesc}</p>
        <p>${emptyHint}</p>
      </div>`;
    return;
  }

  const passageCount = result.passages.length;
  const fallbackCount = result.fallback ? result.fallback.words.length : 0;
  meta.textContent = `${result.words.length} unknown words · ${passageCount} passages` + (fallbackCount > 0 ? ` + ${fallbackCount} template words` : '');

  let html = '';

  // Render each pre-written passage
  result.passages.forEach((p, i) => {
    const fullText = p.text;
    html += `<div class="article-section">
      <div class="article-section-header">
        <div class="article-section-title">${p.title}</div>
        <button class="article-speak-btn speak-text" data-text="${escapeAttr(fullText)}" data-rate="0.9" aria-label="Read this passage">
          Read Aloud
        </button>
      </div>`;

    // Highlight all matched unknown words in the passage text
    // Split into tokens to avoid recursive HTML replacement
    const wordRegex = /[a-zA-Z]+/g;
    let lastIndex = 0;
    let highlighted = '';
    let match;
    while ((match = wordRegex.exec(fullText)) !== null) {
      highlighted += fullText.slice(lastIndex, match.index);
      const token = match[0];
      let isMatch = false;
      for (const w of p.matchedWords) {
        const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${esc}(?:es|ed|ing|er|est|ly|s)?$`, 'i');
        if (re.test(token)) { isMatch = true; break; }
      }
      if (isMatch) {
        highlighted += `<span class="hl speak-text" data-text="${escapeAttr(token)}" data-rate="0.85" title="${token}">${token}</span>`;
      } else {
        highlighted += token;
      }
      lastIndex = match.index + token.length;
    }
    highlighted += fullText.slice(lastIndex);
    html += `<div class="article-paragraph">${highlighted}</div>`;

    // Word tags for this passage
    html += `<div class="article-word-list" style="margin-top:8px">
      ${p.matchedWords.map(w => `<span class="article-word-tag speak-text" data-text="${escapeAttr(w)}" data-rate="0.85"><span class="tw">${w}</span></span>`).join('')}
    </div>`;

    html += `</div>`;
  });

  // Fallback: template-generated for uncovered words
  if (result.fallback) {
    const fw = result.fallback;
    html += `<div class="article-section">
      <div class="article-section-header">
        <div class="article-section-title">More Words (Template)</div>
      </div>
      <div class="article-word-list">
        ${fw.words.map(w => `<span class="article-word-tag speak-text" data-text="${escapeAttr(w.w)}" data-rate="0.85"><span class="tw">${w.w}</span></span>`).join('')}
      </div>
      <div class="article-paragraph">`;
    fw.sentences.forEach(line => {
      const raw = line.texts.join(' ');
      if (line.word) {
        const esc = line.word.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tokRe = /[a-zA-Z]+/g;
        let out = '', last = 0, m;
        while ((m = tokRe.exec(raw)) !== null) {
          out += raw.slice(last, m.index);
          const t = m[0];
          if (new RegExp(`^${esc}(?:es|ed|ing|er|est|ly|s)?$`, 'i').test(t)) {
            out += `<span class="hl speak-text" data-text="${escapeAttr(t)}" data-rate="0.85">${t}</span>`;
          } else {
            out += t;
          }
          last = m.index + t.length;
        }
        out += raw.slice(last);
        html += out + ' ';
      } else {
        html += raw + ' ';
      }
    });
    html += `</div></div>`;
  }

  body.innerHTML = html;
}

function getPassageArticlePlainTextLegacy() {
  const result = generatePassageArticleLegacy();
  if (!result) return '';

  let text = `=== Vocab Article (${result.words.length} unknown words) ===\n\n`;

  result.passages.forEach(p => {
    text += `【${p.title}】\n`;
    text += p.text + '\n';
    text += `Words: ${p.matchedWords.join(', ')}\n\n`;
  });

  if (result.fallback) {
    text += `【Template Words】\n`;
    text += `Words: ${result.fallback.words.map(w => w.w).join(', ')}\n`;
    result.fallback.sentences.forEach(line => {
      text += line.texts.join(' ') + ' ';
    });
    text += '\n\n';
  }

  return text;
}

const SIMPLE_ARTICLE_STYLES_V2 = [
  {
    title: 'Daily Life',
    intro: 'This is a simple day. Read slowly and notice the focus words.',
    bridge: 'These small actions happen in one easy day.',
    ending: 'Now the day feels clear and easy to remember.',
  },
  {
    title: 'Short Dialogue',
    intro: 'Two friends are talking. Their words are short and simple.',
    bridge: 'They keep the talk easy, so the new words stand out.',
    ending: 'After the talk, the new words feel more familiar.',
  },
  {
    title: 'Small Story',
    intro: 'This is a tiny story with only a few steps.',
    bridge: 'Each new line adds one more clear idea.',
    ending: 'At the end, the learner remembers the key words better.',
  },
];

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ensureSentence(text, fallback) {
  const raw = String(text || '').trim() || fallback;
  if (!raw) return '';
  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}

function buildArticleExampleV2(word) {
  if (word && word.ex) return ensureSentence(word.ex, '');
  return ensureSentence(`This word is ${word ? word.w : 'useful'}`, 'This word is useful.');
}

function buildArticleHintV2(word) {
  const hint = word && word.zh ? word.zh : (word && word.en ? word.en : 'remember this word');
  return `${word.w} (${hint})`;
}

function buildArticleGroupsV2(words) {
  if (words.length === 0) return [[], [], []];
  if (words.length === 1) return [[words[0]], [words[0]], [words[0]]];
  if (words.length === 2) {
    return [
      [words[0], words[1]],
      [words[1], words[0]],
      [words[0], words[1]],
    ];
  }

  const groups = [[], [], []];
  words.forEach((word, idx) => {
    groups[idx % 3].push(word);
  });
  groups.forEach((group, idx) => {
    if (group.length === 0) group.push(words[idx % words.length]);
  });
  return groups;
}

function chunkWordsForArticlesV2(words, chunkSize) {
  const groups = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    groups.push(words.slice(i, i + chunkSize));
  }
  return groups;
}

function buildSimpleArticleV2(style, words, index) {
  const examples = words.map(buildArticleExampleV2);
  const lines = [style.intro];

  if (examples[0]) lines.push(examples[0]);
  if (style.bridge) lines.push(style.bridge);
  if (examples[1]) lines.push(examples[1]);
  if (examples[2]) lines.push(examples[2]);
  if (style.ending) lines.push(style.ending);

  return {
    id: `article-${index + 1}`,
    title: `Article ${index + 1} · ${style.title}`,
    text: lines.join(' '),
    focusWords: words,
    summaryZh: `中文提示：重点词有 ${words.map(buildArticleHintV2).join('、')}。`,
    quizQuestions: buildArticleQuizV2(words),
  };
}

function getQuizDistractorsV2(correctWord, count) {
  return shuffleArray(
    WORDS.filter(w => w.w !== correctWord.w && w.zh !== correctWord.zh)
  ).slice(0, count);
}

function buildArticleQuizV2(words) {
  if (!words.length) return [];

  const questions = [];
  const mainWord = words[0];
  const meaningChoices = shuffleArray([
    { label: mainWord.zh, correct: true },
    ...getQuizDistractorsV2(mainWord, 2).map(w => ({ label: w.zh, correct: false })),
  ]);
  questions.push({
    prompt: `What is the meaning of "${mainWord.w}"?`,
    choices: meaningChoices,
    answer: mainWord.zh,
    word: mainWord.w,
  });

  if (words.length > 1) {
    const secondWord = words[1];
    const wordChoices = shuffleArray([
      { label: secondWord.w, correct: true },
      ...getQuizDistractorsV2(secondWord, 2).map(w => ({ label: w.w, correct: false })),
    ]);
    questions.push({
      prompt: `Which word did you see in this article?`,
      choices: wordChoices,
      answer: secondWord.w,
      word: secondWord.w,
    });
  }

  return questions;
}

function highlightArticleTextV2(text, focusWords) {
  const wordRegex = /[a-zA-Z]+/g;
  let lastIndex = 0;
  let highlighted = '';
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    highlighted += text.slice(lastIndex, match.index);
    const token = match[0];
    let isMatch = false;
    for (const word of focusWords) {
      const esc = word.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^${esc}(?:es|ed|ing|er|est|ly|s)?$`, 'i');
      if (re.test(token)) {
        isMatch = true;
        break;
      }
    }
    if (isMatch) {
      highlighted += `<span class="hl speak-text" data-text="${escapeAttr(token)}" data-rate="0.85" title="${token}">${token}</span>`;
    } else {
      highlighted += token;
    }
    lastIndex = match.index + token.length;
  }

  highlighted += text.slice(lastIndex);
  return highlighted;
}

function rankWordsForArticles(words) {
  return [...words].sort((a, b) => {
    const sa = getWordStats(a.w);
    const sb = getWordStats(b.w);
    const scoreA = sa.masteryScore + sa.flashCorrect + sa.quizCorrect - (sa.flashWrong + sa.quizWrong) * 2;
    const scoreB = sb.masteryScore + sb.flashCorrect + sb.quizCorrect - (sb.flashWrong + sb.quizWrong) * 2;
    if (scoreA !== scoreB) return scoreA - scoreB;
    const dueA = isWordDue(a.w) ? 0 : 1;
    const dueB = isWordDue(b.w) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    if (sa.generatedAt !== sb.generatedAt) return sa.generatedAt - sb.generatedAt;
    return a.w.localeCompare(b.w);
  });
}

function getArticleSourceWords(mode = articleMode) {
  if (mode === 'selected') return getSelectedArticleWordObjects();
  return getAutoArticleWordObjects();
}

function generateArticlePackage(mode = articleMode) {
  const words = getArticleSourceWords(mode);
  if (words.length === 0) return null;

  const ranked = rankWordsForArticles(words);
  const groups = chunkWordsForArticlesV2(ranked, 3);
  const articles = groups.map((group, idx) => {
    const style = SIMPLE_ARTICLE_STYLES_V2[idx % SIMPLE_ARTICLE_STYLES_V2.length];
    return buildSimpleArticleV2(style, group, idx);
  });

  markWordsGenerated(words);
  return {
    version: ARTICLE_ENGINE_VERSION,
    createdAt: Date.now(),
    unknownSignature: mode === 'selected' ? `selected:${getSelectedArticleWordsSignature()}` : `auto:${words.map(w => w.w).sort().join('|')}`,
    sourceMode: mode,
    words: words.map(w => w.w),
    articleCount: articles.length,
    articles,
  };
}

function ensureArticlePackage(force = false, mode = articleMode) {
  const sourceWords = getArticleSourceWords(mode);
  if (sourceWords.length === 0) {
    articlePackageCache = null;
    return null;
  }
  const signature = mode === 'selected'
    ? `selected:${getSelectedArticleWordsSignature()}`
    : `auto:${sourceWords.map(w => w.w).sort().join('|')}`;

  if (!force && articlePackageCache && articlePackageCache.version === ARTICLE_ENGINE_VERSION && articlePackageCache.unknownSignature === signature) {
    return articlePackageCache;
  }

  const stored = !force ? loadArticlePackageFromStorage() : null;
  if (stored && stored.unknownSignature === signature) {
    articlePackageCache = stored;
    return stored;
  }

  const generated = generateArticlePackage(mode);
  if (!generated) return null;
  saveArticlePackageToStorage(generated);
  return generated;
}

function generateArticle() {
  return ensureArticlePackage(false, articleMode);
}

function closeArticle() {
  stopSpeaking();
  document.getElementById('article-overlay').hidden = true;
  document.body.style.overflow = '';
}

function updateVocabBadge() {
  updateArticleEntryState();
}

function updateArticleEntryState() {
  const badge = document.getElementById('vocab-badge');
  const autoCount = getAutoArticleWordObjects().length;
  if (badge) badge.textContent = autoCount;

  const btn = document.getElementById('vocab-btn');
  if (btn) {
    const selectedCount = selectedArticleWords.size;
    btn.title = selectedCount > 0
      ? `Auto review uses ${autoCount} weak words. You also selected ${selectedCount} words for custom articles.`
      : `Auto review uses ${autoCount} weak words.`;
  }

  updateArticleModeState();
}

function renderArticle() {
  const body = document.getElementById('article-body');
  const meta = document.getElementById('article-meta');
  const pageIndicator = document.getElementById('article-page-indicator');
  const prevBtn = document.getElementById('article-prev-btn');
  const nextBtn = document.getElementById('article-next-btn');
  updateArticleModeState();
  const result = generateArticle();

  if (!result) {
    meta.textContent = articleMode === 'selected' ? '0 selected words' : '0 review words';
    pageIndicator.textContent = 'Page 1 / 1';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    const emptyTitle = articleMode === 'selected' ? 'No Selected Words Yet' : 'No Review Words Yet';
    const emptyDesc = articleMode === 'selected'
      ? 'Pick a few words on the cards with "加入短文", then come back here.'
      : 'Words you mark as unknown, keep getting wrong, or reach review time will appear here automatically.';
    const emptyHint = articleMode === 'selected'
      ? 'Selected mode is for custom articles from your own word list.'
      : 'Use the "Don\'t Know" button, spelling mistakes, or choice mistakes to send words into article reinforcement.';
    body.innerHTML = `
      <div class="article-empty">
        <h3>${emptyTitle}</h3>
        <p>${emptyDesc}</p>
        <p>${emptyHint}</p>
      </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(result.articles.length / ARTICLE_PAGE_SIZE));
  articlePageIndex = Math.min(articlePageIndex, totalPages - 1);
  const pageStart = articlePageIndex * ARTICLE_PAGE_SIZE;
  const visibleArticles = result.articles.slice(pageStart, pageStart + ARTICLE_PAGE_SIZE);

  meta.textContent = `${result.words.length} ${result.sourceMode === 'selected' ? 'selected words' : 'review words'} · ${result.articles.length} simple articles`;
  pageIndicator.textContent = `Page ${articlePageIndex + 1} / ${totalPages}`;
  prevBtn.disabled = articlePageIndex === 0;
  nextBtn.disabled = articlePageIndex >= totalPages - 1;

  let html = '';
  visibleArticles.forEach(article => {
    html += `<div class="article-section">
      <div class="article-section-header">
        <div class="article-section-title">${article.title}</div>
        <button class="article-speak-btn speak-text" data-text="${escapeAttr(article.text)}" data-rate="0.9" aria-label="Read this passage">
          Read Aloud
        </button>
      </div>
      <div class="article-paragraph">${highlightArticleTextV2(article.text, article.focusWords)}</div>
      <div class="article-word-list" style="margin-top:8px">
        ${article.focusWords.map(w => `<span class="article-word-tag speak-text" data-text="${escapeAttr(w.w)}" data-rate="0.85"><span class="tw">${w.w}</span><span class="tz">${w.zh}</span></span>`).join('')}
      </div>
      <div class="article-zh-paragraph">${article.summaryZh}</div>
      <div class="article-quiz-list">
        ${article.quizQuestions.map((q, qIdx) => `<div class="article-quiz" data-quiz-index="${qIdx}" data-word="${escapeAttr(q.word || '')}">
          <div class="article-quiz-question">${q.prompt}</div>
          <div class="article-quiz-options">
            ${q.choices.map(choice => `<button class="article-quiz-option" type="button" data-correct="${choice.correct ? '1' : '0'}">${escapeHtml(choice.label)}</button>`).join('')}
          </div>
          <div class="article-quiz-feedback" hidden>Answer: ${escapeHtml(q.answer)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  });

  body.innerHTML = html;
}

function getArticlePlainText() {
  const result = generateArticle();
  if (!result) return '';

  let text = `=== Vocab Article (${result.words.length} ${result.sourceMode === 'selected' ? 'selected words' : 'review words'}) ===\n`;
  text += `Mode: multiple simple articles\n`;
  text += '\n';

  result.articles.forEach(article => {
    text += `[${article.title}]\n`;
    text += `${article.text}\n`;
    text += `${article.summaryZh}\n`;
    text += `Focus words: ${article.focusWords.map(w => `${w.w} (${w.zh})`).join(', ')}\n\n`;
    article.quizQuestions.forEach((q, idx) => {
      text += `Q${idx + 1}: ${q.prompt}\n`;
      text += `Answer: ${q.answer}\n`;
    });
    text += '\n';
  });

  return text;
}

function openArticle(mode = 'auto') {
  articleMode = mode;
  articlePageIndex = 0;
  ensureArticlePackage(false, articleMode);
  renderArticle();
  document.getElementById('article-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

// ====== INIT ======
loadUnknownWords();
loadLearningActivity();
loadSelectedArticleWords();
loadArticleWordStats();
ensureArticlePackage(false, articleMode);
renderPills();
renderSections();
renderCards(WORDS);
renderStats();
updateArticleEntryState();
setupEvents();
