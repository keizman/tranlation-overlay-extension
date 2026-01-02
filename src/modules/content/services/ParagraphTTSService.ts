/**
 * 段落TTS服务
 * 双击段落触发 TTS 朗读 + 逐词高亮
 * 技术：Web Speech API (静音获取词边界) + Google TTS (实际音频)
 */

import { WordHighlighter, injectTTSHighlightStyles } from './WordHighlighter';

// Google TTS 配置
const GOOGLE_TTS_BASE_URL = 'https://translate.planktonfly.com/translate_tts';
const GOOGLE_TTS_AUTH = 'Basic bXl1c2VyOjEyMzQ1NjY=';

// ============ 页面内调试面板 ============
const DEBUG = true;
let debugPanel: HTMLElement | null = null;
let debugLogs: string[] = [];
const MAX_LOGS = 100;

function createDebugPanel(): void {
  if (debugPanel || !DEBUG) return;

  debugPanel = document.createElement('div');
  debugPanel.id = 'wxt-tts-debug-panel';
  debugPanel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px; display: flex; justify-content: space-between;">
      <span>📝 TTS Debug</span>
      <span id="wxt-tts-debug-clear" style="cursor: pointer; pointer-events: auto; padding: 2px 6px; background: #333; border-radius: 3px;">🗑️</span>
    </div>
    <div id="wxt-tts-debug-content" style="overflow-y: auto; max-height: 180px;"></div>
  `;
  debugPanel.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    width: 320px;
    max-height: 250px;
    background: rgba(0, 0, 0, 0.9);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    border-radius: 8px;
    z-index: 999999;
    pointer-events: auto;
    box-shadow: 0 2px 10px rgba(0,0,0,0.5);
  `;
  document.body.appendChild(debugPanel);

  // 清除按钮 - 显式绑定点击事件
  const clearBtn = debugPanel.querySelector('#wxt-tts-debug-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      debugLogs = [];
      const content = debugPanel?.querySelector('#wxt-tts-debug-content');
      if (content) content.innerHTML = '';
      log('日志已清除');
    });
  }
}

function addDebugLog(msg: string): void {
  if (!DEBUG) return;

  const timestamp = new Date().toLocaleTimeString();
  debugLogs.push(`[${timestamp}] ${msg}`);
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }

  if (!debugPanel) createDebugPanel();
  const content = debugPanel?.querySelector(
    '#wxt-tts-debug-content',
  ) as HTMLElement;
  if (content) {
    content.innerHTML = debugLogs
      .map(
        (l) =>
          `<div style="padding: 2px 0; border-bottom: 1px solid #333;">${l}</div>`,
      )
      .join('');
    // 自动滚动到底部
    setTimeout(() => {
      content.scrollTop = content.scrollHeight;
    }, 10);
  }

  // 同时输出到 console
  console.log(`[ParagraphTTS] ${msg}`);
}

const log = (msg: string, ...args: any[]) => {
  const argsStr = args.length
    ? ' ' +
      args
        .map((a) =>
          typeof a === 'object'
            ? JSON.stringify(a).substring(0, 50)
            : String(a),
        )
        .join(' ')
    : '';
  addDebugLog(msg + argsStr);
};
const warn = (msg: string, ...args: any[]) => {
  addDebugLog('⚠️ ' + msg);
  console.warn(`[ParagraphTTS] ${msg}`, ...args);
};
const error = (msg: string, ...args: any[]) => {
  addDebugLog('❌ ' + msg);
  console.error(`[ParagraphTTS] ${msg}`, ...args);
};
// ============ 调试面板结束 ============

export interface ParagraphTTSConfig {
  minSegmentChars: number;
  maxSegmentChars: number;
  doubleClickInterval: number;
  driftThreshold: number;
  speechRate: number;
  highlightDelayMs: number; // 高亮延迟，用于同步 Web Speech 和 Google TTS
}

const DEFAULT_CONFIG: ParagraphTTSConfig = {
  minSegmentChars: 20,
  maxSegmentChars: 150, // Google TTS 限制，减少以避免 400 错误
  doubleClickInterval: 1000, // 1s
  driftThreshold: 500, // 500ms
  speechRate: 1.0,
  highlightDelayMs: 800, // 高亮延迟 500ms 以匹配 Google TTS
};

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
      e.stopPropagation();
      this.handleDoubleClick(target);
      this.lastClickTime = 0;
      this.lastClickElement = null;
    } else {
      log('单击记录，等待第二次点击...');
      this.lastClickTime = now;
      this.lastClickElement = target;
    }
  };

  /**
   * 双击处理
   */
  private handleDoubleClick(element: HTMLElement): void {
    log('handleDoubleClick - 当前状态:', this.state);

    if (this.state === 'playing' && this.currentParagraph === element) {
      log('→ 暂停播放');
      this.pause();
    } else if (this.state === 'paused' && this.currentParagraph === element) {
      log('→ 继续播放');
      this.resume();
    } else {
      log('→ 开始新播放');
      this.stop();
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
      log('开始并行 TTS...');
      // 先尝试 Google TTS，如果失败则只用 Web Speech
      const [speechResult, googleResult] = await Promise.allSettled([
        this.startShadowSpeech(text, charOffset),
        this.startGoogleTTS(text),
      ]);

      log('Web Speech 结果:', speechResult.status);
      log('Google TTS 结果:', googleResult.status);
    } catch (err) {
      error('playSegment 异常:', err);
      this.stop();
    }
  }

  /**
   * Web Speech API 静音合成 (获取词边界)
   */
  private startShadowSpeech(text: string, charOffset: number): Promise<void> {
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
          // 添加延迟以同步 Google TTS，并跟踪定时器
          const timeoutId = window.setTimeout(() => {
            if (this.state === 'playing') {
              this.highlighter.highlightByCharIndex(globalCharIndex);
            }
          }, this.config.highlightDelayMs);
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
   */
  private startGoogleTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      const url = `${GOOGLE_TTS_BASE_URL}?ie=UTF-8&client=gtx&tl=en&q=${encodeURIComponent(text)}`;
      log('Google TTS URL:', url);

      this.fetchGoogleAudio(url, text)
        .then((blob) => {
          if (!blob) {
            warn('Google TTS 返回空 blob');
            resolve();
            return;
          }

          log('Google TTS blob 大小:', blob.size, 'bytes');

          this.googleAudio = new Audio(URL.createObjectURL(blob));

          this.googleAudio.onloadeddata = () => {
            log('✓ 音频加载完成，时长:', this.googleAudio?.duration, 's');
          };

          this.googleAudio.onplay = () => {
            log('✓ 音频开始播放');
          };

          this.googleAudio.onended = () => {
            log('✓ 音频播放结束');
            this.currentSegmentIndex++;
            if (this.currentSegmentIndex < this.segments.length) {
              this.playSegment(this.currentSegmentIndex);
            } else {
              this.stop();
            }
            resolve();
          };

          this.googleAudio.onerror = (e) => {
            error('音频播放错误:', e);
            resolve();
          };

          log('调用 audio.play()...');
          this.googleAudio
            .play()
            .then(() => {
              log('✓ play() Promise 成功');
            })
            .catch((e) => {
              error('play() 被阻止:', e.name, e.message);
              // 尝试用户交互后重试
              warn('提示：可能需要用户交互才能播放音频');
              resolve();
            });
        })
        .catch((err) => {
          error('fetchGoogleAudio 失败:', err);
          resolve();
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
