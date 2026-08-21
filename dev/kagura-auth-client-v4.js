/* Kagura Auth Client V4 - development module */
(() => {
  'use strict';

  const STORAGE = Object.freeze({
    installId: 'kaguraAuthV4.installId',
    accessToken: 'kaguraAuthV4.accessToken',
    refreshToken: 'kaguraAuthV4.refreshToken',
    username: 'kaguraAuthV4.username',
  });

  const TERMINAL_CODES = new Set([
    'ACCOUNT_DISABLED', 'ACCOUNT_EXPIRED', 'DEVICE_LIMIT', 'DEVICE_REVOKED',
    'REFRESH_TOKEN_EXPIRED', 'INVALID_TOKEN',
  ]);
  const TOKEN_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN']);
  const SECRET_KEY_RE = /password|access.?token|refresh.?token|authorization|admin.?key|secret/i;
  const listeners = new Set();

  let config = {
    apiBase: '',
    timeoutMs: 20000,
    validationCacheMs: 60000,
    heartbeatMs: 5 * 60 * 1000,
  };
  let lastValidatedAt = 0;
  let heartbeatTimer = null;
  let refreshPromise = null;

  const safeGet = (key, fallback = '') => {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  };
  const safeSet = (key, value) => {
    try { GM_setValue(key, value); } catch { console.warn('[KaguraAuth] storage write failed'); }
  };
  const safeDelete = key => { try { GM_deleteValue(key); } catch {} };

  function randomId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = [...bytes].map(v => v.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  function getInstallId() {
    let id = String(safeGet(STORAGE.installId, '') || '').trim();
    if (!id) {
      id = randomId();
      safeSet(STORAGE.installId, id);
    }
    return id;
  }

  function getDeviceName() {
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
    const ua = navigator.userAgent || '';
    let browser = 'Browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    return `${browser} / ${platform}`.slice(0, 120);
  }

  function configure(next = {}) {
    config = {
      ...config,
      ...next,
      apiBase: String(next.apiBase ?? config.apiBase).trim().replace(/\/+$/, ''),
    };
    return getPublicState();
  }

  function authError(code, message, status = 0) {
    const error = new Error(message || '授权请求失败');
    error.name = 'KaguraAuthError';
    error.code = code || 'SERVER_ERROR';
    error.status = Number(status) || 0;
    return error;
  }

  function requireApiBase() {
    if (!config.apiBase) throw authError('CONFIG_MISSING', '授权服务器尚未配置');
    return config.apiBase;
  }

  function getTokens() {
    return {
      accessToken: String(safeGet(STORAGE.accessToken, '') || ''),
      refreshToken: String(safeGet(STORAGE.refreshToken, '') || ''),
    };
  }

  function sanitizeUser(user) {
    return { username: String(user?.username || safeGet(STORAGE.username, '') || '').trim() };
  }

  function getPublicState() {
    const { accessToken, refreshToken } = getTokens();
    return Object.freeze({
      configured: Boolean(config.apiBase),
      authenticated: Boolean(accessToken && refreshToken),
      username: String(safeGet(STORAGE.username, '') || ''),
      installId: getInstallId(),
    });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    const state = getPublicState();
    listeners.forEach(fn => { try { fn(state); } catch {} });
  }

  function clearSession({ keepInstallId = true } = {}) {
    safeDelete(STORAGE.accessToken);
    safeDelete(STORAGE.refreshToken);
    safeDelete(STORAGE.username);
    if (!keepInstallId) safeDelete(STORAGE.installId);
    lastValidatedAt = 0;
    stopHeartbeat();
    emit();
  }

  function storeSession(payload) {
    const accessToken = String(payload?.accessToken || '').trim();
    const refreshToken = String(payload?.refreshToken || '').trim();
    if (!accessToken || !refreshToken) throw authError('BAD_RESPONSE', '授权服务器返回异常');
    safeSet(STORAGE.accessToken, accessToken);
    safeSet(STORAGE.refreshToken, refreshToken);
    const user = sanitizeUser(payload?.user);
    if (user.username) safeSet(STORAGE.username, user.username);
    lastValidatedAt = Date.now();
    startHeartbeat();
    emit();
    return user;
  }

  function parseJson(text) {
    if (!String(text || '').trim()) return {};
    try { return JSON.parse(text); }
    catch { throw authError('BAD_RESPONSE', '授权服务器返回异常'); }
  }

  function request(path, { method = 'GET', body, token } = {}) {
    const url = `${requireApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
    return new Promise((resolve, reject) => {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        timeout: config.timeoutMs,
        anonymous: true,
        onload(response) {
          let payload;
          try { payload = parseJson(response.responseText); }
          catch (error) { reject(error); return; }
          if (response.status >= 200 && response.status < 300 && payload?.ok !== false) {
            resolve(payload || { ok: true });
            return;
          }
          const code = String(payload?.code || (response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR'));
          reject(authError(code, '授权请求失败', response.status));
        },
        onerror: () => reject(authError('NETWORK_ERROR', '授权服务器暂时无法连接')),
        ontimeout: () => reject(authError('TIMEOUT', '授权请求超时')),
      });
    });
  }

  function userMessage(error) {
    switch (error?.code) {
      case 'INVALID_CREDENTIALS': return '账号或密码错误';
      case 'ACCOUNT_DISABLED':
      case 'ACCOUNT_EXPIRED':
      case 'DEVICE_LIMIT':
      case 'DEVICE_REVOKED': return '当前账号授权不可用';
      case 'TOKEN_EXPIRED':
      case 'INVALID_TOKEN':
      case 'REFRESH_TOKEN_EXPIRED': return '登录状态已失效，请重新登录';
      case 'RATE_LIMITED': return '请求过于频繁，请稍后再试';
      case 'CONFIG_MISSING': return '授权服务器尚未配置';
      case 'NETWORK_ERROR':
      case 'TIMEOUT': return '授权服务器暂时无法连接';
      default: return '授权校验失败，请稍后重试';
    }
  }

  async function login(username, password) {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '');
    if (!cleanUsername || !cleanPassword) throw authError('INVALID_CREDENTIALS', '账号或密码错误');
    const payload = await request('/api/login', {
      method: 'POST',
      body: {
        username: cleanUsername,
        password: cleanPassword,
        installId: getInstallId(),
        deviceName: getDeviceName(),
      },
    });
    return { ok: true, user: storeSession(payload) };
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const { refreshToken } = getTokens();
      if (!refreshToken) throw authError('REFRESH_TOKEN_EXPIRED', '登录状态已失效');
      try {
        const payload = await request('/api/refresh', {
          method: 'POST',
          body: { refreshToken, installId: getInstallId() },
        });
        storeSession({
          ...payload,
          user: payload?.user || { username: safeGet(STORAGE.username, '') },
        });
        return payload;
      } catch (error) {
        if (TERMINAL_CODES.has(error?.code)) clearSession();
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function protectedRequest(path, options = {}, allowRefresh = true) {
    const { accessToken } = getTokens();
    if (!accessToken) throw authError('INVALID_TOKEN', '登录状态已失效');
    try {
      return await request(path, { ...options, token: accessToken });
    } catch (error) {
      if (allowRefresh && (TOKEN_CODES.has(error?.code) || error?.status === 401)) {
        await refresh();
        return protectedRequest(path, options, false);
      }
      if (TERMINAL_CODES.has(error?.code)) clearSession();
      throw error;
    }
  }

  async function me({ force = false } = {}) {
    const tokens = getTokens();
    if (!tokens.accessToken || !tokens.refreshToken) throw authError('INVALID_TOKEN', '登录状态已失效');
    if (!force && lastValidatedAt && Date.now() - lastValidatedAt < config.validationCacheMs) {
      return { ok: true, user: sanitizeUser({ username: safeGet(STORAGE.username, '') }), cached: true };
    }
    const payload = await protectedRequest('/api/me');
    const user = sanitizeUser(payload?.user);
    if (user.username) safeSet(STORAGE.username, user.username);
    lastValidatedAt = Date.now();
    emit();
    return { ok: true, user };
  }

  async function heartbeat() {
    const payload = await protectedRequest('/api/heartbeat', {
      method: 'POST',
      body: { installId: getInstallId() },
    });
    lastValidatedAt = Date.now();
    return payload;
  }

  async function logout() {
    const { accessToken, refreshToken } = getTokens();
    if (!accessToken || !refreshToken) {
      clearSession();
      return { ok: true };
    }
    try {
      await request('/api/logout', {
        method: 'POST',
        token: accessToken,
        body: { refreshToken, installId: getInstallId() },
      });
    } catch {}
    clearSession();
    return { ok: true };
  }

  async function requireAuthorized({ force = true } = {}) {
    try {
      const result = await me({ force });
      return { ok: true, user: result.user };
    } catch (error) {
      return {
        ok: false,
        code: error?.code || 'SERVER_ERROR',
        message: userMessage(error),
        error,
      };
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (!getTokens().accessToken) return;
    heartbeatTimer = setInterval(() => {
      heartbeat().catch(error => {
        if (TERMINAL_CODES.has(error?.code)) clearSession();
      });
    }, Math.max(60000, Number(config.heartbeatMs) || 300000));
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function redact(value, depth = 0) {
    if (depth > 8) return '[TRUNCATED]';
    if (typeof value === 'string') {
      return value.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]');
    }
    if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = SECRET_KEY_RE.test(key) ? '[REDACTED]' : redact(item, depth + 1);
      }
      return out;
    }
    return value;
  }

  const api = Object.freeze({
    configure,
    getInstallId,
    getPublicState,
    onChange,
    login,
    refresh,
    me,
    heartbeat,
    logout,
    requireAuthorized,
    clearSession,
    redact,
    userMessage,
    startHeartbeat,
    stopHeartbeat,
  });

  globalThis.KaguraAuth = api;
})();
