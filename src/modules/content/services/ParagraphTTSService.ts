/**
 * 段落TTS服务
 * 双击段落触发 TTS 朗读 + 逐词高亮
 * 技术：Web Speech API (静音获取词边界) + Google TTS (实际音频)
 */

import { WordHighlighter, injectTTSHighlightStyles } from './WordHighlighter';

// Google TTS 配置
const GOOGLE_TTS_BASE_URL = 'https://translate.planktonfly.com/translate_tts';
const GOOGLE_TTS_AUTH = 'Basic bXl1c2VyOjEyMzQ1NjY=';

// ============ 统一调试日志 ============
// 使用全局 DebugLogger，避免创建重复的 debug 面板
import {
  createModuleLogger,
  setDebugEnabled,
} from '../../shared/utils/DebugLogger';

const ttsLogger = createModuleLogger('ParagraphTTS');
const log = ttsLogger.log;
const warn = ttsLogger.warn;
const error = ttsLogger.error;

// DEBUG 开关 - 由配置控制
let _DEBUG_ENABLED = false;

function setTTSDebugEnabled(enabled: boolean): void {
  _DEBUG_ENABLED = enabled;
  setDebugEnabled(enabled); // 同步到全局 DebugLogger
}
// ============ 调试日志结束 ============

export interface ParagraphTTSConfig {
  minSegmentChars: number;
  maxSegmentChars: number;
  doubleClickInterval: number;
  driftThreshold: number;
  speechRate: number;
  /**
   * 总延迟时间（ms）
   * 用于同步 Web Speech 和 Google TTS
   * webSpeechStartDelay + highlightBoundaryDelay = totalHighlightDelay
   */
  totalHighlightDelay: number;
  showDebugPanel?: boolean;
}

const DEFAULT_CONFIG: ParagraphTTSConfig = {
  minSegmentChars: 20,
  maxSegmentChars: 150,
  doubleClickInterval: 400,
  driftThreshold: 500,
  speechRate: 1.0,
  totalHighlightDelay: 800, // 总延迟 1100ms，分配为 Web Speech 启动延迟 550ms + 高亮延迟 550ms
  showDebugPanel: false,
};

// ==================== AudioContext 单例管理 ====================

/**
 * 全局 AudioContext 单例
 * 避免每次播放都创建/销毁，减少音频系统初始化开销
 */
let paragraphAudioContext: AudioContext | null = null;
let isParagraphAudioWarmedUp = false;

/**
 * 获取全局 AudioContext 单例
 */
function getParagraphAudioContext(): AudioContext {
  if (!paragraphAudioContext || paragraphAudioContext.state === 'closed') {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported');
    }
    const newContext = new AudioContextClass();
    paragraphAudioContext = newContext;
    log('AudioContext 单例已创建, state:', newContext.state);
    return newContext;
  }
  return paragraphAudioContext;
}

/**
 * 预热音频系统（单例版本）
 */
async function warmUpParagraphAudio(): Promise<void> {
  try {
    const audioContext = getParagraphAudioContext();

    if (audioContext.state === 'suspended') {
      log('AudioContext 被挂起，正在恢复...');
      await audioContext.resume();
    }

    if (!isParagraphAudioWarmedUp) {
      log('首次预热音频系统...');
      const buffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 0.01,
        audioContext.sampleRate,
      );
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      isParagraphAudioWarmedUp = true;
      log('🔊 音频系统预热完成');
    }
  } catch (err) {
    warn('音频预热失败:', err);
  }
}

/**
 * 使用 Web Audio API 播放音频 Blob
 */
async function _playAudioWithWebAudioAPI(blob: Blob): Promise<void> {
  const audioContext = getParagraphAudioContext();

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);

  return new Promise((resolve) => {
    source.onended = () => {
      log('Web Audio API 播放结束');
      resolve();
    };
    source.start(0);
    log('Web Audio API 开始播放');
  });
}

type PlayState = 'idle' | 'playing' | 'paused';

export class ParagraphTTSService {
  private config: ParagraphTTSConfig;
  private highlighter: WordHighlighter;

  // 双击检测
  private lastClickTime: number = 0;
  private lastClickElement: HTMLElement | null = null;

  // 播放状态
  private state: PlayState = 'idle';
  private currentParagraph: HTMLElement | null = null;
  private currentText: string = '';

  // TTS 引擎
  private synth: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private googleAudio: HTMLAudioElement | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null; // Web Audio API 音频源

  // 分片播放
  private segments: string[] = [];
  private currentSegmentIndex: number = 0;

  // 延迟定时器跟踪（用于暂停时清理）
  private pendingTimeouts: number[] = [];

  // 统计
  private clickCount: number = 0;

  constructor(config: Partial<ParagraphTTSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.highlighter = new WordHighlighter();
    this.synth = window.speechSynthesis || null;

    // 设置调试模式
    setTTSDebugEnabled(this.config.showDebugPanel ?? false);

    log('构造函数 - Web Speech 可用:', !!this.synth);
    log('配置:', JSON.stringify(this.config));

    // 注入样式
    injectTTSHighlightStyles();
    log('样式已注入');
  }

  /**
   * 启用服务
   */
  enable(): void {
    document.addEventListener('click', this.handleClick);
    log('✅ 服务已启用 - 监听 click 事件');
    log('当前 URL:', window.location.href);
    log('User Agent:', navigator.userAgent);

    // 预热音频系统，消除首次播放延迟
    this.warmUpAudioSystem();
  }

  /**
   * 预热音频系统
   * 使用单例 AudioContext，避免每次都创建/销毁
   */
  private warmUpAudioSystem(): void {
    warmUpParagraphAudio();
  }

  /**
   * 禁用服务
   */
  disable(): void {
    document.removeEventListener('click', this.handleClick);
    this.stop();
    log('❌ 服务已禁用');
  }

  /**
   * 点击处理 - 双击检测
   */
  private handleClick = (e: MouseEvent): void => {
    this.clickCount++;
    log(
      `📍 Click #${this.clickCount} - target:`,
      (e.target as HTMLElement)?.tagName,
    );

    const target = this.findParagraph(e.target as HTMLElement);

    if (!target) {
      log('❌ 未找到有效段落元素');
      return;
    }

    log('✓ 找到段落:', target.tagName, '- 文本长度:', target.innerText.length);

    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    const isSameElement = target === this.lastClickElement;

    log(`时间间隔: ${timeSinceLastClick}ms, 同一元素: ${isSameElement}`);

    if (
      isSameElement &&
      timeSinceLastClick <= this.config.doubleClickInterval
    ) {
      // 双击触发
      log('🎯 双击检测成功! 触发 TTS');
      e.preventDefault();
      e.stopPropagation(); // 双击时阻止传播
      this.handleDoubleClick(target);
      this.lastClickTime = 0;
      this.lastClickElement = null;
    } else {
      log('单击记录，等待第二次点击...');
      this.lastClickTime = now;
      this.lastClickElement = target;
      // 单击不阻止传播，让 Word TTS 可以正常工作
    }
  };

  /**
   * 双击处理 - 简化为 play/stop 切换，不支持暂停恢复
   */
  private handleDoubleClick(element: HTMLElement): void {
    log('handleDoubleClick - 当前状态:', this.state);

    if (this.state === 'playing' || this.state === 'paused') {
      // 正在播放或暂停 -> 停止
      log('→ 停止播放');
      this.stop();
    } else {
      // 空闲 -> 开始播放
      log('→ 开始新播放');
      this.play(element);
    }
  }

  /**
   * 开始播放段落
   */
  private async play(element: HTMLElement): Promise<void> {
    this.currentParagraph = element;
    // 获取原文文本，排除翻译内容
    this.currentText = this.getOriginalText(element);

    log('play() - 文本:', this.currentText.substring(0, 50) + '...');

    if (!this.currentText) {
      warn('文本为空，跳过');
      return;
    }

    // 切片文本
    this.segments = this.segmentText(this.currentText);
    this.currentSegmentIndex = 0;

    log(`切片完成: ${this.segments.length} 个片段`);
    this.segments.forEach((s, i) =>
      log(`  片段[${i}]: "${s.substring(0, 30)}..."`),
    );

    // 准备高亮
    log('准备高亮...');
    this.highlighter.prepare(element);

    // 播放第一个片段
    log('开始播放第一个片段...');
    await this.playSegment(this.currentSegmentIndex);
  }

  /**
   * 播放单个片段
   */
  private async playSegment(index: number): Promise<void> {
    log(`playSegment(${index}) - 总共 ${this.segments.length} 个`);

    if (index >= this.segments.length) {
      log('所有片段播放完成');
      this.stop();
      return;
    }

    // 清理之前的音频对象，防止并发冲突
    if (this.googleAudio) {
      this.googleAudio.pause();
      // 释放 blob URL 防止内存泄漏
      if (this.googleAudio.src && this.googleAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.googleAudio.src);
      }
      this.googleAudio.src = '';
      this.googleAudio = null;
      log('已清理之前的音频对象');
    }

    const text = this.segments[index];
    this.state = 'playing';

    log(`播放片段[${index}]: "${text.substring(0, 50)}..."`);

    // 计算此片段在完整文本中的起始位置
    let charOffset = 0;
    for (let i = 0; i < index; i++) {
      charOffset += this.segments[i].length + 1;
    }
    log('字符偏移:', charOffset);

    try {
      // 计算延迟因子：Web Speech 启动延迟 = 总延迟 / 2
      const webSpeechStartDelay = Math.floor(
        this.config.totalHighlightDelay / 2,
      );
      log(
        `延迟因子: Web Speech 启动延迟=${webSpeechStartDelay}ms, 高亮延迟=${webSpeechStartDelay}ms, 总延迟=${this.config.totalHighlightDelay}ms`,
      );

      // 先启动 Google TTS，给它独占的启动时间以避免音频焦点冲突
      log('开始 Google TTS...');
      const googleTTSPromise = this.startGoogleTTS(text);

      // 延迟启动 Web Speech（静音获取词边界）
      const webSpeechPromise = new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          log(`Web Speech 延迟启动 (${webSpeechStartDelay}ms 后)`);
          this.startShadowSpeech(text, charOffset, webSpeechStartDelay).then(
            resolve,
          );
        }, webSpeechStartDelay);
        this.pendingTimeouts.push(timeoutId);
      });

      const [googleResult, speechResult] = await Promise.allSettled([
        googleTTSPromise,
        webSpeechPromise,
      ]);

      log('Google TTS 结果:', googleResult.status);
      log('Web Speech 结果:', speechResult.status);
    } catch (err) {
      error('playSegment 异常:', err);
      this.stop();
    }
  }

  /**
   * Web Speech API 静音合成 (获取词边界)
   * @param text 文本
   * @param charOffset 字符偏移
   * @param highlightBoundaryDelay 高亮延迟（已找计入 Web Speech 启动延迟）
   */
  private startShadowSpeech(
    text: string,
    charOffset: number,
    highlightBoundaryDelay: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      log('startShadowSpeech - synth 可用:', !!this.synth);

      if (!this.synth) {
        warn('Web Speech API 不可用');
        resolve();
        return;
      }

      this.utterance = new SpeechSynthesisUtterance(text);
      this.utterance.volume = 0; // 静音
      this.utterance.rate = this.config.speechRate;
      this.utterance.lang = 'en-US';

      log('Utterance 创建完成，开始 speak...');

      this.utterance.onstart = () => {
        log('✓ Web Speech 开始');
      };

      this.utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === 'word') {
          const globalCharIndex = charOffset + event.charIndex;
          // 使用传入的 highlightBoundaryDelay 以同步 Google TTS
          const timeoutId = window.setTimeout(() => {
            if (this.state === 'playing') {
              this.highlighter.highlightByCharIndex(globalCharIndex);
            }
          }, highlightBoundaryDelay);
          this.pendingTimeouts.push(timeoutId);
        }
      };

      this.utterance.onend = () => {
        log('✓ Web Speech 结束');
        resolve();
      };

      this.utterance.onerror = (e) => {
        warn('Web Speech 错误:', e.error);
        resolve();
      };

      this.synth.speak(this.utterance);
      log('synth.speak() 已调用');
    });
  }

  /**
   * Google TTS 播放音频
   * 添加超时兜底，防止 onended 事件丢失导致卡住
   */
  private startGoogleTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      const url = `${GOOGLE_TTS_BASE_URL}?ie=UTF-8&client=gtx&tl=en&q=${encodeURIComponent(text)}`;
      log('Google TTS URL:', url);

      let isResolved = false;
      let timeoutId: number | null = null;

      const safeResolve = () => {
        if (isResolved) return;
        isResolved = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve();
      };

      const moveToNextSegment = () => {
        log('移动到下一个片段...');

        // ⚠️ 关键：清除当前片段的高亮定时器，防止旧片段的高亮继续执行
        this.clearPendingTimeouts();

        // 取消当前 Web Speech（用于词边界检测的静音语音）
        if (this.synth) {
          this.synth.cancel();
          log('已取消 Web Speech');
        }

        this.currentSegmentIndex++;
        if (this.currentSegmentIndex < this.segments.length) {
          this.playSegment(this.currentSegmentIndex);
        } else {
          this.stop();
        }
        safeResolve();
      };

      this.fetchGoogleAudio(url, text)
        .then(async (blob) => {
          if (!blob) {
            warn('Google TTS 返回空 blob');
            moveToNextSegment();
            return;
          }

          log('Google TTS blob 大小:', blob.size, 'bytes');

          try {
            // 使用 Web Audio API 播放（低延迟）
            const audioContext = getParagraphAudioContext();

            if (audioContext.state === 'suspended') {
              log('AudioContext 被挂起，正在恢复...');
              await audioContext.resume();
            }

            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            const duration = audioBuffer.duration;
            log('✓ 音频解码完成，时长:', duration, 's');

            // 设置超时兜底：音频时长 + 5秒缓冲
            const timeoutMs = (duration + 5) * 1000;
            timeoutId = window.setTimeout(() => {
              if (!isResolved) {
                warn(`⚠️ 音频超时 (${timeoutMs}ms)，强制跳到下一段`);
                moveToNextSegment();
              }
            }, timeoutMs);
            log('设置超时兜底:', timeoutMs, 'ms');

            // 创建音频源并播放
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);

            // 存储音频源引用，以便 stop() 时可以立即停止
            this.currentAudioSource = source;

            source.onended = () => {
              log('✓ Web Audio API 播放结束 (onended)');
              this.currentAudioSource = null; // 播放结束后清除引用
              moveToNextSegment();
            };

            source.start(0);
            log('✓ Web Audio API 开始播放');
          } catch (audioErr) {
            error('Web Audio API 播放失败:', audioErr);
            moveToNextSegment();
          }
        })
        .catch((err) => {
          error('fetchGoogleAudio 失败:', err);
          moveToNextSegment();
        });
    });
  }

  /**
   * 获取 Google TTS 音频
   */
  private async fetchGoogleAudio(
    url: string,
    text: string,
  ): Promise<Blob | null> {
    log(
      `fetchGoogleAudio: 文本长度=${text.length}, 前30字="${text.substring(0, 30)}..."`,
    );

    // 检查文本长度限制
    if (text.length > 200) {
      warn(`文本过长 (${text.length} 字符)，Google TTS 可能限制 ~200 字符`);
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Proxy-Target': 'google',
          Authorization: GOOGLE_TTS_AUTH,
        },
      });

      log('fetch 响应:', response.status, response.statusText);

      if (response.ok) {
        const blob = await response.blob();
        log('✓ 获取音频成功:', blob.size, 'bytes');
        return blob;
      } else {
        // 400 错误时打印更多信息
        const errorText = await response.text().catch(() => '(无法读取)');
        error(`fetch 失败: ${response.status} ${response.statusText}`);
        error(`错误响应: ${errorText.substring(0, 100)}`);
        error(`请求 URL 长度: ${url.length}`);
        return null;
      }
    } catch (err: any) {
      error('fetch 异常:', err?.message || err);
      return null;
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    this.state = 'paused';

    // 清除待执行的高亮定时器
    this.clearPendingTimeouts();

    if (this.synth) {
      this.synth.pause();
    }
    if (this.googleAudio) {
      this.googleAudio.pause();
    }

    log('⏸ 已暂停');
  }

  /**
   * 继续播放
   */
  resume(): void {
    this.state = 'playing';

    if (this.synth) {
      this.synth.resume();
    }
    if (this.googleAudio) {
      this.googleAudio.play();
    }

    log('▶ 继续播放');
  }

  /**
   * 停止播放
   */
  stop(): void {
    this.state = 'idle';

    // 清除待执行的高亮定时器
    this.clearPendingTimeouts();

    if (this.synth) {
      this.synth.cancel();
    }

    // 停止 Web Audio API 音频源
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        log('✓ Web Audio API 音频源已停止');
      } catch (_e) {
        // 可能已经停止，忽略错误
      }
      this.currentAudioSource = null;
    }

    // 停止旧版 HTML5 Audio（兼容）
    if (this.googleAudio) {
      this.googleAudio.pause();
      this.googleAudio.src = '';
      this.googleAudio = null;
    }

    this.highlighter.cleanup();
    this.currentParagraph = null;
    this.currentText = '';
    this.segments = [];
    this.currentSegmentIndex = 0;

    log('⏹ 已停止');
  }

  /**
   * 清除所有待执行的高亮定时器
   */
  private clearPendingTimeouts(): void {
    for (const id of this.pendingTimeouts) {
      window.clearTimeout(id);
    }
    this.pendingTimeouts = [];
    log('清除 ' + this.pendingTimeouts.length + ' 个待执行定时器');
  }

  /**
   * 文本切片
   */
  private segmentText(text: string): string[] {
    const { minSegmentChars, maxSegmentChars } = this.config;
    const delimiters = /([.。;；!！?？\n])/;

    const parts = text.split(delimiters);
    const segments: string[] = [];
    let buffer = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (buffer.length + part.length <= maxSegmentChars) {
        buffer += part;
      } else if (buffer.length >= minSegmentChars) {
        segments.push(buffer.trim());
        buffer = part;
      } else {
        buffer += part;
      }
    }

    if (buffer.trim().length > 0) {
      segments.push(buffer.trim());
    }

    return segments.filter(
      (s) => s.length >= minSegmentChars || segments.length === 1,
    );
  }

  /**
   * 获取原文文本，排除翻译内容
   * 移除 .wxt-translation-term, .illa-paragraph-translation 等翻译元素
   */
  private getOriginalText(element: HTMLElement): string {
    // 克隆元素以避免修改原始 DOM
    const clone = element.cloneNode(true) as HTMLElement;

    // 翻译元素选择器
    const translationSelectors = [
      '.wxt-translation-term', // 单词翻译
      '.illa-paragraph-translation', // 段落翻译
      '[data-translation]', // 通用翻译标记
    ];

    // 移除所有翻译元素
    for (const selector of translationSelectors) {
      const elements = clone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    }

    const text = clone.innerText.trim();
    log(`getOriginalText: 原文长度=${text.length}, 排除翻译元素后`);
    return text;
  }

  /**
   * 查找段落元素
   */
  private findParagraph(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;
    let depth = 0;

    while (current && current !== document.body && depth < 20) {
      const tagName = current.tagName.toLowerCase();
      const isBlockElement = [
        'p',
        'div',
        'article',
        'section',
        'li',
        'td',
        'th',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ].includes(tagName);

      if (isBlockElement && current.innerText.trim().length > 10) {
        log(
          `findParagraph: 深度=${depth}, tag=${tagName}, 长度=${current.innerText.length}`,
        );
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    log(`findParagraph: 未找到，遍历了 ${depth} 层`);
    return null;
  }

  /**
   * 获取当前状态
   */
  getState(): PlayState {
    return this.state;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.disable();
  }
}
