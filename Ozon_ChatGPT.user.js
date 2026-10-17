// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      3.2.2
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// @description  ChatGPT 批量生图助手；Ozon SKU 主图爬取已拆分为独立脚本。
// @author       Kagura
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://chatgpt.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* KAGURA_POD_STYLE_UPDATE_V322 */
(() => {
  'use strict';

  const CURRENT_VERSION = '3.2.2';
  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';
  const INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';
  const SUPPRESS_KEY = 'kaguraStartupUpdateSuppressVersion';
  const OVERLAY_CLASS = 'kagura-startup-update-overlay';

  function compareVersion(a, b) {
    const aa = String(a).split('.').map(v => Number(v) || 0);
    const bb = String(b).split('.').map(v => Number(v) || 0);
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i += 1) {
      if ((aa[i] || 0) > (bb[i] || 0)) return 1;
      if ((aa[i] || 0) < (bb[i] || 0)) return -1;
    }
    return 0;
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
        timeout: 30000,
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status || '未知'}`));
            return;
          }
          try {
            resolve(JSON.parse(String(response.responseText || '').trim()));
          } catch (error) {
            reject(new Error(`版本信息解析失败：${error?.message || error}`));
          }
        },
        onerror: () => reject(new Error('检查更新网络请求失败')),
        ontimeout: () => reject(new Error('检查更新请求超时')),
      });
    });
  }

  function removeLegacyReleaseNote() {
    document.querySelectorAll('#kagura-gpt-version-modal, [id*="version-modal"]').forEach(node => {
      if (String(node.textContent || '').includes('脚本更新说明')) node.remove();
    });
  }

  const legacyStyle = document.createElement('style');
  legacyStyle.id = 'kagura-disable-legacy-release-note';
  legacyStyle.textContent = '#kagura-gpt-version-modal{display:none!important;}';
  (document.head || document.documentElement).appendChild(legacyStyle);

  const legacyObserver = new MutationObserver(removeLegacyReleaseNote);
  legacyObserver.observe(document.documentElement, { childList: true, subtree: true });
  removeLegacyReleaseNote();

  function ensureStyle() {
    if (document.getElementById('kagura-startup-update-style')) return;
    const style = document.createElement('style');
    style.id = 'kagura-startup-update-style';
    style.textContent = `
      .${OVERLAY_CLASS}{position:absolute;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.50)}
      .kagura-startup-update-modal{width:min(380px,95%);max-height:88%;overflow:auto;background:#fff;color:#182230;border-radius:13px;padding:15px;box-shadow:0 18px 44px rgba(15,23,42,.32);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      .kagura-startup-update-title{text-align:center;font-size:17px;font-weight:800;margin-bottom:10px}
      .kagura-startup-update-info{white-space:pre-wrap;background:#f8fafc;border:1px solid #e4e7ec;border-radius:9px;padding:10px;max-height:240px;overflow:auto;margin-bottom:11px}
      .kagura-startup-update-actions{display:flex;gap:7px;justify-content:center;flex-wrap:wrap}
      .kagura-startup-update-actions button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700}
      .kagura-startup-update-now{background:#005bff;color:#fff}
      .kagura-startup-update-suppress{background:#fff3e0;color:#9a5a00}
      .kagura-startup-update-close{background:#eef2f6;color:#344054}
    `;
    document.documentElement.appendChild(style);
  }

  async function waitForPanel(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const panel = document.querySelector('#kagura-gpt-panel');
      if (panel) return panel;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  }

  function openPodInstallPage(info) {
    const url = String(info?.install_url || INSTALL_URL).trim() || INSTALL_URL;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  async function showUpdate(info) {
    const panel = await waitForPanel();
    if (!panel || panel.querySelector(`.${OVERLAY_CLASS}`)) return;
    ensureStyle();

    const latest = String(info.version || '').trim();
    const notes = Array.isArray(info.changelog) ? info.changelog.map(String) : [];
    const noteText = notes.length
      ? notes.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '本版本未提供更新说明。';

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.innerHTML = `
      <div class="kagura-startup-update-modal">
        <div class="kagura-startup-update-title">发现新版本 V${latest}</div>
        <div class="kagura-startup-update-info" data-role="info">当前版本：V${CURRENT_VERSION}\n最新版本：V${latest}\n\n更新内容：\n${noteText}</div>
        <div class="kagura-startup-update-actions">
          <button type="button" class="kagura-startup-update-now" data-role="now" title="打开固定 GitHub Raw 脚本，由 Tampermonkey 接管覆盖确认">立刻更新</button>
          <button type="button" class="kagura-startup-update-suppress" data-role="suppress">不再提醒</button>
          <button type="button" class="kagura-startup-update-close" data-role="close">关闭</button>
        </div>
      </div>`;
    panel.appendChild(overlay);

    overlay.querySelector('[data-role="now"]').addEventListener('click', () => openPodInstallPage(info));
    overlay.querySelector('[data-role="suppress"]').addEventListener('click', () => {
      GM_setValue(SUPPRESS_KEY, latest);
      overlay.remove();
    });
    overlay.querySelector('[data-role="close"]').addEventListener('click', () => overlay.remove());
  }

  async function checkOnOpen() {
    try {
      const info = await requestJson(MANIFEST_API);
      const latest = String(info.version || '').trim();
      if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) return;
      if (compareVersion(latest, CURRENT_VERSION) <= 0) return;
      if (String(GM_getValue(SUPPRESS_KEY, '')) === latest) return;
      await showUpdate(info);
    } catch (error) {
      console.warn('[Kagura] 启动时检查更新失败：', error);
    }
  }

  setTimeout(checkOnOpen, 1200);
})();

(() => {
  'use strict';

  const APP_VERSION = '3.2.2';
  function initChatGPTModule() {
    const MODULE_NAME = `ChatGPT 批量生图下载器 V${APP_VERSION}`;
    const C_STATE_KEY = 'chatgptBatchImageStateV1';
    const C_SETTINGS_KEY = 'chatgptBatchImageSettingsV1';
    const C_DB_NAME = 'kagura-chatgpt-batch-image';
    const C_DB_STORE = 'handles';
    const C_SOURCE_DIR_KEY = 'source-directory';
    const C_OUTPUT_DIR_KEY = 'output-directory';
    const C_TEMPLATE_KEY = 'template-file';
    const C_LOG_KEY = 'chatgptBatchImageLogsV1';
    const C_LOG_MAX = 2500;

    const MODULE_VERSION = APP_VERSION;
    const MODULE_CHANGELOG = [
      `V${APP_VERSION} 更新内容：`,
      '1. 刷新恢复不再只被动等待：等待页面稳定后会主动定位当前批次用户消息和对应 assistant 回复，并把回复区域滚入视口触发重新挂载。',
      '2. 增强 Chrome 懒加载图库扫描：即使缩略图库当前只挂载 0～1 张图片，也会识别可滚动容器并遍历顶部、中部、底部。',
      '3. 页面已显示生成完成但仅识别 0/3、1/3、2/3 时，会周期性执行当前回复强制扫描，优先把已存在但未挂载的图片加载出来。',
      '4. 刷新同步观察期结束前增加最终深度恢复扫描；只有主动定位、滚动和懒加载扫描仍失败后才进入待确认。',
      '5. 保留一次提交原则：刷新恢复与深度扫描都不会重新发送已经成功提交的生图任务。',
      '6. 保留 V3.1.1 的当前原图区间显示、创建图片菜单快速重试，以及 V3.1.0 的详细日志和计时功能。'
    ].join('\n');
    const C_NOTICE_HIDE_KEY = `chatgptBatchImageNoticeHide_${MODULE_VERSION}`;

    const C_DEFAULT_STATE = {
      imagePaths: [],
      index: 0,
      batchNo: 1,
      running: false,
      phase: 'idle',
      currentBatch: [],
      results: [],
      pendingQueue: [],
      startedAt: 0,
      totalRunMs: 0,
      runSegmentStartedAt: 0,
      batchStartedAt: 0,
      generationStartedAt: 0,
      lastBatchElapsedMs: 0,
      lastGenerationElapsedMs: 0,
      expectedGeneratedCount: 0,
      detectedGeneratedCount: 0,
      generatedCountChangedAt: 0,
      resumeContext: null,
    };

    const C_DEFAULT_SETTINGS = {
      batchSize: 10,
      prompt: '',
      newChatEachBatch: true,
      uploadTimeout: 180000,
      generationTimeout: 900000,
      stableSeconds: 15,
      intervalMin: 3500,
      intervalMax: 6500,
    };

    let cState = (() => {
      const saved = GM_getValue(C_STATE_KEY, null);
      const merged = saved && typeof saved === 'object' ? { ...C_DEFAULT_STATE, ...saved } : { ...C_DEFAULT_STATE };
      if (!Array.isArray(merged.results)) merged.results = [];
      if (!Array.isArray(merged.pendingQueue)) merged.pendingQueue = [];
      if (!Array.isArray(merged.currentBatch)) merged.currentBatch = [];
      return merged;
    })();
    let cSettings = { ...C_DEFAULT_SETTINGS, ...(GM_getValue(C_SETTINGS_KEY, {}) || {}) };
    let cPanel;
    let cLogBox;
    let cStatusText;
    let cProgressText;
    let cPendingText;
    let cSourceText;
    let cTemplateText;
    let cOutputText;
    let cStartButton;
    let cBatchText;
    let cCurrentFilesText;
    let cPhaseText;
    let cGeneratedText;
    let cTotalTimeText;
    let cBatchTimeText;
    let cGenerationTimeText;
    let cLogWindow = null;
    let cLogWindowBody = null;
    let cLogWindowMetrics = null;
    let cLogAutoScroll = true;
    let cLogEntries = (() => {
      const saved = GM_getValue(C_LOG_KEY, []);
      return Array.isArray(saved) ? saved.slice(-C_LOG_MAX) : [];
    })();
    let cWorkerActive = false;

    class CPausedError extends Error {
      constructor() {
        super('任务已暂停');
        this.name = 'PausedError';
      }
    }

    class CSilentGenerationAbortError extends Error {
      constructor(message) {
        super(message || '检测到静默中断');
        this.name = 'SilentGenerationAbortError';
      }
    }


    class CUploadRetryableError extends Error {
      constructor(message) {
        super(message || '检测到可重试的上传失败');
        this.name = 'UploadRetryableError';
      }
    }

    function cSameBatchPaths(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => item === b[index]);
    }


    function cCompactBatchFileLabel(paths) {
      const files = Array.isArray(paths) ? paths.map(path => String(path || '').split('/').pop()).filter(Boolean) : [];
      if (!files.length) return '-';
      const nums = files.map(name => {
        const match = name.match(/(\d+)(?=\.[^.]+$)/);
        return match ? Number(match[1]) : null;
      });
      if (nums.every(Number.isFinite)) {
        const consecutive = nums.every((num, index) => index === 0 || num === nums[index - 1] + 1);
        if (consecutive && nums.length > 1) return `${nums[0]}–${nums[nums.length - 1]}`;
        return nums.join('、');
      }
      if (files.length <= 3) return files.join('、');
      return `${files.slice(0, 2).join('、')} 等${files.length}张`;
    }

    function cShouldShowUpdateNotice() {
      return !GM_getValue(C_NOTICE_HIDE_KEY, false);
    }

    function cSetUpdateNoticeHidden(hidden) {
      GM_setValue(C_NOTICE_HIDE_KEY, Boolean(hidden));
    }

    function cSaveState() {
      GM_setValue(C_STATE_KEY, cState);
      cUpdatePanel();
    }

    function cSaveSettings() {
      GM_setValue(C_SETTINGS_KEY, cSettings);
    }

    function cSleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function cRandomInterval() {
      const rawMin = Number(cSettings.intervalMin);
      const rawMax = Number(cSettings.intervalMax);
      const min = Math.max(0, Number.isFinite(rawMin) ? rawMin : C_DEFAULT_SETTINGS.intervalMin);
      const max = Math.max(min, Number.isFinite(rawMax) ? rawMax : C_DEFAULT_SETTINGS.intervalMax);
      if (max === min) return Math.round(min);
      return Math.floor(min + Math.random() * (max - min + 1));
    }

    function cFormatWaitMs(ms) {
      const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`;
    }

    async function cWaitBetweenBatches() {
      const waitMs = cRandomInterval();
      const deadline = Date.now() + waitMs;
      cLog(`本批完成，随机等待 ${cFormatWaitMs(waitMs)} 后进入下一批（设置范围：${cFormatWaitMs(cSettings.intervalMin)} - ${cFormatWaitMs(cSettings.intervalMax)}）`, 'info');
      while (cState.running) {
        const left = deadline - Date.now();
        if (left <= 0) break;
        cState.phase = 'batch_wait';
        cStatusText.textContent = `批次间随机等待：${cFormatWaitMs(left)} 后开始第 ${cState.batchNo} 批…`;
        await cSleep(Math.min(1000, Math.max(200, left)));
      }
      if (!cState.running) {
        cLog('批次间等待过程中收到暂停请求，不再进入下一批', 'warn');
        return false;
      }
      cState.phase = 'ready';
      cSaveState();
      cLog('批次间随机等待结束，开始下一批', 'success');
      return true;
    }

    function cNowText(date = new Date()) {
      return date.toLocaleTimeString('zh-CN', { hour12: false });
    }

    function cFormatDuration(ms) {
      const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function cGetTotalRunMs() {
      return Math.max(0, Number(cState.totalRunMs || 0))
        + (cState.runSegmentStartedAt ? Math.max(0, Date.now() - Number(cState.runSegmentStartedAt)) : 0);
    }

    function cStartRunClock() {
      if (!cState.startedAt) cState.startedAt = Date.now();
      if (!cState.runSegmentStartedAt) cState.runSegmentStartedAt = Date.now();
    }

    function cStopRunClock() {
      if (!cState.runSegmentStartedAt) return;
      cState.totalRunMs = Math.max(0, Number(cState.totalRunMs || 0)) + Math.max(0, Date.now() - Number(cState.runSegmentStartedAt));
      cState.runSegmentStartedAt = 0;
    }

    function cGetBatchElapsedMs() {
      return cState.batchStartedAt ? Math.max(0, Date.now() - Number(cState.batchStartedAt)) : Math.max(0, Number(cState.lastBatchElapsedMs || 0));
    }

    function cGetGenerationElapsedMs() {
      return cState.generationStartedAt ? Math.max(0, Date.now() - Number(cState.generationStartedAt)) : Math.max(0, Number(cState.lastGenerationElapsedMs || 0));
    }

    function cFinishBatchTimers() {
      if (cState.batchStartedAt) cState.lastBatchElapsedMs = Math.max(0, Date.now() - Number(cState.batchStartedAt));
      if (cState.generationStartedAt) cState.lastGenerationElapsedMs = Math.max(0, Date.now() - Number(cState.generationStartedAt));
      cState.batchStartedAt = 0;
      cState.generationStartedAt = 0;
      cState.generatedCountChangedAt = 0;
      cState.expectedGeneratedCount = 0;
      cState.detectedGeneratedCount = 0;
    }

    function cPhaseLabel(phase = cState.phase) {
      const labels = {
        idle: '等待配置', ready: '准备开始', preparing: '准备当前批次',
        uploading_source: '上传原图', activating_create_image: '添加创建图片模式',
        uploading_template: '上传模板图', writing_prompt: '写入提示词', sending: '发送并确认提交',
        generating: '等待/检测生图', downloading: '下载保存成图', recovering: '恢复检测当前成图',
        refreshing: '刷新同步服务器结果', batch_wait: '批次间随机等待', pending: '异常转待确认',
        error: '异常暂停', done: '全部完成'
      };
      return labels[phase] || String(phase || '未知');
    }

    function cPersistLogs() {
      if (cLogEntries.length > C_LOG_MAX) cLogEntries = cLogEntries.slice(-C_LOG_MAX);
      GM_setValue(C_LOG_KEY, cLogEntries);
    }

    function cLogLineText(entry) {
      const prefix = entry.type === 'error' ? '失败' : entry.type === 'success' ? '成功' : entry.type === 'warn' ? '提示' : '信息';
      const batch = entry.batchNo ? ` [第${entry.batchNo}批]` : '';
      const progress = Number(entry.expectedGeneratedCount || 0) > 0 ? ` [生图${Number(entry.detectedGeneratedCount || 0)}/${Number(entry.expectedGeneratedCount || 0)}]` : '';
      return `[${entry.localTime || ''}] ${prefix}${batch}${progress}：${entry.message}`;
    }

    function cRenderLogPreview() {
      if (!cLogBox) return;
      cLogBox.innerHTML = '';
      for (const entry of cLogEntries.slice(-10)) {
        const line = document.createElement('div');
        line.className = `kagura-gpt-log kagura-gpt-log-${entry.type || 'info'}`;
        line.textContent = cLogLineText(entry);
        cLogBox.appendChild(line);
      }
      cLogBox.scrollTop = cLogBox.scrollHeight;
    }

    function cFilteredLogEntries() {
      if (!cLogWindow) return cLogEntries;
      const level = cLogWindow.querySelector('[data-log-filter="level"]')?.value || 'all';
      const query = String(cLogWindow.querySelector('[data-log-filter="search"]')?.value || '').trim().toLowerCase();
      return cLogEntries.filter(entry => {
        if (level !== 'all' && entry.type !== level) return false;
        if (query && !cLogLineText(entry).toLowerCase().includes(query)) return false;
        return true;
      });
    }

    function cRenderLogWindow() {
      if (!cLogWindowBody) return;
      cLogWindowBody.innerHTML = '';
      for (const entry of cFilteredLogEntries()) {
        const line = document.createElement('div');
        line.className = `kagura-log-window-line kagura-log-window-${entry.type || 'info'}`;
        line.textContent = cLogLineText(entry);
        cLogWindowBody.appendChild(line);
      }
      if (cLogAutoScroll) cLogWindowBody.scrollTop = cLogWindowBody.scrollHeight;
    }

    function cLog(message, type = 'info') {
      const now = new Date();
      const prefix = type === 'error' ? '失败' : type === 'success' ? '成功' : type === 'warn' ? '提示' : '信息';
      console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](`[${MODULE_NAME}] ${message}`);
      cLogEntries.push({
        time: now.toISOString(),
        localTime: cNowText(now),
        type,
        prefix,
        message: String(message),
        batchNo: Number(cState.batchNo || 0),
        phase: String(cState.phase || ''),
        expectedGeneratedCount: Number(cState.expectedGeneratedCount || 0),
        detectedGeneratedCount: Number(cState.detectedGeneratedCount || 0),
        url: location.href,
        version: APP_VERSION,
      });
      cPersistLogs();
      cRenderLogPreview();
      cRenderLogWindow();
    }

    function cDownloadTextFile(fileName, text, type = 'text/plain;charset=utf-8') {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function cLogStamp() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    function cBuildLogTxt() {
      const header = [
        `脚本：${MODULE_NAME}`,
        `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        `浏览器：${navigator.userAgent}`,
        `页面：${location.href}`,
        `总运行：${cFormatDuration(cGetTotalRunMs())}`,
        `当前批次：${cState.batchNo}`,
        `当前阶段：${cPhaseLabel()}`,
        `当前生图：${cState.detectedGeneratedCount || 0}/${cState.expectedGeneratedCount || 0}`,
        '-----------------------------------',
      ];
      return '\uFEFF' + [...header, ...cLogEntries.map(cLogLineText)].join('\r\n');
    }

    function cExportLogsTxt() {
      cDownloadTextFile(`ChatGPT运行日志_V${APP_VERSION}_${cLogStamp()}.txt`, cBuildLogTxt());
      cLog(`已导出运行日志 TXT，共 ${cLogEntries.length} 条`, 'success');
    }

    function cExportDiagnosticJson() {
      const safeSettings = { ...cSettings, prompt: undefined, promptLength: String(cSettings.prompt || '').length };
      const payload = {
        exportedAt: new Date().toISOString(),
        version: APP_VERSION,
        module: MODULE_NAME,
        browser: navigator.userAgent,
        url: location.href,
        timing: {
          totalRunMs: cGetTotalRunMs(),
          batchElapsedMs: cGetBatchElapsedMs(),
          generationElapsedMs: cGetGenerationElapsedMs(),
        },
        state: { ...cState },
        settings: safeSettings,
        logs: cLogEntries,
      };
      cDownloadTextFile(`ChatGPT诊断包_V${APP_VERSION}_${cLogStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      cLog(`已导出诊断 JSON，共 ${cLogEntries.length} 条日志`, 'success');
    }

    async function cCopyLogs() {
      const text = cBuildLogTxt();
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      cLog('运行日志已复制到剪贴板', 'success');
    }

    function cClearLogs() {
      if (!confirm('确定清空全部运行日志吗？此操作不会影响任务进度和已保存图片。')) return;
      cLogEntries = [];
      GM_deleteValue(C_LOG_KEY);
      cRenderLogPreview();
      cRenderLogWindow();
    }

    function cOpenDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(C_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(C_DB_STORE)) db.createObjectStore(C_DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('无法打开文件授权数据库'));
      });
    }

    async function cSaveHandle(key, handle) {
      const db = await cOpenDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(C_DB_STORE, 'readwrite');
        tx.objectStore(C_DB_STORE).put(handle, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('无法保存文件授权'));
      });
      db.close();
    }

    async function cGetHandle(key) {
      const db = await cOpenDb();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(C_DB_STORE, 'readonly');
        const request = tx.objectStore(C_DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('无法读取文件授权'));
      });
      db.close();
      return handle;
    }

    async function cClearHandles() {
      const db = await cOpenDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(C_DB_STORE, 'readwrite');
        tx.objectStore(C_DB_STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('无法清除文件授权'));
      });
      db.close();
    }

    async function cPermission(handle, mode = 'read', request = false) {
      if (!handle) return 'denied';
      const options = { mode };
      if ((await handle.queryPermission(options)) === 'granted') return 'granted';
      if (request && (await handle.requestPermission(options)) === 'granted') return 'granted';
      return 'denied';
    }

    async function cChooseSourceFolder() {
      const picker = unsafeWindow.showDirectoryPicker || window.showDirectoryPicker;
      if (typeof picker !== 'function') throw new Error('当前浏览器不支持文件夹选择，请使用最新版Chrome或Edge。');
      const handle = await picker.call(unsafeWindow, { mode: 'readwrite' });
      await cSaveHandle(C_SOURCE_DIR_KEY, handle);
      cSourceText.textContent = handle.name;
      cSourceText.title = handle.name;
      await cScanImages();
      cLog(`原图文件夹已选择：${handle.name}`, 'success');
    }

    async function cChooseOutputFolder() {
      const picker = unsafeWindow.showDirectoryPicker || window.showDirectoryPicker;
      if (typeof picker !== 'function') throw new Error('当前浏览器不支持文件夹选择，请使用最新版Chrome或Edge。');
      const handle = await picker.call(unsafeWindow, { mode: 'readwrite' });
      await cSaveHandle(C_OUTPUT_DIR_KEY, handle);
      cOutputText.textContent = handle.name;
      cOutputText.title = handle.name;
      cLog(`成品文件夹已选择：${handle.name}`, 'success');
    }

    async function cDeleteImagesRecursive(directoryHandle) {
      let removed = 0;
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
          if (!cIsImageName(entry.name)) continue;
          await directoryHandle.removeEntry(entry.name);
          removed += 1;
          continue;
        }
        if (entry.kind === 'directory') {
          removed += await cDeleteImagesRecursive(entry);
        }
      }
      return removed;
    }

    async function cClearSourceAndOutputImages() {
      if (cState.running) throw new Error('请先暂停任务，再执行清空图片。');

      const source = await cGetHandle(C_SOURCE_DIR_KEY);
      const output = await cGetHandle(C_OUTPUT_DIR_KEY);
      if (!source) throw new Error('请先选择原图目录');
      if (!output) throw new Error('请先选择成品目录');

      const sourceName = source.name || '原图目录';
      const outputName = output.name || '成品目录';
      const first = confirm(`确定清空“${sourceName}”和“${outputName}”中的所有图片吗？

只删除 JPG/JPEG/PNG/WEBP/GIF/BMP 图片，其他文件保留。此操作不可恢复。`);
      if (!first) {
        cLog('已取消清空图片', 'info');
        return;
      }

      const second = confirm(`二次确认：真的要删除两个目录中的全部图片吗？

原图目录：${sourceName}
成品目录：${outputName}`);
      if (!second) {
        cLog('二次确认未通过，已取消清空图片', 'info');
        return;
      }

      if ((await cPermission(source, 'readwrite', true)) !== 'granted') throw new Error('没有获得原图目录读写权限');
      if ((await cPermission(output, 'readwrite', true)) !== 'granted') throw new Error('没有获得成品目录读写权限');

      let sameDirectory = false;
      try {
        if (typeof source.isSameEntry === 'function') sameDirectory = await source.isSameEntry(output);
      } catch (_) {}

      const removedSource = await cDeleteImagesRecursive(source);
      const removedOutput = sameDirectory ? 0 : await cDeleteImagesRecursive(output);

      cState.running = false;
      cState.imagePaths = [];
      cState.index = 0;
      cState.currentBatch = [];
      cState.phase = 'idle';
      cSaveState();

      if (sameDirectory) {
        cLog(`原图目录与成品目录为同一目录，共删除 ${removedSource} 张图片`, 'warn');
      } else {
        cLog(`清空完成：原图目录删除 ${removedSource} 张，成品目录删除 ${removedOutput} 张`, 'warn');
      }
      if (cStatusText) cStatusText.textContent = '图片目录已清空，请重新放入原图后扫描';
    }

    async function cChooseTemplate() {
      const picker = unsafeWindow.showOpenFilePicker || window.showOpenFilePicker;
      if (typeof picker === 'function') {
        const [handle] = await picker.call(unsafeWindow, {
          multiple: false,
          types: [{ description: '模板图片', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] } }],
        });
        if (!handle) return;
        await cSaveHandle(C_TEMPLATE_KEY, handle);
        cTemplateText.textContent = handle.name;
        cTemplateText.title = handle.name;
        cLog(`模板图已选择：${handle.name}`, 'success');
        return;
      }
      throw new Error('当前浏览器不支持模板文件授权，请使用最新版Chrome或Edge。');
    }

    function cNaturalCompare(a, b) {
      return String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
    }

    function cIsImageName(name) {
      return /\.(?:jpe?g|png|webp|gif|bmp)$/i.test(name || '');
    }

    async function cListImagesRecursive(directoryHandle, prefix = '') {
      const paths = [];
      for await (const entry of directoryHandle.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'file' && cIsImageName(entry.name)) paths.push(path);
        else if (entry.kind === 'directory') paths.push(...await cListImagesRecursive(entry, path));
      }
      return paths;
    }

    async function cScanImages() {
      const source = await cGetHandle(C_SOURCE_DIR_KEY);
      if (!source) throw new Error('请先选择原图文件夹');
      if ((await cPermission(source, 'read', true)) !== 'granted') throw new Error('没有获得原图文件夹读取权限');
      const paths = (await cListImagesRecursive(source)).sort(cNaturalCompare);
      if (!paths.length) throw new Error('原图文件夹中没有找到JPG、PNG或WEBP图片');
      cState.imagePaths = paths;
      cState.index = Math.min(cState.index, paths.length);
      cState.phase = 'ready';
      cSaveState();
      cLog(`已扫描到 ${paths.length} 张原图`, 'success');
      return paths;
    }

    async function cGetFileByPath(directoryHandle, relativePath) {
      const parts = String(relativePath).split('/').filter(Boolean);
      let current = directoryHandle;
      for (let i = 0; i < parts.length - 1; i += 1) current = await current.getDirectoryHandle(parts[i]);
      const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
      return fileHandle.getFile();
    }

    async function cWaitUntil(check, timeout, interval = 500, allowPaused = false) {
      const started = Date.now();
      let lastError;
      while (Date.now() - started < timeout) {
        if (!allowPaused && !cState.running) throw new CPausedError();
        try {
          const result = await check();
          if (result) return result;
        } catch (error) {
          lastError = error;
        }
        await cSleep(interval);
      }
      if (lastError) throw lastError;
      return null;
    }

    function cIsVisible(element) {
      if (!(element instanceof Element)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0;
    }

    function cText(element) {
      return `${element?.innerText || element?.textContent || ''} ${element?.getAttribute?.('aria-label') || ''} ${element?.getAttribute?.('title') || ''}`.trim();
    }

    function cFindClickable(patterns, root = document) {
      const regex = new RegExp(patterns.join('|'), 'i');
      const selectors = 'button, [role="button"], [role="menuitem"], a';
      return [...root.querySelectorAll(selectors)]
        .filter(cIsVisible)
        .filter(el => regex.test(cText(el)))
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.top - br.top || ar.left - br.left;
        })[0] || null;
    }

    function cFindPromptEditor() {
      /*
       * ChatGPT 页面可能同时保留隐藏 textarea、历史消息中的 contenteditable，
       * 不能再使用 document.querySelector() 直接拿第一个节点。
       * 这里优先选择：可见、位于统一 Composer 内、屏幕位置最靠下的真正编辑器。
       */
      const selectors = [
        '#prompt-textarea',
        'textarea[name="prompt-textarea"]',
        'textarea[data-testid="prompt-textarea"]',
        'form[data-type="unified-composer"] textarea',
        'form[data-type="unified-composer"] [contenteditable="true"]',
        '[data-composer-surface="true"] textarea',
        '[data-composer-surface="true"] [contenteditable="true"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'main textarea',
        'main div[contenteditable="true"]'
      ];

      const seen = new Set();
      const candidates = [];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (seen.has(element)) continue;
          seen.add(element);
          if (!cIsVisible(element) || element.closest('#kagura-gpt-panel')) continue;
          if (!(element instanceof HTMLTextAreaElement)
            && !(element instanceof HTMLInputElement)
            && element.getAttribute('contenteditable') !== 'true') continue;

          const rect = element.getBoundingClientRect();
          if (rect.width < 120 || rect.height < 12) continue;

          const insideUnified = Boolean(element.closest('form[data-type="unified-composer"]'));
          const insideSurface = Boolean(element.closest('[data-composer-surface="true"]'));
          const insideForm = Boolean(element.closest('form'));
          const insideMessage = Boolean(element.closest('[data-message-author-role], article'));
          let score = rect.bottom;
          if (element.id === 'prompt-textarea') score += 20000;
          if (element.getAttribute('name') === 'prompt-textarea') score += 15000;
          if (insideUnified) score += 12000;
          if (insideSurface) score += 10000;
          if (insideForm) score += 3000;
          if (rect.top > window.innerHeight * 0.45) score += 1500;
          if (insideMessage && !insideUnified && !insideSurface) score -= 30000;
          candidates.push({ element, score, rect });
        }
      }

      candidates.sort((a, b) => b.score - a.score || b.rect.bottom - a.rect.bottom);
      return candidates[0]?.element || null;
    }

    function cFindComposer() {
      const input = cFindPromptEditor();
      return input?.closest('form[data-type="unified-composer"]')
        || input?.closest('[data-composer-surface="true"]')
        || input?.closest('form')
        || document.querySelector('form[data-type="unified-composer"]')
        || document.querySelector('[data-composer-surface="true"]')
        || document;
    }

    async function cGoNewChat() {
      cStatusText.textContent = '正在新建对话…';
      const direct = document.querySelector('a[data-testid="create-new-chat-button"], button[data-testid="create-new-chat-button"], a[aria-label*="新聊天"], a[aria-label*="New chat"], button[aria-label*="新聊天"], button[aria-label*="New chat"]');
      const button = direct || cFindClickable(['新聊天', '新建聊天', 'New chat']);
      if (button) {
        button.click();
      } else {
        history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      const editor = await cWaitUntil(() => cFindPromptEditor(), 30000, 500);
      if (!editor) throw new Error('新建对话后未找到输入框');
      await cSleep(1200);
    }

    function cFindFileInput() {
      const inputs = [...document.querySelectorAll('input[type="file"]')];
      return inputs.find(input => {
        const accept = input.accept || '';
        return !accept || /image|png|jpe?g|webp|\*/i.test(accept);
      }) || inputs[0] || null;
    }

    async function cEnsureFileInput() {
      let input = cFindFileInput();
      if (input) return input;
      const attach = document.querySelector('button[data-testid*="composer-plus"], button[aria-label*="添加照片"], button[aria-label*="添加文件"], button[aria-label*="Attach"], button[aria-label*="Upload"], button[aria-label="Add"]')
        || cFindClickable(['添加照片', '添加文件', '上传文件', 'Attach', 'Upload', 'Add photos']);
      if (attach) {
        attach.click();
        await cSleep(500);
      }
      input = cFindFileInput();
      if (input) return input;
      const menuItem = cFindClickable(['添加照片和文件', '上传文件', 'Add photos and files', 'Upload file', 'Attach files']);
      if (menuItem) {
        menuItem.click();
        await cSleep(500);
      }
      input = cFindFileInput();
      if (!input) throw new Error('未找到ChatGPT上传控件，页面结构可能已经变化');
      return input;
    }

    function cCountAttachments() {
      const composer = cFindComposer();
      const removeButtons = [...composer.querySelectorAll([
        'button[aria-label*="移除"]',
        'button[aria-label*="Remove"]',
        'button[aria-label*="删除附件"]',
        'button[aria-label*="Delete attachment"]'
      ].join(','))].filter(cIsVisible);
      if (removeButtons.length) return removeButtons.length;

      const explicitItems = [...composer.querySelectorAll([
        '[data-testid="composer-attachment"]',
        '[data-testid="attachment"]',
        '[data-testid*="attachment-item"]'
      ].join(','))].filter(cIsVisible);
      if (explicitItems.length) return explicitItems.length;

      return [...composer.querySelectorAll('img')].filter(img => {
        const rect = img.getBoundingClientRect();
        return cIsVisible(img)
          && rect.width >= 32 && rect.height >= 32
          && rect.width <= 240 && rect.height <= 240;
      }).length;
    }

    function cDetectUploadFailure() {
      const retryablePattern = /(?:上传到\s*files\.oaiusercontent\.com\s*失败|files\.oaiusercontent\.com[^\n]{0,120}(?:失败|failed)|文件上传失败|上传失败|Upload failed|Failed to upload|Network error|网络(?:错误|问题)|你已上传过此文件|已上传过此文件|You(?:'|’)ve already uploaded this file|already uploaded this file)/i;
      const limitPattern = /(?:上传限制|上传次数.*上限|达到.*上传.*限制|upload limit|too many files|reached.*upload.*limit|rate limit)/i;

      const candidates = [
        ...document.querySelectorAll('[role="alert"], [role="dialog"], [aria-live="assertive"], [aria-live="polite"], [data-testid*="toast"], [class*="toast"], [class*="error"]')
      ].filter(node => cIsVisible(node) && !node.closest('#kagura-gpt-panel'));

      for (const node of candidates) {
        const message = cText(node).replace(/\s+/g, ' ').trim();
        if (!message) continue;
        if (limitPattern.test(message)) return { failed: true, retryable: false, message };
        if (retryablePattern.test(message)) return { failed: true, retryable: true, message };
      }

      // 红色顶部提示在部分版本中没有稳定 role/class，最后再扫可见短文本节点。
      const textNodes = [...document.querySelectorAll('body div, body span')]
        .filter(node => cIsVisible(node) && !node.closest('#kagura-gpt-panel'))
        .filter(node => {
          const r = node.getBoundingClientRect();
          return r.width > 80 && r.height > 12 && r.height < 180;
        });
      for (const node of textNodes) {
        const message = cText(node).replace(/\s+/g, ' ').trim();
        if (!message || message.length > 500) continue;
        if (limitPattern.test(message)) return { failed: true, retryable: false, message };
        if (retryablePattern.test(message)) return { failed: true, retryable: true, message };
      }
      return { failed: false, retryable: false, message: '' };
    }

    function cDismissUploadFailureUi() {
      const buttons = [...document.querySelectorAll('button, [role="button"]')]
        .filter(cIsVisible)
        .filter(button => !button.closest('#kagura-gpt-panel'))
        .filter(button => /^(?:确定|知道了|关闭|OK|Okay|Got it|Close|Dismiss)$/i.test(cText(button).replace(/\s+/g, ' ').trim()));
      for (const button of buttons.slice(0, 4)) {
        try { cSmartClick(button); } catch (_) {}
      }
      try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) {}
    }

    function cAttachmentRemoveButtons() {
      const composer = cFindComposer();
      const selectors = [
        'button[aria-label*="移除"]',
        'button[aria-label*="Remove"]',
        'button[aria-label*="删除附件"]',
        'button[aria-label*="Delete attachment"]',
        'button[title*="移除"]',
        'button[title*="Remove"]'
      ];
      const direct = [...composer.querySelectorAll(selectors.join(','))].filter(cIsVisible);
      if (direct.length) return direct;

      const wrappers = [...composer.querySelectorAll('[data-testid*="attachment"], [class*="attachment"]')].filter(cIsVisible);
      const fallback = [];
      for (const wrapper of wrappers) {
        const buttons = [...wrapper.querySelectorAll('button, [role="button"]')].filter(cIsVisible);
        for (const button of buttons) {
          const label = cText(button);
          if (/移除|删除|remove|delete|close|关闭/i.test(label)) fallback.push(button);
        }
      }
      return fallback;
    }

    async function cClearComposerForUploadRetry() {
      cStatusText.textContent = '上传失败：正在清空本批全部附件后重试…';
      cLog('检测到上传失败，开始清空本批全部原图/模板附件', 'warn');
      cDismissUploadFailureUi();
      await cSleep(500);

      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const buttons = cAttachmentRemoveButtons();
        if (!buttons.length && cCountAttachments() <= 0) break;
        if (buttons.length) {
          // 每轮只点当前 DOM 中仍存在的移除按钮，避免节点销毁后连续点击报错。
          for (const button of buttons.slice(0, 6)) {
            if (!cIsVisible(button)) continue;
            try { cSmartClick(button); } catch (_) {}
            await cSleep(180);
          }
        } else {
          await cSleep(300);
        }
      }

      // 清理可能已经写入的提示词；上传重试按“整批重新开始”处理。
      const editor = cFindPromptEditor();
      if (editor) {
        try {
          editor.focus({ preventScroll: true });
          if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            cSetNativeValue(editor, '');
          } else {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection.removeAllRanges();
            selection.addRange(range);
            try { document.execCommand('delete', false); } catch (_) {}
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward', data: null }));
          }
        } catch (_) {}
      }

      cDismissUploadFailureUi();
      await cSleep(800);
      const remain = cCountAttachments();
      if (remain > 0) throw new Error(`清空当前批附件失败，仍识别到 ${remain} 个附件；已暂停以避免重复上传`);
      cLog('本批附件已全部清空，可以重新上传', 'success');
    }

    function cGetUploadState() {
      const composer = cFindComposer();
      const text = cText(composer);
      const externalFailure = cDetectUploadFailure();
      const localFailed = /上传失败|文件上传失败|Upload failed|Failed to upload|无法上传/i.test(text);
      const failed = externalFailure.failed || localFailed;
      const retryable = externalFailure.failed ? externalFailure.retryable : localFailed;
      const failureMessage = externalFailure.message || (localFailed ? text.replace(/\s+/g, ' ').trim().slice(0, 300) : '');
      const textUploading = /上传中|正在上传|正在处理(?:文件|图片)?|Uploading|Processing (?:file|image)|Preparing upload/i.test(text);
      const progressSelectors = [
        '[role="progressbar"]',
        '[aria-busy="true"]',
        '[data-testid*="upload-progress"]',
        '[data-testid*="attachment-loading"]',
        '[data-state="loading"]',
        '.animate-spin'
      ];
      const indicatorUploading = progressSelectors.some(selector =>
        [...composer.querySelectorAll(selector)].some(cIsVisible)
      );
      const previews = [...composer.querySelectorAll('img')].filter(img => {
        const rect = img.getBoundingClientRect();
        return cIsVisible(img)
          && rect.width >= 32 && rect.height >= 32
          && rect.width <= 240 && rect.height <= 240;
      });
      const previewTotal = previews.length;
      const previewReady = previews.filter(img => img.complete && Boolean(img.naturalWidth)).length;
      const incompletePreview = previewReady < previewTotal;
      return {
        failed,
        retryable,
        failureMessage,
        uploading: textUploading || indicatorUploading || incompletePreview,
        textUploading,
        indicatorUploading,
        incompletePreview,
        previewTotal,
        previewReady,
        count: cCountAttachments(),
      };
    }

    async function cWaitForUploadsStable(expectedCount, label, stableMs = 4000) {
      const timeout = Number(cSettings.uploadTimeout) || C_DEFAULT_SETTINGS.uploadTimeout;
      let stableSince = 0;
      let lastCount = -1;

      const readyCount = await cWaitUntil(() => {
        const state = cGetUploadState();
        if (state.failed) {
          const detail = state.failureMessage ? `：${state.failureMessage}` : '';
          if (state.retryable) throw new CUploadRetryableError(`${label}上传失败${detail}`);
          throw new Error(`${label}上传失败且不可自动重试${detail}`);
        }

        const enough = state.count >= expectedCount;
        if (!state.uploading && enough) {
          if (state.count !== lastCount) {
            lastCount = state.count;
            stableSince = Date.now();
          }
          if (!stableSince) stableSince = Date.now();
          const stableFor = Date.now() - stableSince;
          cStatusText.textContent = `${label}已显示 ${state.count} 张，正在确认上传完成（${Math.min(Math.ceil(stableFor / 1000), Math.ceil(stableMs / 1000))}/${Math.ceil(stableMs / 1000)}秒）…`;
          if (stableFor >= stableMs) return state.count;
        } else {
          stableSince = 0;
          lastCount = state.count;
          cStatusText.textContent = `正在上传${label}：${state.count}/${expectedCount}…`;
        }
        return null;
      }, timeout, 500);

      if (!readyCount) {
        const state = cGetUploadState();
        throw new Error(`${label}未在 ${Math.round(timeout / 1000)} 秒内完成上传（当前识别 ${state.count}/${expectedCount} 张），不会自动发送`);
      }
      cLog(`${label}全部上传完成：${readyCount} 张附件已稳定`, 'success');
      return readyCount;
    }

    async function cUploadFiles(files, label) {
      if (!files.length) return cCountAttachments();
      cStatusText.textContent = `正在上传${label}（${files.length}张）…`;
      const before = cCountAttachments();
      const expected = before + files.length;
      const input = await cEnsureFileInput();
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file));
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      cLog(`已提交上传${label}：${files.map(file => file.name).join('、')}`, 'info');

      return cWaitForUploadsStable(expected, label, 4000);
    }

    async function cWaitUntilReadyToSend(expectedCount, expectedPrompt) {
      cStatusText.textContent = '正在做发送前最终检查…';
      let stableSince = 0;
      const timeout = Number(cSettings.uploadTimeout) || C_DEFAULT_SETTINGS.uploadTimeout;
      const ready = await cWaitUntil(() => {
        const state = cGetUploadState();
        if (state.failed) {
          const detail = state.failureMessage ? `：${state.failureMessage}` : '';
          if (state.retryable) throw new CUploadRetryableError(`发送前检测到附件上传失败${detail}`);
          throw new Error(`发送前检测到附件上传失败且不可自动重试${detail}`);
        }
        const editor = cFindPromptEditor();
        const promptReady = Boolean(editor && cPromptMatches(editor, expectedPrompt));
        const createImageReady = cHasCreateImageChip();
        const button = cFindSendButton();
        const sendEnabled = Boolean(button && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
        const allReady = !state.uploading
          && state.count >= expectedCount
          && promptReady
          && createImageReady
          && sendEnabled;
        if (allReady) {
          if (!stableSince) stableSince = Date.now();
          const stableFor = Date.now() - stableSince;
          cStatusText.textContent = `附件、提示词和创建图片模式均已就绪，发送前稳定等待（${Math.min(Math.ceil(stableFor / 1000), 5)}/5秒）…`;
          if (stableFor >= 5000) return button;
        } else {
          stableSince = 0;
          cStatusText.textContent = `发送前检查：附件 ${state.count}/${expectedCount}，提示词${promptReady ? '已写入' : '未写入'}，创建图片${createImageReady ? '已启用' : '已丢失'}，发送按钮${sendEnabled ? '已可用' : '尚未可用'}…`;
        }
        return null;
      }, timeout, 500);

      if (!ready) {
        const editor = cFindPromptEditor();
        const promptReady = Boolean(editor && cPromptMatches(editor, expectedPrompt));
        if (!promptReady) throw new Error('发送前检测到固定提示词不在当前可见输入框中，已停止自动发送');
        if (!cHasCreateImageChip()) throw new Error('发送前检测到“创建图片”模式已丢失，已停止自动发送');
        throw new Error('附件未完全上传或发送按钮仍不可用，已停止自动发送');
      }
      cLog('发送前检查通过：附件上传完成、提示词仍在输入框内、“创建图片”模式仍存在，并稳定 5 秒', 'success');
      return ready;
    }

    function cFindComposerPlusButton() {
      /*
       * 参考 playwright_auto_v2.12.py：
       * 1. 优先使用 ChatGPT 页面中较稳定的 data-testid="composer-plus-btn"；
       * 2. 再以可见输入框/Composer 为锚点，在左侧寻找小型按钮；
       * 3. 明确排除脚本自己的悬浮面板，避免误点面板按钮。
       */
      const stableSelectors = [
        'button[data-testid="composer-plus-btn"]',
        '#composer-plus-btn',
        'button[aria-label="添加文件等"]',
        '[role="button"][aria-label="添加文件等"]',
        'button[data-testid*="composer-plus"]',
        '[role="button"][data-testid*="composer-plus"]',
        'button[aria-label="Add"]',
        '[role="button"][aria-label="Add"]',
        'button[aria-label*="添加文件"]',
        '[role="button"][aria-label*="添加文件"]',
        'button[aria-label*="Attach"]',
        '[role="button"][aria-label*="Attach"]'
      ];

      for (const selector of stableSelectors) {
        const matches = [...document.querySelectorAll(selector)]
          .filter(cIsVisible)
          .filter(el => !el.closest('#kagura-gpt-panel'))
          .filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');
        if (matches.length) return matches[matches.length - 1];
      }

      const composer = cFindComposer();
      const editor = cFindPromptEditor();
      const anchorRect = editor?.getBoundingClientRect?.() || composer?.getBoundingClientRect?.() || null;
      if (!anchorRect) return null;

      const nodes = [...document.querySelectorAll('button, [role="button"]')]
        .filter(cIsVisible)
        .filter(el => !el.closest('#kagura-gpt-panel'))
        .filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true');

      const candidates = nodes.map(el => {
        const r = el.getBoundingClientRect();
        const text = cText(el).replace(/\s+/g, ' ').trim();
        const testid = el.getAttribute('data-testid') || '';
        const aria = el.getAttribute('aria-label') || '';
        const cy = r.top + r.height / 2;
        const anchorCy = anchorRect.top + anchorRect.height / 2;
        const nearComposerY = cy >= anchorRect.top - 30 && cy <= anchorRect.bottom + 40;
        const nearLeft = r.left >= anchorRect.left - 100 && r.left <= anchorRect.left + 90;
        const small = r.width >= 22 && r.width <= 76 && r.height >= 22 && r.height <= 76;
        const looksLikePlus = /composer-plus/i.test(testid)
          || /添加文件|添加照片|附件|Attach|Add/i.test(`${aria} ${text}`)
          || /^\+$/.test(text);
        const bad = /项目源|project source/i.test(`${aria} ${text}`);
        let score = 0;
        if (/composer-plus-btn/i.test(testid)) score += 1000;
        if (/composer-plus/i.test(testid)) score += 700;
        if (aria === '添加文件等') score += 600;
        if (looksLikePlus) score += 250;
        if (small) score += 120;
        if (nearComposerY) score += 120;
        if (nearLeft) score += 120;
        score -= Math.abs(cy - anchorCy) * 0.4;
        score -= Math.abs(r.right - anchorRect.left) * 0.3;
        return { el, score, small, nearComposerY, nearLeft, looksLikePlus, bad };
      }).filter(x => x.looksLikePlus && x.small && x.nearComposerY && x.nearLeft && !x.bad)
        .sort((a, b) => b.score - a.score);

      if (candidates[0]) return candidates[0].el;

      // 最后按 Composer 左下角坐标探测按钮。
      const cr = composer?.getBoundingClientRect?.() || anchorRect;
      const probePoints = [
        [cr.left + 24, cr.bottom - 28],
        [cr.left + 32, cr.bottom - 32],
        [anchorRect.left - 22, anchorRect.top + anchorRect.height / 2]
      ];
      for (const [x, y] of probePoints) {
        let el = document.elementFromPoint(x, y);
        while (el && el !== document.body) {
          if (el.closest?.('#kagura-gpt-panel')) break;
          if (el.matches?.('button, [role="button"]') && cIsVisible(el)) return el;
          el = el.parentElement;
        }
      }
      return null;
    }

    function cPlainText(element) {
      return String(element?.innerText || element?.textContent || '').trim().replace(/\s+/g, ' ');
    }

    function cIsInsideMessage(element) {
      return Boolean(element?.closest?.('[data-message-author-role], article'));
    }

    function cIsInsideOwnPanel(element) {
      return Boolean(element?.closest?.('#kagura-gpt-panel'));
    }

    function cVisibleMenuRoots() {
      const selectors = [
        '[popover]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-menu-content]',
        '[data-headlessui-portal]',
        '[data-floating-ui-portal]',
        '[role="menu"]',
        '[role="dialog"]',
        '[role="listbox"]',
        '[data-state="open"]'
      ].join(',');
      return [...document.querySelectorAll(selectors)].filter(el => {
        if (!(el instanceof Element) || !cIsVisible(el) || cIsInsideMessage(el) || cIsInsideOwnPanel(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 80 && r.height >= 30 && r.bottom >= 0 && r.top <= innerHeight;
      });
    }

    function cIsCreateImageMenuOpen() {
      const plus = cFindComposerPlusButton();
      const expanded = plus?.getAttribute?.('aria-expanded');
      if (expanded === 'true') return true;
      if (cVisibleMenuRoots().length) return true;
      return Boolean(cFindCreateImageMenuItem(false));
    }

    function cCreateImageMenuDiagnostics() {
      const plus = cFindComposerPlusButton();
      const plusInfo = plus
        ? `+按钮 aria-expanded=${plus.getAttribute('aria-expanded') || '-'} aria-haspopup=${plus.getAttribute('aria-haspopup') || '-'} testid=${plus.getAttribute('data-testid') || '-'}`
        : '+按钮=未找到';
      const roots = cVisibleMenuRoots();
      const texts = [];
      for (const root of roots.slice(0, 6)) {
        const text = cPlainText(root).replace(/\s+/g, ' ').trim();
        if (text) texts.push(text.slice(0, 220));
      }
      if (!texts.length) {
        const candidates = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],div,span')]
          .filter(el => cIsVisible(el) && !cIsInsideMessage(el) && !cIsInsideOwnPanel(el))
          .map(el => cPlainText(el))
          .filter(text => text && text.length <= 120 && /(上传|照片|文件|图片|image|photo|file|创建|生成|创作)/i.test(text))
          .slice(-12);
        texts.push(...candidates);
      }
      return `${plusInfo}；可见菜单/候选：${texts.length ? texts.join(' || ') : '无'}`;
    }

    function cFindCreateImageMenuItem(logFound = true) {
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
      const primaryRegex = /(创建图片|创作图片|生成图片|create\s*image|generate\s*image)/i;
      const exactRegex = /^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
      const candidates = [];
      const seen = new Set();
      const composer = cFindComposer();
      const composerRect = composer?.getBoundingClientRect?.() || null;

      const visible = el => {
        if (!(el instanceof Element)) return false;
        const r = el.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return false;
        if (r.bottom < -10 || r.top > viewportH + 10 || r.right < -10 || r.left > viewportW + 10) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
      };

      const menuSelectors = [
        '[popover]', '[data-radix-popper-content-wrapper]', '[data-radix-menu-content]',
        '[data-headlessui-portal]', '[data-floating-ui-portal]', '[role="menu"]',
        '[role="dialog"]', '[role="listbox"]', '[data-state="open"]'
      ].join(',');
      const menuLike = el => Boolean(el.closest?.(menuSelectors));
      const interactive = el => Boolean(el.matches?.('button,[role="menuitem"],[role="option"],[role="button"],[data-radix-collection-item],[tabindex]'));

      const addCandidate = (row, leafText = '') => {
        if (!(row instanceof Element) || seen.has(row) || !visible(row)) return;
        if (cIsInsideMessage(row) || cIsInsideOwnPanel(row)) return;
        const r = row.getBoundingClientRect();
        const rowText = cPlainText(row);
        const allText = `${rowText} ${row.getAttribute('aria-label') || ''} ${row.getAttribute('title') || ''}`.trim();
        if (!primaryRegex.test(allText) || rowText.length > 240) return;
        if (r.width < 70 || r.width > Math.min(1100, viewportW * 0.96)) return;
        if (r.height < 22 || r.height > 180) return;

        const inMenu = menuLike(row);
        const nearComposer = composerRect
          ? r.bottom >= composerRect.top - 520 && r.top <= composerRect.bottom + 80
          : r.top >= viewportH * 0.35;
        if (!inMenu && !nearComposer) return;

        let score = 0;
        if (exactRegex.test(rowText)) score += 1800;
        else score += 700;
        if (/可视化/.test(rowText)) score += 1000;
        if (/任何内容/.test(rowText)) score += 450;
        if (/visualize|visualise/i.test(rowText)) score += 700;
        if (inMenu) score += 700;
        if (interactive(row)) score += 420;
        if (getComputedStyle(row).cursor === 'pointer') score += 120;
        if (leafText && rowText !== leafText) score += 60;
        if (nearComposer) score += 180;
        score += Math.max(0, r.top) * 0.03;

        seen.add(row);
        candidates.push({ element: row, score, text: rowText, rect: r });
      };

      const nodes = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],div,span')];
      for (const el of nodes) {
        if (!visible(el) || cIsInsideMessage(el) || cIsInsideOwnPanel(el)) continue;
        const text = cPlainText(el);
        const aria = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        if (!primaryRegex.test(`${text} ${aria} ${title}`) || text.length > 240) continue;

        addCandidate(el, text);
        let cur = el;
        for (let depth = 0; depth < 7 && cur; depth += 1, cur = cur.parentElement) {
          if (!visible(cur) || cIsInsideMessage(cur) || cIsInsideOwnPanel(cur)) continue;
          const t = cPlainText(cur);
          if (!primaryRegex.test(t) || t.length > 240) continue;
          if (interactive(cur) || menuLike(cur)) addCandidate(cur, text);
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0]) {
        const best = candidates[0];
        if (logFound) cLog(`已定位“创建图片”菜单项：${best.text.slice(0, 100)}；坐标 ${Math.round(best.rect.left + best.rect.width / 2)},${Math.round(best.rect.top + best.rect.height / 2)}`, 'info');
        return best.element;
      }
      return null;
    }

    function cSmartClick(element) {
      if (!element) return false;
      element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const target = hit && !hit.closest?.('#kagura-gpt-panel') ? hit : element;
      const options = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      };
      try { target.dispatchEvent(new PointerEvent('pointerover', options)); } catch (_) {}
      try { target.dispatchEvent(new MouseEvent('mouseover', options)); } catch (_) {}
      try { target.dispatchEvent(new PointerEvent('pointerdown', options)); } catch (_) {}
      try { target.dispatchEvent(new MouseEvent('mousedown', options)); } catch (_) {}
      try { target.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 })); } catch (_) {}
      try { target.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 })); } catch (_) {}
      try { HTMLElement.prototype.click.call(target); } catch (_) {
        try { HTMLElement.prototype.click.call(element); } catch (_) { return false; }
      }
      return true;
    }

    function cHasCreateImageChip() {
      const composer = cFindComposer();
      const editor = cFindPromptEditor();
      const editorRect = editor?.getBoundingClientRect?.() || null;
      const regex = /^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i;
      const roots = composer && composer !== document ? [composer, document] : [document];
      const checked = new Set();

      for (const root of roots) {
        const nodes = [...root.querySelectorAll('button,[role="button"],div,span')];
        for (const el of nodes) {
          if (checked.has(el)) continue;
          checked.add(el);
          if (!cIsVisible(el) || cIsInsideOwnPanel(el) || cIsInsideMessage(el)) continue;
          const text = cPlainText(el);
          if (!regex.test(text)) continue;
          const r = el.getBoundingClientRect();
          const insideComposer = composer instanceof Element && composer.contains(el);
          const nearEditor = editorRect
            ? r.bottom >= editorRect.top - 140 && r.top <= editorRect.bottom + 80
            : r.top > window.innerHeight * 0.5;
          if (insideComposer || nearEditor) return true;
        }
      }
      return false;
    }

    function cResetCreateImageMenuState() {
      // 用户脚本无法产生 Playwright 的 trusted 键盘事件，这里采用“点击输入框 + Escape事件”双重恢复。
      const editor = cFindPromptEditor();
      try { editor?.focus?.(); } catch (_) {}
      try { editor?.click?.(); } catch (_) {}
      const keyOptions = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true };
      try { document.activeElement?.dispatchEvent?.(new KeyboardEvent('keydown', keyOptions)); } catch (_) {}
      try { document.dispatchEvent(new KeyboardEvent('keydown', keyOptions)); } catch (_) {}
      try { document.activeElement?.dispatchEvent?.(new KeyboardEvent('keyup', keyOptions)); } catch (_) {}
    }

    async function cActivateCreateImage() {
      cState.phase = 'activating_create_image';
      cSaveState();
      cStatusText.textContent = '正在点击加号并启用“创建图片”…';

      if (cHasCreateImageChip()) {
        cLog('输入框附近已存在“创建图片”标签，无需重复添加', 'success');
        return;
      }

      let lastError = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        cLog(`检查/添加创建图片模式，第 ${attempt}/${maxAttempts} 次`, 'info');
        try {
          cResetCreateImageMenuState();
          await cSleep(250);

          const plus = await cWaitUntil(() => cFindComposerPlusButton(), 7000, 200);
          if (!plus) throw new Error('未找到输入框左侧“+”按钮');
          try { plus.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
          cSmartClick(plus);
          cLog(`已点击输入框左侧“+”按钮；aria-expanded=${plus.getAttribute('aria-expanded') || '-'}`, 'info');

          let opened = await cWaitUntil(() => cIsCreateImageMenuOpen(), 2200, 120);
          if (!opened) {
            cLog(`第一次点击“+”后未确认菜单展开，快速重试一次。${cCreateImageMenuDiagnostics()}`, 'warn');
            cResetCreateImageMenuState();
            await cSleep(250);
            const plusAgain = cFindComposerPlusButton() || plus;
            cSmartClick(plusAgain);
            opened = await cWaitUntil(() => cIsCreateImageMenuOpen(), 2200, 120);
          }
          if (!opened) {
            throw new Error(`点击“+”后菜单未真正展开。${cCreateImageMenuDiagnostics()}`);
          }

          let menuItem = await cWaitUntil(() => cFindCreateImageMenuItem(false), 4500, 150);
          if (!menuItem) {
            throw new Error(`加号菜单已展开，但没有找到“创建图片”。${cCreateImageMenuDiagnostics()}`);
          }
          // 正式点击前再定位一次并写详细日志，防止动态菜单节点刚好被重挂载。
          menuItem = cFindCreateImageMenuItem(true) || menuItem;
          if (!cSmartClick(menuItem)) throw new Error('已找到“创建图片”，但点击动作未成功派发');
          cLog('已点击“创建图片”整行菜单项', 'info');

          const activated = await cWaitUntil(() => cHasCreateImageChip(), 5000, 220);
          if (!activated) throw new Error(`点击后未检测到输入框附近的“创建图片”标签。${cCreateImageMenuDiagnostics()}`);

          cLog('创建图片模式添加成功', 'success');
          return;
        } catch (error) {
          lastError = error;
          cLog(`第 ${attempt} 次添加创建图片模式失败：${error.message || error}`, 'warn');
          cResetCreateImageMenuState();
          if (attempt < maxAttempts) await cSleep(900);
        }
      }

      throw new Error(`创建图片模式添加失败，已快速原地重试 ${maxAttempts} 次。最后错误：${lastError?.message || lastError || '未知错误'}`);
    }

    function cSetNativeValue(element, value) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }

    function cNormalizePromptText(value) {
      return String(value || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();
    }

    function cStripComposerUiText(value) {
      /*
       * ChatGPT 会把“创建图片”功能标签放进可编辑器的 DOM 范围内。
       * 直接读取 innerText 时，它会被误认为用户已经输入了 4 个字，
       * 从而触发“输入框存在残留内容”的保护逻辑。
       * 这里只剔除独立的功能标签，不会删除普通提示词中的“创建图片”字样。
       */
      const chipPattern = /^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i;
      const lines = String(value || '')
        .replace(/\u00a0/g, ' ')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !chipPattern.test(line));
      return lines.join('\n');
    }

    function cReadPromptEditor(editor = cFindPromptEditor()) {
      if (!editor) return '';

      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        return cNormalizePromptText(editor.value);
      }

      /*
       * 用克隆节点读取纯提示词，并移除功能按钮、附件、图标及不可编辑标签。
       * 不修改真实页面 DOM，因此不会清除“创建图片”模式。
       */
      let value = '';
      try {
        const clone = editor.cloneNode(true);
        clone.querySelectorAll([
          'button',
          '[role="button"]',
          '[role="menuitem"]',
          '[contenteditable="false"]',
          '[data-testid*="attachment"]',
          '[data-testid*="composer-chip"]',
          '[data-testid*="tool-chip"]',
          'img',
          'svg'
        ].join(',')).forEach(node => node.remove());
        value = clone.textContent || '';
      } catch (_) {
        value = editor.innerText || editor.textContent || '';
      }

      const cleaned = cStripComposerUiText(value);
      const normalized = cNormalizePromptText(cleaned);

      // 某些页面结构无法在克隆节点中分离标签；仅当全文就是功能标签时视为空输入框。
      if (/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i.test(normalized)) {
        return '';
      }
      return normalized;
    }

    function cPromptMatches(editor, expectedText) {
      const actual = cReadPromptEditor(editor);
      const expected = cNormalizePromptText(expectedText);
      if (!expected || !actual) return false;
      if (actual === expected || actual.includes(expected)) return true;
      const compactActual = actual.replace(/\s+/g, '');
      const compactExpected = expected.replace(/\s+/g, '');
      if (compactActual === compactExpected || compactActual.includes(compactExpected)) return true;
      if (compactExpected.length >= 80) {
        const head = compactExpected.slice(0, 40);
        const tail = compactExpected.slice(-40);
        return compactActual.includes(head) && compactActual.includes(tail);
      }
      return false;
    }

    function cPlaceCaretAtEnd(editor) {
      if (!editor) return false;
      try { editor.focus({ preventScroll: true }); } catch (_) {
        try { editor.focus(); } catch (_) {}
      }

      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        const length = String(editor.value || '').length;
        try { editor.setSelectionRange(length, length); } catch (_) {}
        return true;
      }

      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      } catch (_) {
        return false;
      }
    }

    function cInsertPromptByExecCommand(editor, text) {
      if (!editor) return false;
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        cSetNativeValue(editor, text);
        return true;
      }

      cPlaceCaretAtEnd(editor);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, text); } catch (_) {}
      try {
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: text
        }));
      } catch (_) {}
      return inserted;
    }

    function cInsertPromptByRange(editor, text) {
      if (!editor || editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) return false;
      try {
        cPlaceCaretAtEnd(editor);
        const selection = window.getSelection();
        let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (!range || !editor.contains(range.startContainer)) {
          range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
        }

        const fragment = document.createDocumentFragment();
        const lines = String(text).split('\n');
        lines.forEach((line, index) => {
          if (index > 0) fragment.appendChild(document.createElement('br'));
          if (line) fragment.appendChild(document.createTextNode(line));
        });
        const tail = document.createTextNode('');
        fragment.appendChild(tail);
        range.insertNode(fragment);
        range.setStartAfter(tail);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertText',
          data: text
        }));
        editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
      } catch (_) {
        return false;
      }
    }

    async function cEnsureCreateImagePreserved(expectedPrompt) {
      if (cHasCreateImageChip()) return;

      cLog('提示词写入后检测到“创建图片”标签消失，正在保留提示词并重新启用该模式', 'warn');
      await cActivateCreateImage();

      const editor = cFindPromptEditor();
      if (!editor || !cPromptMatches(editor, expectedPrompt)) {
        throw new Error('重新启用“创建图片”后提示词丢失，已停止自动发送');
      }
      if (!cHasCreateImageChip()) {
        throw new Error('提示词已写入，但无法恢复“创建图片”模式，已停止自动发送');
      }
      cLog('“创建图片”模式已恢复，提示词仍完整保留', 'success');
    }

    async function cSetPrompt(text) {
      const expected = String(text || '').trim();
      if (!expected) throw new Error('固定提示词为空，已停止发送');

      if (!cHasCreateImageChip()) {
        cLog('写入提示词前未检测到“创建图片”标签，正在重新启用', 'warn');
        await cActivateCreateImage();
      }

      let editor = await cWaitUntil(() => cFindPromptEditor(), 30000, 300);
      if (!editor) throw new Error('未找到当前可见的提示词输入框');
      editor.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

      const existing = cReadPromptEditor(editor);
      if (!existing && cHasCreateImageChip()) {
        cLog('已识别并忽略“创建图片”功能标签，当前提示词输入区为空', 'info');
      }
      if (cPromptMatches(editor, expected)) {
        await cEnsureCreateImagePreserved(expected);
        cLog(`固定提示词已存在并校验通过（${expected.length} 字）`, 'success');
        return;
      }
      if (existing) {
        throw new Error(`当前输入框已有 ${existing.length} 字残留内容。为防止清除“创建图片”模式，脚本不会自动删除，请手动清空后重试当前批次`);
      }

      const methods = [cInsertPromptByExecCommand, cInsertPromptByRange];
      let lastActual = '';
      for (let attempt = 0; attempt < methods.length; attempt += 1) {
        editor = cFindPromptEditor();
        if (!editor) throw new Error('写入过程中未找到当前可见输入框');

        const before = cReadPromptEditor(editor);
        if (before && !cPromptMatches(editor, expected)) {
          throw new Error(`提示词写入出现部分内容（当前识别 ${before.length} 字）。为避免重复写入，请手动清空后重试当前批次`);
        }

        methods[attempt](editor, expected);
        await cSleep(1000);

        const currentEditor = cFindPromptEditor();
        lastActual = cReadPromptEditor(currentEditor);
        if (currentEditor && cPromptMatches(currentEditor, expected)) {
          await cEnsureCreateImagePreserved(expected);
          cLog(`固定提示词已无损写入并校验通过（${expected.length} 字，第 ${attempt + 1} 种方式）`, 'success');
          return;
        }

        if (lastActual) {
          throw new Error(`固定提示词只写入了部分内容（当前识别 ${lastActual.length} 字）。脚本不会清空编辑器，以免移除“创建图片”模式，请手动清空后重试`);
        }
        cLog(`第 ${attempt + 1} 种无损写入方式未生效，准备尝试下一种方式`, 'warn');
      }

      throw new Error(`固定提示词写入失败：输入框内未检测到完整提示词（当前识别 ${lastActual.length} 字），不会点击发送`);
    }

    function cFindSendButton() {
      const selectors = [
        'button[data-testid="send-button"]',
        'button[data-testid="composer-send-button"]',
        'button[aria-label*="发送提示"]',
        'button[aria-label="发送"]',
        'button[aria-label*="Send prompt"]',
        'button[aria-label="Send"]',
      ];
      for (const selector of selectors) {
        const buttons = [...document.querySelectorAll(selector)]
          .filter(button => cIsVisible(button) && !button.closest('#kagura-gpt-panel'))
          .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
        if (buttons[0]) return buttons[0];
      }
      return cFindClickable(['发送提示', '^发送$', 'Send prompt', '^Send$'], cFindComposer());
    }

    function cCountUserMessagesContaining(promptText) {
      const expected = cNormalizePromptText(promptText);
      if (!expected) return 0;
      const compactExpected = expected.replace(/\s+/g, '');
      const head = compactExpected.slice(0, Math.min(50, compactExpected.length));
      const nodes = [...document.querySelectorAll('[data-message-author-role="user"], article')];
      const seen = new Set();
      for (const node of nodes) {
        if (!cIsVisible(node) || node.closest('form[data-type="unified-composer"], [data-composer-surface="true"], #kagura-gpt-panel')) continue;
        const role = node.getAttribute('data-message-author-role') || '';
        if (role && role !== 'user') continue;
        const compact = cNormalizePromptText(node.innerText || node.textContent || '').replace(/\s+/g, '');
        if (!compact || !compact.includes(head)) continue;
        const rect = node.getBoundingClientRect();
        seen.add(`${Math.round(rect.top + window.scrollY)}|${compact.slice(0, 120)}`);
      }
      return seen.size;
    }

    async function cSendPrompt(expectedAttachmentCount, expectedPrompt) {
      let button = await cWaitUntilReadyToSend(expectedAttachmentCount, expectedPrompt);
      const editorBefore = cFindPromptEditor();
      if (!editorBefore || !cPromptMatches(editorBefore, expectedPrompt)) {
        throw new Error('点击发送前提示词校验失败，已停止自动发送');
      }
      if (!cHasCreateImageChip()) {
        throw new Error('点击发送前“创建图片”模式校验失败，已停止自动发送');
      }

      const beforeMatchedUserCount = cCountUserMessagesContaining(expectedPrompt);
      const beforeAnyUserCount = cCountVisibleUserMessages();
      const queuedWaitMs = Math.max(
        Number(cSettings.uploadTimeout) || C_DEFAULT_SETTINGS.uploadTimeout,
        240000
      );

      function cFormatUploadProgress(uploadState) {
        const previewPart = uploadState.previewTotal
          ? `${uploadState.previewReady}/${uploadState.previewTotal}`
          : '0/0';
        const uploadLabel = uploadState.failed
          ? '失败'
          : uploadState.uploading
            ? '处理中'
            : '已完成';
        return {
          previewPart,
          uploadLabel,
          text: `附件 ${uploadState.count}/${expectedAttachmentCount}，预览完成 ${previewPart}，上传状态：${uploadLabel}`
        };
      }

      function readSendProgress() {
        const uploadState = cGetUploadState();
        if (uploadState.failed) {
          const detail = uploadState.failureMessage ? `：${uploadState.failureMessage}` : '';
          if (uploadState.retryable) {
            throw new CUploadRetryableError(`发送后等待附件处理时检测到上传失败${detail}`);
          }
          throw new Error(`发送后等待附件处理时检测到不可重试的上传失败${detail}`);
        }

        const editor = cFindPromptEditor();
        const promptStillInEditor = Boolean(editor && cPromptMatches(editor, expectedPrompt));
        const newUserMessage = cCountUserMessagesContaining(expectedPrompt) > beforeMatchedUserCount;
        const anyUserIncreased = cCountVisibleUserMessages() > beforeAnyUserCount;
        const generationStarted = cIsStopButtonVisible();
        const submittedLike = cLooksLikeSubmittedAfterClick(
          expectedAttachmentCount,
          expectedPrompt,
          beforeAnyUserCount,
          beforeMatchedUserCount
        );

        return {
          uploadState,
          editor,
          promptStillInEditor,
          newUserMessage,
          anyUserIncreased,
          generationStarted,
          submittedLike,
        };
      }

      async function waitAfterClick(clickAttempt) {
        const startedAt = Date.now();
        let pendingLogged = false;
        let lastStatusLog = 0;

        while (Date.now() - startedAt < queuedWaitMs) {
          if (!cState.running) throw new CPausedError();

          const state = readSendProgress();

          // 最可靠：当前提示词已经离开输入框，并出现用户消息 / 生成状态 / 已提交特征。
          if (!state.promptStillInEditor && (
            state.newUserMessage
            || state.anyUserIncreased
            || state.generationStarted
            || state.submittedLike
          )) {
            let reason = '检测到新用户消息';
            if (state.generationStarted) {
              reason = '检测到生成状态';
            } else if (state.submittedLike && !state.newUserMessage && !state.anyUserIncreased) {
              reason = '检测到消息已提交，附件仍在 ChatGPT 侧完成处理';
            } else if (state.anyUserIncreased && !state.newUserMessage) {
              reason = '检测到新的用户消息节点';
            }
            const uploadProgress = cFormatUploadProgress(state.uploadState);
            cLog(`任务已确认发送成功（${reason}）；${uploadProgress.text}，开始等待生图完成`, 'success');
            await cSleep(1200);
            return { sent: true };
          }

          // 重要修复：
          // 点击发送后，ChatGPT 可能先“挂起发送”，等待附件真正传完。
          // 此时提示词仍会留在输入框，不能把它当成点击失败，更不能再次点击。
          if (state.promptStillInEditor) {
            if (!pendingLogged) {
              pendingLogged = true;
              cLog(
                `第 ${clickAttempt} 次点击发送后提示词仍在输入框；可能正在等待附件上传/处理。进入待发送观察状态，不会重复点击发送。`,
                'warn'
              );
            }

            const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
            const remainSec = Math.max(0, Math.ceil((queuedWaitMs - (Date.now() - startedAt)) / 1000));
            const uploadProgress = cFormatUploadProgress(state.uploadState);
            cStatusText.textContent =
              `待发送观察：${uploadProgress.text}；提示词仍在输入框；已等待 ${elapsedSec} 秒`;

            if (Date.now() - lastStatusLog >= 15000) {
              cLog(
                `发送待确认：${uploadProgress.text}；提示词仍在输入框；发送按钮已点击，继续等待，约 ${remainSec} 秒内不会重复点击。`,
                'info'
              );
              lastStatusLog = Date.now();
            }

            await cSleep(700);
            continue;
          }

          // 提示词已经离开输入框，但消息节点/生成状态可能晚几秒挂载。
          // 这时绝不能返回去执行“第二次发送”，继续观察即可。
          if (!state.promptStillInEditor) {
            if (!pendingLogged) {
              pendingLogged = true;
              cLog('提示词已离开输入框，正在等待 ChatGPT 挂载用户消息或进入生成状态；不会再次点击发送。', 'info');
            }

            const uploadProgress = cFormatUploadProgress(state.uploadState);
            cStatusText.textContent =
              `消息已离开输入框，正在确认ChatGPT接收任务… ${uploadProgress.text}`;
            if (Date.now() - lastStatusLog >= 15000) {
              cLog(
                `发送确认中：提示词已离开输入框；${uploadProgress.text}；等待用户消息或生成状态出现。`,
                'info'
              );
              lastStatusLog = Date.now();
            }
            await cSleep(700);
            continue;
          }
        }

        const finalState = readSendProgress();

        // 超时瞬间可能正好已发送，最后再确认一次。
        if (!finalState.promptStillInEditor) {
          cLog('等待发送确认超时时提示词已经离开输入框，取消二次点击；按已提交状态继续等待生成。', 'warn');
          await cSleep(1500);
          return { sent: true };
        }

        return { sent: false };
      }

      cStatusText.textContent = '附件和提示词均已就绪，正在发送任务…';

      for (let clickAttempt = 1; clickAttempt <= 2; clickAttempt += 1) {
        // 每次真正点击前再检查一次，防止上一轮等待期间消息已经自动发送。
        const beforeClickState = readSendProgress();
        if (!beforeClickState.promptStillInEditor) {
          cLog('准备再次点击前发现提示词已经离开输入框，说明任务已进入提交状态；取消重复点击。', 'success');
          await cSleep(1200);
          return;
        }

        cSmartClick(button);
        cLog(`已点击发送按钮（第 ${clickAttempt} 次），开始等待附件处理和消息真正提交`, 'info');

        const result = await waitAfterClick(clickAttempt);
        if (result.sent) return;

        if (clickAttempt === 1) {
          // 只有完整观察期结束后，提示词仍原封不动留在输入框，才认为第一次确实没提交。
          const currentEditor = cFindPromptEditor();
          const promptStillThere = Boolean(currentEditor && cPromptMatches(currentEditor, expectedPrompt));

          if (!promptStillThere) {
            cLog('第一次等待结束时提示词已经离开输入框，取消第二次点击并按已发送处理。', 'success');
            await cSleep(1200);
            return;
          }

          cLog('第一次发送等待期结束，提示词仍完整停留在输入框中，才判定本次点击确实未提交；准备第二次点击。', 'warn');

          // 第二次点击前重新等待发送按钮真正恢复为可用。
          // 如果在这一步消息突然自动发出，不能因为输入框已空而报错。
          try {
            button = await cWaitUntilReadyToSend(expectedAttachmentCount, expectedPrompt);
          } catch (error) {
            const editorNow = cFindPromptEditor();
            const promptStillNow = Boolean(editorNow && cPromptMatches(editorNow, expectedPrompt));
            if (!promptStillNow) {
              cLog('准备第二次点击期间消息已经自动发出，检测到输入框已清空；取消重复点击，按发送成功处理。', 'success');
              await cSleep(1200);
              return;
            }
            throw error;
          }
          continue;
        }

        throw new Error('连续两次点击发送并等待附件处理后，固定提示词仍停留在输入框中，无法确认消息已提交');
      }
    }

    function cIsStopButtonVisible() {
      const button = document.querySelector('button[data-testid="stop-button"], button[aria-label*="停止生成"], button[aria-label*="Stop generating"], button[aria-label="Stop"]');
      return Boolean(button && cIsVisible(button));
    }

    function cCountVisibleUserMessages() {
      const nodes = [...document.querySelectorAll('[data-message-author-role="user"], article')];
      const seen = new Set();
      for (const node of nodes) {
        if (!cIsVisible(node) || node.closest('form[data-type="unified-composer"], [data-composer-surface="true"], #kagura-gpt-panel')) continue;
        const role = node.getAttribute('data-message-author-role') || '';
        if (role && role !== 'user') continue;
        const rect = node.getBoundingClientRect();
        const key = `${Math.round(rect.top + window.scrollY)}|${Math.round(rect.left)}|${Math.round(rect.width)}|${Math.round(rect.height)}`;
        seen.add(key);
      }
      return seen.size;
    }

    function cIsSendButtonBusy() {
      const composer = cFindComposer();
      const sendButton = cFindSendButton();
      const loadingSelectors = [
        '[role="progressbar"]',
        '[aria-busy="true"]',
        '[data-testid*="loading"]',
        '[data-testid*="upload-progress"]',
        '[data-state="loading"]',
        '.animate-spin',
        'svg[class*="animate-spin"]'
      ];
      const loadingNode = composer && loadingSelectors.some(selector =>
        [...composer.querySelectorAll(selector)].some(node => cIsVisible(node))
      );
      const buttonBusy = Boolean(sendButton && (
        sendButton.disabled
        || sendButton.getAttribute('aria-disabled') === 'true'
        || /请稍候|处理中|上传中|loading|processing/i.test(cText(sendButton))
      ));
      return Boolean(loadingNode || buttonBusy || cIsStopButtonVisible());
    }

    function cLooksLikeSubmittedAfterClick(expectedCount, expectedPrompt, beforeAnyUserCount = 0, beforeMatchedUserCount = 0) {
      const editor = cFindPromptEditor();
      const promptStillInEditor = Boolean(editor && cPromptMatches(editor, expectedPrompt));
      if (promptStillInEditor) return false;

      const uploadState = cGetUploadState();
      const anyUserIncreased = cCountVisibleUserMessages() > beforeAnyUserCount;
      const matchedUserIncreased = cCountUserMessagesContaining(expectedPrompt) > beforeMatchedUserCount;
      const attachmentMovedOut = uploadState.count < Math.max(1, expectedCount);
      const editorEmpty = !cReadPromptEditor(editor);
      const chipMissing = !cHasCreateImageChip();
      const sendBusy = cIsSendButtonBusy();

      return Boolean(
        matchedUserIncreased
        || anyUserIncreased
        || (attachmentMovedOut && (sendBusy || editorEmpty || chipMissing))
      );
    }

    function cBestImgUrl(img) {
      const candidates = [];
      const add = (url, width = 0, priority = 0) => {
        url = String(url || '').trim();
        if (!url || /^javascript:/i.test(url)) return;
        candidates.push({ url, width: Number(width) || 0, priority });
      };

      add(img.currentSrc, img.naturalWidth || 0, 50);
      add(img.src, img.naturalWidth || 0, 40);
      add(img.getAttribute('data-src'), img.naturalWidth || 0, 35);
      add(img.getAttribute('data-original'), img.naturalWidth || 0, 35);

      const parseSrcset = srcset => {
        String(srcset || '').split(',').forEach(item => {
          const part = item.trim();
          if (!part) return;
          const match = part.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
          if (match) add(match[1], Number(match[2]), match[3].toLowerCase() === 'w' ? 70 : 60);
          else add(part.split(/\s+/)[0], 0, 20);
        });
      };
      parseSrcset(img.getAttribute('srcset'));
      img.closest('picture')?.querySelectorAll('source[srcset]').forEach(source => parseSrcset(source.getAttribute('srcset')));

      const anchor = img.closest('a[href]');
      if (anchor && /(?:blob:|data:image|oaiusercontent|oaistatic|openai|chatgpt|usercontent|\/files\/|\/image\/|\.(?:png|jpe?g|webp|avif)(?:[?#]|$))/i.test(anchor.href)) {
        add(anchor.href, 99999, 100);
      }

      candidates.sort((a, b) => (b.priority + b.width / 100000) - (a.priority + a.width / 100000));
      return candidates[0]?.url || '';
    }

    function cCanonicalImageUrl(url) {
      const raw = String(url || '').trim();
      if (!raw || /^(?:blob:|data:)/i.test(raw)) return raw;
      try {
        const parsed = new URL(raw, location.href);
        parsed.hash = '';
        [
          'w', 'h', 'width', 'height', 'q', 'quality', 'dpr', 'fit', 'crop',
          'format', 'fm', 'auto', 'resize', 'size', 'thumb', 'thumbnail'
        ].forEach(key => parsed.searchParams.delete(key));
        return `${parsed.origin}${parsed.pathname}${parsed.searchParams.toString() ? `?${parsed.searchParams}` : ''}`;
      } catch (_) {
        return raw.replace(/#.*$/, '');
      }
    }

    function cFindLatestUserAnchor(promptText = '') {
      const expected = cNormalizePromptText(promptText).replace(/\s+/g, '');
      const head = expected.slice(0, Math.min(48, expected.length));
      const candidates = [...document.querySelectorAll('[data-message-author-role="user"], article')];
      let best = null;
      let bestScore = -Infinity;

      for (const node of candidates) {
        if (!(node instanceof Element)) continue;
        if (node.closest('form[data-type="unified-composer"], [data-composer-surface="true"], #kagura-gpt-panel')) continue;
        const role = node.getAttribute('data-message-author-role') || '';
        if (role && role !== 'user') continue;
        const compact = cNormalizePromptText(node.innerText || node.textContent || '').replace(/\s+/g, '');
        if (head && !compact.includes(head)) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const absoluteTop = rect.top + window.scrollY;
        const score = absoluteTop - Math.min(compact.length, 5000) * 0.01;
        if (score > bestScore) {
          best = node;
          bestScore = score;
        }
      }

      if (best) return best;
      const fallback = candidates.filter(node => {
        if (!(node instanceof Element)) return false;
        if (node.closest('form[data-type="unified-composer"], [data-composer-surface="true"], #kagura-gpt-panel')) return false;
        const role = node.getAttribute('data-message-author-role') || '';
        return !role || role === 'user';
      });
      return fallback[fallback.length - 1] || null;
    }

    function cNodeIsAfterAnchor(node, anchor) {
      if (!anchor || !node) return true;
      try {
        const relation = anchor.compareDocumentPosition(node);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return true;
      } catch (_) {}
      const anchorRect = anchor.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      return nodeRect.top + window.scrollY > anchorRect.bottom + window.scrollY - 20;
    }

    function cGenerationCompletionState(promptText = '') {
      const anchor = cFindLatestUserAnchor(promptText);
      const anchorRect = anchor?.getBoundingClientRect?.();
      const anchorBottom = anchorRect ? anchorRect.bottom + window.scrollY : -1;
      let hasFinishTime = false;
      let hasEdit = false;
      let hasDownload = false;

      const nodes = [...document.querySelectorAll('main button, main [role="button"], main span, main p, main div')];
      for (const node of nodes) {
        if (!(node instanceof Element) || !cIsVisible(node)) continue;
        if (node.closest('#kagura-gpt-panel, form[data-type="unified-composer"], [data-composer-surface="true"]')) continue;
        const userRoot = node.closest('[data-message-author-role="user"]');
        if (userRoot) continue;
        if (anchor && !cNodeIsAfterAnchor(node, anchor)) continue;
        const rect = node.getBoundingClientRect();
        if (anchorBottom >= 0 && rect.top + window.scrollY < anchorBottom - 100) continue;
        const text = cText(node).replace(/\s+/g, ' ').trim();
        if (!text || text.length > 180) continue;

        if (/(?:Worked for|Thought for|思考了|已思考|工作了|用时\s*\d|耗时\s*\d)/i.test(text) && !/(?:正在思考|Thinking)/i.test(text)) {
          hasFinishTime = true;
        }
        if (/(?:^|\s)(?:编辑图片|编辑|Edit image|Edit)(?:\s|$)/i.test(text)) hasEdit = true;
        if (/(?:下载图片|下载|Download image|Download)/i.test(text)) hasDownload = true;
      }

      const stopVisible = cIsStopButtonVisible();
      return {
        hasFinishTime,
        hasEdit,
        hasDownload,
        stopVisible,
        complete: !stopVisible && (hasFinishTime || hasEdit || hasDownload),
      };
    }

    function cGeneratedImages(promptText = '') {
      const anchor = cFindLatestUserAnchor(promptText);
      const anchorRect = anchor?.getBoundingClientRect?.();
      const anchorBottom = anchorRect ? anchorRect.bottom + window.scrollY : -1;
      const images = [...document.querySelectorAll('main img')];
      const seen = new Set();
      const items = [];

      images.forEach((img, domIndex) => {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.closest('#kagura-gpt-panel, nav, aside, form[data-type="unified-composer"], [data-composer-surface="true"]')) return;
        const messageRoot = img.closest('[data-message-author-role], article');
        const role = messageRoot?.getAttribute?.('data-message-author-role') || '';
        if (role === 'user') return;
        if (anchor && !cNodeIsAfterAnchor(img, anchor)) return;

        const rect = img.getBoundingClientRect();
        const absoluteTop = rect.top + window.scrollY;
        if (anchorBottom >= 0 && absoluteTop <= anchorBottom + 10) return;

        const width = img.naturalWidth || Math.round(rect.width || 0);
        const height = img.naturalHeight || Math.round(rect.height || 0);
        const clientWidth = Math.round(rect.width || 0);
        const clientHeight = Math.round(rect.height || 0);
        const displayArea = Math.max(0, clientWidth * clientHeight);
        const alt = String(img.alt || '');
        const url = cBestImgUrl(img);
        const key = cCanonicalImageUrl(url);
        const ratio = width / Math.max(1, height);

        if (!url || !key || seen.has(key)) return;
        if (/avatar|logo|icon|emoji|favicon|profile|用户头像|个人资料/i.test(`${url} ${alt}`)) return;
        if (width < 128 || height < 128) return;
        if (clientWidth < 20 || clientHeight < 20) return;
        if (ratio < 0.20 || ratio > 5.0) return;

        seen.add(key);
        items.push({
          img,
          url,
          key,
          width,
          height,
          clientWidth,
          clientHeight,
          displayArea,
          domIndex,
          absoluteTop,
          absoluteLeft: rect.left + window.scrollX,
          role: role || 'unknown',
        });
      });

      return items;
    }

    function cImageKey(item) {
      return item?.key || cCanonicalImageUrl(item?.url || '');
    }

    function cNormalizeGalleryImages(items, expectedCount = 0) {
      const unique = [];
      const seen = new Set();
      for (const item of items || []) {
        const key = cImageKey(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
      }

      // Chrome 的右侧图库可能使用虚拟滚动：初始只挂载 8~9 个缩略图；
      // Edge 有时又会把完整 N 张缩略图全部挂出来，同时页面还会额外出现 1 张主预览。
      // 因此这里不能写死“主预览算一张”或“主预览一定不算一张”，而要按当前页面结构自适应判断。
      unique.sort((a, b) => {
        const aSeen = Number.isFinite(a.firstSeenOrder) ? a.firstSeenOrder : Number.MAX_SAFE_INTEGER;
        const bSeen = Number.isFinite(b.firstSeenOrder) ? b.firstSeenOrder : Number.MAX_SAFE_INTEGER;
        return (aSeen - bSeen)
          || (a.domIndex - b.domIndex)
          || (a.absoluteTop - b.absoluteTop)
          || (a.absoluteLeft - b.absoluteLeft);
      });

      if (!expectedCount || unique.length <= 1) return expectedCount ? unique.slice(0, expectedCount) : unique;

      const byArea = [...unique].sort((a, b) => (b.displayArea || 0) - (a.displayArea || 0));
      const main = byArea[0];
      const secondArea = byArea[1]?.displayArea || 0;
      const mainLooksLikePreview = Boolean(main
        && (main.displayArea || 0) >= Math.max(120000, secondArea * 2.2)
        && (main.clientWidth || 0) >= 220
        && (main.clientHeight || 0) >= 220);

      const thumbs = unique.filter(item => {
        if (!mainLooksLikePreview || item !== main) return true;
        return false;
      }).filter(item => {
        if (!mainLooksLikePreview) return true;
        // 对于其余图片，优先保留右侧缩略图/小图列表。
        return item !== main;
      });

      const normalizedThumbs = thumbs.sort((a, b) => {
        const aSeen = Number.isFinite(a.firstSeenOrder) ? a.firstSeenOrder : Number.MAX_SAFE_INTEGER;
        const bSeen = Number.isFinite(b.firstSeenOrder) ? b.firstSeenOrder : Number.MAX_SAFE_INTEGER;
        return (aSeen - bSeen)
          || (a.absoluteTop - b.absoluteTop)
          || (a.absoluteLeft - b.absoluteLeft)
          || (a.domIndex - b.domIndex);
      });

      // 自适应规则：
      // 1) 如果右侧/列表缩略图已达到计划数量，则直接以缩略图为准，主预览不额外计数（兼容 Edge）。
      if (normalizedThumbs.length >= expectedCount) return normalizedThumbs.slice(0, expectedCount);

      // 2) 如果缩略图只有 N-1 张，但有一个明显主预览，则补上主预览（兼容 Chrome 常见 1 + N-1 结构）。
      if (mainLooksLikePreview && normalizedThumbs.length === expectedCount - 1) {
        const merged = [main, ...normalizedThumbs];
        merged.sort((a, b) => {
          const aSeen = Number.isFinite(a.firstSeenOrder) ? a.firstSeenOrder : Number.MAX_SAFE_INTEGER;
          const bSeen = Number.isFinite(b.firstSeenOrder) ? b.firstSeenOrder : Number.MAX_SAFE_INTEGER;
          return (aSeen - bSeen)
            || (a.absoluteTop - b.absoluteTop)
            || (a.absoluteLeft - b.absoluteLeft)
            || (a.domIndex - b.domIndex);
        });
        return merged.slice(0, expectedCount);
      }

      // 3) 其他情况回退到去重后的总列表，保持旧行为，避免把真实结果过度裁掉。
      return unique.slice(0, expectedCount);
    }

    function cFindCurrentAssistantReply(promptText = '') {
      const anchor = cFindLatestUserAnchor(promptText);
      if (!anchor) return null;
      const anchorRect = anchor.getBoundingClientRect?.();
      const anchorTop = anchorRect ? anchorRect.top + window.scrollY : -1;
      const candidates = [];
      const seen = new Set();
      const nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]'), ...document.querySelectorAll('main article')];
      for (const node of nodes) {
        if (!(node instanceof Element) || seen.has(node)) continue;
        seen.add(node);
        if (node.closest('#kagura-gpt-panel, form[data-type="unified-composer"], [data-composer-surface="true"]')) continue;
        const role = node.getAttribute('data-message-author-role') || node.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') || '';
        if (role && role !== 'assistant') continue;
        if (!cNodeIsAfterAnchor(node, anchor)) continue;
        const r = node.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        const top = r.top + window.scrollY;
        if (anchorTop >= 0 && top < anchorTop - 20) continue;
        candidates.push({ node, top });
      }
      candidates.sort((a, b) => a.top - b.top);
      return candidates[0]?.node || null;
    }

    function cScrollRecoveryNode(node, block = 'center') {
      if (!(node instanceof Element)) return false;
      try { node.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' }); }
      catch (_) { try { node.scrollIntoView(); } catch (_) { return false; } }
      try { window.dispatchEvent(new Event('scroll')); } catch (_) {}
      return true;
    }

    async function cForceHydrateCurrentGeneratedReply(promptText = '', expectedCount = 0, pass = 0, quiet = false) {
      const anchor = cFindLatestUserAnchor(promptText);
      if (anchor) { cScrollRecoveryNode(anchor, 'center'); await cSleep(260); }
      let reply = cFindCurrentAssistantReply(promptText);
      if (!reply && anchor) {
        try { window.scrollBy({ top: 520, behavior: 'instant' }); } catch (_) { window.scrollBy(0, 520); }
        await cSleep(420);
        reply = cFindCurrentAssistantReply(promptText);
      }
      if (reply) {
        const blocks = ['start', 'center', 'end'];
        cScrollRecoveryNode(reply, blocks[pass % blocks.length]);
        await cSleep(300);
        const imgs = [...reply.querySelectorAll('img')].filter(img => img instanceof HTMLImageElement);
        if (imgs.length) {
          const pick = imgs[Math.min(imgs.length - 1, pass % Math.max(1, imgs.length))];
          try { pick.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
          await cSleep(220);
        }
      }
      const galleryCount = cScrollGeneratedGallery(promptText, pass, true);
      await cSleep(420);
      const detected = cNormalizeGalleryImages(cGeneratedImages(promptText), expectedCount).length;
      if (!quiet) cLog(`主动恢复扫描：当前批次消息=${anchor ? '已定位' : '未定位'}，assistant回复=${reply ? '已定位' : '未定位'}，图库容器=${galleryCount}，当前检测 ${detected}/${expectedCount || '?'}`, detected >= expectedCount && expectedCount ? 'success' : 'info');
      return { anchor: Boolean(anchor), reply: Boolean(reply), galleryCount, detected };
    }

    async function cPrimeRefreshRecovery(promptText = '', expectedCount = 0) {
      cLog('刷新恢复：开始主动定位当前批次消息/回复并触发缩略图库懒加载，不重新发送任务', 'warn');
      for (let pass = 0; pass < 4; pass += 1) {
        if (!cState.running) throw new CPausedError();
        const result = await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, pass, pass > 0);
        if (expectedCount > 0 && result.detected >= expectedCount) {
          cLog(`刷新恢复主动扫描已找到 ${result.detected}/${expectedCount} 张，转入正常完成检测`, 'success');
          return true;
        }
        await cSleep(850);
      }
      return false;
    }

    function cFindGeneratedGalleryScrollables(promptText = '') {
      const anchor = cFindLatestUserAnchor(promptText);
      const candidates = [];
      const seen = new Set();
      const nodes = [...document.querySelectorAll('main div, main section, main [role="list"], main [role="group"]')];

      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || seen.has(node)) continue;
        if (node.closest('#kagura-gpt-panel, nav, aside, form[data-type="unified-composer"], [data-composer-surface="true"]')) continue;
        if (anchor && !cNodeIsAfterAnchor(node, anchor)) continue;

        const rect = node.getBoundingClientRect();
        if (rect.width < 45 || rect.height < 90 || rect.width > 720 || rect.height > Math.max(900, innerHeight * 1.2)) continue;
        if (node.scrollHeight <= node.clientHeight + 20) continue;

        const style = getComputedStyle(node);
        const overflow = `${style.overflowY || ''} ${style.overflow || ''}`;
        if (!/(auto|scroll)/i.test(overflow)) continue;

        const imgs = [...node.querySelectorAll('img')].filter(img => {
          if (!(img instanceof HTMLImageElement)) return false;
          const r = img.getBoundingClientRect();
          const w = img.naturalWidth || r.width;
          const h = img.naturalHeight || r.height;
          return w >= 128 && h >= 128 && r.width >= 18 && r.height >= 18;
        });
        const lazySlots = [...node.querySelectorAll('button,[role="button"],[data-testid*="image" i],[class*="thumb" i],[class*="gallery" i]')].filter(el => {
          if (!(el instanceof Element)) return false;
          const r = el.getBoundingClientRect();
          return r.width >= 24 && r.height >= 24 && r.width <= 260 && r.height <= 260;
        });
        if (imgs.length < 1 && lazySlots.length < 2) continue;

        seen.add(node);
        let score = imgs.length * 140 + Math.min(8, lazySlots.length) * 45;
        if (rect.width <= 220) score += 900; // 右侧窄缩略图栏
        if (rect.height >= 250) score += 300;
        if (rect.left > innerWidth * 0.45) score += 180;
        score += Math.min(500, node.scrollHeight - node.clientHeight);
        candidates.push({ node, score });
      }

      candidates.sort((a, b) => b.score - a.score);
      return candidates.slice(0, 4).map(item => item.node);
    }

    function cScrollGeneratedGallery(promptText = '', round = 0, forceSweep = false) {
      const scrollables = cFindGeneratedGalleryScrollables(promptText);
      const positions = forceSweep
        ? [0, 0.18, 0.38, 0.58, 0.78, 1]
        : [0.22, 0.48, 0.74, 1, 0.52, 0];
      const ratio = positions[round % positions.length];

      for (const element of scrollables) {
        const max = Math.max(0, element.scrollHeight - element.clientHeight);
        if (!max) continue;
        const next = Math.max(0, Math.min(max, Math.round(max * ratio)));
        try {
          element.scrollTop = next;
          element.dispatchEvent(new Event('scroll', { bubbles: true }));
          // Chrome 的懒加载有时需要目标缩略图真正进入可视区域。
          const imgs = [...element.querySelectorAll('img')];
          const target = ratio >= 0.7 ? imgs[imgs.length - 1] : imgs[0];
          target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        } catch (_) {}
      }

      // 没找到独立图库滚动容器时，轻微滚动主页面触发懒加载，但不离开当前回复太远。
      if (!scrollables.length && forceSweep) {
        try {
          window.scrollBy({ top: round % 2 ? -240 : 240, behavior: 'instant' });
        } catch (_) {}
      }
      return scrollables.length;
    }

    async function cWaitForGeneratedImages(baselineKeys, expectedCount = 0, promptText = '') {
      cStatusText.textContent = 'GPT正在生成图片…';
      const timeout = Number(cSettings.generationTimeout) || C_DEFAULT_SETTINGS.generationTimeout;
      const stableNeed = Math.max(5, Number(cSettings.stableSeconds) || C_DEFAULT_SETTINGS.stableSeconds) * 1000;
      const started = Date.now();
      const collected = new Map();
      let collectSequence = 0;
      let lastSignature = '';
      let stableSince = 0;
      let sawStop = false;
      let lastLogAt = 0;
      let round = 0;
      let completionFirstSeenAt = 0;
      let shortageLogged = false;
      let lastCount = -1;
      let lastCountChangeAt = Date.now();
      let stopGoneSince = 0;
      const refreshFlags = (cState.resumeContext && cState.resumeContext.flags) ? cState.resumeContext.flags : {};
      const inRefreshRecovery = Boolean(cState.resumeContext?.kind === 'generation-refresh');
      const postCompleteSweepMs = inRefreshRecovery ? 120000 : 60000;
      let lastActiveRecoveryAt = 0;
      let activeRecoveryPass = 0;
      let finalDeepRecoveryDone = false;
      let finalDeepRecoveryAt = 0;

      while (Date.now() - started < timeout) {
        if (!cState.running) throw new CPausedError();
        const stopVisible = cIsStopButtonVisible();
        if (stopVisible) {
          sawStop = true;
          stopGoneSince = 0;
        } else if (sawStop && !stopGoneSince) {
          stopGoneSince = Date.now();
        }

        const current = cGeneratedImages(promptText)
          .filter(item => !baselineKeys.has(cImageKey(item)))
          .filter(item => item.img.complete && (item.img.naturalWidth || item.width) >= 128 && (item.img.naturalHeight || item.height) >= 128);

        for (const item of current) {
          const key = cImageKey(item);
          if (!collected.has(key)) {
            item.firstSeenOrder = collectSequence++;
            collected.set(key, item);
          } else {
            const old = collected.get(key);
            item.firstSeenOrder = old.firstSeenOrder;
            // 优先保留分辨率或显示面积更大的同一资源版本。
            const oldQuality = (old.width || 0) * (old.height || 0) + (old.displayArea || 0);
            const newQuality = (item.width || 0) * (item.height || 0) + (item.displayArea || 0);
            if (newQuality > oldQuality) collected.set(key, item);
          }
        }

        const ready = cNormalizeGalleryImages([...collected.values()], expectedCount);
        const signature = ready.map(cImageKey).join('|');
        const completion = cGenerationCompletionState(promptText);
        const elapsed = Date.now() - started;

        if (ready.length !== lastCount) {
          lastCount = ready.length;
          lastCountChangeAt = Date.now();
          cState.detectedGeneratedCount = ready.length;
          cState.expectedGeneratedCount = expectedCount;
          cState.generatedCountChangedAt = Date.now();
          cSaveState();
        }
        const countStableFor = Date.now() - lastCountChangeAt;

        if (completion.complete && !completionFirstSeenAt) completionFirstSeenAt = Date.now();

        if (signature !== lastSignature) {
          lastSignature = signature;
          stableSince = ready.length ? Date.now() : 0;
          cLog(`生成检测：已发现 ${ready.length}${expectedCount ? `/${expectedCount}` : ''} 张当前任务图片`, 'info');
        } else if (ready.length && !stableSince) {
          stableSince = Date.now();
        }

        const stateLabel = `${completion.hasFinishTime ? '用时标志' : '-'}|${completion.hasEdit ? '编辑' : '-'}|${completion.hasDownload ? '下载' : '-'}|${stopVisible ? '生成中' : '未生成'}`;
        if (Date.now() - lastLogAt >= 15000) {
          cLog(`生图进度：${ready.length}/${expectedCount || '?'}；状态：${stateLabel}；当前数量已停留 ${Math.floor(countStableFor / 1000)} 秒`, 'info');
          lastLogAt = Date.now();
        }

        const stableFor = stableSince ? Date.now() - stableSince : 0;
        const reachedExpected = expectedCount <= 0 || ready.length >= expectedCount;
        const missingExpected = expectedCount > 0 && ready.length < expectedCount;

        if (missingExpected && completion.complete && !shortageLogged) {
          shortageLogged = true;
          cLog(`页面已显示生成完成，但当前仅识别 ${ready.length}/${expectedCount} 张。正在继续遍历右侧缩略图列表并等待 Chrome 懒加载，不会立即按少图结束。`, 'warn');
        }


        const needActiveRecovery = missingExpected && (completion.complete || inRefreshRecovery || ready.length > 0);
        if (needActiveRecovery && Date.now() - lastActiveRecoveryAt >= 12000) {
          lastActiveRecoveryAt = Date.now();
          await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, true);
        }

        const composerIdle = !stopVisible && !cIsSendButtonBusy();
        const stopGoneFor = stopGoneSince ? Date.now() - stopGoneSince : 0;
        const alreadySyncedAfterZero = Boolean(
          refreshFlags.finishedButHiddenRefreshDone
          || refreshFlags.idleZeroRefreshDone
          || refreshFlags.zeroImageRefreshDone
        );

        // ChatGPT 偶发：服务器已经生成完成，但前端没有把 assistant 回复/图库挂到 DOM。
        // 如果本轮确实出现过“停止生成”按钮，随后按钮恢复且仍 0 图，优先刷新同步，绝不重发。
        if (ready.length === 0 && sawStop && composerIdle && stopGoneFor >= 20000 && !refreshFlags.finishedButHiddenRefreshDone) {
          return cTriggerRefreshAndResume(
            '检测到生成按钮已恢复，但页面仍未渲染任何生成图；判定为前端回复可能未挂载，刷新页面同步服务器结果',
            'finishedButHiddenRefreshDone',
          );
        }

        if (!completion.complete && stopVisible && elapsed >= 360000 && countStableFor >= 90000 && !refreshFlags.noFinishRefreshDone) {
          return cTriggerRefreshAndResume('生成已持续约6分钟，且图片数量 90 秒没有变化（仍在生成中）', 'noFinishRefreshDone');
        }

        // 没有任何图片、页面也已空闲时，不再判定“静默中断并重发”。
        // 已确认发送成功的批次必须保持 at-most-once：先刷新同步，再决定待确认。
        if (ready.length === 0 && composerIdle && elapsed >= 360000 && countStableFor >= 60000 && !alreadySyncedAfterZero) {
          return cTriggerRefreshAndResume(
            '已发送任务约6分钟仍为0图，但页面已恢复空闲；为避免重复生成，先刷新页面同步已有回复，不重新发送',
            'idleZeroRefreshDone',
          );
        }

        if (ready.length === 0 && composerIdle && alreadySyncedAfterZero && elapsed >= 180000 && countStableFor >= 60000) {
          if (!finalDeepRecoveryDone) {
            finalDeepRecoveryDone = true;
            finalDeepRecoveryAt = Date.now();
            cLog('刷新同步观察期结束但仍为0图，开始最终深度恢复扫描：重新定位当前批次回复并完整遍历懒加载图库', 'warn');
            for (let pass = 0; pass < 6; pass += 1) {
              await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, pass > 0);
              await cSleep(800);
            }
            lastCountChangeAt = Date.now();
            continue;
          }
          if (Date.now() - finalDeepRecoveryAt >= 30000) {
            cLog('刷新同步 + 最终深度扫描后仍未检测到生成图。为避免重复生成，本批不再自动发送，将以0图异常进入待确认。', 'warn');
            return ready;
          }
        }

        if (ready.length === 0 && elapsed >= 600000 && !refreshFlags.zeroImageRefreshDone && !alreadySyncedAfterZero) {
          return cTriggerRefreshAndResume('长时间仍未检测到生成图，准备刷新页面后继续检测', 'zeroImageRefreshDone');
        }

        // 只有数量达到计划值时，完成标志才允许直接结束。
        if (ready.length && completion.complete && reachedExpected && stableFor >= 5000) {
          cLog(`检测到生图完成标志（${stateLabel}），并已收齐 ${ready.length}/${expectedCount || ready.length} 张，开始下载`, 'success');
          return expectedCount > 0 ? ready.slice(0, expectedCount) : ready;
        }
        if (expectedCount > 0 && ready.length >= expectedCount && !stopVisible && stableFor >= Math.min(stableNeed, 10000)) {
          cLog(`已检测到目标数量 ${expectedCount} 张，且页面不再生成，开始下载`, 'success');
          return ready.slice(0, expectedCount);
        }
        if (ready.length && sawStop && !stopVisible && reachedExpected && stableFor >= Math.min(stableNeed, 8000)) {
          cLog('生成按钮已由停止状态恢复，目标图片数量已收齐，开始下载', 'success');
          return expectedCount > 0 ? ready.slice(0, expectedCount) : ready;
        }
        if (ready.length && !stopVisible && elapsed >= 90000 && reachedExpected && stableFor >= stableNeed) {
          cLog('未检测到标准完成文字，但目标图片数量已收齐且页面不再生成，按完成处理', 'warn');
          return expectedCount > 0 ? ready.slice(0, expectedCount) : ready;
        }

        // Chrome 下生成完成后，虚拟缩略图列表可能仍少挂载最后1张。
        // 在完成后的45秒内反复扫完整个缩略图栏，给最后一张进入DOM和加载的机会。
        const inPostCompleteRecovery = missingExpected && completionFirstSeenAt
          && Date.now() - completionFirstSeenAt < postCompleteSweepMs;
        cScrollGeneratedGallery(promptText, round++, inPostCompleteRecovery);

        if (missingExpected && completionFirstSeenAt
          && Date.now() - completionFirstSeenAt >= postCompleteSweepMs
          && (ready.length === 0 || stableFor >= 12000)) {
          if (!finalDeepRecoveryDone) {
            finalDeepRecoveryDone = true;
            finalDeepRecoveryAt = Date.now();
            cLog(`完成后已主动遍历图库 ${Math.round(postCompleteSweepMs / 1000)} 秒，目前 ${ready.length}/${expectedCount}；进入最后一次深度扫描，避免把已生成但未挂载的图片误判为缺图。`, 'warn');
            for (let pass = 0; pass < 5; pass += 1) {
              await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, pass > 0);
              await cSleep(750);
            }
            lastCountChangeAt = Date.now();
            continue;
          }
          if (Date.now() - finalDeepRecoveryAt >= 20000) {
            cLog(`最终深度扫描后仍只识别 ${ready.length}/${expectedCount} 张。按异常批次保存现有结果并进入待确认。`, 'warn');
            return ready;
          }
        }

        await cSleep(inPostCompleteRecovery ? 900 : 1200);
      }

      const fallback = cNormalizeGalleryImages([...collected.values()], expectedCount);
      if (fallback.length) {
        cLog(`等待超时，但已检测到 ${fallback.length} 张当前任务图片，保存现有结果`, 'warn');
        return fallback;
      }
      throw new Error(`等待生图超时（${Math.round(timeout / 60000)}分钟），未检测到当前任务的可下载图片`);
    }

    function cFetchBlob(url, timeout = 120000) {
      if (/^(?:blob:|data:)/i.test(url)) return fetch(url).then(response => {
        if (!response.ok) throw new Error(`图片读取失败：HTTP ${response.status}`);
        return response.blob();
      });
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          timeout,
          headers: { Referer: location.href, Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8' },
          onload(response) {
            if (response.status >= 200 && response.status < 300 && response.response instanceof Blob && response.response.size) resolve(response.response);
            else reject(new Error(`生成图下载失败：HTTP ${response.status || '未知'}`));
          },
          ontimeout: () => reject(new Error('生成图下载超时')),
          onerror: () => reject(new Error('生成图下载网络错误')),
        });
      });
    }

    function cSanitizeName(name) {
      return String(name).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').slice(0, 150) || 'generated';
    }

    function cExtension(blob, url) {
      const type = blob?.type || '';
      if (/png/i.test(type)) return 'png';
      if (/webp/i.test(type)) return 'webp';
      if (/jpe?g/i.test(type)) return 'jpg';
      const match = String(url).match(/\.(png|webp|jpe?g)(?:[?#]|$)/i);
      return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
    }

    async function cWriteBlob(directoryHandle, fileName, blob) {
      if ((await cPermission(directoryHandle, 'readwrite', false)) !== 'granted') throw new Error('成品文件夹写入权限已失效，请重新选择');
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    }

    async function cDownloadGenerated(items, batchPaths, batchNo) {
      const output = await cGetHandle(C_OUTPUT_DIR_KEY);
      if (!output) throw new Error('没有选择成品文件夹');
      cStatusText.textContent = `正在保存 ${items.length} 张生成图…`;
      const saved = [];
      for (let i = 0; i < items.length; i += 1) {
        if (!cState.running) throw new CPausedError();
        const item = items[i];
        const blob = await cFetchBlob(item.url);
        const ext = cExtension(blob, item.url);
        let base;
        if (items.length === batchPaths.length) {
          // 模块1保存的原图名为“SKU.jpg”，生成图改为“SKU_XT.ext”。
          const sourceName = batchPaths[i].split('/').pop().replace(/\.[^.]+$/, '');
          const skuName = sourceName.replace(/_XT(?:_\d+)?$/i, '');
          base = `${skuName}_XT`;
        } else if (batchPaths.length === 1) {
          // 单个SKU生成多张图时，避免覆盖：SKU_XT、SKU_XT_02、SKU_XT_03……
          const sourceName = batchPaths[0].split('/').pop().replace(/\.[^.]+$/, '');
          const skuName = sourceName.replace(/_XT(?:_\d+)?$/i, '');
          base = i === 0 ? `${skuName}_XT` : `${skuName}_XT_${String(i + 1).padStart(2, '0')}`;
        } else {
          // 多SKU批次的生成数量不一致时无法可靠判断对应关系，保留批次名防止错配SKU。
          base = `批次${String(batchNo).padStart(3, '0')}_生成${String(i + 1).padStart(2, '0')}_XT`;
          if (i === 0) cLog(`本批输入 ${batchPaths.length} 张、检测到 ${items.length} 张生成图，数量不一致，无法可靠按SKU对应，已改用批次名。`, 'warn');
        }
        const fileName = `${cSanitizeName(base)}.${ext}`;
        await cWriteBlob(output, fileName, blob);
        saved.push(fileName);
        cLog(`${fileName} 已保存`, 'success');
      }
      return saved;
    }


    function cSkuFromPath(path) {
      const sourceName = String(path || '').split('/').pop().replace(/\.[^.]+$/, '');
      return sourceName.replace(/_XT(?:_\d+)?$/i, '') || sourceName || '未知SKU';
    }

    function cQueueTimeStamp(date = new Date()) {
      const pad = value => String(value).padStart(2, '0');
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    }

    async function cDownloadAbnormalGenerated(items, batchNo) {
      const output = await cGetHandle(C_OUTPUT_DIR_KEY);
      if (!output) throw new Error('没有选择成品文件夹');
      const stamp = cQueueTimeStamp();
      const saved = [];
      const saveErrors = [];
      cStatusText.textContent = `异常批次：正在临时保存 ${items.length} 张生成图…`;

      for (let i = 0; i < items.length; i += 1) {
        if (!cState.running) throw new CPausedError();
        const item = items[i];
        const base = `待确认_批次${String(batchNo).padStart(3, '0')}_生成${String(i + 1).padStart(2, '0')}_XT_${stamp}`;
        try {
          const blob = await cFetchBlob(item.url);
          const ext = cExtension(blob, item.url);
          const fileName = `${cSanitizeName(base)}.${ext}`;
          await cWriteBlob(output, fileName, blob);
          saved.push(fileName);
          cLog(`${fileName} 已作为待确认图片保存`, 'success');
        } catch (error) {
          const message = error?.message || String(error);
          saveErrors.push({ order: i + 1, url: item?.url || '', error: message });
          cLog(`异常批次第 ${i + 1} 张生成图保存失败：${message}`, 'error');
        }
      }
      return { saved, saveErrors };
    }

    function cRecordPendingBatch({ batchNo, batchPaths, generated, saved, saveErrors, reason, phase, recovered = false }) {
      const now = new Date();
      const entry = {
        id: `pending-${batchNo}-${now.getTime()}`,
        batchNo,
        sourceCount: batchPaths.length,
        sourceFiles: batchPaths.map((path, index) => ({
          order: index + 1,
          path,
          fileName: String(path).split('/').pop(),
          sku: cSkuFromPath(path),
        })),
        generatedCount: generated.length,
        generatedFiles: saved.map((fileName, index) => ({ order: index + 1, fileName })),
        saveErrors: saveErrors || [],
        reason: String(reason || '未知异常'),
        phase: phase || cState.phase || 'unknown',
        recovered: Boolean(recovered),
        time: now.toISOString(),
      };
      cState.pendingQueue.push(entry);
      return entry;
    }

    function cIsFatalBatchError(error) {
      if (error instanceof CPausedError) return true;
      const message = String(error?.message || error || '');
      return /(?:权限|重新选择|没有选择|文件夹|固定提示词|输入框|创建图片|发送按钮|没有找到.*按钮|附件|上传|upload limit|too many files|达到.*限制|网络错误|写入权限|无法打开文件授权数据库|无法读取文件授权)/i.test(message);
    }

    function cCollectCurrentGeneratedForPending(promptText = '') {
      const items = cGeneratedImages(promptText)
        .filter(item => item?.img?.complete && (item.img.naturalWidth || item.width) >= 128 && (item.img.naturalHeight || item.height) >= 128);
      // 不传 expectedCount，避免异常批次被强制裁成计划数量。
      return cNormalizeGalleryImages(items, 0);
    }

    async function cFinalizePendingBatch(batchPaths, generated, reason, options = {}) {
      const batchNo = cState.batchNo;
      const phase = options.phase || cState.phase || 'generating';
      const recovered = Boolean(options.recovered);
      const uniqueGenerated = cNormalizeGalleryImages(generated || [], 0);
      const { saved, saveErrors } = await cDownloadAbnormalGenerated(uniqueGenerated, batchNo);
      const entry = cRecordPendingBatch({
        batchNo,
        batchPaths,
        generated: uniqueGenerated,
        saved,
        saveErrors,
        reason,
        phase,
        recovered,
      });

      cState.results.push({
        batchNo,
        sourceFiles: [...batchPaths],
        generatedCount: uniqueGenerated.length,
        savedFiles: [...saved],
        abnormal: true,
        pendingId: entry.id,
        reason: entry.reason,
        recovered,
        time: entry.time,
      });
      cState.resumeContext = null;
      cState.phase = 'pending';
      cFinishBatchTimers();
      cState.index += batchPaths.length;
      cState.batchNo += 1;
      cState.currentBatch = [];
      cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
      cSaveState();
      cLog(`第 ${batchNo} 批已加入待确认队列：原图 ${batchPaths.length} 张，生成图 ${uniqueGenerated.length} 张，已临时保存 ${saved.length} 张。异常原因：${entry.reason}`, 'warn');
      cLog('异常批次不重置、不重发，脚本将直接继续下一批。', 'warn');
      return true;
    }

    function cCsvCell(value) {
      const text = String(value ?? '').replace(/\r?\n/g, ' ');
      return `"${text.replace(/"/g, '""')}"`;
    }

    function cExportPendingQueue() {
      const queue = Array.isArray(cState.pendingQueue) ? cState.pendingQueue : [];
      if (!queue.length) {
        cLog('当前没有待确认异常批次。', 'warn');
        if (cStatusText) cStatusText.textContent = '当前没有待确认异常批次';
        return;
      }
      const rows = [[
        '批次', '原图数量', '原图顺序_SKU_文件', '生成图数量', '临时生成图文件', '保存失败', '异常原因', '异常阶段', '记录时间'
      ]];
      for (const item of queue) {
        const sources = (item.sourceFiles || []).map(x => `${x.order}:${x.sku}:${x.fileName || x.path}`).join('；');
        const generated = (item.generatedFiles || []).map(x => `${x.order}:${x.fileName}`).join('；');
        const failures = (item.saveErrors || []).map(x => `${x.order}:${x.error}`).join('；');
        rows.push([
          item.batchNo,
          item.sourceCount,
          sources,
          item.generatedCount,
          generated,
          failures,
          item.reason,
          item.phase,
          item.time,
        ]);
      }
      const csv = '\uFEFF' + rows.map(row => row.map(cCsvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ChatGPT待确认队列_${cQueueTimeStamp()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      cLog(`已导出 ${queue.length} 个待确认异常批次`, 'success');
    }

    async function cRecoverCurrentGenerated() {
      cSettings.prompt = String(cPanel.querySelector('[data-role="prompt"]').value || '').trim();
      cSaveSettings();
      if (!cSettings.prompt) throw new Error('请先填写与当前任务一致的固定提示词');
      await cValidateHandles(true);
      if (!cState.imagePaths.length) await cScanImages();

      const batchSize = Math.max(1, Math.min(20, Number(cSettings.batchSize) || 10));
      const storedBatch = Array.isArray(cState.currentBatch) ? cState.currentBatch.filter(Boolean) : [];
      const latestPending = [...(cState.pendingQueue || [])].reverse().find(entry =>
        entry && Array.isArray(entry.sourceFiles) && entry.sourceFiles.some(file => file?.path)
      ) || null;

      let recoveringPending = null;
      let batchPaths = storedBatch.length ? storedBatch : cState.imagePaths.slice(cState.index, cState.index + batchSize);
      // 当进度已经到末尾、当前批次已被误判进待确认队列时，允许“检测当前成图”
      // 直接恢复最近一个待确认批次，不要求清空进度或重新发送。
      if (!batchPaths.length && latestPending) {
        recoveringPending = latestPending;
        batchPaths = latestPending.sourceFiles.map(file => file?.path).filter(Boolean);
      }
      if (!batchPaths.length) throw new Error('当前没有可恢复的批次');

      const recoverBatchNo = recoveringPending?.batchNo || cState.batchNo;
      cState.running = true;
      cState.phase = 'recovering';
      if (!recoveringPending) cState.currentBatch = batchPaths;
      cSaveState();
      cLog(`开始检测当前对话中的已生成图片，目标 ${batchPaths.length} 张${recoveringPending ? `（恢复待确认第 ${recoverBatchNo} 批）` : ''}`, 'info');

      try {
        const generated = await cWaitForGeneratedImages(new Set(), batchPaths.length, cSettings.prompt);
        if (generated.length !== batchPaths.length && batchPaths.length > 1) {
          if (recoveringPending) {
            cState.running = false;
            cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
            cSaveState();
            cLog(`待确认第 ${recoverBatchNo} 批恢复检测仍为 ${generated.length}/${batchPaths.length} 张，保留原待确认记录，不重复新增、不推进进度。`, 'warn');
            return;
          }
          await cFinalizePendingBatch(
            batchPaths,
            generated,
            `恢复检测时生成数量不一致：计划 ${batchPaths.length} 张，实际检测到 ${generated.length} 张；无法可靠按SKU对应。`,
            { phase: 'recovering', recovered: true },
          );
          cState.running = false;
          cSaveState();
          return;
        }

        const saved = await cDownloadGenerated(generated, batchPaths, recoverBatchNo);
        if (recoveringPending) {
          cState.pendingQueue = (cState.pendingQueue || []).filter(entry => entry?.id !== recoveringPending.id);
          const result = (cState.results || []).find(item => item?.pendingId === recoveringPending.id);
          if (result) {
            result.abnormal = false;
            result.resolved = true;
            result.recovered = true;
            result.generatedCount = generated.length;
            result.savedFiles = [...saved];
            result.resolvedTime = new Date().toISOString();
          } else {
            cState.results.push({
              batchNo: recoverBatchNo,
              sourceFiles: batchPaths,
              generatedCount: generated.length,
              savedFiles: saved,
              recovered: true,
              resolvedPendingId: recoveringPending.id,
              time: new Date().toISOString(),
            });
          }
          cState.running = false;
          cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
          cSaveState();
          cLog(`待确认第 ${recoverBatchNo} 批恢复完成：检测 ${generated.length} 张，保存 ${saved.length} 张，已从待确认队列移除`, 'success');
          return;
        }

        cState.results.push({
          batchNo: cState.batchNo,
          sourceFiles: batchPaths,
          generatedCount: generated.length,
          savedFiles: saved,
          recovered: true,
          time: new Date().toISOString(),
        });
        cState.index += batchPaths.length;
        cState.batchNo += 1;
        cState.currentBatch = [];
        cState.running = false;
        cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
        cSaveState();
        cLog(`当前成图恢复完成：检测 ${generated.length} 张，保存 ${saved.length} 张`, 'success');
      } catch (error) {
        cState.running = false;
        cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'error';
        cSaveState();
        throw error;
      }
    }

    async function cValidateHandles(request = true) {
      const [source, template, output] = await Promise.all([
        cGetHandle(C_SOURCE_DIR_KEY),
        cGetHandle(C_TEMPLATE_KEY),
        cGetHandle(C_OUTPUT_DIR_KEY),
      ]);
      if (!source) throw new Error('请先选择原图文件夹');
      if (!template) throw new Error('请先选择模板图');
      if (!output) throw new Error('请先选择成品文件夹');
      if ((await cPermission(source, 'read', request)) !== 'granted') throw new Error('没有原图文件夹读取权限');
      if ((await cPermission(template, 'read', request)) !== 'granted') throw new Error('没有模板图读取权限');
      if ((await cPermission(output, 'readwrite', request)) !== 'granted') throw new Error('没有成品文件夹写入权限');
      return { source, template, output };
    }

    async function cProcessBatch() {
      const handles = await cValidateHandles(false);
      const batchSize = Math.max(1, Math.min(20, Number(cSettings.batchSize) || 10));
      const batchPaths = cState.imagePaths.slice(cState.index, cState.index + batchSize);
      if (!batchPaths.length) return false;

      const continuingSameBatch = cSameBatchPaths(cState.currentBatch || [], batchPaths) && Boolean(cState.batchStartedAt);
      cState.currentBatch = batchPaths;
      if (!continuingSameBatch) {
        cState.batchStartedAt = Date.now();
        cState.generationStartedAt = 0;
        cState.detectedGeneratedCount = 0;
        cState.generatedCountChangedAt = Date.now();
      }
      cState.expectedGeneratedCount = batchPaths.length;
      cState.phase = 'preparing';
      cSaveState();

      let generalRetryCount = 0;
      let uploadRetryCount = 0;
      let mode = (cState.resumeContext && cState.resumeContext.kind === 'generation-refresh' && cSameBatchPaths(batchPaths, cState.resumeContext.batchPaths || batchPaths))
        ? 'detect-only'
        : 'full';
      let silentResendUsed = Boolean(cState.resumeContext?.flags?.silentResendDone);
      let newChatPrepared = false;
      let executionNo = 0;

      while (true) {
        executionNo += 1;
        let promptSent = mode !== 'full';
        try {
          if (executionNo === 1) {
            cLog(`开始处理第 ${cState.batchNo} 批，共 ${batchPaths.length} 张原图`, 'success');
          } else {
            cLog(`第 ${cState.batchNo} 批再次执行：第 ${executionNo} 次（${mode === 'detect-only' ? '仅恢复检测' : '完整重新执行本批'}）`, 'warn');
          }

          let baselineKeys = new Set();

          if (mode === 'full') {
            // 每批只在第一次正式执行时新建对话；上传失败后的重试必须留在当前对话，先清空再重传。
            if (cSettings.newChatEachBatch && !newChatPrepared) {
              await cGoNewChat();
              newChatPrepared = true;
            }
            baselineKeys = new Set(cGeneratedImages().map(cImageKey));
            const sourceFiles = [];
            for (const path of batchPaths) sourceFiles.push(await cGetFileByPath(handles.source, path));
            const templateFile = await handles.template.getFile();

            cState.phase = 'uploading_source'; cSaveState();
            await cUploadFiles(sourceFiles, '原图');
            cState.phase = 'activating_create_image'; cSaveState();
            await cActivateCreateImage();
            cState.phase = 'uploading_template'; cSaveState();
            const expectedAttachmentCount = await cUploadFiles([templateFile], '模板图');
            cState.phase = 'writing_prompt'; cSaveState();
            await cSetPrompt(cSettings.prompt);
            cState.phase = 'sending'; cSaveState();
            await cSendPrompt(expectedAttachmentCount, cSettings.prompt);
            promptSent = true;
            if (!cState.generationStartedAt) cState.generationStartedAt = Date.now();
            if (!cState.generatedCountChangedAt) cState.generatedCountChangedAt = Date.now();
            cState.expectedGeneratedCount = batchPaths.length;
            cState.phase = 'generating';
            cSaveState();
          } else {
            baselineKeys = new Set();
            promptSent = true;
            if (!cState.generationStartedAt) cState.generationStartedAt = Date.now();
            if (!cState.generatedCountChangedAt) cState.generatedCountChangedAt = Date.now();
            cState.expectedGeneratedCount = batchPaths.length;
            cState.phase = 'generating';
            cSaveState();
            if (cState.resumeContext?.kind === 'generation-refresh') {
              cLog(`已按刷新恢复机制回到第 ${cState.batchNo} 批，等待 10 秒让对话主体稳定，随后主动定位当前批次回复并扫描图库`, 'warn');
              await cSleep(10000);
              await cPrimeRefreshRecovery(cSettings.prompt, batchPaths.length);
            } else {
              cLog('当前批次此前已经发送成功，本次只继续等待/恢复检测结果，不会重新发送提示词', 'warn');
              await cSleep(2000);
            }
          }

          const generated = await cWaitForGeneratedImages(baselineKeys, batchPaths.length, cSettings.prompt);
          cState.resumeContext = null;

          if (generated.length !== batchPaths.length && batchPaths.length > 1) {
            return cFinalizePendingBatch(
              batchPaths,
              generated,
              `生成数量不一致：计划 ${batchPaths.length} 张，实际检测到 ${generated.length} 张；无法确定缺少的是哪个SKU，禁止按顺序强行命名。`,
              { phase: 'generating' },
            );
          }

          cState.detectedGeneratedCount = generated.length;
          cState.expectedGeneratedCount = batchPaths.length;
          cState.phase = 'downloading';
          cSaveState();
          const saved = await cDownloadGenerated(generated, batchPaths, cState.batchNo);
          cState.results.push({
            batchNo: cState.batchNo,
            sourceFiles: batchPaths,
            generatedCount: generated.length,
            savedFiles: saved,
            time: new Date().toISOString(),
          });
          cFinishBatchTimers();
          cState.index += batchPaths.length;
          cState.batchNo += 1;
          cState.currentBatch = [];
          cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
          cSaveState();
          cLog(`本批完成：输入 ${batchPaths.length} 张，下载 ${saved.length} 张`, 'success');
          return true;
        } catch (error) {
          if (error instanceof CPausedError) {
            cState.resumeContext = null;
            throw error;
          }

          // 上传网络失败单独处理：清空本批全部附件，然后从原图开始完整重传。
          if (error instanceof CUploadRetryableError) {
            if (uploadRetryCount >= 2) {
              cState.resumeContext = null;
              cState.running = false;
              cState.phase = 'error';
              cSaveState();
              cLog(`第 ${cState.batchNo} 批上传连续重试 2 次仍失败：${error.message || error}`, 'error');
              throw new Error(`当前批次上传连续重试2次仍失败，已暂停且未推进进度。最后错误：${error.message || error}`);
            }

            uploadRetryCount += 1;
            cLog(`第 ${cState.batchNo} 批检测到网络/附件上传失败，准备第 ${uploadRetryCount}/2 次上传重试`, 'warn');
            await cClearComposerForUploadRetry();
            cState.phase = 'preparing';
            cSaveState();
            mode = 'full';
            promptSent = false;
            await cSleep(1500);
            continue;
          }

          if (cIsFatalBatchError(error)) {
            cState.resumeContext = null;
            throw error;
          }

          if (error instanceof CSilentGenerationAbortError) {
            const partial = cCollectCurrentGeneratedForPending(cSettings.prompt);
            cState.resumeContext = null;
            cLog('检测到发送后的静默异常。V3.0.36 起禁止自动重发已提交批次，转入待确认以避免重复生成。', 'warn');
            return cFinalizePendingBatch(
              batchPaths,
              partial,
              `已发送任务后出现静默异常：${error?.message || String(error)}；为避免重复生成，本批未自动重发。`,
              { phase: cState.phase || 'generating' },
            );
          }

          if (generalRetryCount === 0) {
            cLog(`当前批次遇到异常：${error?.message || String(error)}，正在尝试自动恢复一次`, 'warn');
            generalRetryCount += 1;
            mode = promptSent ? 'detect-only' : 'full';
            continue;
          }

          if (!promptSent && cState.phase !== 'generating') {
            cState.resumeContext = null;
            throw error;
          }

          const partial = cCollectCurrentGeneratedForPending(cSettings.prompt);
          cState.resumeContext = null;
          return cFinalizePendingBatch(
            batchPaths,
            partial,
            `生图阶段发生异常：${error?.message || String(error)}；已保存当前能检测到的生成图并转入待确认。`,
            { phase: cState.phase || 'generating' },
          );
        }
      }
    }

    async function cWorker() {
      if (cWorkerActive || !cState.running) return;
      cWorkerActive = true;
      try {
        while (cState.running && cState.index < cState.imagePaths.length) {
          const processed = await cProcessBatch();
          if (!processed) break;
          if (cState.running && cState.index < cState.imagePaths.length) {
            const continueNext = await cWaitBetweenBatches();
            if (!continueNext) break;
          }
        }
        if (cState.running && cState.index >= cState.imagePaths.length) {
          cStopRunClock();
          cState.running = false;
          cState.phase = 'done';
          cSaveState();
          const pendingCount = Array.isArray(cState.pendingQueue) ? cState.pendingQueue.length : 0;
          cLog(`全部完成，共处理 ${cState.imagePaths.length} 张原图；待确认异常批次 ${pendingCount} 个`, pendingCount ? 'warn' : 'success');
          if (cStatusText) cStatusText.textContent = pendingCount ? `全部完成；待确认 ${pendingCount} 批` : '全部完成';
        }
      } catch (error) {
        if (error instanceof CPausedError) {
          cLog('任务已暂停', 'warn');
        } else {
          cStopRunClock();
          cState.running = false;
          cState.phase = 'error';
          cSaveState();
          cLog(error.message || String(error), 'error');
          cLog('任务已暂停；可检查页面后点击“开始/继续”重试当前批次。', 'warn');
          if (cStatusText) cStatusText.textContent = `任务已暂停：${error.message || error}`;
        }
      } finally {
        cWorkerActive = false;
        cUpdatePanel();
      }
    }

    async function cStart() {
      cSettings.prompt = String(cPanel.querySelector('[data-role="prompt"]').value || '').trim();
      cSettings.batchSize = Math.max(1, Math.min(20, Number(cPanel.querySelector('[data-setting="batchSize"]').value) || 10));
      cSettings.stableSeconds = Math.max(5, Number(cPanel.querySelector('[data-setting="stableSeconds"]').value) || 15);
      cSettings.generationTimeout = Math.max(60000, Number(cPanel.querySelector('[data-setting="generationMinutes"]').value || 15) * 60000);
      let intervalMinSeconds = Math.max(0, Number(cPanel.querySelector('[data-setting="intervalMinSeconds"]').value));
      let intervalMaxSeconds = Math.max(0, Number(cPanel.querySelector('[data-setting="intervalMaxSeconds"]').value));
      if (!Number.isFinite(intervalMinSeconds)) intervalMinSeconds = C_DEFAULT_SETTINGS.intervalMin / 1000;
      if (!Number.isFinite(intervalMaxSeconds)) intervalMaxSeconds = C_DEFAULT_SETTINGS.intervalMax / 1000;
      if (intervalMaxSeconds < intervalMinSeconds) {
        [intervalMinSeconds, intervalMaxSeconds] = [intervalMaxSeconds, intervalMinSeconds];
        cLog(`批次随机等待的最大/最小值填写反了，已自动调整为 ${intervalMinSeconds} - ${intervalMaxSeconds} 秒`, 'warn');
      }
      cSettings.intervalMin = Math.round(intervalMinSeconds * 1000);
      cSettings.intervalMax = Math.round(intervalMaxSeconds * 1000);
      cPanel.querySelector('[data-setting="intervalMinSeconds"]').value = intervalMinSeconds;
      cPanel.querySelector('[data-setting="intervalMaxSeconds"]').value = intervalMaxSeconds;
      cSettings.newChatEachBatch = cPanel.querySelector('[data-setting="newChatEachBatch"]').checked;
      cSaveSettings();
      if (!cSettings.prompt) {
        cLog('请先填写固定提示词。', 'warn');
        if (cStatusText) cStatusText.textContent = '请先填写固定提示词';
        return;
      }
      await cValidateHandles(true);
      if (!cState.imagePaths.length) await cScanImages();
      if (cState.index >= cState.imagePaths.length) {
        cState.index = 0;
        cState.batchNo = 1;
        cState.results = [];
        cState.startedAt = 0;
        cState.totalRunMs = 0;
        cState.runSegmentStartedAt = 0;
        cState.lastBatchElapsedMs = 0;
        cState.lastGenerationElapsedMs = 0;
        cFinishBatchTimers();
      }
      cState.running = true;
      cState.phase = 'ready';
      cStartRunClock();
      cSaveState();
      cLog(`任务开始：${cState.imagePaths.length} 张原图，每批 ${cSettings.batchSize} 张`, 'success');
      cWorker();
    }

    function cPause() {
      cStopRunClock();
      cState.running = false;
      cSaveState();
      cLog('已请求暂停；当前页面操作结束后停止', 'warn');
    }

    function cSkipBatch() {
      if (!cState.imagePaths.length) return;
      const batchSize = Math.max(1, Number(cSettings.batchSize) || 10);
      const skipped = cState.imagePaths.slice(cState.index, cState.index + batchSize);
      cStopRunClock();
      cFinishBatchTimers();
      cState.running = false;
      cState.index += skipped.length;
      cState.batchNo += 1;
      cState.currentBatch = [];
      cState.phase = 'ready';
      cSaveState();
      cLog(`已跳过 ${skipped.length} 张：${skipped.join('、')}`, 'warn');
    }

    async function cReset() {
      if (!confirm('确定清空ChatGPT模块的进度、结果和待确认队列吗？已保存到文件夹的图片不会删除。')) return;
      cState = { ...C_DEFAULT_STATE };
      GM_deleteValue(C_STATE_KEY);
      cSaveState();
      cLog('任务记录已清空', 'warn');
    }

    async function cForgetFolders() {
      if (!confirm('确定清除原图、模板图和成品文件夹授权吗？')) return;
      await cClearHandles();
      cSourceText.textContent = '未选择';
      cTemplateText.textContent = '未选择';
      cOutputText.textContent = '未选择';
      cLog('文件授权已清除', 'warn');
    }

    function cCreateButton(text, className, onClick) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `kagura-gpt-button ${className || ''}`;
      button.textContent = text;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve(onClick(event)).catch(error => {
          console.error(error);
          cLog(error.message || String(error), 'error');
          if (error?.name !== 'AbortError' && cStatusText) cStatusText.textContent = error.message || String(error);
        });
      });
      return button;
    }

    function cCreateLogWindow() {
      if (cLogWindow && document.contains(cLogWindow)) return cLogWindow;
      GM_addStyle(`
        #kagura-gpt-log-window { position:fixed; z-index:2147483647; left:7vw; top:7vh; width:min(820px,86vw); height:76vh; min-width:420px; min-height:260px; resize:both; overflow:hidden; display:flex; flex-direction:column; background:#0f172a; color:#e5e7eb; border:1px solid #334155; border-radius:12px; box-shadow:0 18px 50px rgba(2,6,23,.45); font:12px/1.5 Consolas,"Microsoft YaHei",monospace; }
        #kagura-gpt-log-window * { box-sizing:border-box; }
        .kagura-log-head { display:flex; align-items:center; gap:10px; padding:9px 10px; background:#111827; border-bottom:1px solid #334155; cursor:move; user-select:none; }
        .kagura-log-title { font-weight:800; color:#fff; white-space:nowrap; }
        .kagura-log-metrics { flex:1; min-width:0; color:#a7f3d0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .kagura-log-head button { border:0; border-radius:6px; min-width:28px; height:26px; background:#334155; color:#fff; cursor:pointer; }
        .kagura-log-toolbar { display:flex; gap:7px; align-items:center; padding:8px 10px; background:#172033; border-bottom:1px solid #334155; }
        .kagura-log-toolbar input[type="search"] { flex:1; min-width:120px; background:#0b1220; color:#fff; border:1px solid #475569; border-radius:7px; padding:6px 8px; }
        .kagura-log-toolbar select { background:#0b1220; color:#fff; border:1px solid #475569; border-radius:7px; padding:6px 8px; }
        .kagura-log-toolbar label { display:flex; align-items:center; gap:5px; white-space:nowrap; color:#cbd5e1; }
        .kagura-log-body { flex:1; min-height:0; overflow:auto; padding:9px 10px; background:#020617; }
        .kagura-log-window-line { padding:2px 0; white-space:pre-wrap; word-break:break-word; border-bottom:1px solid rgba(51,65,85,.22); }
        .kagura-log-window-info { color:#dbeafe; } .kagura-log-window-success { color:#86efac; } .kagura-log-window-warn { color:#fde68a; } .kagura-log-window-error { color:#fda4af; }
        .kagura-log-footer { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; padding:8px 10px; background:#111827; border-top:1px solid #334155; }
        .kagura-log-footer button { border:0; border-radius:7px; padding:7px 10px; background:#334155; color:#fff; cursor:pointer; }
        .kagura-log-footer button[data-danger="1"] { background:#7f1d1d; }
        #kagura-gpt-log-window.kagura-log-max { left:8px !important; top:8px !important; width:calc(100vw - 16px) !important; height:calc(100vh - 16px) !important; resize:none; }
        #kagura-gpt-log-window.kagura-log-min { width:210px !important; height:44px !important; min-width:210px !important; min-height:44px !important; resize:none; }
        #kagura-gpt-log-window.kagura-log-min .kagura-log-toolbar, #kagura-gpt-log-window.kagura-log-min .kagura-log-body, #kagura-gpt-log-window.kagura-log-min .kagura-log-footer, #kagura-gpt-log-window.kagura-log-min .kagura-log-metrics { display:none; }
      `);
      cLogWindow = document.createElement('section');
      cLogWindow.id = 'kagura-gpt-log-window';
      cLogWindow.innerHTML = `
        <div class="kagura-log-head">
          <span class="kagura-log-title">运行日志 V${APP_VERSION}</span>
          <span class="kagura-log-metrics" data-role="metrics"></span>
          <button type="button" data-role="min" title="最小化">—</button>
          <button type="button" data-role="max" title="最大化/恢复">□</button>
          <button type="button" data-role="close" title="关闭">×</button>
        </div>
        <div class="kagura-log-toolbar">
          <input type="search" data-log-filter="search" placeholder="搜索日志关键词…">
          <select data-log-filter="level"><option value="all">全部</option><option value="info">信息</option><option value="success">成功</option><option value="warn">提示</option><option value="error">失败</option></select>
          <label><input type="checkbox" data-role="auto" checked> 自动滚动</label>
        </div>
        <div class="kagura-log-body" data-role="body"></div>
        <div class="kagura-log-footer">
          <button type="button" data-role="copy">复制日志</button>
          <button type="button" data-role="txt">导出 TXT</button>
          <button type="button" data-role="json">导出诊断 JSON</button>
          <button type="button" data-role="clear" data-danger="1">清空日志</button>
        </div>`;
      document.documentElement.appendChild(cLogWindow);
      cLogWindowBody = cLogWindow.querySelector('[data-role="body"]');
      cLogWindowMetrics = cLogWindow.querySelector('[data-role="metrics"]');
      const head = cLogWindow.querySelector('.kagura-log-head');
      cMakeDraggable(cLogWindow, head);
      cLogWindow.querySelector('[data-log-filter="search"]').addEventListener('input', cRenderLogWindow);
      cLogWindow.querySelector('[data-log-filter="level"]').addEventListener('change', cRenderLogWindow);
      cLogWindow.querySelector('[data-role="auto"]').addEventListener('change', event => { cLogAutoScroll = Boolean(event.target.checked); });
      cLogWindow.querySelector('[data-role="copy"]').addEventListener('click', () => cCopyLogs());
      cLogWindow.querySelector('[data-role="txt"]').addEventListener('click', cExportLogsTxt);
      cLogWindow.querySelector('[data-role="json"]').addEventListener('click', cExportDiagnosticJson);
      cLogWindow.querySelector('[data-role="clear"]').addEventListener('click', cClearLogs);
      cLogWindow.querySelector('[data-role="close"]').addEventListener('click', () => { cLogWindow.style.display = 'none'; });
      cLogWindow.querySelector('[data-role="min"]').addEventListener('click', event => {
        event.stopPropagation();
        cLogWindow.classList.toggle('kagura-log-min');
        if (cLogWindow.classList.contains('kagura-log-min')) cLogWindow.classList.remove('kagura-log-max');
      });
      cLogWindow.querySelector('[data-role="max"]').addEventListener('click', event => {
        event.stopPropagation();
        cLogWindow.classList.remove('kagura-log-min');
        cLogWindow.classList.toggle('kagura-log-max');
      });
      cRenderLogWindow();
      cUpdateLogWindowMetrics();
      return cLogWindow;
    }

    function cOpenLogWindow() {
      const win = cCreateLogWindow();
      win.style.display = 'flex';
      win.classList.remove('kagura-log-min');
      cRenderLogWindow();
      cUpdateLogWindowMetrics();
    }

    function cUpdateLogWindowMetrics() {
      if (!cLogWindowMetrics) return;
      const expected = Number(cState.expectedGeneratedCount || 0);
      const detected = Number(cState.detectedGeneratedCount || 0);
      cLogWindowMetrics.textContent = `总运行 ${cFormatDuration(cGetTotalRunMs())} ｜ 第${cState.batchNo}批 ｜ 原图 ${cCompactBatchFileLabel(cState.currentBatch)} ｜ ${cPhaseLabel()} ｜ 生图 ${detected}/${expected || 0} ｜ 本批 ${cFormatDuration(cGetBatchElapsedMs())} ｜ 生图 ${cFormatDuration(cGetGenerationElapsedMs())}`;
    }

    function cMakeDraggable(target, handle) {
      let pressed = false;
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;
      let startX = 0;
      let startY = 0;
      const threshold = 5;

      handle.addEventListener('mousedown', event => {
        const onButton = Boolean(event.target.closest('button'));
        if (onButton && !target.classList.contains('kagura-collapsed')) return;
        pressed = true;
        dragging = false;
        startX = event.clientX;
        startY = event.clientY;
        const rect = target.getBoundingClientRect();
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        // 修复：先锁定当前屏幕坐标，再解除 right 定位；纯点击时图标不会瞬移到左侧。
        target.style.left = `${rect.left}px`;
        target.style.top = `${rect.top}px`;
        target.style.right = 'auto';
        event.preventDefault();
      });

      document.addEventListener('mousemove', event => {
        if (!pressed) return;
        if (!dragging && Math.hypot(event.clientX - startX, event.clientY - startY) < threshold) return;
        dragging = true;
        target.style.left = `${Math.max(0, Math.min(innerWidth - target.offsetWidth, event.clientX - offsetX))}px`;
        target.style.top = `${Math.max(0, Math.min(innerHeight - target.offsetHeight, event.clientY - offsetY))}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!pressed) return;
        if (dragging) {
          target.dataset.kaguraSuppressToggle = '1';
          setTimeout(() => { if (target.dataset.kaguraSuppressToggle === '1') delete target.dataset.kaguraSuppressToggle; }, 350);
        }
        pressed = false;
        dragging = false;
      });
    }

    function cClampExpandedPanel(target) {
      requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const maxLeft = Math.max(0, innerWidth - rect.width - 8);
        const maxTop = Math.max(0, innerHeight - Math.min(rect.height, innerHeight - 8));
        const left = Math.max(8, Math.min(maxLeft, rect.left));
        const top = Math.max(8, Math.min(maxTop, rect.top));
        target.style.right = 'auto';
        target.style.left = `${left}px`;
        target.style.top = `${top}px`;
      });
    }


    function cShowVersionModal(force = false) {
      let overlay = document.getElementById('kagura-gpt-version-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kagura-gpt-version-modal';
        overlay.className = 'kagura-gpt-modal-overlay';
        overlay.innerHTML = `
          <div class="kagura-gpt-modal">
            <div class="kagura-gpt-modal-title">脚本更新说明</div>
            <pre class="kagura-gpt-modal-content" data-role="content"></pre>
            <label class="kagura-gpt-modal-check"><input type="checkbox" data-role="hide-next"> 下次开启不再提醒</label>
            <div class="kagura-gpt-modal-actions"><button type="button" class="kagura-gpt-button kagura-gpt-primary" data-role="close">我知道了</button></div>
          </div>`;
        cPanel.appendChild(overlay);
        overlay.addEventListener('click', event => {
          if (event.target === overlay) overlay.classList.remove('show');
        });
        overlay.querySelector('[data-role="close"]').addEventListener('click', () => {
          const hide = overlay.querySelector('[data-role="hide-next"]').checked;
          if (hide) cSetUpdateNoticeHidden(true);
          overlay.classList.remove('show');
        });
      }
      overlay.querySelector('[data-role="content"]').textContent = MODULE_CHANGELOG;
      overlay.querySelector('[data-role="hide-next"]').checked = false;
      overlay.classList.add('show');
      if (force) overlay.querySelector('[data-role="hide-next"]').checked = false;
    }

    function cMaybeShowUpdateNotice() {
      if (cShouldShowUpdateNotice()) {
        setTimeout(() => cShowVersionModal(true), 500);
      }
    }

    function cBindLogResizer(logBox, handle, targetPanel = cPanel) {
      if (!logBox || !handle || !targetPanel) return;
      let startY = 0;
      let startH = 0;
      let startTop = 0;
      let dragging = false;

      handle.addEventListener('mousedown', event => {
        const panelRect = targetPanel.getBoundingClientRect();
        dragging = true;
        startY = event.clientY;
        startH = logBox.getBoundingClientRect().height;
        startTop = panelRect.top;

        // 固化当前 top，之后通过“日志增高多少，面板 top 就上移多少”来保持底部位置稳定。
        targetPanel.style.top = `${panelRect.top}px`;
        targetPanel.style.bottom = 'auto';

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
        event.preventDefault();
        event.stopPropagation();
      });

      document.addEventListener('mousemove', event => {
        if (!dragging) return;

        // 鼠标向上：delta > 0，日志变高；鼠标向下：delta < 0，日志变矮。
        const delta = startY - event.clientY;
        const minHeight = 110;
        const maxByViewport = window.innerHeight * 0.55;
        // 因为窗口要向上扩展，所以最大增量不能超过当前面板顶部到屏幕顶部的可用空间。
        const maxByTopSpace = startH + Math.max(0, startTop - 8);
        const maxHeight = Math.max(minHeight, Math.min(maxByViewport, maxByTopSpace));
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, startH + delta));
        const actualDelta = nextHeight - startH;

        logBox.style.height = `${nextHeight}px`;
        targetPanel.style.top = `${Math.max(8, startTop - actualDelta)}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      });
    }

    async function cTriggerRefreshAndResume(reason, flagName = 'genericRefresh') {
      const existing = cState.resumeContext && typeof cState.resumeContext === 'object' ? cState.resumeContext : {};
      const flags = { ...(existing.flags || {}) };
      if (flagName) flags[flagName] = true;
      cState.resumeContext = {
        kind: 'generation-refresh',
        reason,
        batchNo: cState.batchNo,
        batchPaths: [...(cState.currentBatch || [])],
        prompt: cSettings.prompt,
        triggeredAt: new Date().toISOString(),
        flags,
      };
      cState.running = true;
      cState.phase = 'refreshing';
      cSaveState();
      cLog(`${reason}，正在刷新页面，并将在刷新后自动恢复当前批次检测`, 'warn');
      cStatusText.textContent = '正在刷新页面并准备恢复当前批次检测…';
      setTimeout(() => location.reload(), 300);
      return new Promise(() => {});
    }

    function cCreatePanel() {
      GM_addStyle(`
        #kagura-gpt-panel { position:fixed; z-index:2147483647; right:16px; top:80px; width:390px; color:#182230; background:rgba(255,255,255,.98); border:1px solid #d9e2e8; border-radius:14px; box-shadow:0 12px 36px rgba(15,23,42,.24); font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; overflow:hidden; }
        #kagura-gpt-panel * { box-sizing:border-box; }
        .kagura-gpt-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; color:#fff; background:linear-gradient(135deg,#10a37f,#087f66); font-weight:700; cursor:move; user-select:none; }
        .kagura-gpt-body { padding:12px; max-height:calc(100vh - 120px); overflow:auto; }
        .kagura-gpt-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
        .kagura-gpt-label { width:76px; flex:0 0 76px; color:#667085; }
        .kagura-gpt-value { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:650; }
        .kagura-gpt-buttons { display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin:10px 0; }
        .kagura-gpt-button { border:0; border-radius:8px; padding:8px 6px; cursor:pointer; font-weight:650; background:#eef4f2; color:#24423a; }
        .kagura-gpt-button:hover { filter:brightness(.97); }
        .kagura-gpt-primary { background:#10a37f; color:#fff; }
        .kagura-gpt-danger { background:#ffeaea; color:#b42318; }
        .kagura-gpt-success { background:#e7f8f2; color:#08785e; }
        .kagura-gpt-status { padding:8px 10px; border-radius:8px; background:#eff8f5; margin:8px 0; color:#28584b; }
        .kagura-gpt-progress { font-weight:700; color:#087f66; }
        .kagura-gpt-prompt { width:100%; min-height:115px; resize:vertical; padding:9px; border:1px solid #d7e1de; border-radius:8px; font:12px/1.5 inherit; }
        .kagura-gpt-settings { display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin:8px 0; }
        .kagura-gpt-settings label { color:#667085; font-size:11px; }
        .kagura-gpt-settings input[type="number"] { width:100%; margin-top:3px; padding:6px; border:1px solid #d7e1de; border-radius:6px; }
        .kagura-gpt-check { display:flex; gap:7px; align-items:center; margin:7px 0; color:#475467; }
        .kagura-gpt-logbox { height:96px; overflow:auto; padding:7px; border:1px solid #d9e3df; border-radius:8px; background:#0f172a; color:#dbeafe; font:11px/1.45 Consolas,monospace; min-height:110px; max-height:55vh; }
        .kagura-gpt-log-resizer { display:none !important; }
        .kagura-gpt-log-resizer::before { display:none; }
        .kagura-gpt-footer { display:flex; justify-content:flex-end; align-items:center; margin-top:8px; }
        .kagura-gpt-version-button { border:0; border-radius:999px; background:#0f172a; color:#fff; padding:6px 10px; font:11px/1 inherit; cursor:pointer; box-shadow:0 3px 10px rgba(15,23,42,.16); }
        .kagura-gpt-version-button:hover { filter:brightness(1.06); }
        .kagura-gpt-modal-overlay { position:absolute; inset:0; z-index:20; background:rgba(15,23,42,.42); display:none; align-items:center; justify-content:center; padding:12px; }
        .kagura-gpt-modal-overlay.show { display:flex; }
        .kagura-gpt-modal { width:100%; max-width:360px; max-height:calc(100% - 24px); background:#fff; border-radius:12px; box-shadow:0 12px 34px rgba(15,23,42,.28); padding:14px; color:#182230; display:flex; flex-direction:column; }
        .kagura-gpt-modal-title { font-size:18px; font-weight:800; text-align:center; margin-bottom:10px; }
        .kagura-gpt-modal-content { white-space:pre-wrap; overflow:auto; border:1px solid #d9e2e8; border-radius:9px; background:#f8fafc; padding:10px; font:12px/1.55 inherit; color:#1f2937; min-height:150px; max-height:48vh; }
        .kagura-gpt-modal-check { display:flex; align-items:center; justify-content:center; gap:8px; margin:14px 0 8px; color:#475467; }
        .kagura-gpt-modal-actions { display:flex; justify-content:center; }
        .kagura-gpt-log { margin-bottom:3px; word-break:break-all; }
        .kagura-gpt-log-error { color:#fda4af; }
        .kagura-gpt-log-success { color:#86efac; }
        .kagura-gpt-log-warn { color:#fde68a; }
        .kagura-gpt-note { color:#7b8ba3; font-size:11px; margin-top:7px; }
        .kagura-gpt-toggle { border:0; background:transparent; color:#fff; cursor:pointer; font-size:17px; min-width:24px; min-height:24px; padding:0 2px; font-weight:800; }
        #kagura-gpt-panel.kagura-collapsed { width:48px !important; height:48px !important; min-width:48px; min-height:48px; border-radius:50%; overflow:hidden; background:transparent; }
        #kagura-gpt-panel.kagura-collapsed .kagura-gpt-body { display:none; }
        #kagura-gpt-panel.kagura-collapsed .kagura-gpt-header { width:48px; height:48px; padding:0; justify-content:center; border-radius:50%; cursor:move; }
        #kagura-gpt-panel.kagura-collapsed .kagura-gpt-header-title { display:none; }
        #kagura-gpt-panel.kagura-collapsed .kagura-gpt-toggle { width:48px; height:48px; padding:0; border-radius:50%; font-size:12px; letter-spacing:.2px; cursor:move; touch-action:none; user-select:none; }
      `);

      cPanel = document.createElement('section');
      cPanel.id = 'kagura-gpt-panel';
      cPanel.innerHTML = `
        <div class="kagura-gpt-header"><span class="kagura-gpt-header-title">ChatGPT 批量生图下载器 V${APP_VERSION}</span><button class="kagura-gpt-toggle" title="缩小为图标">−</button></div>
        <div class="kagura-gpt-body">
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">原图文件夹</span><span class="kagura-gpt-value" data-role="source">未选择</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">模板图</span><span class="kagura-gpt-value" data-role="template">未选择</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">成品文件夹</span><span class="kagura-gpt-value" data-role="output">未选择</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">任务进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="progress">0 / 0</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">当前批次</span><span class="kagura-gpt-value" data-role="batch">-</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">当前原图</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="current-files">-</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">当前阶段</span><span class="kagura-gpt-value" data-role="phase">等待配置</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">生图进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="generated">0 / 0</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">总运行</span><span class="kagura-gpt-value" data-role="total-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">本批耗时</span><span class="kagura-gpt-value" data-role="batch-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">生图耗时</span><span class="kagura-gpt-value" data-role="generation-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">待确认</span><span class="kagura-gpt-value" data-role="pending">0 个异常批次</span></div>
          <div class="kagura-gpt-status" data-role="status">等待配置</div>
          <textarea class="kagura-gpt-prompt" data-role="prompt" placeholder="在这里粘贴每一批都要使用的固定提示词"></textarea>
          <div class="kagura-gpt-settings">
            <label>每批原图数<input type="number" min="1" max="20" step="1" data-setting="batchSize"></label>
            <label>图片稳定等待(秒)<input type="number" min="5" max="60" step="1" data-setting="stableSeconds"></label>
            <label>最长生图(分钟)<input type="number" min="1" max="60" step="1" data-setting="generationMinutes"></label>
            <label>批次最短等待(秒)<input type="number" min="0" max="3600" step="0.5" data-setting="intervalMinSeconds"></label>
            <label>批次最长等待(秒)<input type="number" min="0" max="3600" step="0.5" data-setting="intervalMaxSeconds"></label>
          </div>
          <label class="kagura-gpt-check"><input type="checkbox" data-setting="newChatEachBatch"> 每一批开始前自动新建对话</label>
          <div class="kagura-gpt-buttons" data-role="buttons"></div>
          <div class="kagura-gpt-note">最近日志预览（完整记录请点击“运行日志”）</div>
          <div class="kagura-gpt-logbox" data-role="log"></div>
          <div class="kagura-gpt-footer"><button type="button" class="kagura-gpt-version-button" data-role="version">V${MODULE_VERSION}</button></div>
        </div>`;
      document.documentElement.appendChild(cPanel);
      const versionButton = cPanel.querySelector('[data-role="version"]');
      versionButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        cShowVersionModal(true);
      });

      cLogBox = cPanel.querySelector('[data-role="log"]');
      cStatusText = cPanel.querySelector('[data-role="status"]');
      cProgressText = cPanel.querySelector('[data-role="progress"]');
      cBatchText = cPanel.querySelector('[data-role="batch"]');
      cCurrentFilesText = cPanel.querySelector('[data-role="current-files"]');
      cPhaseText = cPanel.querySelector('[data-role="phase"]');
      cGeneratedText = cPanel.querySelector('[data-role="generated"]');
      cTotalTimeText = cPanel.querySelector('[data-role="total-time"]');
      cBatchTimeText = cPanel.querySelector('[data-role="batch-time"]');
      cGenerationTimeText = cPanel.querySelector('[data-role="generation-time"]');
      cPendingText = cPanel.querySelector('[data-role="pending"]');
      cSourceText = cPanel.querySelector('[data-role="source"]');
      cTemplateText = cPanel.querySelector('[data-role="template"]');
      cOutputText = cPanel.querySelector('[data-role="output"]');
      const buttons = cPanel.querySelector('[data-role="buttons"]');

      cStartButton = cCreateButton('开始/继续', 'kagura-gpt-primary', cStart);
      buttons.append(
        cCreateButton('选择原图目录', 'kagura-gpt-success', cChooseSourceFolder),
        cCreateButton('选择模板图', 'kagura-gpt-success', cChooseTemplate),
        cCreateButton('选择成品目录', 'kagura-gpt-success', cChooseOutputFolder),
        cStartButton,
        cCreateButton('暂停', '', cPause),
        cCreateButton('扫描原图', '', cScanImages),
        cCreateButton('检测当前成图', 'kagura-gpt-success', cRecoverCurrentGenerated),
        cCreateButton('导出待确认', 'kagura-gpt-success', cExportPendingQueue),
        cCreateButton('跳过当前批', '', cSkipBatch),
        cCreateButton('运行日志', 'kagura-gpt-success', cOpenLogWindow),
        cCreateButton('导出日志', 'kagura-gpt-success', cExportLogsTxt),
        cCreateButton('清空图片', 'kagura-gpt-danger', cClearSourceAndOutputImages),
        cCreateButton('清空进度', 'kagura-gpt-danger', cReset),
        cCreateButton('清除授权', 'kagura-gpt-danger', cForgetFolders),
      );

      cPanel.querySelector('[data-role="prompt"]').value = cSettings.prompt || '';
      cPanel.querySelector('[data-setting="batchSize"]').value = cSettings.batchSize;
      cPanel.querySelector('[data-setting="stableSeconds"]').value = cSettings.stableSeconds;
      cPanel.querySelector('[data-setting="generationMinutes"]').value = Math.round(cSettings.generationTimeout / 60000);
      cPanel.querySelector('[data-setting="intervalMinSeconds"]').value = Number(cSettings.intervalMin || C_DEFAULT_SETTINGS.intervalMin) / 1000;
      cPanel.querySelector('[data-setting="intervalMaxSeconds"]').value = Number(cSettings.intervalMax || C_DEFAULT_SETTINGS.intervalMax) / 1000;
      cPanel.querySelector('[data-setting="newChatEachBatch"]').checked = Boolean(cSettings.newChatEachBatch);
      cPanel.querySelector('[data-role="prompt"]').addEventListener('change', event => {
        cSettings.prompt = event.target.value;
        cSaveSettings();
      });

      cPanel.querySelector('.kagura-gpt-toggle').addEventListener('click', event => {
        event.stopPropagation();
        if (cPanel.dataset.kaguraSuppressToggle === '1') {
          delete cPanel.dataset.kaguraSuppressToggle;
          return;
        }
        cPanel.classList.toggle('kagura-collapsed');
        const collapsed = cPanel.classList.contains('kagura-collapsed');
        event.currentTarget.textContent = collapsed ? 'AI' : '−';
        event.currentTarget.title = collapsed ? '按住可拖动；点击恢复 ChatGPT 生图窗口' : '缩小为图标';
        if (!collapsed) cClampExpandedPanel(cPanel);
      });
      cMakeDraggable(cPanel, cPanel.querySelector('.kagura-gpt-header'));
      cRenderLogPreview();

      Promise.all([cGetHandle(C_SOURCE_DIR_KEY), cGetHandle(C_TEMPLATE_KEY), cGetHandle(C_OUTPUT_DIR_KEY)]).then(async ([source, template, output]) => {
        if (source) cSourceText.textContent = (await cPermission(source, 'read', false)) === 'granted' ? source.name : `${source.name}（需重新授权）`;
        if (template) cTemplateText.textContent = (await cPermission(template, 'read', false)) === 'granted' ? template.name : `${template.name}（需重新授权）`;
        if (output) cOutputText.textContent = (await cPermission(output, 'readwrite', false)) === 'granted' ? output.name : `${output.name}（需重新授权）`;
      }).catch(error => cLog(error.message, 'warn'));

      cUpdatePanel();
    }

    function cUpdatePanel() {
      if (!cPanel) return;
      const total = cState.imagePaths.length;
      const pendingCount = Array.isArray(cState.pendingQueue) ? cState.pendingQueue.length : 0;
      const batchSize = Math.max(1, Number(cSettings.batchSize) || 10);
      const totalBatches = total ? Math.ceil(total / batchSize) : 0;
      const expected = Number(cState.expectedGeneratedCount || (cState.currentBatch?.length || 0));
      const detected = Number(cState.detectedGeneratedCount || 0);
      const stuckSeconds = cState.generatedCountChangedAt ? Math.max(0, Math.floor((Date.now() - Number(cState.generatedCountChangedAt)) / 1000)) : 0;
      const batchFiles = Array.isArray(cState.currentBatch) ? cState.currentBatch.map(x => String(x).split('/').pop()).join('、') : '';

      cProgressText.textContent = `${Math.min(cState.index, total)} / ${total}`;
      if (cBatchText) {
        cBatchText.textContent = totalBatches ? `第 ${Math.min(cState.batchNo, totalBatches)} / ${totalBatches} 批` : '-';
        cBatchText.title = batchFiles || '当前无活动批次';
      }
      if (cCurrentFilesText) {
        cCurrentFilesText.textContent = cCompactBatchFileLabel(cState.currentBatch);
        cCurrentFilesText.title = batchFiles || '当前无活动批次';
      }
      if (cPhaseText) cPhaseText.textContent = cPhaseLabel();
      if (cGeneratedText) {
        cGeneratedText.textContent = `${detected} / ${expected || 0}${cState.phase === 'generating' && expected ? `（停留 ${stuckSeconds}秒）` : ''}`;
      }
      if (cTotalTimeText) cTotalTimeText.textContent = cFormatDuration(cGetTotalRunMs());
      if (cBatchTimeText) cBatchTimeText.textContent = cFormatDuration(cGetBatchElapsedMs());
      if (cGenerationTimeText) cGenerationTimeText.textContent = cFormatDuration(cGetGenerationElapsedMs());
      if (cPendingText) cPendingText.textContent = `${pendingCount} 个异常批次`;

      if (!total) cStatusText.textContent = '请选择原图文件夹并扫描';
      else if (cState.running && cState.phase === 'batch_wait') { /* 倒计时由 cWaitBetweenBatches 实时更新 */ }
      else if (cState.running && cState.phase === 'generating') cStatusText.textContent = `正在生图：已检测 ${detected}/${expected || '?'}，当前数量停留 ${stuckSeconds} 秒`;
      else if (cState.running) cStatusText.textContent = `运行中：${cPhaseLabel()}`;
      else if (cState.phase === 'done') cStatusText.textContent = pendingCount ? `全部完成；待确认 ${pendingCount} 批` : '全部完成';
      else if (cState.phase === 'error') cStatusText.textContent = '发生错误，已暂停';
      else cStatusText.textContent = `已暂停：下一张 ${cState.imagePaths[cState.index] || '无'}`;
      cStartButton.textContent = cState.running ? '运行中' : '开始/继续';
      cUpdateLogWindowMetrics();
    }

    cCreatePanel();
    setInterval(() => {
      try { cUpdatePanel(); } catch (_) {}
    }, 1000);
    cMaybeShowUpdateNotice();
    if (cState.running && cState.resumeContext?.kind === 'generation-refresh') {
      cLog(`检测到刷新恢复任务：第 ${cState.resumeContext.batchNo || cState.batchNo} 批，将在页面稳定后自动恢复检测`, 'warn');
      setTimeout(() => cWorker(), 1500);
    } else if (cState.running) {
      cStopRunClock();
      cState.running = false;
      cState.phase = 'ready';
      cSaveState();
      cLog('页面重新加载后已自动暂停，请重新授权并点击“开始/继续”', 'warn');
    }
  }

  initChatGPTModule();
})();

/* ===== Kagura 手动更新检查 V3.2.2（ChatGPT-only） ===== */
(() => {
  'use strict';

  const KAGURA_MANUAL_VERSION = '3.2.2';
  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';
  const KAGURA_INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';

  function versionCompare(a, b) {
    const aa = String(a).split('.').map(v => Number(v) || 0);
    const bb = String(b).split('.').map(v => Number(v) || 0);
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i += 1) {
      const av = aa[i] || 0;
      const bv = bb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
        timeout: 30000,
        headers: {
          'Accept': 'application/vnd.github.raw+json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(String(response.responseText || '').trim());
          } else {
            reject(new Error(`HTTP ${response.status || '未知'}`));
          }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  async function checkLatest() {
    const raw = await requestText(KAGURA_MANIFEST_URL);
    const info = JSON.parse(raw);
    const latest = String(info.version || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) {
      throw new Error('GitHub 返回的版本号无效');
    }
    return {
      latest,
      hasUpdate: versionCompare(latest, KAGURA_MANUAL_VERSION) > 0,
      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],
      installUrl: String(info.install_url || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL,
    };
  }

  function ensureStyle() {
    if (document.getElementById('kagura-manual-update-style')) return;
    const style = document.createElement('style');
    style.id = 'kagura-manual-update-style';
    style.textContent = `
      .kagura-manual-update-row {
        display:flex; justify-content:flex-end; align-items:center; gap:6px; margin-top:6px;
      }
      .kagura-manual-update-check {
        border:0; border-radius:999px; padding:6px 10px; cursor:pointer;
        background:#eef4ff; color:#175cd3; font:11px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
      }
      .kagura-manual-update-overlay {
        position:absolute; inset:0; z-index:10000; display:none;
        align-items:center; justify-content:center; padding:12px;
        background:rgba(15,23,42,.48);
      }
      .kagura-manual-update-overlay.show { display:flex; }
      .kagura-manual-update-modal {
        width:min(360px,94%); max-height:88%; overflow:auto;
        background:#fff; color:#182230; border-radius:12px; padding:14px;
        box-shadow:0 16px 40px rgba(15,23,42,.28);
        font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
      }
      .kagura-manual-update-title { font-size:16px; font-weight:800; text-align:center; margin-bottom:10px; }
      .kagura-manual-update-result {
        white-space:pre-wrap; background:#f8fafc; border:1px solid #e4e7ec;
        border-radius:9px; padding:10px; margin-bottom:10px; max-height:220px; overflow:auto;
      }
      .kagura-manual-update-actions { display:flex; gap:7px; justify-content:center; flex-wrap:wrap; }
      .kagura-manual-update-actions button {
        border:0; border-radius:8px; padding:8px 11px; cursor:pointer; font-weight:650;
      }
      .kagura-manual-update-actions [data-role="check"] { background:#e8f7ee; color:#087a3f; }
      .kagura-manual-update-actions [data-role="open-tm"] { background:#005bff; color:#fff; }
      .kagura-manual-update-actions [data-role="close"] { background:#eef2f6; color:#344054; }
    `;
    document.documentElement.appendChild(style);
  }

  function openPodStyleUpdate(info) {
    const url = String(info?.installUrl || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  function showUpdateDialog(panel) {
    let overlay = panel.querySelector(':scope > .kagura-manual-update-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'kagura-manual-update-overlay';
      overlay.innerHTML = `
        <div class="kagura-manual-update-modal">
          <div class="kagura-manual-update-title">手动检查更新</div>
          <div class="kagura-manual-update-result" data-role="result">当前版本：V${KAGURA_MANUAL_VERSION}\n\n检查到新版后，点击“立刻更新”直接打开固定 GitHub Raw 脚本，由 Tampermonkey 显示升级/覆盖确认。不会静默自动更新。</div>
          <div class="kagura-manual-update-actions">
            <button type="button" data-role="check">检查更新</button>
            <button type="button" data-role="open-tm" style="display:none">立刻更新</button>
            <button type="button" data-role="close">关闭</button>
          </div>
        </div>`;
      panel.appendChild(overlay);

      overlay.addEventListener('click', event => {
        if (event.target === overlay) overlay.classList.remove('show');
      });
      overlay.querySelector('[data-role="close"]').addEventListener('click', () => {
        overlay.classList.remove('show');
      });
      overlay.querySelector('[data-role="check"]').addEventListener('click', async event => {
        const btn = event.currentTarget;
        const result = overlay.querySelector('[data-role="result"]');
        const openTm = overlay.querySelector('[data-role="open-tm"]');
        openTm.style.display = 'none';
        openTm.onclick = null;
        btn.disabled = true;
        btn.textContent = '检查中…';
        result.textContent = `当前版本：V${KAGURA_MANUAL_VERSION}\n正在检查 GitHub…`;
        try {
          const info = await checkLatest();
          if (info.hasUpdate) {
            const notes = info.changelog.length
              ? `\n\n更新内容：\n${info.changelog.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
              : '';
            result.textContent =
              `发现新版本：V${info.latest}\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\n\n点击“立刻更新”将打开固定 GitHub Raw 脚本，由 Tampermonkey 接管升级/覆盖确认。`;
            openTm.style.display = '';
            openTm.onclick = () => openPodStyleUpdate(info);
          } else {
            result.textContent = `当前已经是最新版本：V${KAGURA_MANUAL_VERSION}`;
          }
        } catch (error) {
          result.textContent = `检查更新失败：${error?.message || error}`;
        } finally {
          btn.disabled = false;
          btn.textContent = '检查更新';
        }
      });
    }

    overlay.querySelector('[data-role="result"]').textContent =
      `当前版本：V${KAGURA_MANUAL_VERSION}\n\n点击“检查更新”查询 GitHub；发现新版后点“立刻更新”，直接打开固定 Raw 脚本交给 Tampermonkey 覆盖确认。`;
    const openTm = overlay.querySelector('[data-role="open-tm"]');
    if (openTm) {
      openTm.style.display = 'none';
      openTm.onclick = null;
    }
    overlay.classList.add('show');
  }

  function patchPanel(panel) {
    if (!panel || panel.dataset.kaguraManualUpdateV28 === '1') return;
    panel.dataset.kaguraManualUpdateV28 = '1';
    ensureStyle();

    // 强制让面板显示当前真正安装版本。
    const header = panel.querySelector('.kagura-gpt-header-title');
    if (header) {
      const prefix = panel.id === 'kagura-gpt-panel'
        ? 'ChatGPT 批量生图下载器'
        : 'ChatGPT 批量生图下载器';
      header.textContent = `${prefix} V${KAGURA_MANUAL_VERSION}`;
    }

    // 在脚本窗口右下角“版本处”增加检查更新按钮。
    const body = panel.querySelector('.kagura-gpt-body') || panel;
    let versionButton = body.querySelector('[data-role="version"], .kagura-gpt-version-btn, .kagura-ozon-version-btn');
    let row = versionButton?.parentElement;

    if (!row || !row.classList.contains('kagura-manual-update-row')) {
      row = document.createElement('div');
      row.className = 'kagura-manual-update-row';

      if (versionButton) {
        versionButton.parentElement?.insertBefore(row, versionButton);
        row.appendChild(versionButton);
      } else {
        versionButton = document.createElement('button');
        versionButton.type = 'button';
        versionButton.textContent = `V${KAGURA_MANUAL_VERSION}`;
        versionButton.style.cssText =
          'border:0;border-radius:999px;background:#0f172a;color:#fff;padding:6px 10px;font:11px/1.1 inherit;cursor:pointer';
        row.appendChild(versionButton);
        body.appendChild(row);
      }

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'kagura-manual-update-check';
      check.textContent = '检查更新';
      check.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        showUpdateDialog(panel);
      });
      row.appendChild(check);
    }
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll('#kagura-gpt-panel').forEach(patchPanel);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  document.querySelectorAll('#kagura-gpt-panel').forEach(patchPanel);
})();

/* KAGURA_UPDATE_UI_V322_CHATGPT_ONLY */
(() => {
  'use strict';

  const HISTORY_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/history.json?ref=main';
  const GUIDE_OVERLAY = 'kagura-update-guide-overlay-v3034';
  const HISTORY_OVERLAY = 'kagura-update-history-overlay-v3034';

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
        timeout: 30000,
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status || '未知'}`));
            return;
          }
          try {
            resolve(JSON.parse(String(response.responseText || '').trim()));
          } catch (error) {
            reject(new Error(`历史更新说明解析失败：${error?.message || error}`));
          }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  function findPanel(node) {
    return node?.closest?.('#kagura-gpt-panel')
      || document.querySelector('#kagura-gpt-panel');
  }

  function ensureStyle() {
    if (document.getElementById('kagura-update-ui-style-v3034')) return;
    const style = document.createElement('style');
    style.id = 'kagura-update-ui-style-v3034';
    style.textContent = `
      .${GUIDE_OVERLAY}, .${HISTORY_OVERLAY}{position:absolute;inset:0;z-index:40000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.56)}
      .kagura-update-guide-card,.kagura-update-history-card{width:min(380px,96%);max-height:88%;display:flex;flex-direction:column;background:#fff;color:#182230;border-radius:13px;box-shadow:0 18px 46px rgba(15,23,42,.34);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;overflow:hidden}
      .kagura-update-card-head{padding:14px 15px 10px;text-align:center;font-size:17px;font-weight:800;border-bottom:1px solid #eef2f6}
      .kagura-update-guide-body{padding:13px 15px}
      .kagura-update-guide-tip{padding:9px 10px;margin-bottom:10px;background:#f0f7ff;border:1px solid #cfe2ff;border-radius:9px;color:#174ea6;font-weight:700}
      .kagura-update-guide-step{display:flex;gap:9px;align-items:flex-start;margin:9px 0}
      .kagura-update-guide-num{flex:0 0 24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#10a37f;color:#fff;font-weight:800;font-size:12px}
      .kagura-update-guide-text{padding-top:2px}
      .kagura-update-guide-text b{font-weight:800}
      .kagura-update-card-actions{display:flex;justify-content:center;gap:8px;padding:10px 14px 14px;border-top:1px solid #eef2f6;background:#fff}
      .kagura-update-card-actions button{border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:750}
      .kagura-update-guide-close,.kagura-update-history-close{background:#10a37f;color:#fff}
      .kagura-update-history-body{padding:10px 12px;overflow:auto;min-height:120px}
      .kagura-update-history-meta{padding:8px 10px;margin-bottom:9px;background:#f8fafc;border:1px solid #e4e7ec;border-radius:8px;color:#475467}
      .kagura-update-history-item{border:1px solid #e4e7ec;border-radius:9px;margin-bottom:8px;overflow:hidden;background:#fff}
      .kagura-update-history-item summary{cursor:pointer;list-style:none;padding:10px 11px;font-weight:800;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kagura-update-history-item summary::-webkit-details-marker{display:none}
      .kagura-update-history-version{color:#087a3f}
      .kagura-update-history-date{font-size:11px;color:#667085;font-weight:600}
      .kagura-update-history-notes{padding:9px 12px 10px;margin:0;white-space:pre-wrap;color:#344054}
      .kagura-update-history-loading{padding:18px 8px;text-align:center;color:#667085}
    `;
    document.documentElement.appendChild(style);
  }

  function showGuide(sourceNode) {
    const panel = findPanel(sourceNode);
    if (!panel) return;
    ensureStyle();
    panel.querySelector(`.${GUIDE_OVERLAY}`)?.remove();

    const overlay = document.createElement('div');
    overlay.className = GUIDE_OVERLAY;
    overlay.innerHTML = `
      <div class="kagura-update-guide-card">
        <div class="kagura-update-card-head">最快更新方式</div>
        <div class="kagura-update-guide-body">
          <div class="kagura-update-guide-tip">不需要滚动更新说明，按下面 4 步即可原地覆盖更新。</div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">1</span><div class="kagura-update-guide-text">点击浏览器右上角 <b>Tampermonkey</b> 图标。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">2</span><div class="kagura-update-guide-text">进入 <b>管理面板</b>，找到“ Ozon主图下载 + ChatGPT批量生图助手 ”。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">3</span><div class="kagura-update-guide-text">点右侧 <b>铅笔/编辑 → 设置 → 检查用户脚本的更新</b>。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">4</span><div class="kagura-update-guide-text">更新页点击 <b>Overwrite（覆盖）</b>。不会新增第二条脚本。</div></div>
        </div>
        <div class="kagura-update-card-actions"><button type="button" class="kagura-update-guide-close">我知道了</button></div>
      </div>`;
    panel.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.kagura-update-guide-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
  }

  async function showHistory(sourceNode) {
    const panel = findPanel(sourceNode);
    if (!panel) return;
    ensureStyle();
    panel.querySelector(`.${HISTORY_OVERLAY}`)?.remove();

    const overlay = document.createElement('div');
    overlay.className = HISTORY_OVERLAY;
    overlay.innerHTML = `
      <div class="kagura-update-history-card">
        <div class="kagura-update-card-head">历史更新说明</div>
        <div class="kagura-update-history-body"><div class="kagura-update-history-loading">正在读取 GitHub 历史记录…</div></div>
        <div class="kagura-update-card-actions"><button type="button" class="kagura-update-history-close">关闭</button></div>
      </div>`;
    panel.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.kagura-update-history-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });

    const body = overlay.querySelector('.kagura-update-history-body');
    try {
      const data = await requestJson(HISTORY_API);
      const versions = Array.isArray(data.versions) ? data.versions : [];
      body.textContent = '';

      const meta = document.createElement('div');
      meta.className = 'kagura-update-history-meta';
      meta.textContent = `当前安装：V${typeof GM_info !== 'undefined' && GM_info?.script?.version ? GM_info.script.version : '未知'}${data.since ? `\n历史记录：V${data.since} 起` : ''}`;
      body.appendChild(meta);

      if (!versions.length) {
        const empty = document.createElement('div');
        empty.className = 'kagura-update-history-loading';
        empty.textContent = '暂无历史更新说明。';
        body.appendChild(empty);
        return;
      }

      versions.forEach((entry, index) => {
        const details = document.createElement('details');
        details.className = 'kagura-update-history-item';
        if (index === 0) details.open = true;

        const summary = document.createElement('summary');
        const version = document.createElement('span');
        version.className = 'kagura-update-history-version';
        version.textContent = `V${String(entry.version || '')}`;
        const date = document.createElement('span');
        date.className = 'kagura-update-history-date';
        date.textContent = String(entry.date || '');
        summary.append(version, date);

        const notes = document.createElement('div');
        notes.className = 'kagura-update-history-notes';
        const list = Array.isArray(entry.notes) ? entry.notes.map(String) : [];
        notes.textContent = list.length ? list.map((item, i) => `${i + 1}. ${item}`).join('\n') : '无详细说明。';

        details.append(summary, notes);
        body.appendChild(details);
      });
    } catch (error) {
      body.innerHTML = '';
      const failed = document.createElement('div');
      failed.className = 'kagura-update-history-loading';
      failed.textContent = `读取历史更新说明失败：${error?.message || error}`;
      body.appendChild(failed);
    }
  }

  // 版本号仍用于查看历史更新说明；所有更新按钮统一使用 POD Raw 安装链路。
  document.addEventListener('click', event => {
    const versionButton = event.target.closest?.('[data-role="version"], .kagura-gpt-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHistory(versionButton);
    }
  }, true);
})();
