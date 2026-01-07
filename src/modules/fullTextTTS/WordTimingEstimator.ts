/**
 * 单词时间估算器
 * WordTimingEstimator - 纯函数，根据句子时长和文本估算每个单词的起始时间
 *
 * 输入：
 * - sentenceText: 句子文本
 * - sentenceDuration: 句子总时长 (秒)
 *
 * 输出：
 * - 词起始时间数组 (相对句子起始，如 [0, 0.35, 0.72, ...])
 *
 * 估算规则：
 * 1. 基线：sentenceDuration / wordCount = basePerWord
 * 2. 加权调整：
 *    - 词长 >6 字符 +25% 时长
 *    - 句首词 +10%，句尾词 -5%
 *    - 词后逗号/分号 +150ms 停顿
 *    - 词后冒号 +100ms 停顿
 * 3. 归一化：所有 perWord 总和 = sentenceDuration（防止积累误差）
 */

import { createModuleLogger } from '../shared/utils/DebugLogger';

const logger = createModuleLogger('WordTimingEstimator');

/**
 * 单词信息 (内部使用)
 */
interface WordInfo {
  word: string;
  rawWeight: number; // 原始权重
  normalizedDuration: number; // 归一化后的时长
  startTime: number; // 相对起始时间
}

/**
 * 单词估算结果
 */
export interface WordTiming {
  word: string;
  startTime: number; // 相对句子起始的时间 (秒)
  duration: number; // 估算的单词时长 (秒)
  charOffset: number; // 在句子中的字符偏移
}

/**
 * 停顿标点及其额外时长 (秒)
 */
const PUNCTUATION_PAUSES: Record<string, number> = {
  ',': 0.15, // 逗号 150ms
  ';': 0.15, // 分号 150ms
  ':': 0.1, // 冒号 100ms
  '—': 0.12, // 破折号 120ms
  '-': 0.05, // 连字符 50ms
  '...': 0.2, // 省略号 200ms
  '…': 0.2, // 省略号 200ms
};

/**
 * 长词阈值 (超过此字符数的词需要更长时间)
 */
const LONG_WORD_THRESHOLD = 6;

/**
 * 长词额外时长系数 (25% 增加)
 */
const LONG_WORD_MULTIPLIER = 1.25;

/**
 * 句首词额外时长系数 (10% 增加)
 */
const SENTENCE_START_MULTIPLIER = 1.1;

/**
 * 句尾词减少时长系数 (5% 减少)
 */
const SENTENCE_END_MULTIPLIER = 0.95;

/**
 * 估算句子中每个单词的起始时间
 * 纯函数，不依赖 timepoints 或 fallback 判断
 *
 * @param sentenceText 句子文本
 * @param sentenceDuration 句子总时长 (秒)
 * @returns 词起始时间数组
 */
export function estimateWordTimings(
  sentenceText: string,
  sentenceDuration: number,
): WordTiming[] {
  if (!sentenceText.trim() || sentenceDuration <= 0) {
    return [];
  }

  // 1. 分词并计算字符偏移
  const words = extractWords(sentenceText);
  if (words.length === 0) {
    return [];
  }

  // 2. 计算每个词的原始权重
  const wordInfos: WordInfo[] = words.map((w, index) => ({
    word: w.word,
    rawWeight: calculateWordWeight(w.word, index, words.length),
    normalizedDuration: 0,
    startTime: 0,
  }));

  // 3. 计算总权重
  const totalWeight = wordInfos.reduce((sum, w) => sum + w.rawWeight, 0);

  // 4. 归一化：分配时长使总和 = sentenceDuration
  let accumulatedTime = 0;
  for (let i = 0; i < wordInfos.length; i++) {
    wordInfos[i].normalizedDuration =
      (wordInfos[i].rawWeight / totalWeight) * sentenceDuration;
    wordInfos[i].startTime = accumulatedTime;
    accumulatedTime += wordInfos[i].normalizedDuration;
  }

  // 5. 构建结果
  const result: WordTiming[] = wordInfos.map((info, index) => ({
    word: info.word,
    startTime: info.startTime,
    duration: info.normalizedDuration,
    charOffset: words[index].charOffset,
  }));

  logger.log(
    `估算 ${words.length} 个词时间, 句时长=${sentenceDuration.toFixed(2)}s`,
  );

  return result;
}

/**
 * 从文本中提取单词及其字符偏移
 */
function extractWords(text: string): { word: string; charOffset: number }[] {
  const words: { word: string; charOffset: number }[] = [];
  // 匹配单词（包括后面可能跟着的标点）
  const wordRegex = /\S+/g;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      charOffset: match.index,
    });
  }

  return words;
}

/**
 * 计算单个词的权重
 *
 * @param word 单词文本 (可能包含标点)
 * @param index 在句子中的索引
 * @param totalWords 句子总词数
 * @returns 权重值 (基线 1.0)
 */
function calculateWordWeight(
  word: string,
  index: number,
  totalWords: number,
): number {
  let weight = 1.0;

  // 提取纯单词（去除标点）用于长度计算
  const pureWord = word.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');

  // 1. 词长调整：长词 +25%
  if (pureWord.length > LONG_WORD_THRESHOLD) {
    weight *= LONG_WORD_MULTIPLIER;
  }

  // 2. 位置调整
  if (index === 0) {
    // 句首词 +10%
    weight *= SENTENCE_START_MULTIPLIER;
  } else if (index === totalWords - 1) {
    // 句尾词 -5%
    weight *= SENTENCE_END_MULTIPLIER;
  }

  // 3. 标点停顿调整
  for (const [punct, pause] of Object.entries(PUNCTUATION_PAUSES)) {
    if (word.includes(punct)) {
      // 将停顿时间转换为权重（假设基线每词 400ms）
      weight += pause / 0.4;
      break; // 只计算一个标点
    }
  }

  return weight;
}

/**
 * 合并句子级时间和词级时间，生成全局词起始时间
 *
 * @param sentences 句子列表，每个包含 startTime 和 wordTimings
 * @returns 全局词起始时间数组
 */
export function mergeToGlobalTimings(
  sentences: {
    sentenceStartTime: number;
    wordTimings: WordTiming[];
    globalCharOffset: number;
  }[],
): { word: string; globalStartTime: number; globalCharOffset: number }[] {
  const result: {
    word: string;
    globalStartTime: number;
    globalCharOffset: number;
  }[] = [];

  for (const sentence of sentences) {
    for (const wordTiming of sentence.wordTimings) {
      result.push({
        word: wordTiming.word,
        globalStartTime: sentence.sentenceStartTime + wordTiming.startTime,
        globalCharOffset: sentence.globalCharOffset + wordTiming.charOffset,
      });
    }
  }

  return result;
}

/**
 * 根据当前播放时间查找应高亮的词索引
 *
 * @param currentTime 当前播放时间 (秒)
 * @param wordTimings 全局词时间数组
 * @returns 当前应高亮的词索引，-1 表示未开始
 */
export function findCurrentWordIndex(
  currentTime: number,
  wordTimings: { globalStartTime: number }[],
): number {
  if (wordTimings.length === 0 || currentTime < 0) {
    return -1;
  }

  // 二分查找最后一个 startTime <= currentTime 的词
  let left = 0;
  let right = wordTimings.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (wordTimings[mid].globalStartTime <= currentTime) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}
