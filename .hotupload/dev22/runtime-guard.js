;(() => {
  'use strict';

  const VERSION = '4.1.0-dev.22';
  const OWNER_KEY = '__KAGURA_IMAGEFLOW_RUNTIME_OWNER_V2__';
  const page = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
  const instanceId = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const startedAt = Date.now();
  const cleanupFns = new Set();
  const legacyVersions = new Set();
  const state = {
    version: VERSION,
    instanceId,
    startedAt,
    secondary: false,
    mixed: false,
    blocked: false,
    ownerVersion: '',
    ownerInstanceId: '',
    coreVersion: '',
    reason: '',
  };

  const log = (...args) => console.log('[KaguraRuntime22]', ...args);
  const warn = (...args) => console.warn('[KaguraRuntime22]', ...args);

  function readOwner() {
    try { return page[OWNER_KEY] || null; } catch (_) { return null; }
  }

  function writeOwner(value) {
    try {
      Object.defineProperty(page, OWNER_KEY, {
        configurable: true,
        enumerable: false,
        writable: true,
        value,
      });
      return true;
    } catch (_) {
      try { page[OWNER_KEY] = value; return true; } catch (_) { return false; }
    }
  }

  const existing = readOwner();
  if (existing?.instanceId && existing.instanceId !== instanceId) {
    state.secondary = true;
    state.blocked = true;
    state.ownerVersion = String(existing.version || '');
    state.ownerInstanceId = String(existing.instanceId || '');
    state.reason = existing.version === VERSION ? 'duplicate_same_version_runtime' : 'different_runtime_owner';
    warn('检测到页面已有 Runtime owner；当前实例不启动核心', {
      current: VERSION,
      ownerVersion: state.ownerVersion,
      ownerInstanceId: state.ownerInstanceId,
    });
  } else {
    writeOwner({
      version: VERSION,
      instanceId,
      startedAt,
      heartbeatAt: Date.now(),
      status: 'preflight',
    });
    state.ownerVersion = VERSION;
    state.ownerInstanceId = instanceId;
  }

  function extractVersions(text) {
    return [...new Set(String(text || '').match(/4\.1\.0-dev\.\d+(?:\.\d+)*/g) || [])];
  }

  function markMixed(version, reason = 'legacy_runtime_detected') {
    if (version && version !== VERSION) legacyVersions.add(version);
    state.mixed = true;
    state.blocked = true;
    state.reason = reason;
    if (version) state.coreVersion = version;
    for (const fn of [...cleanupFns]) {
      try { fn({ version, reason }); } catch (_) {}
    }
    renderStatus();
    warn('检测到旧核心/混合运行；已阻止 dev.22 继续接管页面', {
      installedVersion: VERSION,
      detectedCoreVersion: version || '',
      reason,
      instanceId,
    });
  }

  function inspectPanel(preflightMode = false) {
    const panel = document.querySelector('#kagura-gpt-panel');
    if (!panel) return { panel: null, versions: [] };
    const versions = extractVersions(panel.textContent || '');
    const foreign = versions.find(v => v !== VERSION);
    if (preflightMode) {
      // dev.22 core has not booted yet; any existing Kagura panel belongs to another runtime.
      markMixed(foreign || versions[0] || 'unknown', 'preexisting_kagura_runtime');
    } else if (foreign) markMixed(foreign, 'legacy_kagura_panel');
    else if (versions.includes(VERSION)) state.coreVersion = VERSION;
    return { panel, versions };
  }

  function renderStatus() {
    try {
      const panel = document.querySelector('#kagura-gpt-panel');
      if (panel) {
        let badge = panel.querySelector('#kagura-runtime-fingerprint-badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'kagura-runtime-fingerprint-badge';
          badge.style.cssText = 'margin:6px 10px 8px;padding:6px 8px;border-radius:8px;font:600 11px/1.35 system-ui;word-break:break-all;';
          panel.appendChild(badge);
        }
        const core = state.coreVersion || (state.mixed ? [...legacyVersions][0] : VERSION);
        badge.textContent = state.mixed || state.secondary
          ? `⚠ 混合运行｜安装 ${VERSION}｜页面核心 ${core || '未知'}｜RID ${instanceId.slice(0, 8)}`
          : `Runtime ${VERSION}｜RID ${instanceId.slice(0, 8)}`;
        badge.style.background = state.mixed || state.secondary ? 'rgba(220,38,38,.12)' : 'rgba(16,185,129,.10)';
        badge.style.color = state.mixed || state.secondary ? '#b91c1c' : '#047857';
      }

      let banner = document.getElementById('kagura-runtime-mismatch-banner');
      if (!(state.mixed || state.secondary)) {
        banner?.remove();
        return;
      }
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'kagura-runtime-mismatch-banner';
        banner.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:14px;transform:translateX(-50%);max-width:min(760px,calc(100vw - 24px));padding:10px 14px;border:1px solid rgba(220,38,38,.35);border-radius:10px;background:#fff7f7;color:#991b1b;box-shadow:0 8px 30px rgba(0,0,0,.16);font:600 13px/1.45 system-ui;';
        document.documentElement.appendChild(banner);
      }
      const core = state.coreVersion || [...legacyVersions][0] || state.ownerVersion || '未知';
      banner.textContent = `Kagura ImageFlow 检测到混合运行：安装 ${VERSION}，页面核心 ${core}。为避免新上传拦截影响旧核心，本页已阻止 dev.22 接管/启动。请完整刷新页面；若刷新后仍出现，请在油猴中停用旧版本。`;
    } catch (_) {}
  }

  const observer = new MutationObserver(() => {
    inspectPanel();
    renderStatus();
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); } catch (_) {}

  document.addEventListener('click', event => {
    if (!(state.mixed || state.secondary)) return;
    const target = event.target instanceof Element ? event.target.closest('#kagura-gpt-panel button, #kagura-gpt-panel [role="button"]') : null;
    if (!target) return;
    const text = String(target.textContent || target.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (!/(开始|继续|start|resume)/i.test(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderStatus();
  }, true);

  function isOwner() {
    const owner = readOwner();
    return Boolean(!state.secondary && owner?.version === VERSION && owner?.instanceId === instanceId);
  }

  function registerCleanup(fn) {
    if (typeof fn !== 'function') return () => {};
    cleanupFns.add(fn);
    if (state.mixed || state.secondary) {
      try { fn({ reason: state.reason }); } catch (_) {}
    }
    return () => cleanupFns.delete(fn);
  }

  async function preflight(waitMs = 2200) {
    if (state.secondary) {
      renderStatus();
      return false;
    }
    const deadline = Date.now() + Math.max(400, Number(waitMs) || 2200);
    while (Date.now() < deadline) {
      inspectPanel(true);
      if (state.mixed || !isOwner()) {
        state.blocked = true;
        renderStatus();
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    inspectPanel(true);
    if (state.mixed || !isOwner()) {
      state.blocked = true;
      renderStatus();
      return false;
    }
    state.blocked = false;
    const owner = readOwner();
    if (owner && owner.instanceId === instanceId) {
      owner.status = 'active';
      owner.heartbeatAt = Date.now();
    }
    log('Runtime preflight passed', { version: VERSION, instanceId });
    return true;
  }

  function fingerprint() {
    const owner = readOwner();
    return {
      installedVersion: VERSION,
      runtimeVersion: globalThis.KaguraRuntimeVersion || VERSION,
      ownerVersion: String(owner?.version || state.ownerVersion || ''),
      ownerInstanceId: String(owner?.instanceId || state.ownerInstanceId || ''),
      instanceId,
      startedAt,
      coreVersion: state.coreVersion || '',
      mixedRuntime: Boolean(state.mixed),
      secondaryRuntime: Boolean(state.secondary),
      blocked: Boolean(state.blocked),
      reason: state.reason || '',
      legacyVersions: [...legacyVersions],
    };
  }

  globalThis.KaguraRuntimeVersion = VERSION;
  globalThis.__KaguraRuntimeFingerprint = fingerprint;
  globalThis.KaguraRuntimeGuard = Object.freeze({
    version: VERSION,
    instanceId,
    preflight,
    isOwner,
    registerCleanup,
    fingerprint,
    inspectPanel,
    markMixed,
    renderStatus,
    get mixed() { return state.mixed; },
    get secondary() { return state.secondary; },
    get blocked() { return state.blocked; },
  });

  setInterval(() => {
    try {
      if (!isOwner()) return;
      const owner = readOwner();
      owner.heartbeatAt = Date.now();
      inspectPanel();
      renderStatus();
    } catch (_) {}
  }, 5000);

  queueMicrotask(() => {
    inspectPanel();
    renderStatus();
  });
})();