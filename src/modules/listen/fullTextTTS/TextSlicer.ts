/**
 * 文本切片服务
 * TextSlicer - 智能文本分割
 *
 * 切片策略：
 * 1. 段落 < 上限 → 直接使用
 * 2. 段落 > 上限 → 递归二分切片
 *    - 计算中心点 index = length / 2
 *    - 从中心向两侧寻找强语义结束符 (\n > . > ? > ! > ;)
 *    - 优先向右，其次向左
 *    - 兜底：80字符内无标点则按空格切分
 * 3. 每个 Slice 的 SSML 中在句末插入 mark 标签 (句子级别)
 *    - 在句末 .!?; 后插入 mark
 *    - 避免密集 mark 导致事件丢失
 */

import type { TextSlice, SentenceInfo } from '../../shared/types/fullTextTTS';
import {
  ENG_TTS_MAX_LENGTH,
  SPLIT_SEARCH_RANGE,
  SPLIT_DELIMITERS,
  SSML_BREAK_TIME,
} from './constants';
import { createModuleLogger } from '../../shared/utils/DebugLogger';

const logger = createModuleLogger('TextSlicer');

/**
 * 文本切片器
 */
export class TextSlicer {
  private maxLength: number;

  constructor(maxLength: number = ENG_TTS_MAX_LENGTH) {
    this.maxLength = maxLength;
  }

  /**
   * 切分文本
   * @param text 原始文本
   * @param globalOffset 全局字符偏移 (默认 0)
   * @returns 文本切片数组
   */
  slice(text: string, globalOffset: number = 0): TextSlice[] {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return [];
    }

    // 如果文本长度小于上限，直接返回
    if (trimmedText.length <= this.maxLength) {
      return [this.createSlice(trimmedText, globalOffset)];
    }

    // 递归二分切片
    return this.recursiveSplit(trimmedText, globalOffset);
  }

  /**
   * 递归二分切片
   */
  private recursiveSplit(text: string, globalOffset: number): TextSlice[] {
    if (text.length <= this.maxLength) {
      return [this.createSlice(text, globalOffset)];
    }

    // 计算中心点
    const center = Math.floor(text.length / 2);

    // 寻找最佳切分点
    const splitPoint = this.findSplitPoint(text, center);

    if (splitPoint === -1) {
      // 兜底：无法找到合适的切分点，强制在中心切分
      logger.warn('无法找到合适的切分点，强制在中心切分');
      const left = text.substring(0, center);
      const right = text.substring(center);
      return [
        ...this.recursiveSplit(left, globalOffset),
        ...this.recursiveSplit(right, globalOffset + center),
      ];
    }

    // 在切分点切分
    const left = text.substring(0, splitPoint + 1).trim();
    const right = text.substring(splitPoint + 1).trim();

    const leftSlices = this.recursiveSplit(left, globalOffset);
    const rightOffset = globalOffset + text.indexOf(right, splitPoint);
    const rightSlices = this.recursiveSplit(right, rightOffset);

    return [...leftSlices, ...rightSlices];
  }

  /**
   * 寻找最佳切分点
   * 从中心点向两侧搜索，优先级：\n > . > ? > ! > ;
   * 优先向右搜索，其次向左
   */
  private findSplitPoint(text: string, center: number): number {
    const searchRange = Math.min(
      SPLIT_SEARCH_RANGE,
      Math.floor(text.length / 2),
    );

    // 按优先级遍历分隔符
    for (const delimiter of SPLIT_DELIMITERS) {
      // 向右搜索
      for (let i = 0; i <= searchRange; i++) {
        const rightIndex = center + i;
        if (rightIndex < text.length && text[rightIndex] === delimiter) {
          return rightIndex;
        }
      }

      // 向左搜索
      for (let i = 1; i <= searchRange; i++) {
        const leftIndex = center - i;
        if (leftIndex >= 0 && text[leftIndex] === delimiter) {
          return leftIndex;
        }
      }
    }

    // 兜底：寻找最近的空格（避免切断单词）
    for (let i = 0; i <= searchRange; i++) {
      const rightIndex = center + i;
      if (rightIndex < text.length && text[rightIndex] === ' ') {
        return rightIndex;
      }

      const leftIndex = center - i;
      if (leftIndex >= 0 && text[leftIndex] === ' ') {
        return leftIndex;
      }
    }

    // 无法找到合适的切分点
    return -1;
  }

  /**
   * 创建文本切片
   */
  private createSlice(text: string, startOffset: number): TextSlice {
    // 分句 (用于词时间估算)
    const sentences = this.splitIntoSentences(text, startOffset);
    // 构建简化的 SSML (无 mark 标签)
    const ssml = this.buildSSML(text);

    logger.log(`创建切片: ${sentences.length} 句, 时长估算模式`);

    return {
      text,
      startOffset,
      endOffset: startOffset + text.length,
      ssml,
      marks: [], // 不再使用 SSML marks
      sentences,
    };
  }

  /**
   * 分句
   * 按句末标点 .!?; 分割文本
   */
  private splitIntoSentences(
    text: string,
    startOffset: number,
  ): SentenceInfo[] {
    const sentences: SentenceInfo[] = [];
    // 使用正则匹配句子结束符后的位置进行分割
    const sentenceRegex = /[^.!?;]*[.!?;]+/g;
    let match;
    let lastIndex = 0;

    while ((match = sentenceRegex.exec(text)) !== null) {
      const sentenceText = match[0].trim();
      if (sentenceText) {
        const sentenceStart = text.indexOf(match[0], lastIndex);
        sentences.push({
          text: sentenceText,
          startOffset: startOffset + sentenceStart,
          endOffset: startOffset + sentenceStart + match[0].length,
          wordCount: this.countWords(sentenceText),
        });
        lastIndex = sentenceStart + match[0].length;
      }
    }

    // 处理末尾没有标点的剩余文本
    const remaining = text.substring(lastIndex).trim();
    if (remaining) {
      sentences.push({
        text: remaining,
        startOffset: startOffset + lastIndex,
        endOffset: startOffset + text.length,
        wordCount: this.countWords(remaining),
      });
    }

    // 如果没有分出句子，把整个文本当作一个句子
    if (sentences.length === 0) {
      sentences.push({
        text: text,
        startOffset: startOffset,
        endOffset: startOffset + text.length,
        wordCount: this.countWords(text),
      });
    }

    return sentences;
  }

  /**
   * 统计单词数
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  /**
   * 构建 SSML 文本 (简化版本，无 mark 标签)
   */
  private buildSSML(text: string): string {
    // 转义 SSML 特殊字符
    const escapedText = this.escapeSSML(text);
    // 添加 speak 标签和开头 break
    return `<speak><break time="${SSML_BREAK_TIME}ms"/>${escapedText}</speak>`;
  }

  /**
   * 转义 SSML 特殊字符
   */
  private escapeSSML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * 单例实例
 */
let textSlicerInstance: TextSlicer | null = null;

/**
 * 获取 TextSlicer 单例
 */
export function getTextSlicer(maxLength?: number): TextSlicer {
  if (!textSlicerInstance || maxLength !== undefined) {
    textSlicerInstance = new TextSlicer(maxLength);
  }
  return textSlicerInstance;
}
