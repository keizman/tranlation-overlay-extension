/**
 * 全局调试日志工具
 * 所有模块使用统一的日志输出，同时输出到控制台和调试面板
 */

// 调试开关 - 可通过设置控制
let DEBUG_ENABLED = true;

// 调试面板
let debugPanel: HTMLElement | null = null;
let debugLogs: string[] = [];
const MAX_LOGS = 200;

/**
 * 设置调试开关
 */
export function setDebugEnabled(enabled: boolean): void {
  DEBUG_ENABLED = enabled;
  console.log(`[DebugLogger] 调试模式: ${enabled ? '开启' : '关闭'}`);
}

/**
 * 创建调试面板
 */
function createDebugPanel(): void {
  if (debugPanel || typeof document === 'undefined') return;

  debugPanel = document.createElement('div');
  debugPanel.id = 'wxt-global-debug-panel';
  debugPanel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px; display: flex; justify-content: space-between;">
      <span>📝 Debug Logs</span>
      <span id="wxt-debug-clear" style="cursor: pointer; padding: 2px 6px; background: #333; border-radius: 3px;">🗑️</span>
    </div>
    <div id="wxt-debug-content" style="overflow-y: auto; max-height: 180px;"></div>
  `;
  debugPanel.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    width: 350px;
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

  // 清除按钮
  const clearBtn = debugPanel.querySelector('#wxt-debug-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      debugLogs = [];
      const content = debugPanel?.querySelector('#wxt-debug-content');
      if (content) content.innerHTML = '';
      debug('DebugLogger', '日志已清除');
    });
  }
}

/**
 * 添加日志到面板
 */
function addToPanel(module: string, msg: string): void {
  if (!DEBUG_ENABLED) return;

  // 确保面板存在
  if (!debugPanel && typeof document !== 'undefined') {
    createDebugPanel();
  }

  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] [${module}] ${msg}`;
  debugLogs.push(logEntry);

  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift();
  }

  const content = debugPanel?.querySelector('#wxt-debug-content');
  if (content) {
    const div = document.createElement('div');
    div.textContent = logEntry;
    div.style.borderBottom = '1px solid #333';
    div.style.paddingBottom = '2px';
    div.style.marginBottom = '2px';
    content.appendChild(div);
    content.scrollTop = content.scrollHeight;
  }
}

/**
 * 调试日志 - 同时输出到控制台和面板
 */
export function debug(module: string, msg: string, ...args: any[]): void {
  const argsStr = args.length
    ? ' ' +
      args
        .map((a) =>
          typeof a === 'object'
            ? JSON.stringify(a).substring(0, 100)
            : String(a),
        )
        .join(' ')
    : '';

  // 输出到控制台
  console.log(`[${module}] ${msg}`, ...args);

  // 输出到面板
  addToPanel(module, msg + argsStr);
}

/**
 * 警告日志
 */
export function warn(module: string, msg: string, ...args: any[]): void {
  console.warn(`[${module}] ⚠️ ${msg}`, ...args);
  addToPanel(module, `⚠️ ${msg}`);
}

/**
 * 错误日志
 */
export function error(module: string, msg: string, ...args: any[]): void {
  console.error(`[${module}] ❌ ${msg}`, ...args);
  addToPanel(module, `❌ ${msg}`);
}

// 导出简化版本，用于特定模块
export function createModuleLogger(moduleName: string) {
  return {
    log: (msg: string, ...args: any[]) => debug(moduleName, msg, ...args),
    warn: (msg: string, ...args: any[]) => warn(moduleName, msg, ...args),
    error: (msg: string, ...args: any[]) => error(moduleName, msg, ...args),
  };
}
