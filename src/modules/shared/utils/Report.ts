/**
 * 统一日志模块
 *
 * 传输通道：
 * 1) App Bridge（默认启用）：Report -> background -> native bridge -> Android logcat
 * 2) WebSocket（可选）：由 VITE_WS_LOG_ENABLED 控制，默认可关闭
 *
 * 重试规则：
 * - 2 秒间隔
 * - 最多 5 次
 * - 达到上限后停止当前通道
 */

import { browser } from 'wxt/browser';

const WS_SERVER_URI = import.meta.env.VITE_WS_LOG_SERVER || '';
const WS_LOG_ENABLED =
  String(import.meta.env.VITE_WS_LOG_ENABLED || '').toLowerCase() === 'true';

const RETRY_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const APP_LOG_BATCH_MESSAGE_TYPE = 'APP_LOG_BATCH';
const APP_LOG_BATCH_SIZE = 30;
const APP_LOG_FLUSH_INTERVAL_MS = 200;
const APP_LOG_MAX_QUEUE_SIZE = 500;
const CONSOLE_MODULE_DEFAULT = 'Console';

type LogLevel = 'log' | 'warn' | 'error';
type ConsoleLevel = LogLevel | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  args?: string;
  seq: number;
}

interface AppLogBatchResponse {
  success?: boolean;
  error?: string;
  result?: {
    ok?: boolean;
    accepted?: number;
    error?: string;
  };
}

const MAX_ARG_LENGTH = 20_000;
let logSequence = 0;
let consoleBridgeInstalled = false;
let isForwardingConsoleLog = false;

const rawConsole = (() => {
  const consoleObj = globalThis.console;
  const noop = () => {};

  const bind = (method: keyof Console) => {
    const fn = consoleObj?.[method];
    return typeof fn === 'function'
      ? (fn as (...args: unknown[]) => void).bind(consoleObj)
      : noop;
  };

  return {
    log: bind('log'),
    info: bind('info'),
    debug: bind('debug'),
    warn: bind('warn'),
    error: bind('error'),
  };
})();

function truncate(value: string, max: number = MAX_ARG_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...<truncated>`;
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    type: 'Error',
    name: error.name,
    message: error.message,
    stack: error.stack ? truncate(error.stack) : undefined,
  };
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_, v) => {
        if (v instanceof Error) return serializeError(v);
        if (typeof v === 'bigint') return v.toString();
        if (v && typeof v === 'object') {
          const obj = v as object;
          if (seen.has(obj)) return '[Circular]';
          seen.add(obj);
        }
        return v;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

function serializeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return truncate(safeStringify(serializeError(arg)));
  }

  if (arg instanceof Response) {
    return truncate(
      safeStringify({
        type: 'Response',
        url: arg.url,
        ok: arg.ok,
        status: arg.status,
        statusText: arg.statusText,
        redirected: arg.redirected,
      }),
    );
  }

  if (arg instanceof Request) {
    return truncate(
      safeStringify({
        type: 'Request',
        url: arg.url,
        method: arg.method,
        mode: arg.mode,
        credentials: arg.credentials,
      }),
    );
  }

  if (typeof arg === 'object' && arg !== null) {
    return truncate(safeStringify(arg));
  }

  return truncate(String(arg));
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatArgs(args: unknown[]): string | undefined {
  if (args.length === 0) return undefined;
  return args.map((a) => serializeArg(a)).join(' ');
}

function toLogLevel(level: ConsoleLevel): LogLevel {
  if (level === 'error') return 'error';
  if (level === 'warn') return 'warn';
  return 'log';
}

function writeRawConsole(level: ConsoleLevel, ...args: unknown[]): void {
  const writer =
    level === 'error'
      ? rawConsole.error
      : level === 'warn'
        ? rawConsole.warn
        : level === 'info'
          ? rawConsole.info
          : level === 'debug'
            ? rawConsole.debug
            : rawConsole.log;
  writer(...args);
}

function parseConsoleMessage(args: unknown[]): {
  module: string;
  message: string;
  trailingArgs: unknown[];
} {
  if (args.length === 0) {
    return {
      module: CONSOLE_MODULE_DEFAULT,
      message: '',
      trailingArgs: [],
    };
  }

  const [first, ...rest] = args;
  if (typeof first === 'string') {
    const match = first.match(/^\[([^\]]+)]\s*(.*)$/);
    if (match) {
      return {
        module: match[1] || CONSOLE_MODULE_DEFAULT,
        message: match[2] || '',
        trailingArgs: rest,
      };
    }
    return {
      module: CONSOLE_MODULE_DEFAULT,
      message: first,
      trailingArgs: rest,
    };
  }

  return {
    module: CONSOLE_MODULE_DEFAULT,
    message: serializeArg(first),
    trailingArgs: rest,
  };
}

// ---------------- App Bridge 日志通道 ----------------
let appLogQueue: LogEntry[] = [];
let appFlushTimer: ReturnType<typeof setTimeout> | null = null;
let appRetryTimer: ReturnType<typeof setTimeout> | null = null;
let appRetryAttempts = 0;
let appTransportStopped = false;
let appTransportFlushing = false;

function isRuntimeMessagingAvailable(): boolean {
  return typeof browser.runtime?.sendMessage === 'function';
}

function resetAppRetryState(): void {
  appRetryAttempts = 0;
  if (appRetryTimer) {
    clearTimeout(appRetryTimer);
    appRetryTimer = null;
  }
}

function scheduleAppRetry(errorMessage: string): void {
  if (appTransportStopped) {
    return;
  }

  appRetryAttempts++;

  if (appRetryAttempts >= MAX_RECONNECT_ATTEMPTS) {
    appTransportStopped = true;
    appLogQueue = [];
    console.warn(
      `[Report] App 日志桥接已达到最大重试次数(${MAX_RECONNECT_ATTEMPTS})，停止转发`,
      { error: errorMessage },
    );
    return;
  }

  if (appRetryTimer) {
    clearTimeout(appRetryTimer);
  }

  appRetryTimer = setTimeout(() => {
    appRetryTimer = null;
    scheduleAppFlush(0);
  }, RETRY_INTERVAL_MS);
}

function scheduleAppFlush(delayMs: number = APP_LOG_FLUSH_INTERVAL_MS): void {
  if (appTransportStopped || appTransportFlushing || appFlushTimer) {
    return;
  }

  appFlushTimer = setTimeout(() => {
    appFlushTimer = null;
    void flushAppLogQueue();
  }, delayMs);
}

async function forwardBatchToBackground(entries: LogEntry[]): Promise<number> {
  if (!isRuntimeMessagingAvailable()) {
    throw new Error('runtime_messaging_unavailable');
  }

  const response = (await browser.runtime.sendMessage({
    type: APP_LOG_BATCH_MESSAGE_TYPE,
    entries,
  })) as AppLogBatchResponse | undefined;

  if (!response || response.success !== true || response.result?.ok !== true) {
    const responseError =
      response?.error ||
      response?.result?.error ||
      'app_log_batch_response_error';
    throw new Error(responseError);
  }

  const accepted = response.result.accepted;
  if (typeof accepted !== 'number') {
    return entries.length;
  }

  if (accepted <= 0) {
    throw new Error('app_log_batch_zero_accepted');
  }

  return Math.min(accepted, entries.length);
}

async function flushAppLogQueue(): Promise<void> {
  if (appTransportStopped || appTransportFlushing || appLogQueue.length === 0) {
    return;
  }

  appTransportFlushing = true;

  try {
    while (appLogQueue.length > 0) {
      const batch = appLogQueue.slice(0, APP_LOG_BATCH_SIZE);
      const accepted = await forwardBatchToBackground(batch);
      appLogQueue.splice(0, accepted);
      resetAppRetryState();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    scheduleAppRetry(message);
  } finally {
    appTransportFlushing = false;
    if (!appTransportStopped && appLogQueue.length > 0 && !appRetryTimer) {
      scheduleAppFlush(0);
    }
  }
}

function enqueueAppLog(entry: LogEntry): void {
  if (appTransportStopped) {
    return;
  }

  appLogQueue.push(entry);
  if (appLogQueue.length > APP_LOG_MAX_QUEUE_SIZE) {
    appLogQueue.shift();
  }

  scheduleAppFlush();
}

// ---------------- WebSocket 日志通道（可选） ----------------
let ws: WebSocket | null = null;
let wsConnecting = false;
let wsReconnectAttempts = 0;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsStopped = false;

function sendWsLog(entry: LogEntry): void {
  if (!WS_LOG_ENABLED || wsStopped) {
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(entry));
    } catch {
      // 发送失败后由 close/reconnect 机制处理
    }
  }
}

function connectWebSocket(): void {
  if (
    !WS_LOG_ENABLED ||
    wsStopped ||
    wsConnecting ||
    (ws && ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  wsConnecting = true;
  console.log(
    `[Report] 正在连接 WS 日志服务器: ${WS_SERVER_URI} (第${wsReconnectAttempts + 1}次)`,
  );

  try {
    ws = new WebSocket(WS_SERVER_URI);

    ws.onopen = () => {
      wsConnecting = false;
      wsReconnectAttempts = 0;
      console.log('[Report] ✅ WebSocket 已连接');
    };

    ws.onclose = (event) => {
      wsConnecting = false;
      ws = null;
      console.log(`[Report] WebSocket 已关闭: code=${event.code}`);
      scheduleWsReconnect();
    };

    ws.onerror = () => {
      wsConnecting = false;
    };

    ws.onmessage = (event) => {
      console.log('[Report] 收到服务器消息:', event.data);
    };
  } catch {
    wsConnecting = false;
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect(): void {
  if (!WS_LOG_ENABLED || wsStopped) {
    return;
  }

  wsReconnectAttempts++;

  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    wsStopped = true;
    console.log(
      `[Report] ⛔ WebSocket 达到最大重连次数(${MAX_RECONNECT_ATTEMPTS})，停止尝试`,
    );
    return;
  }

  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
  }

  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWebSocket();
  }, RETRY_INTERVAL_MS);
}

function sendLog(entry: LogEntry): void {
  enqueueAppLog(entry);
  sendWsLog(entry);
}

function sendLogEntry(
  level: LogLevel,
  module: string,
  message: string,
  args: unknown[],
): void {
  const argsStr = formatArgs(args);
  const entry: LogEntry = {
    timestamp: getTimestamp(),
    level,
    module,
    message,
    args: argsStr,
    seq: logSequence++,
  };
  sendLog(entry);
}

function shouldSkipConsoleForwarding(module: string, message: string): boolean {
  return (
    module === 'Background' &&
    message.includes('收到消息') &&
    message.includes(APP_LOG_BATCH_MESSAGE_TYPE)
  );
}

function installConsoleBridge(): void {
  if (consoleBridgeInstalled || typeof globalThis.console === 'undefined') {
    return;
  }

  const consoleObj = globalThis.console;
  const wrap = (level: ConsoleLevel) => {
    return (...args: unknown[]) => {
      writeRawConsole(level, ...args);

      if (isForwardingConsoleLog) {
        return;
      }

      const parsed = parseConsoleMessage(args);
      if (shouldSkipConsoleForwarding(parsed.module, parsed.message)) {
        return;
      }

      isForwardingConsoleLog = true;
      try {
        sendLogEntry(
          toLogLevel(level),
          parsed.module,
          parsed.message,
          parsed.trailingArgs,
        );
      } finally {
        isForwardingConsoleLog = false;
      }
    };
  };

  consoleObj.log = wrap('log');
  consoleObj.info = wrap('info');
  consoleObj.debug = wrap('debug');
  consoleObj.warn = wrap('warn');
  consoleObj.error = wrap('error');
  consoleBridgeInstalled = true;
}

export function initReport(): void {
  if (!WS_LOG_ENABLED) {
    wsStopped = true;
    console.log(
      '[Report] WebSocket 日志上报已禁用 (VITE_WS_LOG_ENABLED=false)',
    );
    return;
  }

  if (!WS_SERVER_URI) {
    console.log('[Report] 未配置 WS 服务器地址，跳过 WebSocket 上报');
    wsStopped = true;
    return;
  }
  if (typeof WebSocket === 'undefined') {
    console.warn('[Report] 当前环境不支持 WebSocket');
    wsStopped = true;
    return;
  }
  connectWebSocket();
}

export function closeReport(): void {
  appTransportStopped = true;
  appLogQueue = [];

  if (appFlushTimer) {
    clearTimeout(appFlushTimer);
    appFlushTimer = null;
  }
  if (appRetryTimer) {
    clearTimeout(appRetryTimer);
    appRetryTimer = null;
  }

  wsStopped = true;
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

function log(
  level: LogLevel,
  module: string,
  msg: string,
  ...args: unknown[]
): void {
  const consoleMethod = toLogLevel(level);
  const prefix = level === 'error' ? '❌ ' : level === 'warn' ? '⚠️ ' : '';
  writeRawConsole(consoleMethod, `[${module}] ${prefix}${msg}`, ...args);
  sendLogEntry(level, module, msg, args);
}

export const report = {
  log: (module: string, msg: string, ...args: unknown[]) =>
    log('log', module, msg, ...args),
  warn: (module: string, msg: string, ...args: unknown[]) =>
    log('warn', module, msg, ...args),
  error: (module: string, msg: string, ...args: unknown[]) =>
    log('error', module, msg, ...args),
};

export function createModuleLogger(moduleName: string) {
  return {
    log: (msg: string, ...args: unknown[]) =>
      log('log', moduleName, msg, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      log('warn', moduleName, msg, ...args),
    error: (msg: string, ...args: unknown[]) =>
      log('error', moduleName, msg, ...args),
  };
}

installConsoleBridge();

if (typeof window !== 'undefined') {
  initReport();
}
