// ==UserScript==
// @name         1688 Codex 图搜助手
// @name:zh-CN   Ozon→1688 Codex 找同款助手 V1.9.0
// @namespace    kagura.1688.codex.image.search
// @version      1.9.0
// @description  热更新通道正式版：接入 Utopia-update，与现有脚本一致自动检测新版并弹窗提醒；仅手动确认覆盖更新，不自动下载安装。保留 V1.8.3 全部找同款/结批能力。
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/1688_Codex_ImageSearch.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/1688_Codex_ImageSearch.user.js
// @match        https://1688.com/*
// @match        https://*.1688.com/*
// @match        https://ozon.ru/*
// @match        https://www.ozon.ru/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      www.ozon.ru
// @connect      api.ozon.ru
// @connect      ir.ozone.ru
// @connect      *.ozone.ru
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async () => {
  'use strict';

  if (window.top !== window.self) return;

  const VERSION = '1.9.0';
  const UPDATE_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/1688_Codex_ImageSearch.latest.json?ref=main';
  const UPDATE_HISTORY_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/1688_Codex_ImageSearch.history.json?ref=main';
  const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const UPDATE_SNOOZE_MS = 6 * 60 * 60 * 1000;
  const UPDATE_KEYS = {
    lastCheck: 'kagura_1688_codex_update_last_check_v1',
    ignoredVersion: 'kagura_1688_codex_update_ignored_v1',
    snoozeUntil: 'kagura_1688_codex_update_snooze_v1',
  };

  const gmGet = (key, fallback) => {
    try {
      const v = GM_getValue(key, fallback);
      return v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const gmSet = async (key, value) => { GM_setValue(key, value); return value; };
  const gmDel = async key => { try { GM_deleteValue(key); } catch {} };

  function compareVersions(a, b) {
    const A = String(a || '').split('.').map(v => parseInt(v, 10) || 0);
    const B = String(b || '').split('.').map(v => parseInt(v, 10) || 0);
    const len = Math.max(A.length, B.length);
    for (let i = 0; i < len; i++) {
      const av = A[i] || 0, bv = B[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function requestText(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const finalUrl = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
      GM_xmlhttpRequest({
        method: 'GET',
        url: finalUrl,
        timeout,
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload: res => res.status >= 200 && res.status < 300
          ? resolve(String(res.responseText || '').trim())
          : reject(new Error(`HTTP ${res.status}`)),
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('检查更新超时')),
      });
    });
  }

  function escapeUpdateHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function normalizeChangelog(value) {
    if (Array.isArray(value)) return value.map(x => String(x)).filter(Boolean);
    if (typeof value === 'string') return value.split(/\r?\n/).map(x => x.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
    return [];
  }

  function removeUpdateModal() {
    document.getElementById('kagura-1688-update-modal')?.remove();
  }

  function showNativeUpdateInstructions(latestVersion) {
    const modal = document.getElementById('kagura-1688-update-modal');
    const content = modal?.querySelector('[data-update-content]');
    if (!modal || !content) return;
    let opened = false;
    try {
      const tm = unsafeWindow?.external?.Tampermonkey || window?.external?.Tampermonkey;
      if (tm && typeof tm.openOptions === 'function') {
        tm.openOptions('nav=dashboard');
        opened = true;
      }
    } catch (error) {
      console.warn('[1688 Codex 图搜助手] 无法直接打开 Tampermonkey 管理面板', error);
    }
    content.innerHTML = `
      <div style="font-size:17px;font-weight:800;margin-bottom:10px">手动覆盖更新</div>
      <div style="line-height:1.8">
        已检测到新版 <b>V${escapeUpdateHtml(latestVersion)}</b>。脚本不会自动下载或自动替换。<br><br>
        1. 打开浏览器右上角 <b>Tampermonkey</b> 图标。<br>
        2. 进入 <b>管理面板</b>，找到“1688 Codex 图搜助手”。<br>
        3. 进入该脚本 <b>设置</b>。<br>
        4. 点击 <b>检查用户脚本的更新</b>。<br>
        5. 检测到新版后选择 <b>Overwrite（覆盖）</b>。
      </div>
      <div style="margin-top:10px;font-size:12px;color:#667085">${opened ? '已尝试打开 Tampermonkey 管理面板。' : '浏览器未开放 Tampermonkey 面板跳转接口，请按上面的步骤操作。'}</div>`;
  }

  function showUpdateModal(manifest, { manual = false } = {}) {
    removeUpdateModal();
    const latest = String(manifest.version || '').trim();
    const changes = normalizeChangelog(manifest.changelog || manifest.notes || manifest.update_notes);
    const wrap = document.createElement('div');
    wrap.id = 'kagura-1688-update-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif';
    wrap.innerHTML = `
      <div style="width:min(500px,94vw);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.28);padding:20px;color:#20242a">
        <div data-update-content>
          <div style="font-size:18px;font-weight:800;margin-bottom:12px">发现新版本</div>
          <div style="line-height:1.8">1688 Codex 图搜助手<br>当前版本：<b>V${escapeUpdateHtml(VERSION)}</b><br>最新版本：<b style="color:#1677ff">V${escapeUpdateHtml(latest)}</b>${manifest.published_at ? `<br>发布日期：${escapeUpdateHtml(manifest.published_at)}` : ''}</div>
          <div style="margin-top:12px;padding:10px 12px;background:#f6f8fa;border-radius:8px;max-height:200px;overflow:auto"><b>更新内容</b>${changes.length ? `<ul style="margin:7px 0 0 20px;padding:0">${changes.map(x => `<li>${escapeUpdateHtml(x)}</li>`).join('')}</ul>` : '<div style="margin-top:6px;color:#6c7683">未提供更新说明</div>'}</div>
          <div style="margin-top:10px;font-size:12px;color:#667085">只提醒，不自动更新。只有你手动确认后才通过 Tampermonkey 覆盖更新。</div>
        </div>
        <div data-update-actions style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
          <button data-x="ignore" style="padding:8px 12px;border:1px solid #ccd2da;background:#fff;border-radius:7px;cursor:pointer">忽略 V${escapeUpdateHtml(latest)}</button>
          <button data-x="later" style="padding:8px 12px;border:1px solid #ccd2da;background:#fff;border-radius:7px;cursor:pointer">稍后提醒</button>
          <button data-x="update" style="padding:8px 14px;border:1px solid #1677ff;background:#1677ff;color:#fff;border-radius:7px;cursor:pointer;font-weight:700">立即更新</button>
        </div>
      </div>`;
    document.documentElement.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap && manual) removeUpdateModal(); });
    wrap.querySelector('[data-x="later"]').onclick = async () => {
      await gmSet(UPDATE_KEYS.snoozeUntil, Date.now() + UPDATE_SNOOZE_MS);
      removeUpdateModal();
    };
    wrap.querySelector('[data-x="ignore"]').onclick = async () => {
      await gmSet(UPDATE_KEYS.ignoredVersion, latest);
      removeUpdateModal();
    };
    wrap.querySelector('[data-x="update"]').onclick = () => {
      showNativeUpdateInstructions(latest);
      const actions = wrap.querySelector('[data-update-actions]');
      if (actions) actions.innerHTML = '<button data-x="close" style="padding:8px 14px;border:1px solid #ccd2da;background:#fff;border-radius:7px;cursor:pointer">我知道了</button>';
      wrap.querySelector('[data-x="close"]').onclick = removeUpdateModal;
    };
  }

  async function checkForUpdate({ manual = false, force = false } = {}) {
    try {
      const now = Date.now();
      if (!manual && !force) {
        const last = Number(gmGet(UPDATE_KEYS.lastCheck, 0)) || 0;
        if (now - last < UPDATE_CHECK_INTERVAL_MS) return;
      }
      await gmSet(UPDATE_KEYS.lastCheck, now);
      const manifest = JSON.parse(await requestText(UPDATE_MANIFEST_URL));
      const latest = String(manifest.version || '').trim();
      if (!latest) throw new Error('latest.json 缺少 version');
      if (compareVersions(latest, VERSION) <= 0) {
        if (manual) alert(`当前已经是最新版本 V${VERSION}`);
        return;
      }
      if (!manual) {
        const ignored = String(gmGet(UPDATE_KEYS.ignoredVersion, '') || '');
        const snoozeUntil = Number(gmGet(UPDATE_KEYS.snoozeUntil, 0)) || 0;
        if (ignored === latest || snoozeUntil > now) return;
      }
      showUpdateModal(manifest, { manual });
    } catch (error) {
      console.warn('[1688 Codex 图搜助手] 检查更新失败', error);
      if (manual) alert(`检查更新失败：${error?.message || error}`);
    }
  }

  async function builtinCore(api) {
  'use strict';

  const APP = {
    name: '1688 Codex 图搜助手',
    panelId: 'kagura-1688-codex-helper',
    dbName: 'kagura_1688_codex_image_db_v1',
    dbVersion: 1,
    storeName: 'images',
    stateKey: 'kagura_1688_codex_state_v1',
    layoutKey: 'kagura_1688_codex_layout_v1',
    codeSettingsKey: 'kagura_1688_codex_code_settings_v1',
    ozonPacingKey: 'kagura_1688_codex_ozon_pacing_v1',
    sequenceLedgerKey: 'kagura_1688_codex_sequence_ledger_v1',
    codeRegistryKey: 'kagura_1688_codex_code_registry_v1',
    batchHistoryKey: 'kagura_1688_codex_batch_history_v1',
    projectInfoKey: 'kagura_1688_codex_project_info_v1',
    resultSignalKey: 'kagura_1688_codex_result_signal_v1',
    resultSignalTtlMs: 5 * 60 * 1000,
    cacheEventKey: 'kagura_1688_codex_cache_event_v1',
    cacheSyncMetaKey: 'kagura_1688_codex_cache_sync_meta_v1',
    matchActionKey: 'kagura_1688_codex_match_action_v1',
    controllerKey: 'kagura_1688_codex_controller_v1',
    controllerLeaseMs: 15 * 1000,
    candidateWorkKey: 'kagura_1688_codex_candidate_work_v1',
    candidateFocusKey: 'kagura_1688_codex_candidate_focus_v1',
    candidateWorkTarget: 'kagura_1688_codex_candidate_work',
    batchLockKey: 'kagura_1688_codex_batch_lock_v1',
    batchLockTtlMs: 45 * 1000,
    candidateHeartbeatMs: 2500,
    candidateStaleMs: 12000,
    liveSyncPollMs: 1500,
    maxLogs: 1500,
    inlineLogCount: 12,
    searchTimeoutMs: 30000,
    submitRetries: 2,
  };

  const DEFAULT_LAYOUT = Object.freeze({
    right: 18,
    top: 92,
    width: 350,
    height: 430,
    minimized: false,
    logsOpen: false,
  });

  const DEFAULT_STATE = Object.freeze({
    tasks: [],
    currentIndex: 0,
    running: false,
    paused: false,
    batchStartedAt: 0,
    currentStartedAt: 0,
    liveMode: false,
    waitingForOzon: false,
    lastCacheRevision: 0,
    logs: [],
    ozonCacheRunner: {
      active: false,
      paused: false,
      queueSkus: [],
      cursor: 0,
      ok: 0,
      fail: 0,
      consecutiveFail: 0,
      startedAt: 0,
      stage: 'idle',
      currentSku: '',
      directTried: false,
      waitUntil: 0,
      waitReason: '',
      processedSinceLongRest: 0,
      longRestTarget: 0,
    },
    stats: {
      total: 0,
      matched: 0,
      available: 0,
      reviewNeeded: 0,
      batched: 0,
      noMatch: 0,
      noValidSupplier: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
    },
  });

  const DEFAULT_CODE_SETTINGS = Object.freeze({
    mode: 'visual',
    prefix: 'rarn',
    separator: '-',
    dateFormat: 'MMDD',
    seqWidth: 3,
    startSeq: 1,
    suffix: '',
    template: 'rarn-{MMDD}-{SEQ3}',
    subValue: '1',
  });


  // V1.7.4：Ozon访问节奏默认偏保守。随机等待只能降低连续访问频率，不能保证规避平台风控。
  const DEFAULT_OZON_PACING = Object.freeze({
    enabled: true,
    minDelaySec: 4,
    maxDelaySec: 8,
    failureBackoffEnabled: true,
    failureMinSec: 15,
    failureMaxSec: 30,
    longRestEnabled: true,
    longEveryMin: 8,
    longEveryMax: 14,
    longMinSec: 30,
    longMaxSec: 60,
  });

  let state = loadState();
  // V1.8.3：保持V1.8.2 Skill结构化Gate；批次导出统一改为项目目录固定路径，重新导出直接覆盖原批次目录，ZIP仅作为显式可选动作。
  // V1.9.0：正式启用 GitHub 热更新通道。自动检查只负责提醒；“立即更新”仅引导 Tampermonkey 原生覆盖，禁止自动下载、自动安装或静默替换。
  // 只恢复为可重试状态，不自动判断有无同款。
  let migratedFalseFailures = 0;
  for (const task of state.tasks || []) {
    if (task?.status === 'failed' && /未检测到1688图搜结果/.test(String(task.lastError || ''))) {
      task.status = 'pending';
      task.lastError = '';
      migratedFalseFailures++;
    }
  }
  if (migratedFalseFailures) {
    await api.setValue(APP.stateKey, state);
  }
  const savedLayout = await api.getValue(APP.layoutKey, {});
  let layout = { ...DEFAULT_LAYOUT, ...(savedLayout && typeof savedLayout === 'object' ? savedLayout : {}) };
  // 从 V1.7.2 升级时旧布局没有 height/logsOpen；首次进入 V1.7.3 自动收紧一次，之后完全尊重用户手动调整。
  if (!savedLayout || typeof savedLayout !== 'object' || !Object.prototype.hasOwnProperty.call(savedLayout, 'height')) {
    layout.width = Math.min(Number(layout.width) || DEFAULT_LAYOUT.width, DEFAULT_LAYOUT.width);
    layout.height = DEFAULT_LAYOUT.height;
    layout.logsOpen = false;
  }
  let panel = null;
  let uiTimer = null;
  let activeRunToken = 0;
  const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  let cacheFeedListenerId = null;
  let matchActionListenerId = null;
  let cacheSyncTimer = null;
  let cacheSyncPollTick = 0;
  let controllerHeartbeatTimer = null;
  let cacheSyncBusy = false;
  let autoStartScheduled = false;
  let noticeState = null;
  let noticeTimer = null;
  let realtimeWakeBound = false;
  let runtimeLogWindow = null;
  let runtimeLogTimer = null;
  let runtimeLogSearch = '';
  let runtimeLogLevel = 'all';
  let runtimeLogAutoScroll = true;
  let runtimeLogMinimized = false;
  let runtimeLogFullscreen = false;
  let candidateHeartbeatTimer = null;
  let candidateRetargetTimer = null;
  let candidateWatchTimer = null;
  let candidateFocusListenerId = null;
  let candidateWorkWindowRef = null;
  let candidateWorkLastAlive = null;
  let candidateWorkLastSku = '';
  let candidateWorkLastUrlLogged = '';

  const HOST = String(location.hostname || '').toLowerCase();
  const IS_1688 = HOST === '1688.com' || HOST.endsWith('.1688.com');
  const IS_OZON = HOST === 'ozon.ru' || HOST === 'www.ozon.ru';
  const SITE_LABEL = IS_OZON ? 'Ozon 缓存端' : (IS_1688 ? '1688 匹配端' : '未知站点');

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeOzonPacingSettings(raw) {
    const x = { ...DEFAULT_OZON_PACING, ...(raw && typeof raw === 'object' ? raw : {}) };
    x.enabled = x.enabled !== false;
    x.minDelaySec = clampNumber(x.minDelaySec, 0, 120, DEFAULT_OZON_PACING.minDelaySec);
    x.maxDelaySec = clampNumber(x.maxDelaySec, x.minDelaySec, 180, Math.max(x.minDelaySec, DEFAULT_OZON_PACING.maxDelaySec));
    x.failureBackoffEnabled = x.failureBackoffEnabled !== false;
    x.failureMinSec = clampNumber(x.failureMinSec, 0, 300, DEFAULT_OZON_PACING.failureMinSec);
    x.failureMaxSec = clampNumber(x.failureMaxSec, x.failureMinSec, 600, Math.max(x.failureMinSec, DEFAULT_OZON_PACING.failureMaxSec));
    x.longRestEnabled = x.longRestEnabled !== false;
    x.longEveryMin = Math.round(clampNumber(x.longEveryMin, 1, 500, DEFAULT_OZON_PACING.longEveryMin));
    x.longEveryMax = Math.round(clampNumber(x.longEveryMax, x.longEveryMin, 1000, Math.max(x.longEveryMin, DEFAULT_OZON_PACING.longEveryMax)));
    x.longMinSec = clampNumber(x.longMinSec, 0, 1800, DEFAULT_OZON_PACING.longMinSec);
    x.longMaxSec = clampNumber(x.longMaxSec, x.longMinSec, 3600, Math.max(x.longMinSec, DEFAULT_OZON_PACING.longMaxSec));
    return x;
  }

  function getOzonPacingSettings() {
    return normalizeOzonPacingSettings(api.getValueSync(APP.ozonPacingKey, DEFAULT_OZON_PACING));
  }

  async function saveOzonPacingSettings(settings) {
    const clean = normalizeOzonPacingSettings(settings);
    await api.setValue(APP.ozonPacingKey, clean);
    return clean;
  }

  function randomBetween(min, max) {
    const a = Number(min) || 0, b = Math.max(a, Number(max) || a);
    return a + Math.random() * (b - a);
  }

  function randomIntInclusive(min, max) {
    const a = Math.ceil(Number(min) || 0), b = Math.floor(Math.max(a, Number(max) || a));
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function ozonPacingSummary(settings = getOzonPacingSettings()) {
    if (!settings.enabled) return '关闭';
    let text = `随机 ${settings.minDelaySec}–${settings.maxDelaySec} 秒`;
    if (settings.longRestEnabled) text += ` · 每 ${settings.longEveryMin}–${settings.longEveryMax} 个长休息 ${settings.longMinSec}–${settings.longMaxSec} 秒`;
    if (settings.failureBackoffEnabled) text += ` · 失败退避 ${settings.failureMinSec}–${settings.failureMaxSec} 秒`;
    return text;
  }
  const now = () => Date.now();
  const normalizeText = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  // V1.8.2：与 ozon-1688-source-match Skill 的 output schema 对齐。
  function defaultMatchData() {
    return {
      supplierUrl:'', supplier:'', variant:'',
      supplierUnitQty:'', ozonUnitQty:'', requiredSupplierQty:'',
      activityBeforePrice:'', goodsValue:'', shipping:'', finalCost:'',
      moq:'', moqGate:'',
      specEvidence:'', priceEvidence:'', shippingEvidence:'', note:'', conclusion:'',
      legacyNormalPrice:'', legacyVariant:'', legacyMoq:'', legacyShipping:'',
    };
  }

  function normalizeConclusion(value, fallback='') {
    const v = String(value || fallback || '').toUpperCase().trim();
    if (['MATCHED','NO_MATCH','NO_VALID_SUPPLIER','RETRY'].includes(v)) return v;
    return '';
  }

  function normalizeMatchData(raw) {
    const x = { ...defaultMatchData(), ...(raw && typeof raw === 'object' ? raw : {}) };
    // 兼容旧版字段：只保留证据，不把旧“正常单价”自动当成活动前价。
    if (!x.legacyNormalPrice && x.normalPrice) x.legacyNormalPrice = String(x.normalPrice);
    if (!x.legacyVariant && x.variant) x.legacyVariant = String(x.variant);
    if (!x.legacyMoq && x.moq) x.legacyMoq = String(x.moq);
    if (!x.legacyShipping && x.shipping) x.legacyShipping = String(x.shipping);
    x.conclusion = normalizeConclusion(x.conclusion);
    return x;
  }

  function finitePositive(value, allowZero=false) {
    const n = Number(value);
    return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : null;
  }

  function calculateMatchCost(raw) {
    const data = normalizeMatchData(raw);
    const activityBeforePrice = finitePositive(data.activityBeforePrice);
    const requiredSupplierQty = finitePositive(data.requiredSupplierQty);
    const shipping = finitePositive(data.shipping, true);
    const moq = finitePositive(data.moq);
    const supplierUnitQty = finitePositive(data.supplierUnitQty);
    const ozonUnitQty = finitePositive(data.ozonUnitQty);
    const goodsValue = activityBeforePrice !== null && requiredSupplierQty !== null
      ? activityBeforePrice * requiredSupplierQty : null;
    const finalCost = goodsValue !== null && shipping !== null ? goodsValue + shipping : null;
    const moqPass = moq !== null && moq < 5;
    return { data, activityBeforePrice, requiredSupplierQty, shipping, moq, supplierUnitQty, ozonUnitQty, goodsValue, finalCost, moqPass };
  }

  function validateMatchedData(raw) {
    const c = calculateMatchCost(raw);
    const errors = [];
    if (!normalizeText(c.data.supplierUrl)) errors.push('缺少1688最终链接');
    if (!normalizeText(c.data.variant)) errors.push('缺少1688具体规格');
    if (c.supplierUnitQty === null) errors.push('1688单销售单位包含数量无效');
    if (c.ozonUnitQty === null) errors.push('Ozon单销售单位包含数量无效');
    if (c.requiredSupplierQty === null) errors.push('组成1个Ozon销售单位所需1688数量无效');
    if (c.activityBeforePrice === null) errors.push('活动前单价无效');
    if (c.shipping === null) errors.push('正常运费无效');
    if (c.moq === null) errors.push('MOQ无效');
    else if (!c.moqPass) errors.push(`MOQ=${c.moq}，规则要求MOQ必须小于5`);
    if (!normalizeText(c.data.specEvidence)) errors.push('缺少规格证据');
    if (!normalizeText(c.data.priceEvidence)) errors.push('缺少价格证据');
    if (!normalizeText(c.data.shippingEvidence)) errors.push('缺少运费证据');
    if (c.goodsValue === null || c.finalCost === null) errors.push('成本无法计算');
    return { ...c, ok: errors.length === 0, errors };
  }

  function taskNeedsStructuredReview(task) {
    if (!task || task.status !== 'completed') return false;
    return !validateMatchedData(task.matchData || {}).ok;
  }

  function ensureTaskShape(task) {
    if (!task || typeof task !== 'object') return task;
    task.sku = String(task.sku || '').trim();
    task.title = String(task.title || '');
    task.imageName = String(task.imageName || '');
    task.cacheStatus = task.cacheStatus || (task.imageName ? 'ready' : 'pending');
    task.status = task.status || 'pending';
    task.attempts = Number(task.attempts || 0);
    task.finalCode = String(task.finalCode || '');
    task.batchId = String(task.batchId || '');
    task.matchData = normalizeMatchData(task.matchData || {});
    if (task.status === 'completed') task.matchData.conclusion = 'MATCHED';
    if (task.status === 'no_match') task.matchData.conclusion = 'NO_MATCH';
    if (task.status === 'no_valid_supplier') task.matchData.conclusion = 'NO_VALID_SUPPLIER';
    if (task.status === 'retry') task.matchData.conclusion = 'RETRY';
    return task;
  }

  function formatMoney(n) {
    return Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '';
  }

  function getTaskStatusLabel(task) {
    if (!task) return '未开始';
    if (task.status === 'completed') return taskNeedsStructuredReview(task) ? '有同款 / 待补规格成本' : '有同款 / 可结批';
    if (task.status === 'batched') return '已结批';
    if (task.status === 'no_match') return '无同款';
    if (task.status === 'no_valid_supplier') return '无合适货源';
    if (task.status === 'retry') return '待重试';
    if (task.status === 'candidate_review') return '等待 Codex 核验';
    if (task.status === 'searching') return '正在图搜';
    if (task.status === 'result_loading') return '等待图搜结果';
    if (task.status === 'submitted') return '已提交图搜';
    if (task.status === 'failed') return '失败';
    if (task.status === 'skipped') return '已跳过';
    return '待处理';
  }

  function isTerminalTask(task) {
    return ['completed','batched','no_match','no_valid_supplier','failed','skipped'].includes(task?.status);
  }

  function isActiveTask(task) {
    return ['searching','submitted','result_loading','candidate_review','retry'].includes(task?.status);
  }

  function isReadyFor1688(task) {
    return task?.cacheStatus === 'ready' && Boolean(task?.imageName);
  }

  function isTaskPendingFor1688(task) {
    return ['pending','retry','failed'].includes(task?.status) && !task?.batchId;
  }

  function nextRunnableIndex(from = 0) {
    for (let i = Math.max(0, from); i < state.tasks.length; i++) {
      if (isTaskPendingFor1688(state.tasks[i]) && isReadyFor1688(state.tasks[i])) return i;
    }
    for (let i = 0; i < Math.max(0, from); i++) {
      if (isTaskPendingFor1688(state.tasks[i]) && isReadyFor1688(state.tasks[i])) return i;
    }
    return -1;
  }

  function taskBySku(sku) {
    return state.tasks.find(t => String(t?.sku || '') === String(sku || '')) || null;
  }

  function currentTask() {
    return state.tasks[state.currentIndex] || null;
  }

  function currentTaskSku() {
    return currentTask()?.sku || '';
  }

  function calcStats() {
    let matched = 0, available = 0, reviewNeeded = 0, batched = 0, noMatch = 0, noValidSupplier = 0, failed = 0, skipped = 0, pending = 0, cached = 0;
    for (const t of state.tasks) {
      ensureTaskShape(t);
      if (t.cacheStatus === 'ready' && t.imageName) cached++;
      if (t.status === 'completed') {
        matched++;
        if (taskNeedsStructuredReview(t)) reviewNeeded++;
        else if (!t.finalCode && !t.batchId) available++;
      }
      else if (t.status === 'batched') batched++;
      else if (t.status === 'no_match') noMatch++;
      else if (t.status === 'no_valid_supplier') noValidSupplier++;
      else if (t.status === 'failed') failed++;
      else if (t.status === 'skipped') skipped++;
      else pending++;
    }
    state.stats = { total:state.tasks.length, matched, available, reviewNeeded, batched, noMatch, noValidSupplier, failed, skipped, pending, cached };
    return state.stats;
  }

  function loadState() {
    const saved = GM_getValue(APP.stateKey, null);
    const fresh = saved && typeof saved === 'object' ? { ...DEFAULT_STATE, ...saved } : structuredClone(DEFAULT_STATE);
    fresh.tasks = Array.isArray(fresh.tasks) ? fresh.tasks.map(ensureTaskShape) : [];
    fresh.stats = { ...DEFAULT_STATE.stats, ...(fresh.stats || {}) };
    fresh.ozonCacheRunner = { ...DEFAULT_STATE.ozonCacheRunner, ...(fresh.ozonCacheRunner || {}) };
    fresh.logs = Array.isArray(fresh.logs) ? fresh.logs : [];
    return fresh;
  }

  async function persistState() {
    calcStats();
    await api.setValue(APP.stateKey, state);
  }

  function safeClone(value, fallback = null) {
    try { return structuredClone(value); } catch {}
    try { return JSON.parse(JSON.stringify(value)); } catch {}
    return fallback;
  }

  function snapshotState() {
    return safeClone(state, structuredClone(DEFAULT_STATE));
  }

  function applyStateSnapshot(snapshot, { keepLocalLogs = true } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const localLogs = keepLocalLogs ? (state.logs || []) : [];
    const next = { ...DEFAULT_STATE, ...snapshot };
    next.tasks = Array.isArray(next.tasks) ? next.tasks.map(ensureTaskShape) : [];
    next.stats = { ...DEFAULT_STATE.stats, ...(next.stats || {}) };
    next.ozonCacheRunner = { ...DEFAULT_STATE.ozonCacheRunner, ...(next.ozonCacheRunner || {}) };
    next.logs = keepLocalLogs ? mergeLogEntries(next.logs, localLogs) : (Array.isArray(next.logs) ? next.logs : []);
    state = next;
    calcStats();
    return true;
  }

  async function setLayout(next) {
    layout = { ...layout, ...next };
    await api.setValue(APP.layoutKey, layout);
  }

  function getCodeSettings() {
    const saved = api.getValueSync(APP.codeSettingsKey, DEFAULT_CODE_SETTINGS);
    return { ...DEFAULT_CODE_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  }

  async function saveCodeSettings(settings) {
    await api.setValue(APP.codeSettingsKey, { ...DEFAULT_CODE_SETTINGS, ...settings });
  }

  function currentUrl() { return location.href; }

  function logContext() {
    const task = currentTask();
    const work = getCandidateWorkInfo();
    const runner = state.ozonCacheRunner || {};
    const phase = IS_OZON
      ? (runner.stage || (runner.active ? 'ozon_cache' : 'idle'))
      : (task?.status || (state.liveMode ? (state.waitingForOzon ? 'waiting_ozon' : 'live') : 'idle'));
    return {
      sku: String(task?.sku || runner.currentSku || work?.sku || ''),
      phase: String(phase || ''),
      site: SITE_LABEL,
      role: IS_1688 ? (isControllerTab() ? 'controller' : (isCandidateWorkTab() ? 'candidate' : 'sync')) : 'ozon',
      url: currentUrl(),
    };
  }

  function log(message, level='info', detail = null) {
    const ctx = logContext();
    state.logs.push({ ts:new Date().toISOString(), level, message:String(message), detail, ...ctx });
    if (state.logs.length > APP.maxLogs) state.logs.splice(0, state.logs.length - APP.maxLogs);
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${APP.name}] ${message}`, detail || '');
    try { GM_setValue(APP.stateKey, state); } catch {}
    if (runtimeLogWindow) renderRuntimeLogWindow();
  }

  function clearLogs() {
    state.logs = [];
    try { GM_setValue(APP.stateKey, state); } catch {}
    if (runtimeLogWindow) renderRuntimeLogWindow();
    render();
  }

  function downloadText(name, text, type='text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function buildLogText() {
    calcStats();
    const lines = [];
    lines.push(`${APP.name} v${VERSION}`);
    lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`);
    lines.push(`页面: ${location.href}`);
    lines.push(`任务总数: ${state.stats.total}`);
    lines.push(`已匹配: ${state.stats.matched} | 可结批: ${state.stats.available} | 待补核验: ${state.stats.reviewNeeded || 0} | 已结批: ${state.stats.batched} | 无同款: ${state.stats.noMatch} | 无合适货源: ${state.stats.noValidSupplier || 0} | 失败: ${state.stats.failed} | 待处理: ${state.stats.pending}`);
    lines.push('');
    lines.push('=== 当前任务队列 ===');
    state.tasks.forEach((t, i) => {
      const m = normalizeMatchData(t.matchData || {});
      lines.push(`${i+1}. OzonSKU=${t.sku} | final=${t.finalCode || ''} | batch=${t.batchId || ''} | status=${t.status || ''} | conclusion=${m.conclusion || ''} | attempts=${t.attempts || 0} | image=${t.imageName || ''} | title=${t.title || ''} | supplierUrl=${m.supplierUrl || ''} | variant=${m.variant || ''} | supplierUnitQty=${m.supplierUnitQty || ''} | ozonUnitQty=${m.ozonUnitQty || ''} | requiredSupplierQty=${m.requiredSupplierQty || ''} | activityBeforePrice=${m.activityBeforePrice || ''} | goodsValue=${m.goodsValue || ''} | shipping=${m.shipping || ''} | finalCost=${m.finalCost || ''} | moq=${m.moq || ''} | moqGate=${m.moqGate || ''} | error=${t.lastError || ''} | result=${t.resultUrl || ''}`);
    });
    lines.push('');
    lines.push('=== 运行日志 ===');
    for (const item of state.logs) {
      lines.push(`[${item.ts}] [${item.level}] [sku=${item.sku || '-'}] [phase=${item.phase || '-'}] [${item.role || item.site || '-'}] ${item.message}${item.detail ? ` | ${JSON.stringify(item.detail)}` : ''}`);
    }
    return lines.join('\n');
  }

  function exportLogs() {
    downloadText(`1688_Codex图搜助手_日志_${new Date().toISOString().replace(/[:.]/g,'-')}.txt`, buildLogText());
  }

  function mergeTaskSnapshots(localTasks, remoteTasks) {
    const localMap = new Map((Array.isArray(localTasks) ? localTasks : []).filter(t=>t?.sku).map(t=>[String(t.sku), ensureTaskShape({ ...t })]));
    const remoteList = (Array.isArray(remoteTasks) ? remoteTasks : []).filter(t=>t?.sku).map(t=>ensureTaskShape({ ...t }));
    const out = [];
    const seen = new Set();
    for (const remote of remoteList) {
      const sku = String(remote.sku);
      const local = localMap.get(sku);
      if (local) {
        const merged = { ...local, ...remote };
        // 1688结果若本地更新较新，不允许Ozon旧快照把它覆盖掉。
        const localBiz = ['completed','batched','no_match','no_valid_supplier','retry','candidate_review','searching','submitted','result_loading'].includes(local.status);
        const remoteBiz = ['completed','batched','no_match','no_valid_supplier','retry','candidate_review','searching','submitted','result_loading'].includes(remote.status);
        if (localBiz && !remoteBiz) {
          merged.status = local.status;
          merged.matchData = local.matchData;
          merged.finalCode = local.finalCode;
          merged.batchId = local.batchId;
          merged.batchedAt = local.batchedAt;
          merged.resultUrl = local.resultUrl;
          merged.lastError = local.lastError;
        }
        out.push(ensureTaskShape(merged));
      } else out.push(remote);
      seen.add(sku);
    }
    for (const local of localMap.values()) if (!seen.has(String(local.sku))) out.push(local);
    return out;
  }

  function mergeRemoteState(remote, { source='sync', preserveLocalExecution = true } = {}) {
    if (!remote || typeof remote !== 'object') return false;
    const local = snapshotState();
    const merged = { ...local, ...remote };
    merged.tasks = mergeTaskSnapshots(local.tasks, remote.tasks);
    merged.logs = mergeLogEntries(remote.logs, local.logs);
    if (preserveLocalExecution) {
      // 浏览器站点自己的短期执行态不要被另一标签/另一站点抢走。
      merged.liveMode = local.liveMode;
      merged.running = local.running;
      merged.waitingForOzon = local.waitingForOzon;
      merged.currentIndex = local.currentIndex;
      merged.batchStartedAt = local.batchStartedAt;
      merged.currentStartedAt = local.currentStartedAt;
      if (IS_OZON) merged.ozonCacheRunner = local.ozonCacheRunner;
    }
    applyStateSnapshot(merged, { keepLocalLogs:false });
    calcStats();
    return true;
  }

  function syncPayload(type, extra={}) {
    return {
      type,
      revision: now(),
      tabId:TAB_ID,
      origin:IS_OZON ? 'ozon' : (IS_1688 ? '1688' : 'other'),
      ts:now(),
      state:snapshotState(),
      ...extra,
    };
  }

  async function publishCacheEvent(type='cache_update', extra={}) {
    const payload = syncPayload(type, extra);
    await api.setValue(APP.cacheEventKey, payload);
    return payload;
  }

  function controllerInfo() {
    const x = api.getValueSync(APP.controllerKey, null);
    return x && typeof x === 'object' ? x : null;
  }

  function isControllerTab() {
    const c = controllerInfo();
    return Boolean(c && c.tabId === TAB_ID && now() - Number(c.ts || 0) < APP.controllerLeaseMs);
  }

  async function becomeController(reason='manual') {
    const info = { tabId:TAB_ID, ts:now(), url:location.href, reason, sku:currentTaskSku() };
    await api.setValue(APP.controllerKey, info);
    startControllerHeartbeat();
    return info;
  }

  function startControllerHeartbeat() {
    clearInterval(controllerHeartbeatTimer);
    controllerHeartbeatTimer = setInterval(async () => {
      if (!IS_1688) return;
      const c = controllerInfo();
      if (c?.tabId !== TAB_ID) return;
      await api.setValue(APP.controllerKey, { ...c, ts:now(), url:location.href, sku:currentTaskSku() });
    }, Math.max(3000, Math.floor(APP.controllerLeaseMs / 3)));
  }

  function getCandidateWorkInfo() {
    const x = api.getValueSync(APP.candidateWorkKey, null);
    return x && typeof x === 'object' ? x : null;
  }

  function isCandidateWorkTab() {
    const x = getCandidateWorkInfo();
    return Boolean(IS_1688 && x?.tabId === TAB_ID && x?.role === 'candidate_work');
  }

  function candidateWorkAlive(info=getCandidateWorkInfo()) {
    return Boolean(info && info.role === 'candidate_work' && now() - Number(info.heartbeatAt || info.updatedAt || 0) <= APP.candidateStaleMs);
  }

  function isLikely1688OfferUrl(url=location.href) {
    return /https?:\/\/(?:detail\.)?1688\.com\/(?:offer|detail)\//i.test(String(url || '')) || /\/offer\/\d+/i.test(String(url || ''));
  }

  async function markThisTabAsCandidateWork({ sku=currentTaskSku(), source='navigation' }={}) {
    if (!IS_1688 || !isLikely1688OfferUrl()) return false;
    const old = getCandidateWorkInfo();
    const info = {
      ...(old && typeof old === 'object' ? old : {}),
      role:'candidate_work',
      tabId:TAB_ID,
      sku:String(sku || old?.sku || currentTaskSku() || ''),
      url:location.href,
      title:document.title || '',
      updatedAt:now(),
      heartbeatAt:now(),
      source,
    };
    await api.setValue(APP.candidateWorkKey, info);
    candidateWorkLastSku = info.sku;
    return true;
  }

  function startCandidateHeartbeat() {
    clearInterval(candidateHeartbeatTimer);
    candidateHeartbeatTimer = setInterval(async () => {
      if (!IS_1688 || !isCandidateWorkTab()) return;
      const cur = getCandidateWorkInfo();
      const info = {
        ...(cur || {}), role:'candidate_work', tabId:TAB_ID,
        sku:String(cur?.sku || currentTaskSku() || ''),
        url:location.href, title:document.title || '',
        heartbeatAt:now(), updatedAt:now(),
      };
      await api.setValue(APP.candidateWorkKey, info);
    }, APP.candidateHeartbeatMs);
  }

  function startCandidateFocusListener() {
    if (!IS_1688 || candidateFocusListenerId !== null || typeof GM_addValueChangeListener !== 'function') return;
    candidateFocusListenerId = GM_addValueChangeListener(APP.candidateFocusKey, async (_name, _oldValue, newValue) => {
      if (!newValue || typeof newValue !== 'object') return;
      if (newValue.requesterTabId === TAB_ID) return;
      const info = getCandidateWorkInfo();
      if (!info || info.tabId !== TAB_ID || info.role !== 'candidate_work') return;
      if (newValue.targetTabId && newValue.targetTabId !== TAB_ID) return;
      try { window.focus(); } catch {}
      await api.setValue(APP.candidateFocusKey, { ...newValue, acknowledgedBy:TAB_ID, acknowledgedAt:now(), url:location.href });
    });
  }

  async function requestCandidateWorkFocus() {
    if (!IS_1688) return;
    const info = getCandidateWorkInfo();
    if (!info) {
      showNotice('当前还没有候选工作页。先让 Codex 打开一个1688候选商品。', 'warn', 5000);
      return;
    }
    // V1.8.1：如果我们仍持有真实 Window 句柄，仅执行 focus()；绝不再次传入 URL 导航。
    if (candidateWorkWindowRef && !candidateWorkWindowRef.closed) {
      try {
        candidateWorkWindowRef.focus();
        showNotice('已请求切换到现有候选工作页；不会刷新或重新导航。', 'success', 3500);
        log(`已聚焦现有候选工作页（纯focus，不重新导航）：${info.url || ''}`, 'info');
        return;
      } catch (error) {
        log(`直接聚焦候选工作页失败，改用跨标签聚焦请求：${error?.message || error}`, 'warn');
      }
    }
    // 控制页刷新后 Window 句柄会丢失；让候选页自身执行 focus，禁止以 window.open(info.url, target) 作为兜底。
    const req = { id:`focus_${now()}_${Math.random().toString(36).slice(2,7)}`, requesterTabId:TAB_ID, targetTabId:info.tabId || '', requestedAt:now(), sku:info.sku || currentTaskSku() || '' };
    await api.setValue(APP.candidateFocusKey, req);
    showNotice('已向现有候选工作页发送“聚焦”请求。若浏览器阻止后台页面抢焦点，请手动点该标签；不会刷新页面。', 'info', 6500);
    log(`已请求候选工作页自行聚焦（禁止重新导航）：${info.url || ''}`, 'info');
  }

  function candidateWorkStatus() {
    const info = getCandidateWorkInfo();
    if (!info) return { label:'尚未建立', className:'waiting' };
    if (candidateWorkAlive(info)) return { label:`活跃 · ${info.sku || '当前SKU'}`, className:'good' };
    return { label:`等待恢复 · ${info.sku || '当前SKU'}`, className:'waiting' };
  }

  function startCandidateWorkWatch() {
    clearInterval(candidateWatchTimer);
    if (!IS_1688) return;
    candidateWatchTimer = setInterval(() => {
      const info = getCandidateWorkInfo();
      const alive = candidateWorkAlive(info);
      if (candidateWorkLastAlive === null) candidateWorkLastAlive = alive;
      else if (candidateWorkLastAlive && !alive && info) {
        log(`候选工作页心跳暂时中断，当前SKU保持不变并等待恢复：${info.sku || currentTaskSku() || '-'}`, 'warn');
        candidateWorkLastAlive = false;
      } else if (!candidateWorkLastAlive && alive && info) {
        log(`候选工作页已恢复：${info.sku || currentTaskSku() || '-'} · ${info.url || ''}`, 'info');
        candidateWorkLastAlive = true;
      }
      const url = String(info?.url || '');
      if (alive && url && url !== candidateWorkLastUrlLogged) {
        candidateWorkLastUrlLogged = url;
        log(`候选工作页当前商品：${url}`, 'info');
      }
    }, 3000);
  }

  function shouldInterceptCandidateAnchor(anchor) {
    if (!IS_1688 || !anchor || !isControllerTab()) return false;
    const href = String(anchor.href || anchor.getAttribute('href') || '');
    if (!href || !isLikely1688OfferUrl(href)) return false;
    if (anchor.closest(`#${APP.panelId}`) || anchor.closest('#kagura-1688-runtime-log-window')) return false;
    return true;
  }

  function bindCandidateSingleTabNavigation() {
    if (!IS_1688 || candidateRetargetTimer) return;
    const retarget = () => {
      if (!isControllerTab()) return;
      const links = document.querySelectorAll('a[href]');
      for (const a of links) {
        if (!shouldInterceptCandidateAnchor(a)) continue;
        if (a.dataset.kaguraCandidateBound === '1') continue;
        a.dataset.kaguraCandidateBound = '1';
        a.target = APP.candidateWorkTarget;
        a.rel = String(a.rel || '').replace(/\bnoopener\b|\bnoreferrer\b/g,'').trim();
        a.addEventListener('click', async () => {
          const sku = currentTaskSku();
          const href = a.href;
          const existing = getCandidateWorkInfo();
          await api.setValue(APP.candidateWorkKey, {
            ...(existing || {}), role:'candidate_work', targetName:APP.candidateWorkTarget,
            sku, url:href, title:normalizeText(a.textContent || ''), updatedAt:now(), heartbeatAt:0,
            source:'controller_anchor',
          });
          log(`打开/复用候选工作页：${href}`, 'info');
        }, { capture:true });
      }
    };
    retarget();
    candidateRetargetTimer = setInterval(retarget, 1200);
  }

  function getCandidateSkuContext() {
    const info = getCandidateWorkInfo();
    return String(info?.sku || currentTaskSku() || '');
  }

  function currentRuntimeMetrics() {
    calcStats();
    const task = currentTask();
    const work = candidateWorkStatus();
    const nowTs = now();
    const currentStarted = Number(state.currentStartedAt || 0);
    const batchStarted = Number(state.batchStartedAt || 0);
    return {
      running: state.running,
      liveMode: state.liveMode,
      waitingForOzon: state.waitingForOzon,
      currentSku: task?.sku || '',
      currentStatus: getTaskStatusLabel(task),
      currentElapsed: currentStarted ? nowTs - currentStarted : 0,
      totalElapsed: batchStarted ? nowTs - batchStarted : 0,
      workLabel: work.label,
      workClass: work.className,
      progress: `${Math.min(state.currentIndex + 1, state.stats.total || 0)}/${state.stats.total || 0}`,
      ...state.stats,
    };
  }

  function levelLabel(level) {
    return ({info:'信息',warn:'警告',error:'错误',success:'成功'})[level] || String(level || '信息');
  }

  function logLineText(item) {
    const tm = item?.ts ? new Date(item.ts).toLocaleTimeString('zh-CN', { hour12:false }) : '--:--:--';
    const ctx = [item?.sku ? `SKU ${item.sku}` : '', item?.phase ? item.phase : '', item?.role ? item.role : ''].filter(Boolean).join(' · ');
    const detail = item?.detail ? ` | ${typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail)}` : '';
    return `${tm} [${levelLabel(item?.level)}]${ctx ? ` [${ctx}]` : ''} ${item?.message || ''}${detail}`;
  }

  function filteredRuntimeLogs() {
    const q = String(runtimeLogSearch || '').trim().toLowerCase();
    return (state.logs || []).filter(item => {
      if (runtimeLogLevel !== 'all' && String(item?.level || 'info') !== runtimeLogLevel) return false;
      if (q && !logLineText(item).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function runtimeLogStyle() {
    return `
      #kagura-1688-runtime-log-window{position:fixed;left:6vw;top:7vh;width:88vw;height:84vh;z-index:2147483646;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.45);font:13px/1.45 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;display:flex;flex-direction:column;overflow:hidden}
      #kagura-1688-runtime-log-window.min{left:auto;top:auto;right:18px;bottom:18px;width:260px;height:44px;border-radius:10px}
      #kagura-1688-runtime-log-window.full{left:0;top:0;width:100vw;height:100vh;border-radius:0}
      .krl-head{display:flex;align-items:center;gap:8px;padding:9px 11px;background:#0b1220;border-bottom:1px solid #374151;cursor:move;user-select:none}.krl-title{font-weight:800;flex:1;color:#fff}.krl-head button{border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;border-radius:6px;padding:5px 8px;cursor:pointer}.krl-body{display:flex;flex-direction:column;min-height:0;flex:1}.krl-metrics{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:7px;padding:10px;border-bottom:1px solid #374151;background:#111827}.krl-card{background:#1f2937;border:1px solid #374151;border-radius:8px;padding:7px 9px;overflow:hidden}.krl-card b{display:block;color:#93c5fd;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-size:11px;margin-bottom:3px}.krl-card span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.krl-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid #374151}.krl-tools input,.krl-tools select{background:#111827;border:1px solid #4b5563;color:#fff;border-radius:6px;padding:6px 8px}.krl-tools input{min-width:260px;flex:1}.krl-tools button{border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;border-radius:6px;padding:6px 9px;cursor:pointer}.krl-scroll{flex:1;min-height:0;overflow:auto;padding:8px 10px;background:#030712}.krl-line{white-space:pre-wrap;word-break:break-word;padding:3px 4px;border-bottom:1px dashed rgba(107,114,128,.23)}.krl-info{color:#d1d5db}.krl-success{color:#86efac}.krl-warn{color:#fde68a}.krl-error{color:#fca5a5}.krl-foot{padding:6px 10px;border-top:1px solid #374151;color:#9ca3af;font-size:11px}.min .krl-body,.min .krl-foot{display:none}.min .krl-head{border-bottom:0;flex:1}.min .krl-head [data-log-act="full"],.min .krl-head [data-log-act="copy"],.min .krl-head [data-log-act="export"]{display:none}@media(max-width:820px){.krl-metrics{grid-template-columns:repeat(2,minmax(100px,1fr))}}
    `;
  }

  function openRuntimeLogWindow() {
    if (!IS_1688) {
      showNotice('独立运行日志页面用于1688控制端；Ozon端继续使用面板内日志预览和导出日志。', 'info', 4500);
      return;
    }
    if (runtimeLogWindow && document.contains(runtimeLogWindow)) {
      runtimeLogMinimized = false;
      runtimeLogWindow.classList.remove('min');
      renderRuntimeLogWindow();
      return;
    }
    if (!document.getElementById('kagura-1688-runtime-log-style')) {
      const st = document.createElement('style'); st.id='kagura-1688-runtime-log-style'; st.textContent=runtimeLogStyle(); document.documentElement.appendChild(st);
    }
    const win = document.createElement('div');
    win.id = 'kagura-1688-runtime-log-window';
    win.innerHTML = `
      <div class="krl-head">
        <div class="krl-title">1688 Codex 图搜助手 · 运行日志</div>
        <button data-log-act="copy">复制</button><button data-log-act="export">导出TXT</button><button data-log-act="full">最大化</button><button data-log-act="min">最小化</button><button data-log-act="close">关闭</button>
      </div>
      <div class="krl-body">
        <div class="krl-metrics"></div>
        <div class="krl-tools">
          <input data-log-search placeholder="搜索 SKU、阶段、日志内容…">
          <select data-log-level><option value="all">全部级别</option><option value="info">信息</option><option value="success">成功</option><option value="warn">警告</option><option value="error">错误</option></select>
          <button data-log-act="autoscroll">自动滚动：开</button><button data-log-act="clear">清空日志</button>
        </div>
        <div class="krl-scroll"></div>
      </div>
      <div class="krl-foot">日志会持续保存在脚本状态中；控制页记录完整任务推进，候选工作页主要记录当前SKU核验/页面心跳。浏览器连接中断时脚本只保护任务，真正的 Codex 重连由 Skill/提示词执行。</div>`;
    document.documentElement.appendChild(win);
    runtimeLogWindow = win;
    const search = win.querySelector('[data-log-search]'); search.value=runtimeLogSearch; search.oninput=()=>{runtimeLogSearch=search.value; renderRuntimeLogWindow();};
    const level = win.querySelector('[data-log-level]'); level.value=runtimeLogLevel; level.onchange=()=>{runtimeLogLevel=level.value; renderRuntimeLogWindow();};
    win.querySelector('[data-log-act="close"]').onclick=()=>closeRuntimeLogWindow();
    win.querySelector('[data-log-act="min"]').onclick=()=>{runtimeLogMinimized=!runtimeLogMinimized; win.classList.toggle('min',runtimeLogMinimized); win.querySelector('[data-log-act="min"]').textContent=runtimeLogMinimized?'还原':'最小化';};
    win.querySelector('[data-log-act="full"]').onclick=()=>{runtimeLogFullscreen=!runtimeLogFullscreen; win.classList.toggle('full',runtimeLogFullscreen); win.querySelector('[data-log-act="full"]').textContent=runtimeLogFullscreen?'还原':'最大化';};
    win.querySelector('[data-log-act="copy"]').onclick=()=>copyRuntimeLogs();
    win.querySelector('[data-log-act="export"]').onclick=()=>exportLogs();
    win.querySelector('[data-log-act="clear"]').onclick=()=>{clearLogs(); renderRuntimeLogWindow();};
    win.querySelector('[data-log-act="autoscroll"]').onclick=()=>{runtimeLogAutoScroll=!runtimeLogAutoScroll; renderRuntimeLogWindow();};
    makeRuntimeLogDraggable(win);
    renderRuntimeLogWindow();
    clearInterval(runtimeLogTimer); runtimeLogTimer=setInterval(()=>renderRuntimeLogWindow(),1000);
  }

  function closeRuntimeLogWindow() {
    clearInterval(runtimeLogTimer); runtimeLogTimer=null;
    runtimeLogWindow?.remove(); runtimeLogWindow=null;
  }

  async function copyRuntimeLogs() {
    const text = filteredRuntimeLogs().map(logLineText).join('\n');
    try { await navigator.clipboard.writeText(text); showNotice('当前筛选后的运行日志已复制。','success',2500); }
    catch { downloadText('1688_Codex运行日志_复制失败备用.txt', text); }
  }

  function renderRuntimeLogWindow() {
    const win=runtimeLogWindow; if(!win||!document.contains(win)) return;
    const m=currentRuntimeMetrics();
    const metrics=win.querySelector('.krl-metrics');
    metrics.innerHTML=[
      ['运行状态',m.running?'运行中':(m.liveMode?(m.waitingForOzon?'等待Ozon新任务':'实时接单待命'):'已暂停')],
      ['当前阶段',m.currentStatus],['当前SKU',m.currentSku||'—'],['任务进度',m.progress],
      ['Ozon已就绪',`${m.cached}/${m.total}`],['有同款',String(m.matched)],['无同款',String(m.noMatch)],['无合适货源',String(m.noValidSupplier||0)],
      ['待补核验',String(m.reviewNeeded||0)],['待处理',String(m.pending)],['当前SKU耗时',fmtDuration(m.currentElapsed)],['总运行时间',fmtDuration(m.totalElapsed)],
      ['候选工作页',m.workLabel],['角色',isControllerTab()?'控制页':(isCandidateWorkTab()?'候选工作页':'同步页')],['脚本版本',`v${VERSION}`],['实时接单',m.liveMode?'开启':'暂停']
    ].map(([k,v])=>`<div class="krl-card"><b>${escapeHtml(k)}</b><span title="${escapeHtml(v)}">${escapeHtml(v)}</span></div>`).join('');
    const scroll=win.querySelector('.krl-scroll');
    const rows=filteredRuntimeLogs();
    scroll.innerHTML=rows.map(item=>`<div class="krl-line krl-${escapeHtml(item.level||'info')}">${escapeHtml(logLineText(item))}</div>`).join('') || '<div class="krl-line krl-info">暂无符合筛选条件的日志。</div>';
    const auto=win.querySelector('[data-log-act="autoscroll"]'); if(auto) auto.textContent=`自动滚动：${runtimeLogAutoScroll?'开':'关'}`;
    if(runtimeLogAutoScroll) scroll.scrollTop=scroll.scrollHeight;
  }

  function makeRuntimeLogDraggable(win) {
    const head=win.querySelector('.krl-head'); if(!head) return;
    let drag=null;
    head.addEventListener('pointerdown',e=>{
      if(e.target.closest('button')||runtimeLogFullscreen||runtimeLogMinimized) return;
      const r=win.getBoundingClientRect(); drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top}; head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove',e=>{if(!drag)return; win.style.left=`${Math.max(0,drag.left+e.clientX-drag.x)}px`;win.style.top=`${Math.max(0,drag.top+e.clientY-drag.y)}px`;win.style.right='auto';win.style.bottom='auto';});
    const end=e=>{drag=null;try{head.releasePointerCapture(e.pointerId);}catch{}}; head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
  }

  async function pushTaskStateToProject(reason='state_update') {
    if (!projectDirHandle) return false;
    try {
      await writeProjectStateFile(projectDirHandle, state);
      const meta = {
        revision: now(), cachedCount: calcStats().cached, total:state.tasks.length,
        lastSku: currentTaskSku(), updatedAt:now(), reason,
      };
      await writeProjectSyncFile(projectDirHandle, meta);
      await api.setValue(APP.cacheSyncMetaKey, meta);
      return true;
    } catch (error) {
      log(`写入项目同步状态失败：${error?.message || error}`, 'warn');
      return false;
    }
  }

  async function loadRemoteStateFromProject() {
    if (!projectDirHandle) return null;
    try {
      const stateFile = await readProjectStateFile(projectDirHandle);
      if (stateFile && typeof stateFile === 'object') return stateFile;
    } catch (error) { log(`读取任务状态/task_state.json失败：${error?.message || error}`, 'warn'); }
    return null;
  }

  async function syncFromProjectDirectory({ force=false, source='poll' }={}) {
    if (!IS_1688 || !projectDirHandle || cacheSyncBusy) return false;
    cacheSyncBusy = true;
    try {
      let meta = null;
      try { meta = await readProjectSyncFile(projectDirHandle); } catch {}
      const revision = Number(meta?.revision || 0);
      if (!force && revision && revision <= Number(state.lastCacheRevision || 0)) return false;
      const remote = await loadRemoteStateFromProject();
      if (!remote) return false;
      const oldCached = calcStats().cached;
      mergeRemoteState(remote, { source, preserveLocalExecution:true });
      state.lastCacheRevision = Math.max(Number(state.lastCacheRevision || 0), revision, Number(meta?.revision || 0));
      const newCached = calcStats().cached;
      await persistState();
      if (newCached !== oldCached || force) {
        log(`实时同步项目目录：Ozon缓存 ${oldCached} → ${newCached}/${state.tasks.length}${meta?.reason ? `；来源=${meta.reason}` : ''}`, 'info');
      }
      render();
      if (state.liveMode && isControllerTab()) scheduleControllerAutoStart('project_sync');
      return true;
    } finally { cacheSyncBusy = false; }
  }

  function startRealtimeWakeBindings() {
    if (realtimeWakeBound || !IS_1688) return;
    realtimeWakeBound = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFromProjectDirectory({ force:true, source:'visibility' }).catch(()=>{}); });
    window.addEventListener('focus', () => syncFromProjectDirectory({ force:true, source:'focus' }).catch(()=>{}));
    window.addEventListener('pageshow', () => syncFromProjectDirectory({ force:true, source:'pageshow' }).catch(()=>{}));
  }

  function startCacheFeedListener() {
    if (!IS_1688 || cacheFeedListenerId !== null || typeof GM_addValueChangeListener !== 'function') return;
    cacheFeedListenerId = GM_addValueChangeListener(APP.cacheEventKey, async (_name, _oldValue, newValue, remote) => {
      if (!newValue || typeof newValue !== 'object' || newValue.tabId === TAB_ID) return;
      if (newValue.state) {
        const oldCached = calcStats().cached;
        mergeRemoteState(newValue.state, { source:'gm_event', preserveLocalExecution:true });
        state.lastCacheRevision = Math.max(Number(state.lastCacheRevision || 0), Number(newValue.revision || 0));
        const newCached = calcStats().cached;
        await persistState();
        if (newCached !== oldCached) log(`实时收到Ozon新缓存：${oldCached} → ${newCached}/${state.tasks.length}；SKU=${newValue.sku || '-'}。`, 'info');
        render();
        if (state.liveMode && isControllerTab()) scheduleControllerAutoStart('gm_event');
      }
    });
  }

  function startMatchActionListener() {
    if (!IS_1688 || matchActionListenerId !== null || typeof GM_addValueChangeListener !== 'function') return;
    matchActionListenerId = GM_addValueChangeListener(APP.matchActionKey, async (_name, _oldValue, newValue) => {
      if (!newValue || typeof newValue !== 'object' || newValue.senderTabId === TAB_ID) return;
      if (!isControllerTab()) return;
      const task = taskBySku(newValue.sku);
      if (!task) return;
      const targetIndex = state.tasks.indexOf(task);
      if (targetIndex >= 0) state.currentIndex = targetIndex;
      if (newValue.action === 'matched') {
        const checked = validateMatchedData(newValue.matchData || {});
        if (!checked.ok) {
          task.status = 'candidate_review';
          task.matchData = normalizeMatchData(newValue.matchData || task.matchData || {});
          task.lastError = `后台MATCHED未通过Gate：${checked.errors.join('；')}`;
          await persistState();
          await pushTaskStateToProject('match_gate_rejected').catch(()=>{});
          log(`后台候选标签尝试回传 MATCHED，但当前 Gate未通过，已保持待核验：${checked.errors.join('；')}`, 'warn');
          render();
          return;
        }
        task.matchData = checked.data;
        task.status = 'completed';
      } else if (newValue.action === 'no_match') {
        task.matchData = normalizeMatchData({ ...(task.matchData || {}), conclusion:'NO_MATCH' });
        task.status = 'no_match';
      } else if (newValue.action === 'no_valid_supplier') {
        task.matchData = normalizeMatchData({ ...(task.matchData || {}), ...(newValue.matchData || {}), conclusion:'NO_VALID_SUPPLIER' });
        task.status = 'no_valid_supplier';
      } else if (newValue.action === 'retry') {
        task.matchData = normalizeMatchData({ ...(task.matchData || {}), conclusion:'RETRY' });
        task.status = 'retry';
      } else return;
      task.lastError = String(newValue.error || '');
      await persistState();
      await pushTaskStateToProject('match_action').catch(()=>{});
      log(`控制页收到候选标签结果：${newValue.sku} → ${newValue.action}`, 'info');
      render();
      if (['completed','no_match','no_valid_supplier'].includes(task.status)) await advanceAndMaybeStart();
    });
  }

  function startSyncPolling() {
    clearInterval(cacheSyncTimer);
    if (!IS_1688) return;
    cacheSyncTimer = setInterval(async () => {
      cacheSyncPollTick++;
      try {
        const sharedEvent = api.getValueSync(APP.cacheEventKey, null);
        if (sharedEvent?.state && Number(sharedEvent.revision || 0) > Number(state.lastCacheRevision || 0)) {
          mergeRemoteState(sharedEvent.state, { source:'gm_poll', preserveLocalExecution:true });
          state.lastCacheRevision = Number(sharedEvent.revision || 0);
          await persistState();
          render();
          if (state.liveMode && isControllerTab()) scheduleControllerAutoStart('gm_poll');
        }
        // 目录 I/O 只作为兜底，不每1.5秒打硬盘。约每6秒一次。
        if (cacheSyncPollTick % 4 === 0) await syncFromProjectDirectory({ source:'disk_poll' });
      } catch (error) { console.warn('[Kagura live sync]', error); }
    }, APP.liveSyncPollMs);
  }

  function scheduleControllerAutoStart(reason='sync') {
    if (!IS_1688 || !state.liveMode || !isControllerTab() || state.running || autoStartScheduled) return;
    autoStartScheduled = true;
    setTimeout(async () => {
      autoStartScheduled = false;
      if (!state.liveMode || !isControllerTab() || state.running) return;
      const idx = nextRunnableIndex(state.currentIndex);
      if (idx >= 0) {
        state.currentIndex = idx; state.waitingForOzon = false; await persistState(); render();
        log(`检测到新 READY 任务，控制页自动接单：${state.tasks[idx].sku}（${reason}）`, 'info');
        await startCurrentOrWait();
      } else {
        state.waitingForOzon = true; await persistState(); render();
      }
    }, 250);
  }

  async function enableLiveModeAndStart() {
    if (!IS_1688) return;
    await becomeController('manual_start');
    state.liveMode = true;
    state.waitingForOzon = false;
    if (!state.batchStartedAt) state.batchStartedAt = now();
    await persistState();
    await syncFromProjectDirectory({ force:true, source:'manual_start' }).catch(()=>{});
    render();
    const idx = nextRunnableIndex(state.currentIndex);
    if (idx >= 0) { state.currentIndex = idx; await persistState(); await startCurrentOrWait(); }
    else { state.waitingForOzon = true; await persistState(); render(); log('当前没有 READY 任务：控制页进入实时等待状态，Ozon新增缓存后会自动继续。', 'info'); }
  }

  async function toggleLiveMode() {
    if (!IS_1688) return;
    if (!state.liveMode) return enableLiveModeAndStart();
    state.liveMode = false;
    state.waitingForOzon = false;
    activeRunToken++;
    state.running = false;
    await persistState();
    render();
    log('实时接单已暂停；后台候选标签不会抢任务。', 'info');
  }

  async function advanceAndMaybeStart() {
    const idx = nextRunnableIndex((state.currentIndex + 1) % Math.max(1,state.tasks.length));
    if (idx < 0) {
      state.running = false;
      state.waitingForOzon = Boolean(state.liveMode);
      await persistState(); render();
      if (state.liveMode) log('当前 READY 任务已处理完，控制页等待 Ozon 新任务。', 'info');
      return;
    }
    state.currentIndex = idx; state.running = false; state.currentStartedAt = 0; await persistState(); render();
    if (state.liveMode) await startCurrentOrWait();
  }

  function noticeHtml() {
    if (!noticeState?.message) return '';
    return `<div class="k-notice ${escapeHtml(noticeState.type || 'info')}">${escapeHtml(noticeState.message)}</div>`;
  }

  function showNotice(message, type='info', timeout=4200) {
    noticeState = { message:String(message || ''), type };
    clearTimeout(noticeTimer);
    noticeTimer = timeout > 0 ? setTimeout(() => { noticeState = null; render(); }, timeout) : null;
    render();
  }

  function inlineLogHtml() {
    const logs = (state.logs || []).slice(-APP.inlineLogCount);
    if (!logs.length) return '<div class="k-log-empty">暂无日志</div>';
    return logs.map(item => {
      const tm = item.ts ? new Date(item.ts).toLocaleTimeString('zh-CN', { hour12:false }) : '--:--:--';
      const level = ['error','warn','success'].includes(item.level) ? item.level : 'info';
      const sku = item.sku ? ` · ${escapeHtml(item.sku)}` : '';
      return `<div class="k-log-line ${level}" title="${escapeHtml(logLineText(item))}"><span>${escapeHtml(tm)}</span><b>${escapeHtml(levelLabel(level))}</b><span class="k-log-message">${escapeHtml(item.message || '')}${sku}</span></div>`;
    }).join('');
  }

  async function persistLayout() {
    await api.setValue(APP.layoutKey, layout);
  }

  function codeDateParts(date = new Date()) {
    const yyyy = String(date.getFullYear());
    const yy = yyyy.slice(-2);
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');
    return { YYYY:yyyy, YY:yy, MM:mm, DD:dd, MMDD:mm+dd, YYYYMMDD:yyyy+mm+dd, YYMMDD:yy+mm+dd, dateKey:`${yyyy}-${mm}-${dd}` };
  }

  function effectiveTemplate(settings = getCodeSettings()) {
    if (settings.mode === 'advanced' && normalizeText(settings.template)) return normalizeText(settings.template);
    const parts = [];
    if (normalizeText(settings.prefix)) parts.push(String(settings.prefix).trim());
    if (settings.dateFormat && settings.dateFormat !== 'none') parts.push(`{${settings.dateFormat}}`);
    parts.push(`{SEQ${Math.max(1, Math.min(6, Number(settings.seqWidth)||3))}}`);
    if (normalizeText(settings.suffix)) parts.push(String(settings.suffix).trim());
    return parts.join(settings.separator ?? '-');
  }

  function renderCodeTemplate(template, seq, date = new Date(), sub = '1') {
    const d = codeDateParts(date);
    let out = String(template || '');
    const replacements = { ...d, SUB:String(sub ?? '') };
    for (const [k,v] of Object.entries(replacements)) out = out.replaceAll(`{${k}}`, v);
    out = out.replace(/\{SEQ([1-6])\}/g, (_, n) => String(seq).padStart(Number(n),'0'));
    out = out.replaceAll('{SEQ}', String(seq));
    return out;
  }

  function codeSettingsSummary(settings = getCodeSettings()) {
    if (settings.mode === 'advanced') return `高级模板：${effectiveTemplate(settings)}`;
    const dateText = ({none:'无日期',MMDD:'月日，例如 0818',YYYYMMDD:'年月日，例如 20260818',YYMMDD:'短年月日，例如 260818','YYYY-MM-DD':'日期，例如 2026-08-18'})[settings.dateFormat] || settings.dateFormat;
    return `${settings.prefix || '无前缀'} · ${dateText} · ${settings.seqWidth}位流水号${settings.suffix ? ` · 固定后缀 ${settings.suffix}`:''}`;
  }

  function normalizedTemplateForDateFormat(settings) {
    let tpl = effectiveTemplate(settings);
    if (settings.dateFormat === 'YYYY-MM-DD') tpl = tpl.replace('{YYYY-MM-DD}','{YYYY}-{MM}-{DD}');
    return tpl;
  }

  function codePreview(settings = getCodeSettings(), seq = null) {
    const n = seq ?? Math.max(1, Number(settings.startSeq)||1);
    return renderCodeTemplate(normalizedTemplateForDateFormat(settings), n, new Date(), settings.subValue || '1');
  }

  function usedSequenceLedger() {
    const x = api.getValueSync(APP.sequenceLedgerKey, {});
    return x && typeof x === 'object' ? x : {};
  }

  async function saveSequenceLedger(x) { await api.setValue(APP.sequenceLedgerKey, x); }
  function codeRegistry() { const x = api.getValueSync(APP.codeRegistryKey, {}); return x && typeof x === 'object' ? x : {}; }
  async function saveCodeRegistry(x) { await api.setValue(APP.codeRegistryKey, x); }
  function getBatchHistory() { const x = api.getValueSync(APP.batchHistoryKey, []); return Array.isArray(x) ? x : []; }
  async function saveBatchHistory(x) { await api.setValue(APP.batchHistoryKey, Array.isArray(x) ? x : []); }

  function mergeLogEntries(a, b) {
    const all = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    const seen = new Set();
    const out = [];
    for (const item of all) {
      if (!item || typeof item !== 'object') continue;
      const key = `${item.ts || ''}|${item.level || ''}|${item.message || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    out.sort((x,y) => String(x.ts || '').localeCompare(String(y.ts || '')));
    return out.slice(-APP.maxLogs);
  }

  function formatTaskProgress() {
    const total = state.tasks.length;
    if (!total) return '0/0';
    return `${Math.min(state.currentIndex+1,total)}/${total}`;
  }

  function fmtDuration(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const s = Math.floor(ms/1000), h = Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }

  function buildPanel() {
    if (panel && document.contains(panel)) return panel;
    const old = document.getElementById(APP.panelId); if (old) old.remove();
    panel = document.createElement('div');
    panel.id = APP.panelId;
    panel.innerHTML = `
      <div class="k-head">
        <b>${escapeHtml(APP.name)}</b>
        <span class="k-grow"></span>
        <button class="k-mini" data-act="minimize" title="最小化">—</button>
      </div>
      <div class="k-body"></div>
      <div class="k-resize-y" title="上下拖动调整面板高度"><span>上下拖动调整高度</span></div>`;
    document.documentElement.appendChild(panel);
    bindPanel();
    return panel;
  }

  function applyPanelLayout() {
    if (!panel) return;
    panel.style.right = `${Math.max(0, Number(layout.right)||0)}px`;
    panel.style.top = `${Math.max(0, Number(layout.top)||0)}px`;
    panel.style.width = `${Math.max(315, Math.min(480, Number(layout.width)||DEFAULT_LAYOUT.width))}px`;
    panel.style.height = layout.minimized ? '44px' : `${Math.max(240, Math.min(Math.max(300, window.innerHeight - 20), Number(layout.height)||DEFAULT_LAYOUT.height))}px`;
    panel.classList.toggle('minimized', Boolean(layout.minimized));
  }

  function render() {
    buildPanel();
    applyPanelLayout();
    calcStats();
    const body = panel.querySelector('.k-body');
    if (layout.minimized) { body.innerHTML = ''; return; }
    const t = currentTask();
    const progress = formatTaskProgress();
    const currentElapsed = state.currentStartedAt ? now() - state.currentStartedAt : 0;
    const batchElapsed = state.batchStartedAt ? now() - state.batchStartedAt : 0;

    if (IS_OZON) {
      const projectInfo = api.getValueSync(APP.projectInfoKey, {}) || {};
      const runner = state.ozonCacheRunner || {};
      const pacing = getOzonPacingSettings();
      const runnerState = !runner.active ? '未运行' : (runner.paused ? '已暂停' : (runner.waitUntil > now() ? `随机等待 ${Math.max(0, Math.ceil((runner.waitUntil-now())/1000))}秒` : '运行中'));
      body.innerHTML = `
        <div class="k-grid">
          <div class="k-label">模式</div><div><b>Ozon 缓存</b></div>
          <div class="k-label">版本</div><div>v${escapeHtml(api.getCurrentVersion())}</div>
          <div class="k-label">SKU表</div><div>${state.tasks.length ? `${state.tasks.length} 个任务` : '未导入'}</div>
          <div class="k-label">项目目录</div><div class="k-title" title="${escapeHtml(projectInfo.name || '')}">${escapeHtml(projectInfo.name || '未选择')}</div>
          <div class="k-label">当前SKU</div><div class="k-mono">${escapeHtml(runner.currentSku || t?.sku || '—')}</div>
          <div class="k-label">爬取任务</div><div class="k-status ${runner.paused ? 'waiting' : (runner.active ? 'good' : '')}">${escapeHtml(runnerState)}</div>
          <div class="k-label">本轮进度</div><div>${runner.queueSkus?.length ? `${Math.min(runner.cursor+1,runner.queueSkus.length)}/${runner.queueSkus.length}` : '—'} · 成功 ${runner.ok||0} · 失败 ${runner.fail||0}</div>
          <div class="k-label">随机等待</div><div class="k-title" title="${escapeHtml(ozonPacingSummary(pacing))}">${escapeHtml(ozonPacingSummary(pacing))}</div>
          <div class="k-label">总耗时</div><div class="k-mono">${fmtDuration(batchElapsed)}</div>
        </div>
        ${noticeHtml()}
        <div class="k-stats">已缓存 ${state.stats.cached}/${state.stats.total} · 1688已匹配 ${state.stats.matched} · 可结批 ${state.stats.available} · 待补核验 ${state.stats.reviewNeeded || 0} · 无同款 ${state.stats.noMatch} · 无合适货源 ${state.stats.noValidSupplier || 0} · 待处理 ${state.stats.pending}</div>
        <div class="k-actions">
          <button data-act="file" class="primary">导入跟卖SKU Excel</button>
          <button data-act="selectproject" class="primary">选择项目目录</button>
          <button data-act="cache" class="okbtn">批量缓存 Ozon</button>
          <button data-act="ozonpause">${runner.paused ? '继续任务' : '暂停任务'}</button>
          <button data-act="ozonstop">停止本轮</button>
          <button data-act="ozonretry">重试当前SKU</button>
          <button data-act="pacing">随机等待设置</button>
          <button data-act="logs">导出日志</button>
          <button data-act="clearlogs">清空日志</button>
          <button data-act="update">检查更新</button>
        </div>
        <input data-role="file" type="file" accept=".xlsx,.xls" style="display:none">
        <details class="k-logwrap" ${layout.logsOpen ? 'open' : ''}>
          <summary>最近运行日志（自动刷新）</summary>
          <div class="k-logbox">${inlineLogHtml()}</div>
        </details>
        <div class="k-hint"><b>Ozon端：</b>只负责 SKU → 标题 → 主图缓存。随机等待默认启用：正常SKU间隔随机、失败随机退避、每随机一段数量安排一次较长休息；只能降低连续访问频率，不能保证规避平台风控。检测到验证/访问限制时会安全暂停。暂停/停止后进度保留，继续时只处理硬盘真实缺失的主图。<br><b>当前架构：</b>本批所有SKU都可先缓存；1688端会实时读取新增READY任务，无需等整批缓存结束。</div>`;
      const fileInput = body.querySelector('[data-role="file"]');
      body.querySelector('[data-act="file"]')?.addEventListener('click', () => fileInput.click());
      fileInput?.addEventListener('change', e => importSkuFile(e.target.files?.[0]));
      body.querySelector('[data-act="selectproject"]')?.addEventListener('click', () => chooseProjectDirectory());
      body.querySelector('[data-act="cache"]')?.addEventListener('click', () => batchCacheOzon());
      body.querySelector('[data-act="ozonpause"]')?.addEventListener('click', () => toggleOzonCachePause());
      body.querySelector('[data-act="ozonstop"]')?.addEventListener('click', () => stopOzonCacheRound());
      body.querySelector('[data-act="ozonretry"]')?.addEventListener('click', () => retryCurrentOzonSku());
      body.querySelector('[data-act="pacing"]')?.addEventListener('click', () => openOzonPacingModal());
      body.querySelector('[data-act="logs"]')?.addEventListener('click', () => exportLogs());
      body.querySelector('[data-act="clearlogs"]')?.addEventListener('click', () => clearLogs());
      body.querySelector('[data-act="update"]')?.addEventListener('click', () => api.checkUpdatesManually());
      body.querySelector('.k-logwrap')?.addEventListener('toggle', async e => { layout.logsOpen = Boolean(e.currentTarget.open); await persistLayout(); });
      return;
    }

    if (IS_1688) {
      const codeSettings = getCodeSettings();
      const projectInfo = api.getValueSync(APP.projectInfoKey, {}) || {};
      body.innerHTML = `
        <div class="k-grid">
          <div class="k-label">模式</div><div><b>1688 找同款</b></div>
          <div class="k-label">版本</div><div>v${escapeHtml(api.getCurrentVersion())}</div>
          <div class="k-label">任务</div><div><b>${progress}</b></div>
          <div class="k-label">项目目录</div><div class="k-title" title="${escapeHtml(projectInfo.name || '')}">${escapeHtml(projectInfo.name || '未连接')}</div>
          <div class="k-label">Ozon SKU</div><div class="k-mono" title="${escapeHtml(t?.sku || '')}">${escapeHtml(t?.sku || '未导入')}</div>
          <div class="k-label">标题</div><div class="k-title" title="${escapeHtml(t?.title || '')}">${escapeHtml(t?.title || '—')}</div>
          <div class="k-label">图片</div><div class="k-mono" title="${escapeHtml(t?.imageName || '')}">${escapeHtml(t?.imageName || '—')}</div>
          <div class="k-label">最终货号</div><div class="k-mono">${escapeHtml(t?.finalCode || '未分配')}</div>
          <div class="k-label">上架批次</div><div class="k-mono">${escapeHtml(t?.batchId || '—')}</div>
          <div class="k-label">最近批次导出</div><div class="k-mono">${escapeHtml((() => { const h=latestBatchHistoryEntry(); return h ? `${h.batchId} · ${h.exportStatus || '未记录'}` : '—'; })())}</div>
          <div class="k-label">状态</div><div class="k-status ${statusClass(t)}">${escapeHtml(getTaskStatusLabel(t))}</div>
          <div class="k-label">候选工作页</div><div class="k-status ${candidateWorkStatus().className}">${escapeHtml(candidateWorkStatus().label)}</div>
          <div class="k-label">货号格式</div><div class="k-mono" title="${escapeHtml(codeSettingsSummary(codeSettings))}">${escapeHtml(codeSettingsSummary(codeSettings))}</div>
          <div class="k-label">总耗时</div><div class="k-mono">${fmtDuration(batchElapsed)}</div>
          <div class="k-label">当前耗时</div><div class="k-mono">${fmtDuration(currentElapsed)}</div>
        </div>
        ${noticeHtml()}
        <div class="k-stats">Ozon实时 ${state.stats.cached}/${state.stats.total} · 可结批 ${state.stats.available} · 待补核验 ${state.stats.reviewNeeded || 0} · 已结批 ${state.stats.batched} · 无同款 ${state.stats.noMatch} · 无合适货源 ${state.stats.noValidSupplier || 0} · 待处理 ${state.stats.pending} · ${state.liveMode ? (state.waitingForOzon ? '🟡 等待Ozon新任务' : '🟢 实时接单中') : '⚪ 实时接单已暂停'} · ${isControllerTab() ? '🎛 控制页' : '👁 同步页'}</div>
        <div class="k-actions">
          <button data-act="connectcache" class="primary">连接项目目录</button>
          <button data-act="start" class="primary">开始/继续实时找同款</button>
          <button data-act="livetoggle">${state.liveMode ? '暂停实时接单' : '开启实时接单'}</button>
          <button data-act="retry">重试当前</button>
          <button data-act="done" class="okbtn">有同款并下一个</button>
          <button data-act="nomatch">无同款并下一个</button>
          <button data-act="novalid">无合适货源并下一个</button>
          <button data-act="next">跳过并下一个</button>
          <button data-act="batch" class="okbtn">生成当前上架批次</button>
          <button data-act="exportbatch">重新导出最近批次</button>
          <button data-act="exportzip">导出最近批次ZIP</button>
          <button data-act="fixbatched">修正已结批货源</button>
          <button data-act="codes">货号设置</button>
          <button data-act="focuswork">聚焦候选工作页</button>
          <button data-act="runlogs">运行日志</button>
          <button data-act="logs">导出日志</button>
          <button data-act="clearlogs">清空日志</button>
          <button data-act="update">检查更新</button>
        </div>
        <details class="k-logwrap" ${layout.logsOpen ? 'open' : ''}>
          <summary>最近运行日志（自动刷新）</summary>
          <div class="k-logbox">${inlineLogHtml()}</div>
        </details>
        <div class="k-hint"><b>1688端实时流水线：</b>控制页负责实时接单和推进；候选商品链接默认复用同一个“候选工作页”，避免一次打开大量后台标签。“聚焦候选工作页”只请求切换到现有工作页，不重新导航、不刷新。结批只接受通过当前规格/数量/MOQ/活动前价/运费Gate的MATCHED商品；旧版已匹配但字段不完整会显示“待补核验”。批次固定写入“项目根目录/上架批次/批次号”，重新导出直接覆盖原批次目录；ZIP仅在你明确点击“导出最近批次ZIP”时生成。</div>
      `;
      body.querySelector('[data-act="connectcache"]')?.addEventListener('click', () => connectProjectDirectoryFor1688());
      body.querySelector('[data-act="start"]')?.addEventListener('click', () => enableLiveModeAndStart());
      body.querySelector('[data-act="livetoggle"]')?.addEventListener('click', () => toggleLiveMode());
      body.querySelector('[data-act="retry"]')?.addEventListener('click', () => retryCurrent());
      body.querySelector('[data-act="done"]')?.addEventListener('click', () => openMatchModal());
      body.querySelector('[data-act="nomatch"]')?.addEventListener('click', () => finishAndNext('no_match', { conclusion:'NO_MATCH' }));
      body.querySelector('[data-act="novalid"]')?.addEventListener('click', () => openNoValidSupplierModal());
      body.querySelector('[data-act="next"]')?.addEventListener('click', () => finishAndNext('skipped'));
      body.querySelector('[data-act="batch"]')?.addEventListener('click', () => generateListingBatch());
      body.querySelector('[data-act="exportbatch"]')?.addEventListener('click', () => exportLatestBatch());
      body.querySelector('[data-act="exportzip"]')?.addEventListener('click', () => exportLatestBatchZip());
      body.querySelector('[data-act="fixbatched"]')?.addEventListener('click', () => openFixBatchedSupplierModal());
      body.querySelector('[data-act="codes"]')?.addEventListener('click', () => openCodeSettings());
      body.querySelector('[data-act="focuswork"]')?.addEventListener('click', () => requestCandidateWorkFocus());
      body.querySelector('[data-act="runlogs"]')?.addEventListener('click', () => openRuntimeLogWindow());
      body.querySelector('[data-act="logs"]')?.addEventListener('click', () => exportLogs());
      body.querySelector('[data-act="clearlogs"]')?.addEventListener('click', () => clearLogs());
      body.querySelector('[data-act="update"]')?.addEventListener('click', () => api.checkUpdatesManually());
      body.querySelector('.k-logwrap')?.addEventListener('toggle', async e => { layout.logsOpen = Boolean(e.currentTarget.open); await persistLayout(); });
    }
  }

  function statusClass(t) {
    if (!t) return '';
    if (['completed','batched'].includes(t.status)) return 'good';
    if (['candidate_review','result_loading','retry'].includes(t.status)) return 'waiting';
    if (['no_match','no_valid_supplier','failed'].includes(t.status)) return 'bad';
    return '';
  }

  function bindPanel() {
    const head = panel.querySelector('.k-head');
    let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { x:e.clientX, y:e.clientY, right:innerWidth-rect.right, top:rect.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
      layout.right=Math.max(0, Math.min(innerWidth-120, drag.right-dx));
      layout.top=Math.max(0, Math.min(innerHeight-44, drag.top+dy));
      applyPanelLayout();
    });
    const end = async e => { if (!drag) return; drag=null; try { head.releasePointerCapture(e.pointerId); } catch {} await persistLayout(); };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
    panel.querySelector('[data-act="minimize"]').addEventListener('click', async () => { layout.minimized=!layout.minimized; await persistLayout(); render(); });

    const grip = panel.querySelector('.k-resize-y');
    let resize = null;
    grip?.addEventListener('pointerdown', e => {
      if (layout.minimized) return;
      const r = panel.getBoundingClientRect();
      resize = { y:e.clientY, height:r.height };
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grip?.addEventListener('pointermove', e => {
      if (!resize) return;
      const maxH = Math.max(300, window.innerHeight - Math.max(0, Number(layout.top)||0) - 10);
      layout.height = Math.max(240, Math.min(maxH, resize.height + (e.clientY - resize.y)));
      applyPanelLayout();
      e.preventDefault();
    });
    const resizeEnd = async e => { if (!resize) return; resize=null; try { grip.releasePointerCapture(e.pointerId); } catch {} await persistLayout(); };
    grip?.addEventListener('pointerup', resizeEnd); grip?.addEventListener('pointercancel', resizeEnd);
  }

  function injectCss() {
    const css = `
      #${APP.panelId}{position:fixed;z-index:2147483640;background:#fff;color:#222;border:1px solid #cfd4dc;border-radius:10px;box-shadow:0 10px 35px rgba(0,0,0,.22);font:12px/1.38 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;overflow:hidden;display:flex;flex-direction:column;min-height:44px}
      #${APP.panelId} *{box-sizing:border-box} #${APP.panelId} .k-head{height:42px;flex:0 0 42px;display:flex;align-items:center;padding:0 10px;background:#f4f6f9;border-bottom:1px solid #dde2ea;cursor:move;user-select:none;font-size:13px} #${APP.panelId} .k-grow{flex:1} #${APP.panelId} .k-mini{border:0;background:transparent;font-size:18px;cursor:pointer}
      #${APP.panelId} .k-body{padding:9px 10px 8px;overflow:auto;flex:1;min-height:0} #${APP.panelId}.minimized .k-body,#${APP.panelId}.minimized .k-resize-y{display:none}
      #${APP.panelId} .k-grid{display:grid;grid-template-columns:76px 1fr;gap:4px 7px;align-items:center} #${APP.panelId} .k-label{color:#69717d} #${APP.panelId} .k-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} #${APP.panelId} .k-mono{font-family:Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${APP.panelId} .k-stats{margin:7px 0;padding:7px;background:#f7f8fa;border-radius:7px;color:#48505a} #${APP.panelId} .k-actions{display:grid;grid-template-columns:1fr 1fr;gap:5px} #${APP.panelId} button{padding:6px 7px;border:1px solid #c8ced8;background:#fff;border-radius:6px;cursor:pointer;font-size:11.5px} #${APP.panelId} button.primary{background:#1677ff;color:#fff;border-color:#1677ff} #${APP.panelId} button.okbtn{background:#16a34a;color:#fff;border-color:#16a34a}
      #${APP.panelId} .k-status.good{color:#15803d;font-weight:700} #${APP.panelId} .k-status.waiting{color:#b45309;font-weight:700} #${APP.panelId} .k-status.bad{color:#b91c1c;font-weight:700} #${APP.panelId} .k-hint{margin-top:7px;color:#77808b;font-size:10.8px;line-height:1.45} #${APP.panelId} .k-notice{margin:7px 0 2px;padding:7px 8px;border-radius:7px;line-height:1.45} #${APP.panelId} .k-notice.info{background:#eef6ff;color:#185a9d} #${APP.panelId} .k-notice.success{background:#edf9f0;color:#21753b} #${APP.panelId} .k-notice.warn{background:#fff7e6;color:#9a5a00} #${APP.panelId} .k-notice.error{background:#fff0f0;color:#a61b1b}
      #${APP.panelId} .k-logwrap{margin-top:7px;border:1px solid #d9dee6;border-radius:7px;background:#fafbfc} #${APP.panelId} .k-logwrap summary{padding:6px 8px;cursor:pointer;color:#55606d;font-weight:700;user-select:none} #${APP.panelId} .k-logbox{max-height:125px;overflow:auto;padding:0 7px 7px} #${APP.panelId} .k-log-line{display:flex;align-items:baseline;gap:5px;padding:3px 1px;border-bottom:1px dashed #e6e9ee;font-size:10.7px;min-width:0} #${APP.panelId} .k-log-line>span:first-child{color:#88909b;font-family:Consolas,monospace;flex:0 0 auto} #${APP.panelId} .k-log-line>b{font-size:10px;flex:0 0 auto} #${APP.panelId} .k-log-line.info>b{color:#3976b9} #${APP.panelId} .k-log-line.success>b{color:#23863d} #${APP.panelId} .k-log-line.warn>b{color:#b36a00} #${APP.panelId} .k-log-line.error>b{color:#c52a2a} #${APP.panelId} .k-log-message{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} #${APP.panelId} .k-log-empty{padding:5px;color:#9098a2;font-size:10.8px}
      #${APP.panelId} .k-resize-y{height:12px;flex:0 0 12px;border-top:1px solid #e2e6ec;background:linear-gradient(#fafbfc,#f2f4f7);cursor:ns-resize;text-align:center;color:#9aa2ad;font-size:9px;line-height:11px;user-select:none;touch-action:none} #${APP.panelId} .k-resize-y span{opacity:.82;pointer-events:none}
      .kagura-modal-mask{position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:10px}.kagura-modal{background:#fff;color:#222;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:min(650px,96vw);max-height:92vh;overflow:auto;padding:16px;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.kagura-modal h3{margin:0 0 10px}.kagura-modal label{display:block;margin:8px 0 3px;color:#555}.kagura-modal input,.kagura-modal select,.kagura-modal textarea{width:100%;padding:7px;border:1px solid #c8ced8;border-radius:6px}.kagura-modal textarea{min-height:80px;resize:vertical}.kagura-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kagura-modal .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.kagura-modal button{padding:7px 12px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}.kagura-modal .primary{background:#1677ff;border-color:#1677ff;color:white}.kagura-modal .okbtn{background:#16a34a;border-color:#16a34a;color:white}.kagura-modal .warn{background:#fff6e5;border:1px solid #ffe1a3;color:#805000;padding:8px;border-radius:7px;margin:8px 0}.kagura-modal .calcbox{background:#f4f8ff;border:1px solid #d7e6ff;border-radius:8px;padding:10px;margin-top:10px;line-height:1.7}.kagura-modal .gate-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.kagura-modal .gate{padding:7px;border-radius:7px;background:#f4f5f7}.kagura-modal .gate.pass{background:#edf9f0;color:#21753b}.kagura-modal .gate.fail{background:#fff0f0;color:#a61b1b}
    `;
    const st=document.createElement('style'); st.textContent=css; document.documentElement.appendChild(st);
  }

  function showModal(html, binder) {
    const mask=document.createElement('div'); mask.className='kagura-modal-mask'; mask.innerHTML=`<div class="kagura-modal">${html}</div>`; document.documentElement.appendChild(mask);
    const close=()=>mask.remove(); binder?.(mask.querySelector('.kagura-modal'),close,mask); return {mask,close};
  }

  function openOzonPacingModal() {
    const p = getOzonPacingSettings();
    showModal(`
      <h3>Ozon 随机等待设置</h3>
      <div class="warn">随机等待用于降低连续访问频率，但不能保证规避 Ozon 风控、验证或限流。一旦页面检测到验证/访问限制，缓存任务仍会安全暂停。</div>
      <label><input data-p="enabled" type="checkbox" style="width:auto" ${p.enabled?'checked':''}> 启用 SKU 间随机等待</label>
      <div class="row"><div><label>正常等待最小秒</label><input data-p="minDelaySec" type="number" min="0" max="120" step="0.5" value="${p.minDelaySec}"></div><div><label>正常等待最大秒</label><input data-p="maxDelaySec" type="number" min="0" max="180" step="0.5" value="${p.maxDelaySec}"></div></div>
      <label><input data-p="failureBackoffEnabled" type="checkbox" style="width:auto" ${p.failureBackoffEnabled?'checked':''}> 单个SKU失败后随机退避</label>
      <div class="row"><div><label>失败退避最小秒</label><input data-p="failureMinSec" type="number" min="0" max="300" step="1" value="${p.failureMinSec}"></div><div><label>失败退避最大秒</label><input data-p="failureMaxSec" type="number" min="0" max="600" step="1" value="${p.failureMaxSec}"></div></div>
      <label><input data-p="longRestEnabled" type="checkbox" style="width:auto" ${p.longRestEnabled?'checked':''}> 周期随机长休息</label>
      <div class="row"><div><label>每多少个SKU开始可能长休息（最小）</label><input data-p="longEveryMin" type="number" min="1" max="500" step="1" value="${p.longEveryMin}"></div><div><label>最大</label><input data-p="longEveryMax" type="number" min="1" max="1000" step="1" value="${p.longEveryMax}"></div></div>
      <div class="row"><div><label>长休息最小秒</label><input data-p="longMinSec" type="number" min="0" max="1800" step="1" value="${p.longMinSec}"></div><div><label>长休息最大秒</label><input data-p="longMaxSec" type="number" min="0" max="3600" step="1" value="${p.longMaxSec}"></div></div>
      <div class="actions"><button data-x="cancel">取消</button><button data-x="save" class="primary">保存设置</button></div>
    `,(m,close)=>{
      m.querySelector('[data-x="cancel"]').onclick=close;
      m.querySelector('[data-x="save"]').onclick=async()=>{
        const read = name => m.querySelector(`[data-p="${name}"]`);
        const next = {
          enabled:read('enabled').checked,
          minDelaySec:read('minDelaySec').value,
          maxDelaySec:read('maxDelaySec').value,
          failureBackoffEnabled:read('failureBackoffEnabled').checked,
          failureMinSec:read('failureMinSec').value,
          failureMaxSec:read('failureMaxSec').value,
          longRestEnabled:read('longRestEnabled').checked,
          longEveryMin:read('longEveryMin').value,
          longEveryMax:read('longEveryMax').value,
          longMinSec:read('longMinSec').value,
          longMaxSec:read('longMaxSec').value,
        };
        const saved=await saveOzonPacingSettings(next); close(); render(); showNotice(`随机等待已保存：${ozonPacingSummary(saved)}`,'success',5000); log(`Ozon随机等待设置已保存：${ozonPacingSummary(saved)}`,'info');
      };
    });
  }

  function checkOzonChallenge() {
    const txt=normalizeText(document.body?.innerText||'').toLowerCase();
    return /captcha|verify you are human|подтвердите|проверка безопасности|слишком много запросов|доступ ограничен|access denied|robot|робот/.test(txt) || Boolean(document.querySelector('iframe[src*="captcha" i], [class*="captcha" i], [id*="captcha" i]'));
  }

  async function waitUntil(fn, timeoutMs, interval=500) {
    const start=now(); let lastErr=null;
    while(now()-start<timeoutMs){try{const v=await fn();if(v)return v;}catch(e){lastErr=e;}await sleep(interval);}if(lastErr)throw lastErr;return null;
  }

  async function importSkuFile(file) {
    if (!file) return;
    try {
      if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      let col=0, headerRow=0, found=false; for(let r=0;r<Math.min(rows.length,20);r++){for(let c=0;c<(rows[r]||[]).length;c++){const h=String(rows[r][c]).replace(/\s+/g,'').toLowerCase();if(['跟卖sku','sku','ozonsku','ozonid'].includes(h)){headerRow=r;col=c;found=true;break;}}if(found)break;}
      const skus=[]; for(let r=found?headerRow+1:0;r<rows.length;r++){const s=String(rows[r]?.[found?col:0]??'').trim().replace(/\.0$/,'');if(s)skus.push(s);}const uniq=[...new Set(skus)];if(!uniq.length)throw new Error('未读取到SKU');

      // V1.7.1：重新导入同一批/包含旧 SKU 的 Excel 时，保留已经存在的缓存、匹配、货号与批次状态。
      // 这样从任意 Ozon 商品页启动缓存都不会因为导入动作把已完成状态清空。
      const oldBySku = new Map((state.tasks||[]).map(t=>[String(t?.sku||''), ensureTaskShape({ ...t })]));
      const newTasks = uniq.map(sku => {
        const old = oldBySku.get(String(sku));
        return old ? ensureTaskShape({ ...old, sku:String(sku) }) : ensureTaskShape({ sku:String(sku), cacheStatus:'pending', status:'pending', matchData:{} });
      });
      state={...structuredClone(DEFAULT_STATE),tasks:newTasks,logs:state.logs||[],batchStartedAt:state.batchStartedAt||0,liveMode:false};
      await persistState(); log(`SKU表导入完成：${uniq.length} 个唯一 SKU；其中 ${newTasks.filter(t=>oldBySku.has(String(t.sku))).length} 个沿用已有状态。下一步点击“批量缓存Ozon”。`); render();
    }catch(e){showNotice(`导入失败：${e.message}`,'error',6500);log(`导入失败：${e.message}`,'error');}
  }

  async function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej(new Error('外部库加载失败'));document.head.appendChild(s);});}

  // directory handles
  const DB2='kagura_1688_codex_handles', STORE2='handles';
  function dbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB2,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE2))r.result.createObjectStore(STORE2);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function dbPut(k,v){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE2,'readwrite');tx.objectStore(STORE2).put(v,k);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function dbGet(k){const db=await dbOpen();return new Promise((resolve,reject)=>{const r=db.transaction(STORE2,'readonly').objectStore(STORE2).get(k);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function ensureHandlePermission(h, write=false){if(!h)return false;const o={mode:write?'readwrite':'read'};if((await h.queryPermission?.(o))==='granted')return true;return (await h.requestPermission?.(o))==='granted';}

  let projectDirHandle = null;
  const IMAGE_EXTENSIONS = ['jpg','jpeg','png','webp','avif','bmp'];
  async function chooseProjectDirectory(){
    if(!window.showDirectoryPicker){showNotice('当前浏览器不支持目录选择，请使用Edge/Chrome桌面版。','error',6000);return;}
    try{
      // 重要：必须在用户真实点击事件中直接调用，前面不能 await/confirm。
      const h=await window.showDirectoryPicker({mode:'readwrite'});
      projectDirHandle=h;await dbPut('project',h);await api.setValue(APP.projectInfoKey,{name:h.name,updatedAt:now()});
      await ensureProjectDirs(h);
      const restored=await restoreTasksFromProject(h,{merge:true,allowImageScan:true});
      await publishCacheEvent('project_connected',{sku:'',restored:restored.restored});
      showNotice(`项目目录已连接：${h.name}；恢复 ${restored.restored} 条任务，可用主图 ${restored.cached} 条。`,'success',6500);
      log(`项目目录已选择：${h.name}；恢复 ${restored.restored} 条任务，可用Ozon主图 ${restored.cached} 条。`);render();
    }catch(e){if(e?.name!=='AbortError'){showNotice(`选择项目目录失败：${e.message}`,'error',7000);log(`选择项目目录失败：${e.message}`,'error');}}
  }
  async function connectProjectDirectoryFor1688(){
    if(!window.showDirectoryPicker){showNotice('当前浏览器不支持目录选择。','error',6000);return;}
    try{
      // 同样必须把 picker 放在 click handler 的第一段调用链中。
      const h=await window.showDirectoryPicker({mode:'readwrite'});
      projectDirHandle=h;await dbPut('project',h);await api.setValue(APP.projectInfoKey,{name:h.name,updatedAt:now()});await ensureProjectDirs(h);
      const restored=await restoreTasksFromProject(h,{merge:true,allowImageScan:true});
      await becomeController('project_connect');
      showNotice(`1688已连接：${h.name}；恢复 ${restored.restored} 条任务，可用Ozon主图 ${restored.cached} 条。`,'success',6500);
      log(`1688已连接项目目录：${h.name}；恢复 ${restored.restored} 条任务，其中可用Ozon主图 ${restored.cached} 条。`);render();
      if(state.liveMode) scheduleControllerAutoStart('connect_project');
    }catch(e){if(e?.name!=='AbortError'){showNotice(`连接项目目录失败：${e.message}`,'error',7000);log(`连接项目目录失败：${e.message}`,'error');}}
  }
  async function tryRestoreProject(){try{const h=await dbGet('project');if(h&&(await ensureHandlePermission(h,false))){projectDirHandle=h;await api.setValue(APP.projectInfoKey,{name:h.name,updatedAt:now()});return h;}}catch{}return null;}
  async function ensureProjectDirs(root){await root.getDirectoryHandle('Ozon缓存',{create:true});await root.getDirectoryHandle('任务状态',{create:true});await root.getDirectoryHandle('上架批次',{create:true});}
  async function getOzonDir(root=projectDirHandle){if(!root)return null;return root.getDirectoryHandle('Ozon缓存',{create:true});}
  async function getTaskStateDir(root=projectDirHandle){if(!root)return null;return root.getDirectoryHandle('任务状态',{create:true});}
  async function getListingRootDir(root=projectDirHandle){if(!root)return null;return root.getDirectoryHandle('上架批次',{create:true});}
  async function getListingBatchDir(batchId,{create=false}={}){const root=await getListingRootDir();if(!root)return null;return root.getDirectoryHandle(String(batchId),{create});}
  async function readTextFileHandle(dir,name){try{const fh=await dir.getFileHandle(name);const file=await fh.getFile();return await file.text();}catch(e){if(e?.name==='NotFoundError')return '';throw e;}}
  async function writeTextFileHandle(dir,name,text){const fh=await dir.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(text);await w.close();}
  async function fileExists(dir,name){try{await dir.getFileHandle(name);return true;}catch{return false;}}
  async function listImageFiles(ozonDir){const out=[];for await(const [name,handle] of ozonDir.entries()){if(handle?.kind!=='file')continue;if(!/\.(jpe?g|png|webp|avif|bmp)$/i.test(name))continue;out.push(name);}return out;}
  async function findOzonImageFile(sku, preferredName=''){
    const dir=await getOzonDir();if(!dir)return null;
    const clean=String(sku||'').trim();
    const candidates=[];
    if(preferredName)candidates.push(String(preferredName));
    for(const ext of IMAGE_EXTENSIONS)candidates.push(`${clean}.${ext}`);
    for(const name of [...new Set(candidates)]){try{const fh=await dir.getFileHandle(name);const f=await fh.getFile();return {name,file:f,handle:fh};}catch(e){if(e?.name!=='NotFoundError')throw e;}}
    // 如果旧索引只丢了扩展名/文件名，按SKU主干扫描。
    for await(const [name,handle] of dir.entries()){if(handle?.kind!=='file')continue;const stem=name.replace(/\.[^.]+$/,'');if(stem===clean&&/\.(jpe?g|png|webp|avif|bmp)$/i.test(name)){const f=await handle.getFile();return {name,file:f,handle};}}
    return null;
  }
  async function validateTaskCacheAgainstDisk(task){
    if(!task?.sku)return false;const hit=await findOzonImageFile(task.sku,task.imageName||'');
    if(hit){task.imageName=hit.name;task.cacheStatus='ready';return true;}
    task.imageName='';task.cacheStatus='pending';return false;
  }
  async function validateAllCacheAgainstDisk(){let cached=0;for(const task of state.tasks||[]){if(await validateTaskCacheAgainstDisk(task))cached++;}calcStats();return cached;}
  async function readProjectStateFile(root){const d=await root.getDirectoryHandle('任务状态',{create:true});const txt=await readTextFileHandle(d,'task_state.json');if(!txt)return null;return JSON.parse(txt);}
  async function writeProjectStateFile(root,st=state){const d=await root.getDirectoryHandle('任务状态',{create:true});const payload={...safeClone(st,{}),tasks:(st.tasks||[]).map(t=>ensureTaskShape({...t})),savedAt:now(),version:VERSION};await writeTextFileHandle(d,'task_state.json',JSON.stringify(payload,null,2));}
  async function readProjectSyncFile(root){const d=await root.getDirectoryHandle('任务状态',{create:true});const txt=await readTextFileHandle(d,'sync.json');if(!txt)return null;try{return JSON.parse(txt);}catch{return null;}}
  async function writeProjectSyncFile(root,meta){const d=await root.getDirectoryHandle('任务状态',{create:true});await writeTextFileHandle(d,'sync.json',JSON.stringify(meta,null,2));}
  async function writeProductsCsv(root){const d=await root.getDirectoryHandle('Ozon缓存',{create:true});const lines=[['OzonSKU','标题','主图文件','缓存状态'],...state.tasks.map(t=>[t.sku,t.title||'',t.imageName||'',t.cacheStatus||'pending'])];const csv='\uFEFF'+lines.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');await writeTextFileHandle(d,'products.csv',csv);}
  function parseCsvLine(line){const cells=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(ch==='"')q=false;else cur+=ch;}else if(ch==='"')q=true;else if(ch===','){cells.push(cur);cur='';}else cur+=ch;}cells.push(cur);return cells;}
  async function readProductsCsv(root){try{const d=await root.getDirectoryHandle('Ozon缓存',{create:true});const txt=(await readTextFileHandle(d,'products.csv')).replace(/^\uFEFF/,'');if(!txt)return[];const lines=txt.split(/\r?\n/).filter(Boolean);if(lines.length<2)return[];const head=parseCsvLine(lines[0]);const map={};head.forEach((x,i)=>map[String(x).trim()]=i);return lines.slice(1).map(line=>{const c=parseCsvLine(line);return{sku:String(c[map.OzonSKU]||'').trim(),title:c[map['标题']]||'',imageName:c[map['主图文件']]||'',cacheStatus:c[map['缓存状态']]||''};}).filter(x=>x.sku);}catch{return[];}}
  async function restoreTasksFromProject(root,{merge=true,allowImageScan=true}={}){
    let source='';let remoteTasks=[];
    try{const saved=await readProjectStateFile(root);if(saved?.tasks?.length){remoteTasks=saved.tasks;source='任务状态/task_state.json';}}
    catch(e){log(`读取 task_state.json 失败：${e.message}`,'warn');}
    if(!remoteTasks.length){const rows=await readProductsCsv(root);if(rows.length){remoteTasks=rows.map(x=>ensureTaskShape({...x,status:'pending'}));source='Ozon缓存/products.csv';}}
    if(!remoteTasks.length&&allowImageScan){const od=await root.getDirectoryHandle('Ozon缓存',{create:true});const files=await listImageFiles(od);if(files.length){remoteTasks=files.map(name=>ensureTaskShape({sku:name.replace(/\.[^.]+$/,''),imageName:name,cacheStatus:'ready',status:'pending'}));source='Ozon缓存图片扫描';}}
    if(remoteTasks.length){
      if(merge) state.tasks=mergeTaskSnapshots(state.tasks,remoteTasks); else state.tasks=remoteTasks.map(ensureTaskShape);
    }
    const cached=await validateAllCacheAgainstDisk();
    await persistState();
    // 修正后的真实状态写回项目目录，避免“状态说ready但文件已删”继续传播。
    await writeProjectStateFile(root,state).catch(()=>{});await writeProductsCsv(root).catch(()=>{});
    const meta={revision:now(),cachedCount:cached,total:state.tasks.length,lastSku:'',updatedAt:now(),reason:'restore_validate'};await writeProjectSyncFile(root,meta).catch(()=>{});await api.setValue(APP.cacheSyncMetaKey,meta);
    return{restored:state.tasks.length,cached,source:source||'当前任务状态+硬盘校验'};
  }

  function ozonSearchUrl(sku){return `https://www.ozon.ru/search/?text=${encodeURIComponent(sku)}`;}
  function expectedSkuFromState(){return String(state.ozonCacheRunner?.currentSku||'');}
  function skuFromProductUrl(url=location.href){const m=String(url).match(/-(\d{6,})(?:\/|\?|$)/);return m?m[1]:'';}
  function isOzonSearch(){return IS_OZON&&/\/search\//.test(location.pathname);}
  function isOzonProduct(){return IS_OZON&&/\/product\//.test(location.pathname);}
  function exactOzonLink(sku){
    const anchors=[...document.querySelectorAll('a[href*="/product/"]')];
    const clean=String(sku);
    return anchors.find(a=>{const href=a.href||'';const txt=normalizeText(a.textContent);return href.includes(clean)||txt===clean||txt.includes(` ${clean} `);})||null;
  }
  function findMainImage(){
    const sels=['[data-widget*="gallery" i] img','[data-widget*="webGallery" i] img','[data-widget*="image" i] img','main img'];const arr=[];
    for(const s of sels)for(const img of document.querySelectorAll(s)){const r=img.getBoundingClientRect();const src=img.currentSrc||img.src||img.getAttribute('src')||'';if(!src||r.width<120||r.height<120)continue;let score=r.width*r.height;if(src.includes('cdn1.ozone'))score+=1e6;if(r.top<innerHeight*1.2)score+=4e5;arr.push({img,src,score});}
    arr.sort((a,b)=>b.score-a.score);return arr[0]?.img||null;
  }
  function productTitle(){
    const h=document.querySelector('h1');const t=normalizeText(h?.textContent||'');if(t&&t.length>2)return t;
    const og=document.querySelector('meta[property="og:title"]')?.content;return normalizeText(og||document.title.replace(/\s*[|—-]\s*Ozon.*$/i,''));
  }
  async function imageBlobFromElement(img){
    const src=img.currentSrc||img.src||'';if(!src)throw new Error('主图URL为空');
    try{const resp=await fetch(src,{credentials:'include'});if(resp.ok)return await resp.blob();}catch{}
    return await new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url:src,responseType:'blob',onload:r=>r.status>=200&&r.status<300?resolve(r.response):reject(new Error(`图片HTTP ${r.status}`)),onerror:()=>reject(new Error('图片下载失败'))}));
  }
  function extFromBlob(blob,src=''){const t=String(blob?.type||'').toLowerCase();if(t.includes('png'))return'png';if(t.includes('webp'))return'webp';if(t.includes('avif'))return'avif';const m=String(src).match(/\.(jpe?g|png|webp|avif)(?:\?|$)/i);return(m?.[1]||'jpg').replace('jpeg','jpg');}
  async function saveOzonCache(sku,title,img){
    if(!projectDirHandle)throw new Error('未选择项目目录');if(!(await ensureHandlePermission(projectDirHandle,true)))throw new Error('项目目录没有写入权限');
    const blob=await imageBlobFromElement(img);const ext=extFromBlob(blob,img.currentSrc||img.src||'');const od=await projectDirHandle.getDirectoryHandle('Ozon缓存',{create:true});
    // 清理同SKU旧扩展图片，避免一个SKU同时存在 jpg/png 导致1688读取歧义。
    for(const oldExt of IMAGE_EXTENSIONS){const oldName=`${sku}.${oldExt}`;if(oldName===`${sku}.${ext}`)continue;try{await od.removeEntry(oldName);}catch{}}
    const name=`${sku}.${ext}`;const fh=await od.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(blob);await w.close();
    const t=taskBySku(sku);if(t){t.title=title;t.imageName=name;t.cacheStatus='ready';t.lastError='';}
    await persistState();await writeProjectStateFile(projectDirHandle,state);await writeProductsCsv(projectDirHandle);
    const meta={revision:now(),cachedCount:calcStats().cached,total:state.tasks.length,lastSku:sku,updatedAt:now(),reason:'ozon_cache_success'};await writeProjectSyncFile(projectDirHandle,meta);await api.setValue(APP.cacheSyncMetaKey,meta);
    await publishCacheEvent('sku_ready',{sku,imageName:name,title});
    return{name,blob};
  }

  async function toggleOzonCachePause(){
    const r=state.ozonCacheRunner||{};
    if(!r.active){showNotice('当前没有运行中的 Ozon 缓存任务。','info',3500);return;}
    r.paused=!r.paused;state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject(r.paused?'ozon_paused':'ozon_resumed').catch(()=>{});render();
    log(r.paused?`Ozon缓存任务已暂停：当前SKU ${r.currentSku||'-'}，进度保留。`:`Ozon缓存任务继续：从当前进度恢复。`,'info');
    if(!r.paused) setTimeout(()=>runOzonCacheQueue().catch(()=>{}),50);
  }

  async function stopOzonCacheRound(){
    const r=state.ozonCacheRunner||{};activeRunToken++;
    r.active=false;r.paused=false;r.stage='stopped';r.waitUntil=0;r.waitReason='';state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject('ozon_stopped').catch(()=>{});render();
    log('已停止本轮 Ozon 缓存。已完成缓存和任务进度保留；下次“批量缓存Ozon”只继续硬盘缺失项。','warn');
    showNotice('本轮 Ozon 缓存已停止；已完成数据不会清空。','info',4500);
  }

  async function retryCurrentOzonSku(){
    const r=state.ozonCacheRunner||{};const sku=String(r.currentSku||state.tasks.find(t=>t.cacheStatus!=='ready')?.sku||'');
    if(!sku){showNotice('没有可重试的 Ozon SKU。','info',3500);return;}
    const task=taskBySku(sku);if(task){task.cacheStatus='pending';task.imageName='';task.lastError='';}
    r.queueSkus=[sku];r.cursor=0;r.ok=0;r.fail=0;r.consecutiveFail=0;r.currentSku=sku;r.directTried=false;r.paused=false;r.active=true;r.stage='prepare';r.waitUntil=0;r.waitReason='';r.startedAt=r.startedAt||now();state.ozonCacheRunner=r;
    await persistState();await pushTaskStateToProject('ozon_retry_current').catch(()=>{});render();log(`手动重试 Ozon SKU：${sku}`,'info');setTimeout(()=>runOzonCacheQueue().catch(()=>{}),50);
  }

  async function waitForOzonRunnerReady(token){
    while(true){const r=state.ozonCacheRunner||{};if(token!==activeRunToken||!r.active)return false;if(r.paused){await sleep(500);continue;}if(Number(r.waitUntil||0)>now()){await sleep(Math.min(500,Math.max(100,Number(r.waitUntil)-now())));continue;}return true;}
  }

  function prepareNextLongRestTarget(r,pacing){
    if(!pacing.enabled||!pacing.longRestEnabled){r.longRestTarget=0;return 0;}
    r.longRestTarget=randomIntInclusive(pacing.longEveryMin,pacing.longEveryMax);return r.longRestTarget;
  }

  async function applyOzonPacingWait(reason,minSec,maxSec,token,{resetLongCounter=false}={}){
    const r=state.ozonCacheRunner||{};const min=Math.max(0,Number(minSec)||0),max=Math.max(min,Number(maxSec)||min);const sec=randomBetween(min,max);if(sec<=0)return true;
    r.waitUntil=now()+Math.round(sec*1000);r.waitReason=reason;r.stage='waiting';state.ozonCacheRunner=r;await persistState();render();log(`${reason}：随机等待 ${sec.toFixed(sec>=10?0:1)} 秒。可随时点击暂停或停止本轮。`,'info');
    const ok=await waitForOzonRunnerReady(token);r.waitUntil=0;r.waitReason='';if(resetLongCounter)r.processedSinceLongRest=0;if(r.active)r.stage='prepare';state.ozonCacheRunner=r;await persistState();render();return ok;
  }

  async function applyPostSkuPacing(token,{failed=false}={}){
    const p=getOzonPacingSettings(),r=state.ozonCacheRunner||{};if(!p.enabled)return true;
    r.processedSinceLongRest=Number(r.processedSinceLongRest||0)+1;if(!Number(r.longRestTarget||0))prepareNextLongRestTarget(r,p);
    if(failed&&p.failureBackoffEnabled){if(!(await applyOzonPacingWait('SKU失败退避',p.failureMinSec,p.failureMaxSec,token)))return false;}
    if(p.longRestEnabled&&r.longRestTarget>0&&r.processedSinceLongRest>=r.longRestTarget){if(!(await applyOzonPacingWait('周期随机长休息',p.longMinSec,p.longMaxSec,token,{resetLongCounter:true})))return false;prepareNextLongRestTarget(r,p);}
    if(!(await applyOzonPacingWait('SKU间随机等待',p.minDelaySec,p.maxDelaySec,token)))return false;return true;
  }

  async function batchCacheOzon(){
    if(!IS_OZON)return;if(!state.tasks.length){showNotice('请先导入只有“跟卖sku”一列的 Excel。','warn',5000);return;}if(!projectDirHandle){showNotice('请先点击“选择项目目录”。','warn',5000);return;}
    if(!(await ensureHandlePermission(projectDirHandle,true))){showNotice('项目目录没有写入权限，请重新选择项目目录。','error',6000);return;}
    // 每次开始前先以硬盘真实文件校验缓存，不信任浏览器里的旧 cacheStatus。
    await restoreTasksFromProject(projectDirHandle,{merge:true,allowImageScan:true});
    const missing=[];for(const t of state.tasks){if(!(await validateTaskCacheAgainstDisk(t)))missing.push(t.sku);}
    await persistState();await writeProjectStateFile(projectDirHandle,state).catch(()=>{});await writeProductsCsv(projectDirHandle).catch(()=>{});
    if(!missing.length){showNotice(`Ozon缓存已完整：${state.stats.cached}/${state.tasks.length}，无需重复爬取。`,'success',5000);log(`Ozon缓存已完整：${state.stats.cached}/${state.tasks.length}，本轮无需访问Ozon。`);return;}
    const pacing=getOzonPacingSettings();
    const r={...DEFAULT_STATE.ozonCacheRunner,active:true,paused:false,queueSkus:missing,cursor:0,ok:0,fail:0,consecutiveFail:0,startedAt:now(),stage:'prepare',currentSku:missing[0]||'',directTried:false,processedSinceLongRest:0,longRestTarget:0};prepareNextLongRestTarget(r,pacing);state.ozonCacheRunner=r;state.batchStartedAt=state.batchStartedAt||now();await persistState();await pushTaskStateToProject('ozon_batch_start').catch(()=>{});render();
    log(`开始 Ozon 页面式批量缓存：缺失 ${missing.length}/${state.tasks.length} 个 SKU。当前页面若不是目标 SKU，会先导航到搜索页/精确商品详情后再缓存。随机等待：${ozonPacingSummary(pacing)}。`);setTimeout(()=>runOzonCacheQueue().catch(()=>{}),50);
  }

  async function runOzonCacheQueue(){
    if(!IS_OZON)return;const token=++activeRunToken;let r=state.ozonCacheRunner||{};if(!r.active)return;if(!(await waitForOzonRunnerReady(token)))return;r=state.ozonCacheRunner;
    while(r.active&&r.cursor<r.queueSkus.length){
      if(!(await waitForOzonRunnerReady(token)))return;r=state.ozonCacheRunner;const sku=String(r.queueSkus[r.cursor]||'');r.currentSku=sku;state.ozonCacheRunner=r;await persistState();render();
      if(checkOzonChallenge()){r.paused=true;r.stage='challenge';state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject('ozon_challenge').catch(()=>{});render();log(`检测到Ozon验证/访问限制，已安全暂停：${sku}`,'warn');showNotice('检测到Ozon验证/访问限制，缓存任务已暂停。处理页面后点击“继续任务”。','error',0);return;}
      const task=taskBySku(sku);if(task&&(await validateTaskCacheAgainstDisk(task))){r.ok++;r.cursor++;r.consecutiveFail=0;r.directTried=false;state.ozonCacheRunner=r;await persistState();await applyPostSkuPacing(token,{failed:false});continue;}
      try{
        if(!isOzonProduct()||skuFromProductUrl()!==sku){
          r.stage='navigate';state.ozonCacheRunner=r;await persistState();log(`当前页面不是目标 ${sku}，先导航到 Ozon 搜索页。`);location.href=ozonSearchUrl(sku);return;
        }
        r.stage='extract';state.ozonCacheRunner=r;await persistState();
        const img=await waitUntil(()=>findMainImage(),12000,400);if(!img)throw new Error('详情页未找到可靠主图');const title=productTitle();if(!title)throw new Error('详情页未找到商品标题');await saveOzonCache(sku,title,img);r=state.ozonCacheRunner;r.ok++;r.cursor++;r.consecutiveFail=0;r.directTried=false;r.stage='cached';state.ozonCacheRunner=r;await persistState();log(`Ozon缓存 ${r.cursor}/${r.queueSkus.length}：${sku} 成功 → ${taskBySku(sku)?.imageName||''}`);render();
        if(!(await applyPostSkuPacing(token,{failed:false})))return;
      }catch(e){
        r=state.ozonCacheRunner;r.fail++;r.consecutiveFail++;r.cursor++;r.directTried=false;r.stage='error';const task2=taskBySku(sku);if(task2){task2.cacheStatus='pending';task2.lastError=e.message;}state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject('ozon_error').catch(()=>{});log(`Ozon缓存 ${r.cursor}/${r.queueSkus.length}：${sku} 失败：${e.message}`,'error');render();
        if(r.consecutiveFail>=5){r.active=false;r.stage='stopped_after_failures';state.ozonCacheRunner=r;await persistState();log('Ozon缓存连续5个SKU失败，已自动停止，避免继续无效访问。','warn');showNotice('连续5个SKU失败，本轮已停止；请查看页面/日志后再重试。','error',0);return;}
        if(!(await applyPostSkuPacing(token,{failed:true})))return;
      }
    }
    r=state.ozonCacheRunner;r.active=false;r.paused=false;r.stage='done';r.currentSku='';r.waitUntil=0;r.waitReason='';state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject('ozon_done').catch(()=>{});render();log(`Ozon缓存本轮结束：成功 ${r.ok}，失败 ${r.fail}，当前硬盘缓存 ${calcStats().cached}/${state.tasks.length}。`);showNotice(`Ozon缓存本轮结束：成功 ${r.ok}，失败 ${r.fail}，当前缓存 ${state.stats.cached}/${state.tasks.length}。`,r.fail?'warn':'success',6500);
  }

  async function resumeOzonCacheOnPage(){
    const r=state.ozonCacheRunner||{};if(!IS_OZON||!r.active||r.paused)return;
    const sku=String(r.currentSku||r.queueSkus?.[r.cursor]||'');if(!sku)return;
    // search page: find exact target and navigate
    if(isOzonSearch()){
      if(checkOzonChallenge()){r.paused=true;r.stage='challenge';state.ozonCacheRunner=r;await persistState();render();showNotice('检测到Ozon验证，缓存已暂停。','error',0);return;}
      const link=await waitUntil(()=>exactOzonLink(sku),14000,500);
      if(link){r.stage='navigate_detail';state.ozonCacheRunner=r;await persistState();log(`Ozon搜索命中精确SKU ${sku}，进入商品详情。`);location.href=link.href;return;}
      // 没有精确链接，记录失败但不能拿第一个商品代替
      const task=taskBySku(sku);if(task){task.cacheStatus='pending';task.lastError='Ozon搜索未找到精确SKU';}
      r.fail++;r.consecutiveFail++;r.cursor++;r.directTried=false;r.stage='search_no_exact';state.ozonCacheRunner=r;await persistState();await pushTaskStateToProject('ozon_no_exact').catch(()=>{});log(`Ozon缓存 ${r.cursor}/${r.queueSkus.length}：${sku} 搜索未找到精确商品，禁止使用近似商品。`,'error');
      if(r.consecutiveFail>=5){r.active=false;r.stage='stopped_after_failures';state.ozonCacheRunner=r;await persistState();render();showNotice('连续5个SKU未找到/失败，本轮已停止。','error',0);return;}
      const token=++activeRunToken;if(!(await applyPostSkuPacing(token,{failed:true})))return;setTimeout(()=>runOzonCacheQueue().catch(()=>{}),50);return;
    }
    if(isOzonProduct()){
      const actual=skuFromProductUrl();
      if(actual!==sku){log(`当前Ozon商品页 SKU=${actual||'无法识别'}，目标=${sku}；不会判失败，将重新导航目标SKU。`,'warn');r.stage='redirect_expected';state.ozonCacheRunner=r;await persistState();location.href=ozonSearchUrl(sku);return;}
      setTimeout(()=>runOzonCacheQueue().catch(()=>{}),400);return;
    }
    r.stage='redirect_search';state.ozonCacheRunner=r;await persistState();location.href=ozonSearchUrl(sku);
  }

  // 1688 image search
  function findImageInput(){return [...document.querySelectorAll('input[type="file"]')].find(i=>i.accept?.includes('image')||i.closest('[class*="image" i],[class*="photo" i]'))||document.querySelector('input[type="file"]');}
  function visibleText(el){const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';}
  function findSearchImageButton(){return [...document.querySelectorAll('button,div[role="button"],span')].filter(visibleText).find(el=>normalizeText(el.textContent)==='搜索图片')||null;}
  function offerLinks(){return [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/detail\.1688\.com\/offer\/|1688\.com\/offer\//.test(h)))];}
  function hasImageSearchResult(){return offerLinks().length>=3||/image|pic|search/i.test(location.pathname+location.search)&&offerLinks().length>0;}
  async function loadProjectImage(task){if(!projectDirHandle)throw new Error('未连接项目目录');const od=await projectDirHandle.getDirectoryHandle('Ozon缓存');const fh=await od.getFileHandle(task.imageName);return await fh.getFile();}
  async function submitImageSearch(task){
    const file=await loadProjectImage(task);const input=await waitUntil(()=>findImageInput(),10000,300);if(!input)throw new Error('未找到1688图片上传控件');const dt=new DataTransfer();dt.items.add(new File([file],file.name,{type:file.type||'image/jpeg'}));input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));log(`已把图片写入1688上传控件：${file.name}`);await sleep(1200);const btn=await waitUntil(()=>findSearchImageButton(),8000,300);if(!btn)throw new Error('图片已上传，但未找到“搜索图片”按钮');btn.click();task.status='submitted';await persistState();log(`已提交1688图搜：${task.sku}`);
  }

  async function startCurrentOrWait(){
    if(!IS_1688)return;if(state.running)return;await becomeController('start_current');
    const idx=nextRunnableIndex(state.currentIndex);if(idx<0){state.running=false;state.waitingForOzon=Boolean(state.liveMode);await persistState();render();if(state.liveMode)log('没有可执行的READY任务，实时等待Ozon继续缓存。');return;}
    state.currentIndex=idx;const task=currentTask();state.running=true;state.waitingForOzon=false;state.currentStartedAt=now();task.attempts=(task.attempts||0)+1;task.status='searching';task.lastError='';await persistState();render();log(`开始 SKU ${task.sku}：${task.title||''}`);
    const token=++activeRunToken;
    try{
      await submitImageSearch(task);
      task.status='result_loading';await persistState();render();
      // V1.6.2：结果可能由页面内新窗口、另一1688标签或Codex直接打开候选详情。任何一个真实信号都算进入核验阶段。
      const found=await waitFor1688CandidateSignal(task,token,APP.searchTimeoutMs);
      if(token!==activeRunToken)return;
      task.status='candidate_review';task.lastError=found?'' : '图搜已提交，但控制页未直接检测到结果；保持待核验，不自动判失败。';state.running=false;await persistState();await pushTaskStateToProject('candidate_review').catch(()=>{});render();
      log(found?`SKU ${task.sku}：已检测到1688图搜/候选信号，等待 Codex 核验。`:`SKU ${task.sku}：未在控制页直接检测到图搜结果，但不判失败；等待 Codex 核验/手动重试。`,found?'info':'warn');
    }catch(e){task.status='retry';task.matchData=normalizeMatchData({...(task.matchData||{}),conclusion:'RETRY'});task.lastError=e.message;state.running=false;await persistState();await pushTaskStateToProject('retry').catch(()=>{});render();log(`SKU ${task.sku} 图搜异常：${e.message}。已标记 RETRY，不会判定无同款。`,'error');}
  }

  async function waitFor1688CandidateSignal(task,token,timeoutMs){
    const start=now();
    while(now()-start<timeoutMs){
      if(token!==activeRunToken)return false;
      if(hasImageSearchResult()){await publish1688ResultSignal(task,'control_dom');return true;}
      const sig=api.getValueSync(APP.resultSignalKey,null);if(sig&&String(sig.sku||'')===String(task.sku)&&now()-Number(sig.ts||0)<APP.resultSignalTtlMs)return true;
      const work=getCandidateWorkInfo();if(work&&String(work.sku||'')===String(task.sku)&&candidateWorkAlive(work))return true;
      await sleep(500);
    }
    return false;
  }
  async function publish1688ResultSignal(task,source='tab'){const p={sku:String(task?.sku||currentTaskSku()||''),url:location.href,source,ts:now(),tabId:TAB_ID};if(!p.sku)return;await api.setValue(APP.resultSignalKey,p);}

  async function retryCurrent(){const t=currentTask();if(!t)return;if(!isReadyFor1688(t)){showNotice('当前SKU没有可用Ozon主图。','error',5000);return;}t.status='retry';t.matchData=normalizeMatchData({...(t.matchData||{}),conclusion:'RETRY'});t.lastError='';state.running=false;await persistState();render();await startCurrentOrWait();}

  function readMatchFormData(m){
    return normalizeMatchData({
      supplierUrl:m.querySelector('[name="supplierUrl"]')?.value.trim()||'',supplier:m.querySelector('[name="supplier"]')?.value.trim()||'',variant:m.querySelector('[name="variant"]')?.value.trim()||'',
      supplierUnitQty:m.querySelector('[name="supplierUnitQty"]')?.value.trim()||'',ozonUnitQty:m.querySelector('[name="ozonUnitQty"]')?.value.trim()||'',requiredSupplierQty:m.querySelector('[name="requiredSupplierQty"]')?.value.trim()||'',
      activityBeforePrice:m.querySelector('[name="activityBeforePrice"]')?.value.trim()||'',shipping:m.querySelector('[name="shipping"]')?.value.trim()||'',moq:m.querySelector('[name="moq"]')?.value.trim()||'',
      specEvidence:m.querySelector('[name="specEvidence"]')?.value.trim()||'',priceEvidence:m.querySelector('[name="priceEvidence"]')?.value.trim()||'',shippingEvidence:m.querySelector('[name="shippingEvidence"]')?.value.trim()||'',note:m.querySelector('[name="note"]')?.value.trim()||'',conclusion:'MATCHED'
    });
  }

  function liveMatchCalculation(m){
    const data=readMatchFormData(m);const c=calculateMatchCost(data);data.goodsValue=c.goodsValue===null?'':formatMoney(c.goodsValue);data.finalCost=c.finalCost===null?'':formatMoney(c.finalCost);data.moqGate=c.moq===null?'':(c.moqPass?'PASS':'FAIL');
    const checked=validateMatchedData(data);const calc=m.querySelector('[data-calc]');if(calc){calc.innerHTML=`
      <b>脚本自动计算</b><br>商品货值 = 活动前单价 × Ozon所需1688数量 = <b>${c.goodsValue===null?'待填写':formatMoney(c.goodsValue)}</b><br>
      最终采购成本 = 商品货值 + 正常运费 = <b>${c.finalCost===null?'待填写':formatMoney(c.finalCost)}</b><br>
      MOQ Gate = <b style="color:${c.moq===null?'#777':(c.moqPass?'#15803d':'#b91c1c')}">${c.moq===null?'待填写':(c.moqPass?'PASS':'FAIL（MOQ必须小于5）')}</b>`;}
    const gates=m.querySelector('[data-gates]');if(gates){const rows=[['同款/最终链接',Boolean(normalizeText(data.supplierUrl))],['精确规格',Boolean(normalizeText(data.variant)&&c.supplierUnitQty!==null&&c.ozonUnitQty!==null&&c.requiredSupplierQty!==null)],['MOQ < 5',c.moq!==null&&c.moqPass],['活动前价格',c.activityBeforePrice!==null&&Boolean(normalizeText(data.priceEvidence))],['正常运费',c.shipping!==null&&Boolean(normalizeText(data.shippingEvidence))],['规格证据',Boolean(normalizeText(data.specEvidence))]];gates.innerHTML=rows.map(([name,ok])=>`<div class="gate ${ok?'pass':'fail'}">${ok?'✅':'❌'} ${escapeHtml(name)}</div>`).join('');}
    const btn=m.querySelector('[data-x="save"]');if(btn){btn.disabled=!checked.ok;btn.title=checked.ok?'Gate全部通过，可保存MATCHED':checked.errors.join('；');btn.style.opacity=checked.ok?'1':'.55';}
    return {data,checked};
  }

  function matchFormHtml(task,{batchedEdit=false}={}){
    const old=normalizeMatchData(task?.matchData||{});const calc=calculateMatchCost(old);const legacy=old.legacyNormalPrice||old.normalPrice
      ? `<div class="warn">旧版记录的“正常单价”：${escapeHtml(old.legacyNormalPrice||old.normalPrice)}。当前版本不会自动把它当成活动前价，请按1688页面重新确认“活动前价格”。</div>`:'';
    return `
      <h3>${batchedEdit?'修正已结批货源':'确认真正同款 + 规格/成本 Gate'} · Ozon ${escapeHtml(task?.sku||'')}</h3>
      ${batchedEdit?`<div class="warn">当前最终货号 <b>${escapeHtml(task?.finalCode||'')}</b> / 批次 <b>${escapeHtml(task?.batchId||'')}</b> 已冻结。本操作只更新1688采购信息，绝不修改货号和批次。</div>`:''}
      ${legacy}
      <h4 style="margin:12px 0 0">① 商品与规格</h4>
      <label>1688最终推荐链接 *</label><input name="supplierUrl" value="${escapeHtml(old.supplierUrl||location.href)}">
      <div class="row"><div><label>供应商</label><input name="supplier" value="${escapeHtml(old.supplier||'')}"></div><div><label>1688具体规格 *</label><input name="variant" value="${escapeHtml(old.variant||old.legacyVariant||'')}" placeholder="必须写具体颜色/款式/组合"></div></div>
      <div class="row"><div><label>1688单销售单位包含数量 *</label><input name="supplierUnitQty" type="number" min="0.0001" step="any" value="${escapeHtml(old.supplierUnitQty||'')}"></div><div><label>Ozon单销售单位包含数量 *</label><input name="ozonUnitQty" type="number" min="0.0001" step="any" value="${escapeHtml(old.ozonUnitQty||'')}"></div></div>
      <label>组成1个Ozon销售单位所需1688数量 *</label><input name="requiredSupplierQty" type="number" min="0.0001" step="any" value="${escapeHtml(old.requiredSupplierQty||'')}" placeholder="注意：不是MOQ">
      <h4 style="margin:12px 0 0">② 成本</h4>
      <div class="row"><div><label>1688活动前单价 *</label><input name="activityBeforePrice" type="number" min="0.0001" step="any" value="${escapeHtml(old.activityBeforePrice||'')}" placeholder="禁止券后/首单/新客价"></div><div><label>正常运费 *</label><input name="shipping" type="number" min="0" step="any" value="${escapeHtml(old.shipping||old.legacyShipping||'')}"></div></div>
      <label>1688 MOQ / 起批量 *（必须小于5）</label><input name="moq" type="number" min="1" step="any" value="${escapeHtml(old.moq||old.legacyMoq||'')}">
      <div class="calcbox" data-calc>等待计算…</div>
      <h4 style="margin:12px 0 0">③ 证据</h4>
      <label>规格证据 *</label><textarea name="specEvidence" placeholder="说明为什么这个1688规格与Ozon销售单位一致，以及数量如何换算">${escapeHtml(old.specEvidence||'')}</textarea>
      <label>价格证据 *</label><textarea name="priceEvidence" placeholder="必须说明1688页面活动前价格；不要只写结果数字">${escapeHtml(old.priceEvidence||'')}</textarea>
      <label>运费证据 *</label><textarea name="shippingEvidence" placeholder="正常运费来源，例如页面显示运费3元起">${escapeHtml(old.shippingEvidence||'')}</textarea>
      <label>比价备注</label><textarea name="note" placeholder="记录其他真正同款候选和淘汰原因；MOQ>=5必须淘汰">${escapeHtml(old.note||'')}</textarea>
      <h4 style="margin:12px 0 0">④ 最终提交 Gate</h4><div class="gate-list" data-gates></div>
      <div class="actions"><button data-x="cancel">取消</button><button data-x="save" class="okbtn">${batchedEdit?'保存修正（货号不变）':'保存 MATCHED 并下一个'}</button></div>`;
  }

  function openMatchModal(){const task=currentTask();if(!task)return;showModal(matchFormHtml(task),(m,close)=>{
      m.querySelector('[data-x="cancel"]').onclick=close;const update=()=>liveMatchCalculation(m);m.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input',update));update();
      m.querySelector('[data-x="save"]').onclick=async()=>{const {data,checked}=liveMatchCalculation(m);if(!checked.ok){showNotice(`MATCHED提交被Gate拦截：${checked.errors.join('；')}`,'error',7000);return;}data.goodsValue=formatMoney(checked.goodsValue);data.finalCost=formatMoney(checked.finalCost);data.moqGate='PASS';close();await finishAndNext('completed',data);};
    });}

  function openNoValidSupplierModal(){const task=currentTask();if(!task)return;showModal(`
      <h3>无合适货源 · ${escapeHtml(task.sku)}</h3><div class="warn">只有“找到真正同款，但采购Gate不通过”才使用本状态。例如所有真实同款MOQ≥5、规格无法可靠确认、活动前价格/正常运费无法确认。没有真正同款请使用“无同款并下一个”。</div>
      <label>原因 / 证据 *</label><textarea name="reason" placeholder="记录找到的真实同款，以及为什么不能作为有效货源（例如全部MOQ=5/10）"></textarea>
      <div class="actions"><button data-x="cancel">取消</button><button data-x="save" class="primary">保存 NO_VALID_SUPPLIER 并下一个</button></div>
    `,(m,close)=>{m.querySelector('[data-x="cancel"]').onclick=close;m.querySelector('[data-x="save"]').onclick=async()=>{const reason=m.querySelector('[name="reason"]').value.trim();if(!reason){showNotice('请填写无合适货源原因/证据。','warn',4500);return;}close();await finishAndNext('no_valid_supplier',{conclusion:'NO_VALID_SUPPLIER',note:reason});};});}

  function openFixBatchedSupplierModal(){
    const batchTasks=state.tasks.filter(t=>Boolean(t.batchId&&t.finalCode));if(!batchTasks.length){showNotice('当前没有已结批商品。','info',4000);return;}
    // 优先当前任务；否则默认最近结批的最后一条。
    let task=currentTask();if(!task?.batchId)task=batchTasks.sort((a,b)=>Number(b.batchedAt||0)-Number(a.batchedAt||0))[0];
    showModal(matchFormHtml(task,{batchedEdit:true}),(m,close)=>{
      m.querySelector('[data-x="cancel"]').onclick=close;const update=()=>liveMatchCalculation(m);m.querySelectorAll('input,textarea').forEach(el=>el.addEventListener('input',update));update();
      m.querySelector('[data-x="save"]').onclick=async()=>{const {data,checked}=liveMatchCalculation(m);if(!checked.ok){showNotice(`修正数据未通过Gate：${checked.errors.join('；')}`,'error',7000);return;}const frozenCode=task.finalCode,frozenBatch=task.batchId,batchedAt=task.batchedAt;data.goodsValue=formatMoney(checked.goodsValue);data.finalCost=formatMoney(checked.finalCost);data.moqGate='PASS';task.matchData=data;task.status='batched';task.finalCode=frozenCode;task.batchId=frozenBatch;task.batchedAt=batchedAt;await persistState();await pushTaskStateToProject('fix_batched_supplier').catch(()=>{});close();render();log(`已修正已结批货源：${task.sku} / ${task.finalCode} / ${task.batchId}；最终采购成本=${data.finalCost}。货号和批次保持不变。`,'info');showNotice(`已修正 ${task.finalCode} 的1688规格/成本，原货号与批次保持不变。`,'success',6000);};
    });
  }

  async function sendMatchActionToController(action,task,extra={}){await api.setValue(APP.matchActionKey,{action,sku:task.sku,senderTabId:TAB_ID,ts:now(),...extra});}

  async function finishAndNext(status,data=null){
    const t=currentTask();if(!t)return;
    if(status==='completed'&&data){const checked=validateMatchedData(data);if(!checked.ok){showNotice(`禁止保存 MATCHED：${checked.errors.join('；')}`,'error',7000);log(`MATCHED Gate拦截：${t.sku} → ${checked.errors.join('；')}`,'warn');return;}data={...checked.data,goodsValue:formatMoney(checked.goodsValue),finalCost:formatMoney(checked.finalCost),moqGate:'PASS',conclusion:'MATCHED'};}
    const candidateMode=IS_1688&&!isControllerTab()&&(isCandidateWorkTab()||isLikely1688OfferUrl());
    if(candidateMode){const action=status==='completed'?'matched':status==='no_match'?'no_match':status==='no_valid_supplier'?'no_valid_supplier':status==='retry'?'retry':status;await sendMatchActionToController(action,t,{matchData:data||undefined,error:status==='retry'?(t.lastError||'候选工作页请求重试'):''});log(`候选工作页已向控制页发送结果：${t.sku} → ${action}`);showNotice(`已把 ${action} 结果发送给控制页；本页不会抢下一个任务。`,'success',4500);return;}
    if(status==='completed'){t.matchData=data;t.status='completed';}
    else if(status==='no_match'){t.matchData=normalizeMatchData({...(t.matchData||{}),conclusion:'NO_MATCH'});t.status='no_match';}
    else if(status==='no_valid_supplier'){t.matchData=normalizeMatchData({...(t.matchData||{}),...(data||{}),conclusion:'NO_VALID_SUPPLIER'});t.status='no_valid_supplier';}
    else if(status==='retry'){t.matchData=normalizeMatchData({...(t.matchData||{}),conclusion:'RETRY'});t.status='retry';}
    else t.status=status;
    state.running=false;state.currentStartedAt=0;await persistState();await pushTaskStateToProject(`finish_${status}`).catch(()=>{});log(`任务 ${t.sku} → ${t.status}${t.matchData?.finalCost?`，最终采购成本=${t.matchData.finalCost}`:''}`);render();await advanceAndMaybeStart();
  }

  function openCodeSettings(){
    const s=getCodeSettings();const dateOptions=[['none','无日期'],['MMDD','月日，例如 0818'],['YYYYMMDD','年月日，例如 20260818'],['YYMMDD','短年月日，例如 260818'],['YYYY-MM-DD','带横线日期，例如 2026-08-18']];
    showModal(`<h3>最终货号设置</h3><div class="warn">已经分配的最终货号永久冻结。修改这里的规则只影响未来“未结批”的商品，不会重命名旧批次。</div><label>模式</label><select name="mode"><option value="visual" ${s.mode!=='advanced'?'selected':''}>可视化规则</option><option value="advanced" ${s.mode==='advanced'?'selected':''}>高级模板</option></select><div data-visual><div class="row"><div><label>前缀</label><input name="prefix" value="${escapeHtml(s.prefix)}"></div><div><label>分隔符</label><input name="separator" value="${escapeHtml(s.separator)}"></div></div><label>日期格式</label><select name="dateFormat">${dateOptions.map(([v,l])=>`<option value="${v}" ${s.dateFormat===v?'selected':''}>${l}</option>`).join('')}</select><div class="row"><div><label>流水号位数</label><select name="seqWidth">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${Number(s.seqWidth)===n?'selected':''}>${n} 位</option>`).join('')}</select></div><div><label>首次起始序号</label><input type="number" min="1" name="startSeq" value="${Number(s.startSeq)||1}"></div></div><label>固定后缀（可空）</label><input name="suffix" value="${escapeHtml(s.suffix)}"></div><div data-advanced><label>高级模板</label><input name="template" value="${escapeHtml(s.template)}"><div class="k-hint">可用：{YYYY} {YY} {MM} {DD} {MMDD} {YYYYMMDD} {YYMMDD} {SEQ} {SEQ2}…{SEQ6} {SUB}</div><label>{SUB} 当前值</label><input name="subValue" value="${escapeHtml(s.subValue)}"></div><div class="calcbox">实时预览：<b data-preview></b></div><div class="actions"><button data-x="cancel">取消</button><button data-x="save" class="primary">保存规则</button></div>`,(m,close)=>{
      const mode=m.querySelector('[name="mode"]'),visual=m.querySelector('[data-visual]'),adv=m.querySelector('[data-advanced]'),prev=m.querySelector('[data-preview]');const read=()=>({mode:mode.value,prefix:m.querySelector('[name="prefix"]').value,separator:m.querySelector('[name="separator"]').value,dateFormat:m.querySelector('[name="dateFormat"]').value,seqWidth:Number(m.querySelector('[name="seqWidth"]').value)||3,startSeq:Math.max(1,Number(m.querySelector('[name="startSeq"]').value)||1),suffix:m.querySelector('[name="suffix"]').value,template:m.querySelector('[name="template"]').value,subValue:m.querySelector('[name="subValue"]').value});const redraw=()=>{const x=read();visual.style.display=x.mode==='advanced'?'none':'block';adv.style.display=x.mode==='advanced'?'block':'none';prev.textContent=codePreview(x);};m.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',redraw));redraw();m.querySelector('[data-x="cancel"]').onclick=close;m.querySelector('[data-x="save"]').onclick=async()=>{const x=read();if(!normalizeText(effectiveTemplate(x))){showNotice('货号规则不能为空。','warn',4500);return;}await saveCodeSettings(x);log(`货号规则已保存：${codeSettingsSummary(x)}；模板=${effectiveTemplate(x)}`);close();render();};
    });
  }

  async function acquireBatchLock(){
    const token=`${TAB_ID}_${now()}_${Math.random().toString(36).slice(2,7)}`;const cur=api.getValueSync(APP.batchLockKey,null);if(cur&&now()-Number(cur.ts||0)<APP.batchLockTtlMs&&cur.tabId!==TAB_ID)return null;await api.setValue(APP.batchLockKey,{token,tabId:TAB_ID,ts:now()});await sleep(80);const check=api.getValueSync(APP.batchLockKey,null);return check?.token===token?token:null;
  }
  async function releaseBatchLock(token){const cur=api.getValueSync(APP.batchLockKey,null);if(cur?.token===token)await api.deleteValue(APP.batchLockKey);}

  function nextBatchId(date=new Date()){const d=codeDateParts(date);const base=`B${d.YYYY}${d.MM}${d.DD}`;const existing=[...new Set([...state.tasks.map(t=>t.batchId),...getBatchHistory().map(x=>x.batchId)].filter(Boolean).filter(x=>String(x).startsWith(base)))];let max=0;for(const x of existing){const m=String(x).match(/-(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}return`${base}-${String(max+1).padStart(2,'0')}`;}

  async function updateBatchExportStatus(batchId,status,detail={}){
    const history=getBatchHistory();let row=history.find(x=>x?.batchId===batchId);if(!row){row={batchId,createdAt:now(),date:'',count:state.tasks.filter(t=>t.batchId===batchId).length};history.push(row);}row.exportStatus=status;row.exportUpdatedAt=now();if(detail.destination!==undefined)row.exportDestination=String(detail.destination||'');if(detail.error!==undefined)row.exportError=String(detail.error||'');await saveBatchHistory(history.slice(-300));
  }
  function latestBatchHistoryEntry(){const history=getBatchHistory().filter(x=>x?.batchId);return history.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0]||null;}

  function eligibleForBatch(){return state.tasks.filter(t=>t.status==='completed'&&!t.batchId&&!t.finalCode&&validateMatchedData(t.matchData||{}).ok);}
  function existingCodesInCurrentState(){return new Set(state.tasks.map(t=>t.finalCode).filter(Boolean));}
  function planBatchCodes(tasks,date=new Date()){
    const settings=getCodeSettings();const validation=normalizedTemplateForDateFormat(settings);const d=codeDateParts(date);const ledger=usedSequenceLedger();const registry=codeRegistry();const ledgerKey=`${validation}|${d.dateKey}`;let seq=Math.max(Number(settings.startSeq)||1,Number(ledger[ledgerKey]||0)+1);const used=new Set([...Object.keys(registry),...existingCodesInCurrentState()]);const planned=[];
    for(const t of tasks){let code='';while(true){code=renderCodeTemplate(validation,seq,date,settings.subValue||'1');if(!used.has(code))break;seq++;}planned.push({task:t,code,seq});used.add(code);seq++;}
    return{items:planned,ledger,registry,ledgerKey,lastSeq:planned.at(-1)?.seq||Number(ledger[ledgerKey]||0),settings,effectiveTemplate:validation,dateParts:d};
  }

  async function preflightBatchImages(tasks){const rows=[];const missing=[];for(const t of tasks){try{const hit=await findOzonImageFile(t.sku,t.imageName||'');if(hit){t.imageName=hit.name;t.cacheStatus='ready';rows.push({task:t,...hit});}else{t.imageName='';t.cacheStatus='pending';missing.push(t.sku);}}catch(e){missing.push(t.sku);log(`结批图片预检异常 ${t.sku}：${e.message}`,'error');}}return{ok:missing.length===0,rows,missing};}

  function batchMappingRows(tasks){
    return tasks.map(t=>{const m=normalizeMatchData(t.matchData||{});const checked=validateMatchedData(m);return [
      t.finalCode,t.sku,t.title||'',t.imageName||'',m.supplierUrl||'',m.supplier||'',m.variant||'',m.supplierUnitQty||'',m.ozonUnitQty||'',m.requiredSupplierQty||'',m.activityBeforePrice||'',m.goodsValue||'',m.shipping||'',m.finalCost||'',m.moq||'',m.moqGate||(checked.moq!==null?(checked.moqPass?'PASS':'FAIL'):''),m.specEvidence||'',m.priceEvidence||'',m.shippingEvidence||'',m.note||'',m.conclusion||'MATCHED',t.batchId||''
    ];});
  }
  const BATCH_MAPPING_HEADER=['最终货号','Ozon原始SKU','Ozon标题','Ozon原图','1688最终链接','供应商','1688具体规格','1688单销售单位包含数量','Ozon单销售单位包含数量','组成1个Ozon销售单位所需1688数量','活动前单价','商品货值','正常运费','最终采购成本','MOQ','MOQ Gate','规格证据','价格证据','运费证据','比价备注','最终业务结论','上架批次'];
  function csvText(header,rows){return'\uFEFF'+[header,...rows].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');}

  async function generateListingBatch(){
    if(!IS_1688)return;if(!projectDirHandle){showNotice('请先连接项目根目录。批次会固定写入“项目根目录/上架批次/批次号”。','warn',5500);return;}
    if(!(await ensureHandlePermission(projectDirHandle,true))){showNotice('项目目录写入权限失效，请点击“连接项目目录”重新授权。不会自动下载ZIP。','error',6500);return;}
    const lockToken=await acquireBatchLock();if(!lockToken){showNotice('另一个1688标签正在生成/导出批次，请稍后再试。','warn',5500);return;}
    try{
      // V1.8.1：点击瞬间锁定当前可结批快照；后续Codex新完成的SKU绝不临时加入本批。
      const snapshotTasks=eligibleForBatch().slice();if(!snapshotTasks.length){const review=state.tasks.filter(taskNeedsStructuredReview).length;showNotice(review?`当前没有通过新Gate的可结批商品；另有 ${review} 个旧MATCHED需要补规格/成本。`:'当前没有“已确认有同款且未结批”的商品。','warn',6000);return;}
      const pre=await preflightBatchImages(snapshotTasks);await persistState();if(!pre.ok){showNotice(`结批前发现 ${pre.missing.length} 个Ozon真实主图缺失：${pre.missing.slice(0,5).join('、')}${pre.missing.length>5?'…':''}。未冻结货号，请先补缓存。`,'error',0);log(`结批预检失败：真实Ozon主图缺失 ${pre.missing.join('、')}；未生成批次、未占流水号。`,'error');return;}
      const date=new Date(),plan=planBatchCodes(snapshotTasks,date);if(!plan.items.length)return;const first=plan.items[0].code,last=plan.items.at(-1).code;
      const ok=confirm(`准备生成当前上架批次。\n\n本批数量：${plan.items.length}\n货号规则：${codeSettingsSummary(plan.settings)}\n日期：${plan.dateParts.dateKey}\n当前流水账最大值：${Number(plan.ledger[plan.ledgerKey]||0)||'无'}\n本批首号：${first}\n本批末号：${last}\n\n只包含你点击按钮这一刻已经MATCHED且通过全部Gate的商品；Codex正在核验或之后完成的SKU不会进入本批。\n\n确认后最终货号永久冻结，继续吗？`);if(!ok)return;
      // 确认后再做一次真实文件预检，避免确认窗口停留期间用户移动文件。
      const pre2=await preflightBatchImages(snapshotTasks);if(!pre2.ok){showNotice(`确认后再次检查发现主图缺失，已取消冻结：${pre2.missing.join('、')}`,'error',0);return;}
      const batchId=nextBatchId(date),batchedAt=now();
      for(const {task,code} of plan.items){task.finalCode=code;task.batchId=batchId;task.status='batched';task.batchedAt=batchedAt;task.matchData=normalizeMatchData({...task.matchData,conclusion:'MATCHED'});plan.registry[code]={ozonSku:task.sku,batchId,assignedAt:batchedAt};}
      plan.ledger[plan.ledgerKey]=plan.lastSeq;
      const history=getBatchHistory();history.push({batchId,createdAt:batchedAt,date:plan.dateParts.dateKey,count:plan.items.length,firstCode:plan.items[0].code,lastCode:plan.items.at(-1).code,template:plan.effectiveTemplate,exportStatus:'pending',exportUpdatedAt:batchedAt,exportError:''});
      await Promise.all([persistState(),saveSequenceLedger(plan.ledger),saveCodeRegistry(plan.registry),saveBatchHistory(history.slice(-300))]);
      log(`已生成并冻结上架批次 ${batchId}：${plan.items.length} 个商品，${plan.items[0].code} ～ ${plan.items.at(-1).code}。`);render();showNotice(`批次 ${batchId} 已冻结；导出失败也不会重新占号。`,'success',6000);
      await showBatchFrozenActions(batchId,plan.items.length);
    }finally{await releaseBatchLock(lockToken).catch(()=>{});}
  }

  function crc32Table(){const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;}
  const CRC_TABLE=crc32Table();function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return(c^0xffffffff)>>>0;}
  function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}function concatBytes(parts){const len=parts.reduce((a,b)=>a+b.length,0);const out=new Uint8Array(len);let p=0;for(const b of parts){out.set(b,p);p+=b.length;}return out;}
  function dosTimeDate(d=new Date()){return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(Math.floor(d.getSeconds()/2)),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}
  function zipBlob(files){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;const dt=dosTimeDate();for(const f of files){const name=enc.encode(f.name.replaceAll('\\','/'));const data=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data));const crc=crc32(data);const local=concatBytes([u32(0x04034b50),u16(20),u16(0),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(dt.time),u16(dt.date),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length;}const centralBytes=concatBytes(centrals);const end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(offset),u16(0)]);return new Blob([concatBytes([...locals,centralBytes,end])],{type:'application/zip'});}

  function batchTasksById(batchId){return state.tasks.filter(t=>t.batchId===batchId&&t.finalCode);}
  async function collectBatchFiles(batchId){
    const tasks=batchTasksById(batchId);if(!tasks.length)throw new Error(`批次 ${batchId} 没有商品`);const files=[];const mappingRows=batchMappingRows(tasks);files.push({name:'编号映射.csv',data:new TextEncoder().encode(csvText(BATCH_MAPPING_HEADER,mappingRows))});
    const notes=[`上架批次：${batchId}`,`商品数量：${tasks.length}`,'跟卖主图文件名为最终自定义货号；原始Ozon缓存不会被移动或重命名。','采购成本字段来自 ozon-1688-source-match 结构化核验；最终采购成本 = 活动前单价 × Ozon所需1688数量 + 正常运费；MOQ只做<5准入筛选。'];files.push({name:'说明.txt',data:new TextEncoder().encode(notes.join('\r\n'))});
    const missing=[];for(const t of tasks){const hit=await findOzonImageFile(t.sku,t.imageName||'');if(!hit){missing.push(t.sku);continue;}t.imageName=hit.name;t.cacheStatus='ready';const ext=hit.name.split('.').pop()?.toLowerCase()||'jpg';const bytes=new Uint8Array(await hit.file.arrayBuffer());files.push({name:`跟卖主图/${t.finalCode}.${ext}`,data:bytes});}
    await persistState();if(missing.length)throw new Error(`以下SKU的项目目录真实Ozon主图缺失：${missing.join('、')}`);return{tasks,files,mappingRows};
  }

  async function writeBatchToProjectDirectory(batchId){
    if(!projectDirHandle)throw new Error('未连接项目根目录');if(!(await ensureHandlePermission(projectDirHandle,true)))throw new Error('项目目录写入权限失效，请重新连接项目目录');
    await updateBatchExportStatus(batchId,'exporting',{destination:`项目根目录/上架批次/${batchId}`});
    try{
      const{tasks,mappingRows}=await collectBatchFiles(batchId);const root=await getListingRootDir();const batchDir=await root.getDirectoryHandle(batchId,{create:true});const imgDir=await batchDir.getDirectoryHandle('跟卖主图',{create:true});
      await writeTextFileHandle(batchDir,'编号映射.csv',csvText(BATCH_MAPPING_HEADER,mappingRows));await writeTextFileHandle(batchDir,'说明.txt',[`上架批次：${batchId}`,`商品数量：${tasks.length}`,'本目录由脚本固定写入；“重新导出最近批次”会直接更新此目录，不创建新批次、不改变已冻结货号。','跟卖主图文件名为最终自定义货号；原始Ozon缓存不会被移动或重命名。'].join('\r\n'));
      const wanted=new Set();for(const t of tasks){const hit=await findOzonImageFile(t.sku,t.imageName||'');if(!hit)throw new Error(`${t.sku} 的项目目录真实Ozon主图缺失`);const ext=hit.name.split('.').pop()?.toLowerCase()||'jpg';const outName=`${t.finalCode}.${ext}`;wanted.add(outName);const fh=await imgDir.getFileHandle(outName,{create:true});const w=await fh.createWritable();await w.write(hit.file);await w.close();}
      // 重新导出时删除该批次跟卖主图目录中已不属于本批最终映射的旧图片，防止旧扩展/旧残留混入。
      for await(const [name,handle] of imgDir.entries()){if(handle?.kind==='file'&&!wanted.has(name)&&/\.(jpe?g|png|webp|avif|bmp)$/i.test(name)){try{await imgDir.removeEntry(name);}catch{}}}
      await updateBatchExportStatus(batchId,'exported-project',{destination:`项目根目录/上架批次/${batchId}`,error:''});await pushTaskStateToProject('batch_export_project').catch(()=>{});render();log(`批次 ${batchId} 已写入固定项目目录：上架批次/${batchId}/（${tasks.length}个）`);showNotice(`批次 ${batchId} 已更新到项目目录/上架批次/${batchId}/。`,'success',6500);return true;
    }catch(e){await updateBatchExportStatus(batchId,'failed',{destination:`项目根目录/上架批次/${batchId}`,error:e.message||String(e)});render();throw e;}
  }

  async function exportBatchZipExplicit(batchId){const{tasks,files}=await collectBatchFiles(batchId);const zip=zipBlob(files),url=URL.createObjectURL(zip),a=document.createElement('a');a.href=url;a.download=`${batchId}_上架批次.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);await updateBatchExportStatus(batchId,'exported-zip',{destination:'显式ZIP下载',error:''});render();log(`批次 ${batchId} 已按用户明确操作导出ZIP（${tasks.length}个）。`);showNotice(`批次 ${batchId} ZIP 已下载；项目目录原批次未改变。`,'success',5500);}

  function showBatchFrozenActions(batchId,count){return new Promise(resolve=>{showModal(`<h3>批次已冻结：${escapeHtml(batchId)}</h3><div class="warn">${count} 个商品的最终货号已经永久冻结。现在可以直接保存到固定项目目录；即使导出失败，再次导出仍复用本批次和原货号。</div><div class="calcbox"><b>固定保存位置</b><br>项目根目录 / 上架批次 / ${escapeHtml(batchId)} /<br>├─ 编号映射.csv<br>├─ 说明.txt<br>└─ 跟卖主图 / 最终货号.jpg…</div><div class="actions"><button data-x="later">暂不导出</button><button data-x="folder" class="primary">保存到项目目录</button></div>`,(m,close)=>{m.querySelector('[data-x="later"]').onclick=()=>{close();resolve();};m.querySelector('[data-x="folder"]').onclick=async()=>{try{await writeBatchToProjectDirectory(batchId);close();resolve();}catch(e){showNotice(`写入项目目录失败：${e.message}。请检查项目目录权限后使用“重新导出最近批次”。不会自动下载ZIP。`,'error',0);log(`批次 ${batchId} 写入项目目录失败：${e.message}`,'error');close();resolve();}};});});}

  function latestExistingBatchId(){const historyLatest=latestBatchHistoryEntry();let latest=String(historyLatest?.batchId||'');if(latest)return latest;const ids=[...new Set(state.tasks.map(t=>t.batchId).filter(Boolean))];if(!ids.length)return'';return ids.sort((a,b)=>{const ta=Math.max(...state.tasks.filter(t=>t.batchId===a).map(t=>Number(t.batchedAt)||0));const tb=Math.max(...state.tasks.filter(t=>t.batchId===b).map(t=>Number(t.batchedAt)||0));return tb-ta;})[0]||'';}

  async function exportLatestBatch(){const latest=latestExistingBatchId();if(!latest){showNotice('当前没有已冻结批次可重新导出。','info',4500);return;}if(!projectDirHandle){showNotice('请先点击“连接项目目录”。重新导出固定写回项目根目录，不会自动下载ZIP。','warn',5500);return;}if(!(await ensureHandlePermission(projectDirHandle,true))){showNotice('项目目录权限失效，请点击“连接项目目录”重新授权。不会自动回退ZIP。','error',6500);return;}try{await writeBatchToProjectDirectory(latest);}catch(e){showNotice(`重新导出 ${latest} 失败：${e.message}。请修复项目目录/主图后再次点击本按钮。`,'error',0);log(`重新导出最近批次失败：${latest} → ${e.message}`,'error');}}
  async function exportLatestBatchZip(){const latest=latestExistingBatchId();if(!latest){showNotice('当前没有已冻结批次可导出ZIP。','info',4500);return;}try{await exportBatchZipExplicit(latest);}catch(e){showNotice(`导出ZIP失败：${e.message}`,'error',6500);log(`显式导出ZIP失败：${latest} → ${e.message}`,'error');}}

  async function initCrossTab1688Signals(){
    if(!IS_1688)return;
    // 如果是详情页，新标签必须自己声明“候选工作页”；不依赖控制页是否前台。
    if(isLikely1688OfferUrl()){
      const info=getCandidateWorkInfo();const expected=String(info?.sku||currentTaskSku()||'');
      await markThisTabAsCandidateWork({sku:expected,source:'offer_load'});await publish1688ResultSignal({sku:expected},'offer_tab').catch(()=>{});startCandidateHeartbeat();startCandidateFocusListener();
    }
    // 图搜结果页本身也发送结果信号。
    if(hasImageSearchResult()){const info=getCandidateWorkInfo();const sku=String(info?.sku||currentTaskSku()||'');await publish1688ResultSignal({sku},'result_page').catch(()=>{});}
  }

  // startup
  injectCss();
  await tryRestoreProject();
  if (projectDirHandle) {
    // 启动时也做磁盘真实文件校验；不存在的文件不能继续保留 ready。
    try { await restoreTasksFromProject(projectDirHandle,{merge:true,allowImageScan:true}); } catch (e) { log(`启动恢复项目目录失败：${e.message}`,'warn'); }
  }
  buildPanel();render();
  uiTimer=setInterval(render,1000);
  if(IS_1688){startCacheFeedListener();startMatchActionListener();startSyncPolling();startRealtimeWakeBindings();startCandidateWorkWatch();bindCandidateSingleTabNavigation();await initCrossTab1688Signals();}
  log(`核心已启动 v${VERSION}：当前=${SITE_LABEL}。实时流水线：Ozon边缓存，1688控制页边接单；Codex候选尽量复用单个工作标签。1688同时提供面板日志预览 + 独立“运行日志”页面；批次固定写入项目目录。`);
  if(IS_OZON)setTimeout(()=>resumeOzonCacheOnPage().catch(()=>{}),800);
  }

  function makeApi() {
    return {
      getCurrentVersion: () => VERSION,
      getValueSync: (key, fallback) => gmGet(key, fallback),
      getValue: async (key, fallback) => gmGet(key, fallback),
      setValue: (key, value) => gmSet(key, value),
      deleteValue: key => gmDel(key),
      checkUpdatesManually: () => checkForUpdate({ manual: true, force: true }),
    };
  }

  try { GM_registerMenuCommand('Ozon→1688 找同款助手：检查更新', () => checkForUpdate({ manual: true, force: true })); } catch {}

  await builtinCore(makeApi());
  setTimeout(() => checkForUpdate({ manual: false }), 5000);
})();
