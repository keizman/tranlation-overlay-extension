/**
 * 文本处理工具函数
 */

import { Replacement } from '../../shared/types/api';

/**
 * 检查两个位置范围是否重叠
 */
function rangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * 为替换项添加位置信息
 * 不依赖 LLM 返回顺序，独立查找每个词的位置
 */
export function addPositionsToReplacements(
  originalText: string,
  replacements: Array<{ original: string; translation: string }>,
): Replacement[] {
  const result: Replacement[] = [];
  const usedRanges: Array<{ start: number; end: number }> = [];

  console.log(
    `[TranslationDebug] 原文长度:${originalText.length}, 替换项:${replacements.length}`,
  );

  for (const rep of replacements) {
    if (!rep.original || !rep.translation) continue;

    // 查找所有出现的位置，选择第一个未被占用的
    let searchStart = 0;
    let foundPosition: { start: number; end: number } | null = null;

    while (searchStart < originalText.length) {
      const index = originalText.indexOf(rep.original, searchStart);
      if (index === -1) break;

      const candidateStart = index;
      const candidateEnd = index + rep.original.length;

      // 检查是否与已使用的范围重叠
      const hasOverlap = usedRanges.some((range) =>
        rangesOverlap(candidateStart, candidateEnd, range.start, range.end),
      );

      if (!hasOverlap) {
        // 验证找到的文本确实匹配
        const foundText = originalText.substring(candidateStart, candidateEnd);
        if (foundText === rep.original) {
          foundPosition = { start: candidateStart, end: candidateEnd };
          break;
        }
      }

      // 继续搜索下一个出现位置
      searchStart = index + 1;
    }

    if (foundPosition) {
      result.push({
        ...rep,
        position: foundPosition,
        isNew: true,
      });
      usedRanges.push(foundPosition);
    } else {
      console.warn(
        `[textUtils] 无法找到未被占用的位置: "${rep.original}" -> "${rep.translation}"`,
      );
    }
  }

  result.sort((a, b) => a.position.start - b.position.start);
  return result;
}
