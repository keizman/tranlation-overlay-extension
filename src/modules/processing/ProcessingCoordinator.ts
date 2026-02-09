/**
 * 处理协调器
 * 负责协调所有文本处理请求，确保原子性处理和无重复处理
 */

import {
  ContentSegment,
  globalProcessingState,
} from './ProcessingStateManager';
import {
  OriginalWordDisplayMode,
  TranslationPosition,
} from '../shared/types/core';
import { createModuleLogger } from '../shared/utils/DebugLogger';
import { httpClient } from '../auth/RequestInterceptor';

const wordTTSLog = createModuleLogger('WordTTS');

const GOOGLE_TTS_ENDPOINT = '/translate_tts';

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}

// ==================== AudioContext 单例管理 ====================

/**
 * 全局 AudioContext 单例
 * 避免每次播放都创建/销毁，减少音频系统初始化开销
 */
let globalAudioContext: AudioContext | null = null;
let isAudioContextWarmedUp = false;

// ==================== Word TTS 单例锁状态 ====================

/**
 * Word TTS 播放状态
 * 用于防止重复点击导致多次请求
 */
let isWordTTSPlaying = false;
let currentWordTTSUrl: string | null = null;
let currentWordTTSSource: AudioBufferSourceNode | null = null;

/**
 * 停止当前 Word TTS 播放
 */
function stopCurrentWordTTS(): void {
  if (currentWordTTSSource) {
    try {
      currentWordTTSSource.stop();
      wordTTSLog.log('已停止当前 Word TTS 播放');
    } catch (_e) {
      // 可能已停止，忽略错误
    }
    currentWordTTSSource = null;
  }
  isWordTTSPlaying = false;
  currentWordTTSUrl = null;
}

// ==================== 页面可见性监听 ====================

/**
 * 页面可见性变化时自动恢复 AudioContext
 * 解决后台标签页返回后音频失效的问题
 */
let isVisibilityListenerSetup = false;

function setupVisibilityListener(): void {
  if (isVisibilityListenerSetup) return;
  isVisibilityListenerSetup = true;

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      wordTTSLog.log('页面恢复可见，检查 AudioContext 状态...');
      try {
        const ctx = getGlobalAudioContext();
        if (ctx.state === 'suspended') {
          wordTTSLog.log('AudioContext 被挂起，正在恢复...');
          await ctx.resume();
          wordTTSLog.log('AudioContext 已恢复, state:', ctx.state);
        }
      } catch (err) {
        wordTTSLog.warn('恢复 AudioContext 失败:', err);
      }
    }
  });

  wordTTSLog.log('页面可见性监听已设置');
}

/**
 * 获取全局 AudioContext 单例
 * 如果不存在则创建，如果已关闭则重新创建
 */
function getGlobalAudioContext(): AudioContext {
  if (!globalAudioContext || globalAudioContext.state === 'closed') {
    // 如果 AudioContext 被关闭，重置预热状态
    if (globalAudioContext?.state === 'closed') {
      wordTTSLog.log('AudioContext 已关闭，重建并重置预热状态');
      isAudioContextWarmedUp = false;
    }

    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported');
    }
    const newContext = new AudioContextClass();
    globalAudioContext = newContext;
    wordTTSLog.log('AudioContext 单例已创建, state:', newContext.state);
    return newContext;
  }
  return globalAudioContext;
}

/**
 * 预热 Word TTS 音频系统（单例版本）
 * 只在首次调用时真正预热，后续调用只确保 AudioContext 处于运行状态
 */
async function warmUpWordTTSAudio(): Promise<void> {
  try {
    const audioContext = getGlobalAudioContext();

    // 如果 AudioContext 被挂起（常见于移动端），需要恢复
    if (audioContext.state === 'suspended') {
      wordTTSLog.log('AudioContext 被挂起，正在恢复...');
      await audioContext.resume();
      wordTTSLog.log('AudioContext 已恢复, state:', audioContext.state);
    }

    // 只在首次预热时播放静音音频
    if (!isAudioContextWarmedUp) {
      wordTTSLog.log('首次预热音频系统...');

      // 播放一段极短的静音来激活音频管道
      const buffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 0.01,
        audioContext.sampleRate,
      ); // 10ms 静音
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);

      isAudioContextWarmedUp = true;
      wordTTSLog.log('🔊 音频系统预热完成');
    }
  } catch (err) {
    wordTTSLog.warn('音频预热失败:', err);
  }
}

/**
 * 使用 Web Audio API 播放音频 Blob
 * 比 HTML5 Audio 元素有更低的延迟和更精细的控制
 * @returns AudioBufferSourceNode 引用，用于停止播放
 */
async function playWordTTSAudio(blob: Blob): Promise<AudioBufferSourceNode> {
  const audioContext = getGlobalAudioContext();

  // 确保 AudioContext 处于运行状态
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  // 将 Blob 转换为 ArrayBuffer
  const arrayBuffer = await blob.arrayBuffer();

  // 解码音频数据
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // 创建音频源并播放
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  // 存储到全局引用
  currentWordTTSSource = source;

  source.onended = () => {
    wordTTSLog.log('Web Audio API 播放结束');
    // 播放结束后重置状态
    isWordTTSPlaying = false;
    currentWordTTSUrl = null;
    currentWordTTSSource = null;
  };

  source.start(0);
  wordTTSLog.log('Web Audio API 开始播放');

  return source;
}

// Word TTS 事件委托是否已设置
let isWordTTSEventDelegationSetup = false;

/**
 * 设置 Word TTS 事件委托
 * 使用 document 级别的事件监听，这样即使 DOM 被修改（如 WordHighlighter），
 * 点击事件仍然能被捕获并处理
 *
 * 单例锁逻辑:
 * 1. 如果正在播放同一 URL，忽略点击
 * 2. 如果正在播放不同 URL，停止当前并播放新的
 * 3. 如果空闲，开始新播放
 */
function setupWordTTSEventDelegation(): void {
  if (isWordTTSEventDelegationSetup) return;
  isWordTTSEventDelegationSetup = true;

  // 同时设置页面可见性监听
  setupVisibilityListener();

  document.addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement;

      // 使用 closest 查找最近的 wxt-original-word 元素
      const wordElement = target.closest(
        '.wxt-original-word',
      ) as HTMLElement | null;

      if (!wordElement) return;

      // 找到了 Word TTS 目标元素
      e.preventDefault();
      e.stopPropagation();

      const wordToSpeak =
        wordElement.getAttribute('data-wxt-original-word') ||
        wordElement.textContent ||
        '';
      if (!wordToSpeak) return;

      const params = new URLSearchParams({
        ie: 'UTF-8',
        client: 'gtx',
        tl: 'en-US',
        q: wordToSpeak,
      });
      const audioUrl = `${GOOGLE_TTS_ENDPOINT}?${params.toString()}`;

      if (isWordTTSPlaying) {
        if (currentWordTTSUrl === audioUrl) {
          // 正在播放同一单词，忽略重复点击
          wordTTSLog.log('忽略重复点击，同一单词正在播放:', wordToSpeak);
          return;
        } else {
          // 正在播放不同单词，停止当前播放
          wordTTSLog.log('切换到新单词，停止当前播放:', wordToSpeak);
          stopCurrentWordTTS();
        }
      }

      // 标记正在播放
      isWordTTSPlaying = true;
      currentWordTTSUrl = audioUrl;
      wordTTSLog.log('Word TTS (委托):', {
        text: wordToSpeak,
        audioUrl,
      });

      try {
        await warmUpWordTTSAudio();

        wordTTSLog.log('开始 fetch...', {
          audioUrl,
          textLength: wordToSpeak.length,
        });
        const response = await httpClient.get(audioUrl);
        if (!response.ok) {
          const responseBodySnippet = await response
            .clone()
            .text()
            .then((text) => text.slice(0, 500))
            .catch(() => '');
          wordTTSLog.error('Word TTS HTTP error', {
            audioUrl,
            status: response.status,
            statusText: response.statusText,
            bodySnippet: responseBodySnippet,
          });
          stopCurrentWordTTS();
          return;
        }

        const blob = await response.blob();
        if (blob.size > 0) {
          wordTTSLog.log('下载完成', {
            audioUrl,
            blobSize: blob.size,
            contentType: response.headers.get('content-type') || '',
          });
          await playWordTTSAudio(blob);
        } else {
          wordTTSLog.error('Word TTS 响应音频为空', {
            audioUrl,
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type') || '',
          });
          stopCurrentWordTTS();
        }
      } catch (error) {
        wordTTSLog.error('Word TTS fetch failed', {
          audioUrl,
          text: wordToSpeak,
          error: serializeError(error),
        });
        stopCurrentWordTTS();
      }
    },
    true,
  ); // 使用捕获阶段，确保在其他处理器之前执行

  wordTTSLog.log('Word TTS 事件委托已设置');
}

/**
 * 处理结果接口
 */
export interface ProcessingResult {
  /** 是否成功 */
  success: boolean;
  /** 替换数量 */
  replacementCount: number;
  /** 处理的段落数量 */
  segmentCount: number;
  /** 跳过的段落数量（已处理或正在处理） */
  skippedCount: number;
  /** 错误信息 */
  error?: string;
  /** 处理耗时（毫秒） */
  duration: number;
}

/**
 * 段落处理结果
 */
interface SegmentProcessingResult {
  segment: ContentSegment;
  success: boolean;
  replacementCount: number;
  error?: string;
}

/**
 * 处理协调器
 *
 * 核心职责：
 * 1. 协调所有处理请求，确保无重复处理
 * 2. 实现原子性处理，避免并发冲突
 * 3. 提供统一的错误处理和回滚机制
 * 4. 监控处理性能和状态
 */
export class ProcessingCoordinator {
  /** 处理队列，防止并发冲突 */
  private processingQueue: Promise<any> = Promise.resolve();

  /** 发音服务 */
  private pronunciationService: any;

  /** 统计信息 */
  private stats = {
    totalProcessed: 0,
    totalSkipped: 0,
    totalErrors: 0,
    averageProcessingTime: 0,
  };

  constructor(pronunciationService?: any) {
    this.pronunciationService = pronunciationService;

    // 设置 Word TTS 事件委托（document 级别），确保即使 DOM 被修改也能正常工作
    setupWordTTSEventDelegation();
  }

  /**
   * 处理内容段落列表
   * 主要入口方法，确保所有段落按顺序处理
   */
  async processSegments(
    segments: ContentSegment[],
    textReplacer: any,
    originalWordDisplayMode: OriginalWordDisplayMode,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
    isLazyLoading: boolean = false,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    // 将处理请求加入队列，确保串行处理
    return (this.processingQueue = this.processingQueue.then(async () => {
      return this.doProcessSegments(
        segments,
        textReplacer,
        originalWordDisplayMode,
        translationPosition,
        showParentheses,
        startTime,
        isLazyLoading,
      );
    }));
  }

  /**
   * 实际的段落处理逻辑
   */
  private async doProcessSegments(
    segments: ContentSegment[],
    textReplacer: any,
    originalWordDisplayMode: OriginalWordDisplayMode,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
    startTime: number,
    isLazyLoading: boolean = false,
  ): Promise<ProcessingResult> {
    let processedCount = 0;
    let skippedCount = 0;
    let totalReplacements = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 过滤已处理和正在处理的段落
    const segmentsToProcess = segments.filter((segment) => {
      const isProcessed = globalProcessingState.isContentProcessed(
        segment.fingerprint,
      );
      const isProcessing = globalProcessingState.isContentProcessing(
        segment.fingerprint,
      );

      if (isProcessed || isProcessing) {
        skippedCount++;
        return false;
      }

      return true;
    });

    // 批量标记开始处理
    const successfullyMarked = segmentsToProcess.filter((segment) =>
      globalProcessingState.markProcessingStart(segment.fingerprint),
    );

    try {
      // 并行处理段落（但要控制并发数）
      const batchSize = 8; // 控制并发数，避免过载
      const results: SegmentProcessingResult[] = [];

      for (let i = 0; i < successfullyMarked.length; i += batchSize) {
        const batch = successfullyMarked.slice(i, i + batchSize);
        const batchPromises = batch.map((segment) =>
          this.processSingleSegment(
            segment,
            textReplacer,
            originalWordDisplayMode,
            translationPosition,
            showParentheses,
          ),
        );
        const batchResults = await Promise.allSettled(batchPromises);

        // 处理批次结果
        batchResults.forEach((result, index) => {
          const segment = batch[index];
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            const error = result.reason;
            results.push({
              segment,
              success: false,
              replacementCount: 0,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }

      // 统计结果
      results.forEach((result) => {
        if (result.success) {
          processedCount++;
          totalReplacements += result.replacementCount;

          // 标记处理完成
          globalProcessingState.markProcessingComplete(
            result.segment.fingerprint,
            result.segment.domPath,
            result.replacementCount,
            true,
          );
        } else {
          errorCount++;
          errors.push(result.error || '未知错误');

          // 标记处理失败
          globalProcessingState.markProcessingFailed(
            result.segment.fingerprint,
            result.segment.domPath,
          );
        }
      });
    } catch (globalError) {
      // 清理所有标记
      successfullyMarked.forEach((segment) => {
        globalProcessingState.markProcessingFailed(
          segment.fingerprint,
          segment.domPath,
        );
      });

      const duration = Date.now() - startTime;
      return {
        success: false,
        replacementCount: 0,
        segmentCount: 0,
        skippedCount,
        error:
          globalError instanceof Error
            ? globalError.message
            : String(globalError),
        duration,
      };
    }

    const duration = Date.now() - startTime;

    // 更新统计信息
    this.updateStats(processedCount, skippedCount, errorCount, duration);

    return {
      success: errorCount === 0,
      replacementCount: totalReplacements,
      segmentCount: processedCount,
      skippedCount,
      error: errors.length > 0 ? errors[0] : undefined,
      duration,
    };
  }

  /**
   * 处理单个段落
   */
  private async processSingleSegment(
    segment: ContentSegment,
    textReplacer: any,
    originalWordDisplayMode: OriginalWordDisplayMode,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
  ): Promise<SegmentProcessingResult> {
    try {
      // 为所有相关元素添加处理中的视觉反馈
      segment.elements.forEach((element) => {
        this.addProcessingFeedback(element);
      });

      // 调用文本替换器进行处理
      const result = await textReplacer.replaceText(segment.textContent);

      if (result && result.replacements && result.replacements.length > 0) {
        // 应用替换到DOM
        this.applyReplacements(
          segment,
          result.replacements,
          textReplacer.styleManager,
          originalWordDisplayMode,
          translationPosition,
          showParentheses,
        );

        // 立即为该段落的翻译内容添加发音功能
        if (this.pronunciationService) {
          setTimeout(() => {
            this.addPronunciationToSegment(segment);
          }, 0);
        }

        // 标记文本节点为已处理
        this.markTextNodesProcessed(segment.textNodes);

        return {
          segment,
          success: true,
          replacementCount: result.replacements.length,
        };
      } else {
        // 没有替换但处理成功
        this.markTextNodesProcessed(segment.textNodes);

        return {
          segment,
          success: true,
          replacementCount: 0,
        };
      }
    } catch (error) {
      return {
        segment,
        success: false,
        replacementCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 为所有相关元素移除处理中的视觉反馈
      segment.elements.forEach((element) => {
        this.removeProcessingFeedback(element);
      });
    }
  }

  /**
   * 应用替换到DOM
   */
  private applyReplacements(
    segment: ContentSegment,
    replacements: any[],
    styleManager: any,
    originalWordDisplayMode: OriginalWordDisplayMode,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
  ): void {
    // 重新构建文本内容以确保一致性
    const reconstructedText = segment.textNodes
      .map((node) => node.textContent || '')
      .join('');

    // ✅ 关键一致性检查
    const textMismatch = segment.textContent !== reconstructedText;
    if (textMismatch) {
      console.error('[TranslationDebug] ❌ segment与DOM不一致!', {
        segmentLen: segment.textContent?.length,
        domLen: reconstructedText.length,
      });
    }

    // 🔄 如果文本不一致，或者要确保准确性，重新计算所有位置
    // 使用当前 DOM 的实际文本内容
    const recalculatedReplacements = this.recalculatePositions(
      reconstructedText,
      replacements,
    );

    // 打印所有替换项（简洁格式）
    console.log(
      '[TranslationDebug] 替换项:',
      recalculatedReplacements
        .map((r, i) => `${i}:"${r.original}"@${r.position?.start}`)
        .join(', '),
    );

    // 直接使用重新计算的位置（recalculatePositions 已确保位置正确）
    // 按位置倒序处理（避免位置偏移影响）
    const sortedReplacements = recalculatedReplacements.sort(
      (a: any, b: any) => b.position.start - a.position.start,
    );

    for (const replacement of sortedReplacements) {
      const range = this.findRangeInTextNodes(
        segment.textNodes,
        replacement.position.start,
        replacement.position.end,
      );

      if (range) {
        this.applyReplacementToRange(
          range,
          replacement,
          styleManager,
          originalWordDisplayMode,
          translationPosition,
          showParentheses,
        );
      }
    }
  }

  /**
   * 重新计算所有替换项的位置
   * 基于当前 DOM 实际文本内容，完全重新定位
   */
  private recalculatePositions(
    currentText: string,
    replacements: any[],
  ): any[] {
    const result: any[] = [];
    const usedRanges: Array<{ start: number; end: number }> = [];

    for (const rep of replacements) {
      if (!rep.original || !rep.translation) continue;

      let searchStart = 0;
      let found = false;

      while (searchStart < currentText.length) {
        const index = currentText.indexOf(rep.original, searchStart);
        if (index === -1) break;

        const candidateStart = index;
        const candidateEnd = index + rep.original.length;

        // 检查是否与已使用的范围重叠
        const hasOverlap = usedRanges.some(
          (range) => candidateStart < range.end && range.start < candidateEnd,
        );

        if (!hasOverlap) {
          const foundText = currentText.substring(candidateStart, candidateEnd);
          if (foundText === rep.original) {
            result.push({
              ...rep,
              position: { start: candidateStart, end: candidateEnd },
            });
            usedRanges.push({ start: candidateStart, end: candidateEnd });
            found = true;
            break;
          }
        }

        searchStart = index + 1;
      }

      if (!found) {
        console.warn(`[TranslationDebug] 重计算失败: "${rep.original}"`);
      }
    }

    return result.sort((a, b) => a.position.start - b.position.start);
  }

  /**
   * 在文本节点中查找范围
   */
  private findRangeInTextNodes(
    textNodes: Text[],
    start: number,
    end: number,
  ): Range | null {
    let charCount = 0;
    let startNode: Text | null = null;
    let endNode: Text | null = null;
    let startOffset = 0;
    let endOffset = 0;

    // 构建完整文本内容用于验证
    const fullText = textNodes.map((node) => node.textContent || '').join('');

    // 验证位置边界
    if (start < 0 || end > fullText.length || start >= end) {
      return null;
    }

    for (const node of textNodes) {
      const nodeLength = node.textContent?.length || 0;

      if (startNode === null && charCount + nodeLength >= start) {
        startNode = node;
        startOffset = start - charCount;
      }

      if (endNode === null && charCount + nodeLength >= end) {
        endNode = node;
        endOffset = end - charCount;
      }

      if (startNode && endNode) break;
      charCount += nodeLength;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);

      // 验证范围内容与预期是否匹配
      const extractedText = range.toString();
      const expectedText = fullText.substring(start, end);

      if (extractedText !== expectedText) {
        return null;
      }

      return range;
    }

    return null;
  }

  /**
   * 应用单个替换到范围
   */
  private applyReplacementToRange(
    range: Range,
    replacement: any,
    styleManager: any,
    originalWordDisplayMode: OriginalWordDisplayMode,
    translationPosition: TranslationPosition,
    showParentheses: boolean,
  ): void {
    try {
      const originalWordWrapper = document.createElement('span');
      originalWordWrapper.className = 'wxt-original-word';
      originalWordWrapper.textContent = range.toString();

      // 保存原文用于TTS
      originalWordWrapper.setAttribute(
        'data-wxt-original-word',
        replacement.original,
      );
      // 添加可点击样式指示
      originalWordWrapper.style.cursor = 'pointer';

      const translationSpan = document.createElement('span');
      translationSpan.className = `wxt-translation-term ${styleManager.getCurrentStyleClass()}`;

      // 保存原文信息到DOM属性，供悬浮框系统使用
      translationSpan.setAttribute('data-original-text', replacement.original);

      // 根据新设置决定是否添加括号
      if (showParentheses) {
        translationSpan.textContent = ` (${replacement.translation}) `;
      } else {
        translationSpan.textContent = ` ${replacement.translation} `;
      }

      // 应用显示模式
      switch (originalWordDisplayMode) {
        case OriginalWordDisplayMode.HIDDEN:
          originalWordWrapper.style.display = 'none';
          break;
        case OriginalWordDisplayMode.LEARNING:
          originalWordWrapper.classList.add('wxt-original-word--learning');
          break;
      }

      // Word TTS 现在由 document 级别的事件委托处理（setupWordTTSEventDelegation）
      // 不需要在这里添加 addEventListener，这样即使 DOM 被修改也能正常工作

      // 插入替换元素
      range.surroundContents(originalWordWrapper);
      if (translationPosition === TranslationPosition.BEFORE) {
        originalWordWrapper.before(translationSpan);
      } else {
        originalWordWrapper.after(translationSpan);
      }

      // 添加视觉效果
      this.addGlowEffect(translationSpan);

      // 标记为已处理
      originalWordWrapper.setAttribute('data-wxt-word-processed', 'true');
    } catch (_) {
      // 静默处理错误
    }
  }

  /**
   * 标记文本节点为已处理
   */
  private markTextNodesProcessed(textNodes: Text[]): void {
    const timestamp = Date.now().toString();
    textNodes.forEach((node) => {
      if (node.parentElement) {
        node.parentElement.setAttribute('data-wxt-text-processed', 'true');
        node.parentElement.setAttribute('data-wxt-processed-time', timestamp);
      }
    });
  }

  /**
   * 添加处理中的视觉反馈
   */
  private addProcessingFeedback(element: Element): void {
    element.classList.add('wxt-processing');
  }

  /**
   * 移除处理中的视觉反馈
   */
  private removeProcessingFeedback(element: Element): void {
    element.classList.remove('wxt-processing');
  }

  /**
   * 添加发光效果
   */
  private addGlowEffect(element: Element): void {
    element.classList.add('wxt-glow');
    setTimeout(() => {
      element.classList.remove('wxt-glow');
    }, 800);
  }

  /**
   * 更新统计信息
   */
  private updateStats(
    processed: number,
    skipped: number,
    errors: number,
    duration: number,
  ): void {
    this.stats.totalProcessed += processed;
    this.stats.totalSkipped += skipped;
    this.stats.totalErrors += errors;

    // 更新平均处理时间
    const totalOperations = this.stats.totalProcessed + this.stats.totalErrors;
    if (totalOperations > 0) {
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime *
          (totalOperations - processed - errors) +
          duration) /
        totalOperations;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      totalSkipped: 0,
      totalErrors: 0,
      averageProcessingTime: 0,
    };
  }

  /**
   * 等待所有处理完成
   */
  async waitForCompletion(): Promise<void> {
    await this.processingQueue;
  }

  /**
   * 为单个段落的翻译内容添加发音功能
   * @param segment 内容段落
   */
  private async addPronunciationToSegment(
    segment: ContentSegment,
  ): Promise<void> {
    if (!this.pronunciationService) return;

    try {
      // 在所有相关元素中查找翻译元素
      const allTranslationElements: Element[] = [];

      for (const element of segment.elements) {
        const translationElements = element.querySelectorAll
          ? element.querySelectorAll(
              '.wxt-translation-term:not([data-pronunciation-added])',
            )
          : [];
        allTranslationElements.push(...Array.from(translationElements));
      }

      for (const element of allTranslationElements) {
        const translationText = element.textContent;
        if (translationText) {
          // 提取纯英文内容（去除括号）
          const cleanText = translationText.replace(/[()]/g, '').trim();

          // 检查是否为英文文本（支持常见标点符号和数字）
          if (
            /^[a-zA-Z0-9\s\-',.!?;:()%]+$/.test(cleanText) &&
            cleanText.length > 0
          ) {
            await this.pronunciationService.addPronunciationToElement(
              element as HTMLElement,
              cleanText,
            );

            // 标记已添加发音功能
            element.setAttribute('data-pronunciation-added', 'true');
          }
        }
      }
    } catch (_) {
      // 静默处理错误
    }
  }
}
