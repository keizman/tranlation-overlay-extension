/**
 * WebSocket 日志上报模块
 *
 * 将日志通过 WebSocket 实时上报到服务器
 *
 * 设计原则：
 * 1. 启动时尝试连接，2秒间隔，最多5次，失败后停止
 * 2. 调用方无需关心连接状态，若无连接直接丢弃日志
 */

// WebSocket 服务器地址（从环境变量读取）
const WS_SERVER_URI = import.meta.env.VITE_WS_LOG_SERVER || '';

// 重连配置
const RECONNECT_INTERVAL = 2000; // 2秒
const MAX_RECONNECT_ATTEMPTS = 5; // 最多5次

// 日志级别
type LogLevel = 'log' | 'warn' | 'error';

// 日志条目接口
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  args?: string;
}

const MAX_ARG_LENGTH = 1200;

function truncate(value: string, max: number = MAX_ARG_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...<truncated>`;
}

function serializeError(error: Error): Record<string, unknown> {
  return {
    type: 'Error',
    name: error.name,
    message: error.message,
    stack: error.stack ? truncate(error.stack, 2000) : undefined,
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

// WebSocket 连接状态
let ws: WebSocket | null = null;
let isConnecting = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false; // 是否已停止重连

/**
 * 获取当前时间戳
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 格式化参数为字符串
 */
function formatArgs(args: unknown[]): string | undefined {
  if (args.length === 0) return undefined;
  return args.map((a) => serializeArg(a)).join(' ');
}

/**
 * 发送日志到服务器
 * 若无连接则直接丢弃
 */
function sendLog(entry: LogEntry): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(entry));
    } catch {
      // 发送失败，丢弃
    }
  }
  // 无连接时直接丢弃，不缓冲
}

/**
 * 连接 WebSocket 服务器
 */
function connect(): void {
  if (stopped || isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
    return;
  }

  isConnecting = true;
  console.log(
    `[Report] 正在连接服务器: ${WS_SERVER_URI} (第${reconnectAttempts + 1}次)`,
  );

  try {
    ws = new WebSocket(WS_SERVER_URI);

    ws.onopen = () => {
      isConnecting = false;
      reconnectAttempts = 0;
      console.log('[Report] ✅ WebSocket 已连接');
    };

    ws.onclose = (event) => {
      isConnecting = false;
      ws = null;
      console.log(`[Report] WebSocket 已关闭: code=${event.code}`);
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnecting = false;
      // error 事件后通常会触发 close，由 close 处理重连
    };

    ws.onmessage = (event) => {
      console.log('[Report] 收到服务器消息:', event.data);
    };
  } catch {
    isConnecting = false;
    scheduleReconnect();
  }
}

/**
 * 调度重连
 */
function scheduleReconnect(): void {
  if (stopped) return;

  reconnectAttempts++;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    stopped = true;
    console.log(
      `[Report] ⛔ 已达到最大重连次数(${MAX_RECONNECT_ATTEMPTS})，停止尝试`,
    );
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  console.log(
    `[Report] ${RECONNECT_INTERVAL / 1000}秒后尝试重连 (第${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}次)`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_INTERVAL);
}

/**
 * 初始化连接
 */
export function initReport(): void {
  if (!WS_SERVER_URI) {
    console.log('[Report] 未配置 WS 服务器地址，跳过日志上报');
    stopped = true;
    return;
  }
  if (typeof WebSocket === 'undefined') {
    console.warn('[Report] 当前环境不支持 WebSocket');
    stopped = true;
    return;
  }
  connect();
}

/**
 * 关闭连接
 */
export function closeReport(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * 核心日志函数
 */
function log(
  level: LogLevel,
  module: string,
  msg: string,
  ...args: unknown[]
): void {
  const argsStr = formatArgs(args);

  // 始终输出到控制台
  const consoleMethod =
    level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  const prefix = level === 'error' ? '❌ ' : level === 'warn' ? '⚠️ ' : '';
  console[consoleMethod](`[${module}] ${prefix}${msg}`, ...args);

  // 上报到服务器（无连接则丢弃）
  const entry: LogEntry = {
    timestamp: getTimestamp(),
    level,
    module,
    message: msg,
    args: argsStr,
  };
  sendLog(entry);
}

/**
 * 日志上报对象
 */
export const report = {
  log: (module: string, msg: string, ...args: unknown[]) =>
    log('log', module, msg, ...args),
  warn: (module: string, msg: string, ...args: unknown[]) =>
    log('warn', module, msg, ...args),
  error: (module: string, msg: string, ...args: unknown[]) =>
    log('error', module, msg, ...args),
};

/**
 * 创建模块专用 logger（与原 DebugLogger API 兼容）
 */
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

// 自动初始化连接
if (typeof window !== 'undefined') {
  initReport();
}
