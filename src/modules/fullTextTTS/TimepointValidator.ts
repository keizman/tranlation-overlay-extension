/**
 * Timepoint 验证器
 * TimepointValidator - 验证 API 返回的 timepoints 并提供 fallback 估算
 *
 * 验证逻辑：
 * 1. 检查 timepoints 是否为空
 * 2. 检查 timeSeconds 是否有效 (非负、非 NaN、不超过音频时长)
 * 3. 检查 timepoints 是否严格递增
 * 4. 检查数量是否匹配预期
 *
 * Fallback 估算：
 * - 使用 audioDuration / totalWords 计算每词时长
 * - 累计计算每个句子的起始时间
 */

import type {
  TTSTimepoint,
  SentenceInfo,
  TimepointValidation,
} from '../shared/types/fullTextTTS';
import {
  DEFAULT_WPM,
  DRIFT_THRESHOLD_SINGLE,
  DRIFT_THRESHOLD_CUMULATIVE,
} from './constants';
import { createModuleLogger } from '../shared/utils/DebugLogger';

const logger = createModuleLogger('TimepointValidator');

/**
 * 验证 timepoints 的有效性
 * @param timepoints API 返回的时间点
 * @param expectedMarkCount 预期的 mark 数量
 * @param audioDuration 音频总时长 (秒)
 * @param sentences 句子列表 (用于 fallback 估算)
 * @returns 验证结果
 */
export function validateTimepoints(
  timepoints: TTSTimepoint[] | undefined,
  expectedMarkCount: number,
  audioDuration: number,
  sentences: SentenceInfo[],
): TimepointValidation {
  // 1. 检查 timepoints 是否为空
  if (!timepoints || timepoints.length === 0) {
    logger.warn('timepoints 为空，使用 fallback 估算');
    return {
      isValid: false,
      invalidReason: 'timepoints 为空',
      fallbackTimes: estimateSentenceTimes(sentences, audioDuration),
      useFallback: true,
    };
  }

  // 2. 检查数量是否明显不匹配
  if (timepoints.length < expectedMarkCount * 0.5) {
    logger.warn(
      `timepoints 数量不匹配: 预期 ${expectedMarkCount}, 实际 ${timepoints.length}`,
    );
    return {
      isValid: false,
      invalidReason: `数量不匹配 (预期 ${expectedMarkCount}, 实际 ${timepoints.length})`,
      fallbackTimes: estimateSentenceTimes(sentences, audioDuration),
      useFallback: true,
    };
  }

  // 3. 检查每个 timepoint 的有效性
  let previousTime = -1;
  for (let i = 0; i < timepoints.length; i++) {
    const tp = timepoints[i];

    // 检查 timeSeconds 是否有效
    if (
      tp.timeSeconds === undefined ||
      tp.timeSeconds === null ||
      isNaN(tp.timeSeconds) ||
      tp.timeSeconds < 0
    ) {
      logger.warn(`timepoint[${i}] 无效: timeSeconds=${tp.timeSeconds}`);
      return {
        isValid: false,
        invalidReason: `timepoint[${i}] 无效值: ${tp.timeSeconds}`,
        fallbackTimes: estimateSentenceTimes(sentences, audioDuration),
        useFallback: true,
      };
    }

    // 检查是否超过音频时长 (+0.5s 容差)
    if (tp.timeSeconds > audioDuration + 0.5) {
      logger.warn(
        `timepoint[${i}] 超过音频时长: ${tp.timeSeconds} > ${audioDuration}`,
      );
      return {
        isValid: false,
        invalidReason: `timepoint 超过音频时长`,
        fallbackTimes: estimateSentenceTimes(sentences, audioDuration),
        useFallback: true,
      };
    }

    // 检查是否严格递增
    if (tp.timeSeconds < previousTime) {
      logger.warn(
        `timepoints 顺序错乱: [${i - 1}]=${previousTime}, [${i}]=${tp.timeSeconds}`,
      );
      return {
        isValid: false,
        invalidReason: 'timepoints 顺序错乱',
        fallbackTimes: estimateSentenceTimes(sentences, audioDuration),
        useFallback: true,
      };
    }

    previousTime = tp.timeSeconds;
  }

  // 所有检查通过
  logger.log(`timepoints 验证通过: ${timepoints.length} 个有效 mark`);
  return {
    isValid: true,
    useFallback: false,
  };
}

/**
 * 估算句子时间 (Fallback 方案)
 * 使用 audioDuration / totalWords 计算每词平均时长
 * @param sentences 句子列表
 * @param audioDuration 音频总时长 (秒)
 * @returns 每个句子的起始时间数组
 */
export function estimateSentenceTimes(
  sentences: SentenceInfo[],
  audioDuration: number,
): number[] {
  if (sentences.length === 0) {
    return [];
  }

  // 计算总词数
  const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);

  // 计算每词平均时长
  const perWordDuration =
    totalWords > 0 ? audioDuration / totalWords : 60 / DEFAULT_WPM;

  logger.log(
    `Fallback 估算: 总词数=${totalWords}, 每词时长=${perWordDuration.toFixed(3)}s`,
  );

  // 累计计算每个句子的起始时间
  const times: number[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    times.push(cumulativeTime);
    // 下一个句子的起始时间 = 当前起始 + 当前句子时长
    cumulativeTime += sentences[i].wordCount * perWordDuration;
  }

  return times;
}

/**
 * 动态 Drift 检测器
 * 在播放过程中检测实时 drift
 */
export class DriftDetector {
  private cumulativeDrift: number = 0;
  private lastCheckTime: number = 0;
  private fallbackTriggered: boolean = false;

  /**
   * 检查当前播放时间是否与预期 timepoint 匹配
   * @param currentTime 当前播放时间 (秒)
   * @param expectedTime 预期的 timepoint 时间 (秒)
   * @returns 是否应该切换到 fallback
   */
  checkDrift(currentTime: number, expectedTime: number): boolean {
    if (this.fallbackTriggered) {
      return true;
    }

    const drift = Math.abs(currentTime - expectedTime);

    // 检查单点 drift
    if (drift > DRIFT_THRESHOLD_SINGLE) {
      logger.warn(
        `单点 drift 过大: ${drift.toFixed(2)}s > ${DRIFT_THRESHOLD_SINGLE}s`,
      );
      this.fallbackTriggered = true;
      return true;
    }

    // 累计 drift
    this.cumulativeDrift += drift;
    if (this.cumulativeDrift > DRIFT_THRESHOLD_CUMULATIVE) {
      logger.warn(
        `累计 drift 过大: ${this.cumulativeDrift.toFixed(2)}s > ${DRIFT_THRESHOLD_CUMULATIVE}s`,
      );
      this.fallbackTriggered = true;
      return true;
    }

    return false;
  }

  /**
   * 重置检测器
   */
  reset(): void {
    this.cumulativeDrift = 0;
    this.lastCheckTime = 0;
    this.fallbackTriggered = false;
  }

  /**
   * 检查是否已触发 fallback
   */
  isFallbackTriggered(): boolean {
    return this.fallbackTriggered;
  }
}

/**
 * 全局 DriftDetector 实例
 */
let driftDetectorInstance: DriftDetector | null = null;

/**
 * 获取 DriftDetector 单例
 */
export function getDriftDetector(): DriftDetector {
  if (!driftDetectorInstance) {
    driftDetectorInstance = new DriftDetector();
  }
  return driftDetectorInstance;
}

/**
 * 重置 DriftDetector
 */
export function resetDriftDetector(): void {
  if (driftDetectorInstance) {
    driftDetectorInstance.reset();
  }
}
