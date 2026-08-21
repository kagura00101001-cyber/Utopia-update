/* Kagura Auth Gate V4 - development module */
(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    startForceValidation: true,
    batchForceValidation: true,
  });

  let config = { ...DEFAULTS };
  let lastState = Object.freeze({
    authorized: false,
    checking: false,
    username: '',
    code: 'NOT_CHECKED',
    message: '尚未验证授权',
    checkedAt: 0,
  });
  const listeners = new Set();

  function auth() {
    const api = globalThis.KaguraAuth;
    if (!api || typeof api.requireAuthorized !== 'function') {
      const error = new Error('授权模块尚未加载');
      error.code = 'AUTH_MODULE_MISSING';
      throw error;
    }
    return api;
  }

  function configure(next = {}) {
    config = { ...config, ...next };
    return getState();
  }

  function getState() {
    return lastState;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    try { fn(lastState); } catch {}
    return () => listeners.delete(fn);
  }

  function publish(patch) {
    lastState = Object.freeze({ ...lastState, ...patch });
    listeners.forEach(fn => {
      try { fn(lastState); } catch {}
    });
    return lastState;
  }

  function publicMessage(result) {
    if (result?.ok) return '已授权';
    switch (result?.code) {
      case 'INVALID_TOKEN':
      case 'TOKEN_EXPIRED':
      case 'REFRESH_TOKEN_EXPIRED':
        return '登录状态已失效，请重新登录';
      case 'INVALID_CREDENTIALS':
        return '账号或密码错误';
      case 'ACCOUNT_DISABLED':
      case 'ACCOUNT_EXPIRED':
      case 'DEVICE_LIMIT':
      case 'DEVICE_REVOKED':
        return '当前账号授权不可用';
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        return '授权服务器暂时无法连接';
      case 'CONFIG_MISSING':
        return '授权服务器尚未配置';
      default:
        return result?.message || '授权校验失败，请稍后重试';
    }
  }

  async function check({ force = true, reason = 'manual' } = {}) {
    publish({ checking: true, code: 'CHECKING', message: '正在验证授权…' });
    let result;
    try {
      result = await auth().requireAuthorized({ force });
    } catch (error) {
      result = {
        ok: false,
        code: error?.code || 'AUTH_MODULE_ERROR',
        message: '授权校验失败，请稍后重试',
        error,
      };
    }

    const username = result?.user?.username || auth().getPublicState?.().username || '';
    const next = publish({
      authorized: Boolean(result?.ok),
      checking: false,
      username: String(username || ''),
      code: result?.ok ? 'OK' : String(result?.code || 'SERVER_ERROR'),
      message: publicMessage(result),
      checkedAt: Date.now(),
      reason,
    });
    return { ...result, gateState: next };
  }

  async function requireForStart({ taskName = '任务', onDenied } = {}) {
    const result = await check({
      force: config.startForceValidation !== false,
      reason: `start:${taskName}`,
    });
    if (result.ok) return result;

    if (typeof onDenied === 'function') {
      try { await onDenied(result); } catch {}
    }
    return {
      ...result,
      ok: false,
      action: 'block_start',
      message: publicMessage(result),
    };
  }

  async function requireBeforeNextBatch({ taskName = '任务', onPause } = {}) {
    const result = await check({
      force: config.batchForceValidation !== false,
      reason: `next-batch:${taskName}`,
    });
    if (result.ok) return result;

    // 这个函数只能在“当前批次已经完成并保存”之后调用。
    // 因此授权失败只会阻止下一批，不会中断正在运行的当前批。
    if (typeof onPause === 'function') {
      try {
        await onPause({
          code: result?.code || 'SERVER_ERROR',
          message: publicMessage(result),
          reason: 'auth_before_next_batch',
        });
      } catch {}
    }

    return {
      ...result,
      ok: false,
      action: 'pause_before_next_batch',
      message: publicMessage(result),
    };
  }

  async function runGuardedStart(taskName, startFn, options = {}) {
    if (typeof startFn !== 'function') throw new TypeError('startFn 必须是函数');
    const result = await requireForStart({ taskName, onDenied: options.onDenied });
    if (!result.ok) return result;
    const value = await startFn(result);
    return { ok: true, value, user: result.user };
  }

  function bindAuthState() {
    try {
      const api = auth();
      api.onChange?.(state => {
        if (!state?.authenticated) {
          publish({
            authorized: false,
            username: '',
            code: 'INVALID_TOKEN',
            message: '未登录',
          });
          return;
        }
        publish({ username: String(state.username || lastState.username || '') });
      });
    } catch {}
  }

  const api = Object.freeze({
    configure,
    getState,
    onChange,
    check,
    requireForStart,
    requireBeforeNextBatch,
    runGuardedStart,
    publicMessage,
  });

  globalThis.KaguraAuthGate = api;
  bindAuthState();
})();
