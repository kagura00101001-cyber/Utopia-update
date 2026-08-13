// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      3.0.34
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// @description  完整正式版：新版提醒提供独立更新操作卡；点击右下角版本号可查看 GitHub 历史更新说明。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      ozone.ru
// @connect      ozon.ru
// @connect      *.ozone.ru
// @connect      *.ozon.ru
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* KAGURA_STARTUP_UPDATE_REMINDER_V3033 */
(() => {
  'use strict';

  const CURRENT_VERSION = '3.0.34';
  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';
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
      const panel = document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
      if (panel) return panel;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  }

  function openTampermonkey(resultBox) {
    const steps = '请在 Tampermonkey 中找到“ Ozon主图下载 + ChatGPT批量生图助手 ” → 编辑/铅笔 → 设置 → 检查用户脚本的更新 → Overwrite（覆盖）。';
    try {
      const tm = unsafeWindow?.external?.Tampermonkey || window?.external?.Tampermonkey;
      if (tm && typeof tm.openOptions === 'function') {
        tm.openOptions('nav=dashboard');
        resultBox.textContent += `\n\n已尝试打开 Tampermonkey 管理面板。${steps}`;
        return;
      }
    } catch (error) {
      console.warn('[Kagura] 无法直接打开 Tampermonkey：', error);
    }
    resultBox.textContent += `\n\n浏览器未开放 Tampermonkey 管理面板跳转接口。${steps}`;
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
          <button type="button" class="kagura-startup-update-now" data-role="now">立刻更新</button>
          <button type="button" class="kagura-startup-update-suppress" data-role="suppress">不再提醒</button>
          <button type="button" class="kagura-startup-update-close" data-role="close">关闭</button>
        </div>
      </div>`;
    panel.appendChild(overlay);

    const infoBox = overlay.querySelector('[data-role="info"]');
    overlay.querySelector('[data-role="now"]').addEventListener('click', () => openTampermonkey(infoBox));
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

  const APP_VERSION = '3.0.34';

  const KAGURA_IS_CHATGPT = /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname);
  if (KAGURA_IS_CHATGPT) {
    initChatGPTModule();
    return;
  }

  const SCRIPT_NAME = `Ozon SKU主图批量下载器 V${APP_VERSION}`;
  const STATE_KEY = 'ozonSkuImageDownloaderStateV1';
  const SETTINGS_KEY = 'ozonSkuImageDownloaderSettingsV1';
  const DB_NAME = 'ozon-sku-image-downloader';
  const DB_STORE = 'handles';
  const DIR_KEY = 'output-directory';
  const SEARCH_URL = 'https://www.ozon.ru/search/?text=';

  const DEFAULT_STATE = {
    skus: [],
    customSkuMap: {},
    index: 0,
    running: false,
    phase: 'idle',
    currentSku: '',
    results: [],
    importedFileName: '',
    importedSheetName: '',
    importedHeader: '',
    startedAt: 0,
    soldOutExpectedSku: '',
  };

  const DEFAULT_SETTINGS = {
    delayMin: 2600,
    delayMax: 4300,
    searchTimeout: 25000,
    imageTimeout: 30000,
    jpegQuality: 0.95,
  };

  let state = loadState();
  let settings = { ...DEFAULT_SETTINGS, ...(GM_getValue(SETTINGS_KEY, {}) || {}) };
  let panel;
  let logBox;
  let statusText;
  let progressText;
  let folderText;
  let startButton;
  let isWorkerActive = false;

  function loadState() {
    const saved = GM_getValue(STATE_KEY, null);
    return saved && typeof saved === 'object'
      ? { ...DEFAULT_STATE, ...saved }
      : { ...DEFAULT_STATE };
  }

  function saveState() {
    GM_setValue(STATE_KEY, state);
    updatePanel();
  }

  function saveSettings() {
    GM_setValue(SETTINGS_KEY, settings);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function randomDelay() {
    const min = Math.max(500, Number(settings.delayMin) || DEFAULT_SETTINGS.delayMin);
    const max = Math.max(min, Number(settings.delayMax) || DEFAULT_SETTINGS.delayMax);
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function nowText() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function log(message, type = 'info') {
    const prefix = type === 'error' ? '失败' : type === 'success' ? '成功' : type === 'warn' ? '提示' : '信息';
    console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](`[${SCRIPT_NAME}] ${message}`);
    if (!logBox) return;
    const line = document.createElement('div');
    line.className = `kagura-ozon-log kagura-ozon-log-${type}`;
    line.textContent = `[${nowText()}] ${prefix}：${message}`;
    logBox.appendChild(line);
    while (logBox.children.length > 80) logBox.firstChild.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }

  function cleanSku(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, '');
    }
    return String(value)
      .replace(/^['“”"`]+|['“”"`]+$/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function normalizeHeader(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[\s\n\r\t_\-—–（）()【】\[\]：:]/g, '');
  }

  function headerScore(header) {
    const h = normalizeHeader(header);
    const exact = new Map([
      ['跟卖sku', 100],
      ['商品sku', 95],
      ['ozonsku', 92],
      ['ozonid', 90],
      ['商品id', 88],
      ['商品编码', 85],
      ['商品代码', 85],
      ['sku', 80],
      ['артикул', 78],
    ]);
    if (exact.has(h)) return exact.get(h);
    if (h.includes('sku')) return 65;
    if (h.includes('ozon') && (h.includes('id') || h.includes('编码'))) return 60;
    if (h.includes('跟卖') && (h.includes('编号') || h.includes('编码'))) return 55;
    return 0;
  }


  function customSkuHeaderScore(header) {
    const h = normalizeHeader(header);
    const exact = new Map([
      ['上架sku', 125],
      ['自定义货号', 120],
      ['自定义sku', 115],
      ['自定义商品sku', 112],
      ['商家sku', 105],
      ['卖家sku', 103],
      ['sellerSKU', 100],
      ['货号', 90],
    ]);
    if (exact.has(h)) return exact.get(h);
    if (h.includes('自定义') && (h.includes('货号') || h.includes('sku') || h.includes('编码'))) return 85;
    if ((h.includes('商家') || h.includes('卖家')) && h.includes('sku')) return 78;
    return 0;
  }

  function findCustomSkuColumn(match) {
    if (!match?.rows?.length) return null;
    const headerRow = match.rows[match.headerRow] || [];
    let best = null;
    for (let c = 0; c < headerRow.length; c += 1) {
      if (c === match.column) continue;
      const score = customSkuHeaderScore(headerRow[c]);
      if (!score) continue;
      const nonEmptyBelow = match.rows
        .slice(match.headerRow + 1, Math.min(match.rows.length, match.headerRow + 301))
        .reduce((count, dataRow) => count + (cleanSku((dataRow || [])[c]) ? 1 : 0), 0);
      const candidate = { column: c, header: headerRow[c], score, nonEmptyBelow };
      if (!best || score > best.score || (score === best.score && nonEmptyBelow > best.nonEmptyBelow)) best = candidate;
    }
    return best;
  }

  function findSkuColumn(workbook) {
    let best = null;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
      });

      const scanRows = Math.min(rows.length, 40);
      for (let r = 0; r < scanRows; r += 1) {
        const row = rows[r] || [];
        for (let c = 0; c < row.length; c += 1) {
          const score = headerScore(row[c]);
          if (!score) continue;
          const nonEmptyBelow = rows
            .slice(r + 1, Math.min(rows.length, r + 301))
            .reduce((count, dataRow) => count + (cleanSku((dataRow || [])[c]) ? 1 : 0), 0);
          const candidate = { sheetName, rows, headerRow: r, column: c, header: row[c], score, nonEmptyBelow };
          if (!best || score > best.score || (score === best.score && nonEmptyBelow > best.nonEmptyBelow)) {
            best = candidate;
          }
        }
      }
    }

    return best;
  }

  async function parseExcel(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const match = findSkuColumn(workbook);
    if (!match) throw new Error('没有找到SKU列。请确认表头含“sku”“跟卖sku”“商品SKU”或“SKU”。');

    const customMatch = findCustomSkuColumn(match);
    if (!customMatch) {
      throw new Error('已找到SKU列，但没有找到“上架sku/自定义货号/自定义SKU”列。当前模式要求按SKU搜索、按上架SKU（自定义SKU）命名保存。');
    }

    const skus = [];
    const customSkuMap = {};
    const seenSku = new Set();
    const seenCustom = new Map();
    const duplicateCustom = [];
    const missingCustom = [];

    for (let r = match.headerRow + 1; r < match.rows.length; r += 1) {
      const row = match.rows[r] || [];
      const sku = cleanSku(row[match.column]);
      if (!sku || seenSku.has(sku)) continue;
      if (/^(null|undefined|nan|#n\/a|#value!|#name\?)$/i.test(sku)) continue;

      const customSku = cleanSku(row[customMatch.column]);
      if (!customSku || /^(null|undefined|nan|#n\/a|#value!|#name\?)$/i.test(customSku)) {
        missingCustom.push({ row: r + 1, sku });
        continue;
      }

      if (seenCustom.has(customSku) && seenCustom.get(customSku) !== sku) {
        duplicateCustom.push({ customSku, firstSku: seenCustom.get(customSku), sku, row: r + 1 });
        continue;
      }

      seenSku.add(sku);
      seenCustom.set(customSku, sku);
      skus.push(sku);
      customSkuMap[sku] = customSku;
    }

    if (missingCustom.length) {
      const sample = missingCustom.slice(0, 5).map(x => `第${x.row}行 SKU=${x.sku}`).join('；');
      throw new Error(`发现 ${missingCustom.length} 个SKU没有对应的上架SKU/自定义货号，已停止导入，避免保存时错名。示例：${sample}`);
    }
    if (duplicateCustom.length) {
      const sample = duplicateCustom.slice(0, 5).map(x => `${x.customSku}（${x.firstSku} / ${x.sku}）`).join('；');
      throw new Error(`发现重复的上架SKU/自定义货号，若继续会覆盖图片，已停止导入。重复示例：${sample}`);
    }
    if (!skus.length) throw new Error(`已找到“${match.header}”列，但没有读取到可用的 SKU + 上架SKU/自定义货号对应关系。`);

    return {
      skus,
      customSkuMap,
      sheetName: match.sheetName,
      header: String(match.header),
      customHeader: String(customMatch.header),
    };
  }

  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开文件夹授权数据库'));
    });
  }

  async function saveDirectoryHandle(handle) {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, DIR_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('无法保存文件夹授权'));
    });
    db.close();
  }

  async function getDirectoryHandle() {
    const db = await openHandleDb();
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(DIR_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('无法读取文件夹授权'));
    });
    db.close();
    return handle;
  }

  async function clearDirectoryHandle() {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(DIR_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('无法清除文件夹授权'));
    });
    db.close();
  }

  async function getDirectoryPermission(handle, request = false) {
    if (!handle) return 'denied';
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return 'granted';
    if (request && (await handle.requestPermission(options)) === 'granted') return 'granted';
    return 'denied';
  }

  async function chooseFolder() {
    const picker = unsafeWindow.showDirectoryPicker || window.showDirectoryPicker;
    if (typeof picker !== 'function') {
      throw new Error('当前浏览器不支持选择本地文件夹。请使用最新版Chrome或Edge，并通过HTTPS打开Ozon。');
    }
    const handle = await picker.call(unsafeWindow, { mode: 'readwrite' });
    await saveDirectoryHandle(handle);
    folderText.textContent = handle.name;
    folderText.title = handle.name;
    log(`输出文件夹已选择：${handle.name}`, 'success');
    return handle;
  }

  function sanitizeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').slice(0, 150) || 'unknown';
  }

  function gmFetchBlob(url, timeout = 45000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout,
        headers: {
          Referer: location.href,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        onload(response) {
          if (response.status >= 200 && response.status < 300 && response.response instanceof Blob) {
            resolve(response.response);
          } else {
            reject(new Error(`图片请求失败，HTTP ${response.status || '未知'}`));
          }
        },
        ontimeout: () => reject(new Error('下载图片超时')),
        onerror: () => reject(new Error('下载图片网络错误')),
      });
    });
  }

  async function blobToJpeg(blob, quality = 0.95) {
    if (!blob || blob.size === 0) throw new Error('图片文件为空');
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      const jpeg = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('JPG转换失败')), 'image/jpeg', quality);
      });
      return jpeg;
    } catch (error) {
      if (/jpe?g/i.test(blob.type)) return blob;
      throw new Error(`图片格式转换失败：${error.message}`);
    }
  }

  async function writeBlobToFolder(directoryHandle, fileName, blob) {
    const permission = await getDirectoryPermission(directoryHandle, false);
    if (permission !== 'granted') throw new Error('文件夹写入权限已失效，请点击“选择文件夹”重新授权');
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function bestSrcFromImage(img) {
    const candidates = [];
    const src = img.currentSrc || img.src || img.getAttribute('src') || '';
    if (src) candidates.push({ url: src, width: parseWidthHint(src) || img.naturalWidth || 0 });

    const srcset = img.getAttribute('srcset') || '';
    srcset.split(',').forEach(part => {
      const match = part.trim().match(/^(\S+)\s+(\d+)(w|x)$/i);
      if (match) candidates.push({ url: match[1], width: Number(match[2]) });
    });

    candidates.sort((a, b) => b.width - a.width);
    return upgradeOzonImageUrl(candidates[0]?.url || src);
  }

  function parseWidthHint(url) {
    const text = String(url || '');
    const matches = [
      text.match(/\/wc(\d+)(?:x\d+)?\//i),
      text.match(/\/wc(\d+)(?:h\d+)?\//i),
      text.match(/[?&](?:w|width)=(\d+)/i),
    ];
    for (const match of matches) if (match) return Number(match[1]);
    return 0;
  }

  function upgradeOzonImageUrl(url) {
    if (!url) return '';
    let upgraded = String(url).replace(/&amp;/g, '&');
    upgraded = upgraded.replace(/\/wc\d+(?:x\d+|h\d+)?\//i, '/wc1200/');
    upgraded = upgraded.replace(/([?&](?:w|width)=)\d+/i, (_, prefix) => `${prefix}1200`);
    return upgraded;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0;
  }

  function scoreImage(img, inGallery) {
    if (!isVisible(img)) return -Infinity;
    const src = bestSrcFromImage(img);
    if (!src || /^data:/i.test(src)) return -Infinity;
    if (!/(ozone|ozon|multimedia|cdn)/i.test(src)) return -Infinity;
    if (/(logo|favicon|sprite|icon|avatar|qr|badge)/i.test(src)) return -Infinity;

    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || rect.width;
    const height = img.naturalHeight || rect.height;
    if (width < 150 || height < 150) return -Infinity;

    let score = 0;
    score += Math.min(width * height / 1000, 2500);
    score += Math.min(rect.width * rect.height / 1000, 1200);
    if (inGallery) score += 3500;
    if (rect.top >= 80 && rect.top < innerHeight * 0.92) score += 450;
    if (rect.left < innerWidth * 0.62) score += 500;
    if (rect.width >= 350 && rect.height >= 350) score += 1000;
    if (Math.abs(width / height - 1) < 0.35) score += 180;
    score += Math.min(parseWidthHint(src), 1200);
    return score;
  }

  function findMainImage() {
    const gallerySelectors = [
      '[data-widget*="gallery" i] img',
      '[data-widget*="webGallery" i] img',
      '[data-widget*="image" i] img',
      'main img',
    ];

    const candidates = new Map();
    for (const selector of gallerySelectors) {
      document.querySelectorAll(selector).forEach(img => {
        if (!candidates.has(img)) candidates.set(img, selector.includes('gallery') || selector.includes('Gallery'));
      });
    }
    document.querySelectorAll('img').forEach(img => {
      if (!candidates.has(img)) candidates.set(img, false);
    });

    return [...candidates.entries()]
      .map(([img, inGallery]) => ({ img, src: bestSrcFromImage(img), score: scoreImage(img, inGallery) }))
      .filter(item => Number.isFinite(item.score) && item.src)
      .sort((a, b) => b.score - a.score)[0] || null;
  }

  function looksLikeProductPage() {
    if (/\/product\//i.test(location.pathname)) return true;
    return Boolean(document.querySelector('[data-widget*="webGallery" i], [data-widget*="gallery" i]'));
  }

  function detectBlockedPage() {
    const text = (document.body?.innerText || '').slice(0, 5000).toLowerCase();
    return [
      'доступ ограничен',
      'подтвердите, что вы не робот',
      'captcha',
      'слишком много запросов',
      'access denied',
      'temporarily blocked',
    ].some(keyword => text.includes(keyword));
  }

  function findFirstProductLink() {
    const anchors = [...document.querySelectorAll('a[href*="/product/"]')];
    const candidates = [];
    const seen = new Set();

    for (const anchor of anchors) {
      const href = anchor.href;
      if (!href || seen.has(href) || !isVisible(anchor)) continue;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < 100 || rect.top > innerHeight * 2.5) continue;
      const img = anchor.querySelector('img');
      if (!img || !isVisible(img)) continue;
      if (rect.width < 80 || rect.height < 80) continue;
      seen.add(href);
      candidates.push({
        href,
        top: Math.max(rect.top, 0),
        left: Math.max(rect.left, 0),
        area: rect.width * rect.height,
      });
    }

    candidates.sort((a, b) => {
      const rowA = Math.round(a.top / 80);
      const rowB = Math.round(b.top / 80);
      if (rowA !== rowB) return rowA - rowB;
      if (Math.abs(a.left - b.left) > 30) return a.left - b.left;
      return b.area - a.area;
    });
    return candidates[0]?.href || '';
  }


  function normalizeProductId(value) {
    return String(value || '').trim().replace(/[^0-9]/g, '');
  }

  function productIdFromHref(href) {
    const text = String(href || '');
    const match = text.match(/(?:-|\/)(\d{6,})(?:\/?(?:[?#].*)?$)/);
    if (match) return match[1];
    try {
      const url = new URL(text, location.href);
      return normalizeProductId(url.searchParams.get('product_id'));
    } catch (_) {
      return '';
    }
  }

  function findExactProductLink(sku) {
    const target = normalizeProductId(sku) || normalizeProductId(new URLSearchParams(location.search).get('product_id'));
    if (!target) return '';
    const anchors = [...document.querySelectorAll('a[href*="/product/"]')]
      .filter(anchor => isVisible(anchor));
    const exact = anchors.find(anchor => productIdFromHref(anchor.href) === target);
    return exact?.href || '';
  }

  function isSoldOutSearchPage() {
    const body = (document.body?.innerText || '').slice(0, 12000);
    return /Этот\s+товар\s+закончился|Товар\s+закончился|товар\s+закончился|нет\s+в\s+наличии|Out\s+of\s+stock|商品(?:已)?(?:售罄|告罄)/i.test(body);
  }

  function findSoldOutOriginalProductTarget(sku) {
    const targetId = normalizeProductId(sku) || normalizeProductId(new URLSearchParams(location.search).get('product_id'));
    const soldPattern = /Этот\s+товар\s+закончился|Товар\s+закончился|товар\s+закончился|нет\s+в\s+наличии|Out\s+of\s+stock|商品(?:已)?(?:售罄|告罄)/i;
    const similarPattern = /Похожие\s+предложения|Похожие\s+товары|Similar\s+(?:offers|products)|相似(?:推荐|商品)/i;

    const visibleTextNodes = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p')].filter(isVisible);
    const soldMarkers = visibleTextNodes
      .filter(el => soldPattern.test((el.innerText || el.textContent || '').trim()))
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    if (!soldMarkers.length) return null;

    const similarHeadings = visibleTextNodes
      .filter(el => similarPattern.test((el.innerText || el.textContent || '').trim()))
      .map(el => ({ el, r: el.getBoundingClientRect(), text: (el.innerText || el.textContent || '').trim() }))
      .filter(x => x.r.width > 0 && x.r.height > 0)
      // 排除包含整块页面内容的大容器；真正“Похожие предложения”标题通常文字短、宽度有限。
      .filter(x => x.text.length <= 120 && x.r.width <= Math.max(900, innerWidth * 0.7))
      .sort((a, b) => (a.text.length - b.text.length) || (a.r.width - b.r.width));
    let similarLeft = similarHeadings.length ? similarHeadings[0].r.left : 0;
    // 某些 Ozon DOM 的标题祖先从 x=0 开始，不能拿它当左右分界，否则所有左侧候选都会被过滤掉。
    if (!Number.isFinite(similarLeft) || similarLeft < 180) {
      similarLeft = Math.min(Math.max(innerWidth * 0.30, 360), 620);
    }
    const leftBoundary = Math.max(260, similarLeft - 12);

    const hrefHasTarget = href => {
      if (!targetId || !href) return false;
      if (productIdFromHref(href) === targetId) return true;
      let value = String(href);
      try { value = decodeURIComponent(value); } catch (_) {}
      return new RegExp(`(^|\\D)${targetId}(\\D|$)`).test(value);
    };

    const clickableAncestor = element => {
      let current = element;
      for (let depth = 0; depth < 10 && current && current !== document.body; depth += 1, current = current.parentElement) {
        if (!isVisible(current)) continue;
        const role = current.getAttribute?.('role') || '';
        const href = current.getAttribute?.('href') || '';
        const style = getComputedStyle(current);
        if (current.matches?.('a[href],button,[role="link"],[role="button"]')
          || href
          || typeof current.onclick === 'function'
          || current.tabIndex >= 0
          || style.cursor === 'pointer') return current;
      }
      return element;
    };

    const makeTarget = (element, method, exact = false) => {
      if (!element) return null;
      const clickable = clickableAncestor(element);
      const anchor = clickable?.matches?.('a[href]') ? clickable : clickable?.closest?.('a[href]') || element.closest?.('a[href]');
      const href = anchor?.href || anchor?.getAttribute?.('href') || '';
      const rect = (clickable || element).getBoundingClientRect();
      const er = element.getBoundingClientRect?.() || rect;
      const clickPoints = [
        { x: er.left + er.width / 2, y: er.top + er.height / 2, label: '元素中心' },
        { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height * 0.34, 110), label: '卡片上部' },
        { x: rect.left + Math.min(rect.width * 0.42, 120), y: rect.top + Math.min(rect.height * 0.62, 175), label: '卡片主体' },
      ].filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      return {
        element: clickable || element,
        rawElement: element,
        url: href ? new URL(href, location.href).href : '',
        method,
        exact: Boolean(exact || (href && hrefHasTarget(href))),
        clickX: rect.left + rect.width / 2,
        clickY: rect.top + rect.height / 2,
        clickPoints,
      };
    };

    // 第一优先：告罄页左侧任意链接中，精确包含当前 SKU / product_id 的链接。
    if (targetId) {
      const exactLinks = [...document.querySelectorAll('a[href]')]
        .filter(anchor => isVisible(anchor) && hrefHasTarget(anchor.href || anchor.getAttribute('href') || ''))
        .filter(anchor => {
          const r = anchor.getBoundingClientRect();
          return r.left < leftBoundary && r.right <= leftBoundary + 20 && r.top > 80;
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          const ai = a.querySelector('img')?.getBoundingClientRect?.();
          const bi = b.querySelector('img')?.getBoundingClientRect?.();
          const aScore = (ai ? ai.width * ai.height * 5 : ar.width * ar.height) - ar.left * 0.5;
          const bScore = (bi ? bi.width * bi.height * 5 : br.width * br.height) - br.left * 0.5;
          return bScore - aScore;
        });
      if (exactLinks.length) return makeTarget(exactLinks[0], '左侧精确SKU原商品入口', true);
    }

    // 第二优先：用“Этот товар закончился”标题定位左侧原商品卡，点击卡片里的主图/标题本身。
    for (const marker of soldMarkers) {
      const mr = marker.getBoundingClientRect();
      const imageCandidates = [...document.querySelectorAll('img')]
        .filter(img => isVisible(img))
        .map(img => ({ img, r: img.getBoundingClientRect() }))
        .filter(({ r }) => r.width >= 45 && r.height >= 45)
        .filter(({ r }) => r.left < leftBoundary && r.right <= leftBoundary + 20)
        .filter(({ r }) => r.top >= mr.top - 40 && r.top <= mr.bottom + 520)
        .filter(({ img }) => !similarPattern.test((img.closest('a,div,section')?.innerText || '').slice(0, 500)))
        .sort((a, b) => {
          const aCenterY = a.r.top + a.r.height / 2;
          const bCenterY = b.r.top + b.r.height / 2;
          const aScore = a.r.width * a.r.height * 6 - Math.abs(aCenterY - (mr.bottom + 120)) * 10 - a.r.left;
          const bScore = b.r.width * b.r.height * 6 - Math.abs(bCenterY - (mr.bottom + 120)) * 10 - b.r.left;
          return bScore - aScore;
        });

      if (imageCandidates.length) {
        const image = imageCandidates[0].img;
        let card = image;
        for (let current = image.parentElement, depth = 0; current && current !== document.body && depth < 9; current = current.parentElement, depth += 1) {
          if (!isVisible(current)) continue;
          const r = current.getBoundingClientRect();
          const txt = (current.innerText || current.textContent || '').trim();
          if (r.left >= leftBoundary || r.right > leftBoundary + 28) continue;
          if (r.width >= 120 && r.width <= Math.max(360, leftBoundary - 20)
            && r.height >= 90 && r.height <= 520
            && r.top >= mr.top - 55 && r.bottom <= mr.bottom + 610
            && !similarPattern.test(txt)) {
            card = current;
          }
        }
        const target = makeTarget(card, '告罄标题下方左侧原商品卡片');
        if (target) {
          const ir = image.getBoundingClientRect();
          const cr = card.getBoundingClientRect();
          target.clickPoints = [
            { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2, label: '左侧商品图片中心' },
            { x: cr.left + Math.min(cr.width * 0.45, 125), y: cr.top + Math.min(cr.height * 0.30, 95), label: '左侧商品卡上部' },
            { x: cr.left + Math.min(cr.width * 0.50, 135), y: cr.top + Math.min(cr.height * 0.55, 165), label: '左侧商品卡中部' },
          ];
          return target;
        }
      }

      const clickables = [...document.querySelectorAll('a[href],button,[role="link"],[role="button"],[tabindex]')]
        .filter(isVisible)
        .filter(el => {
          const r = el.getBoundingClientRect();
          const txt = (el.innerText || el.textContent || '').trim();
          if (similarPattern.test(txt)) return false;
          return r.left < leftBoundary && r.right <= leftBoundary + 20
            && r.top >= mr.top - 40 && r.top <= mr.bottom + 560
            && r.width >= 50 && r.height >= 35;
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          const as = ar.width * ar.height - Math.abs(ar.top - mr.bottom) * 12 - ar.left;
          const bs = br.width * br.height - Math.abs(br.top - mr.bottom) * 12 - br.left;
          return bs - as;
        });
      if (clickables.length) return makeTarget(clickables[0], '告罄标题附近左侧原商品点击区');
    }
    return null;
  }

  async function waitUntil(check, timeout, interval = 500) {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeout) {
      try {
        const result = await check();
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
      await sleep(interval);
    }
    if (lastError) throw lastError;
    return null;
  }

  function getCustomSkuForSearchSku(sku) {
    const mapped = cleanSku(state.customSkuMap?.[sku]);
    return mapped || sku;
  }

  function addResult(sku, status, message, imageUrl = '', productUrl = '') {
    const record = {
      sku,
      customSku: getCustomSkuForSearchSku(sku),
      status,
      message,
      imageUrl,
      productUrl: productUrl || location.href,
      time: new Date().toISOString(),
    };
    const existingIndex = state.results.findIndex(item => item.sku === sku);
    if (existingIndex >= 0) state.results[existingIndex] = record;
    else state.results.push(record);
  }

  async function saveOzonImageForSku(sku, imageUrl, productUrl = '', sourceLabel = '商品主图') {
    if (!imageUrl) throw new Error('没有可下载的原商品主图地址');
    const directoryHandle = await getDirectoryHandle();
    if (!directoryHandle) throw new Error('没有选择输出文件夹');
    if ((await getDirectoryPermission(directoryHandle, false)) !== 'granted') {
      throw new Error('文件夹写入权限已失效，请点击“选择文件夹”重新授权');
    }

    const customSku = getCustomSkuForSearchSku(sku);
    statusText.textContent = `正在下载：搜索SKU ${sku} → 保存 ${customSku}.jpg…`;
    const originalBlob = await gmFetchBlob(imageUrl);
    const jpegBlob = await blobToJpeg(originalBlob, settings.jpegQuality);
    const fileName = `${sanitizeFileName(customSku)}.jpg`;
    await writeBlobToFolder(directoryHandle, fileName, jpegBlob);

    addResult(sku, '成功', fileName, imageUrl, productUrl || location.href);
    state.index += 1;
    state.phase = 'search';
    state.currentSku = '';
    saveState();
    log(`搜索SKU ${sku} 的${sourceLabel}已保存为 ${fileName}`, 'success');
    await sleep(randomDelay());
    navigateToCurrentSku();
  }

  async function processSoldOutSearchResult(sku, result) {
    statusText.textContent = `检测到 ${sku} 原商品已告罄，正在点击左侧原商品进入详情页…`;
    log(`检测到原商品已告罄：${sku}；只操作原商品，不会使用右侧相似推荐。识别方式：${result?.method || '未识别到左侧DOM，使用原SKU安全直达'}`, 'warn');

    state.phase = 'product';
    state.soldOutExpectedSku = sku;
    saveState();
    await sleep(450 + Math.floor(Math.random() * 350));

    const startUrl = location.href;
    const expectedId = normalizeProductId(sku) || normalizeProductId(new URLSearchParams(location.search).get('product_id'));

    const pageChanged = () => location.href !== startUrl || looksLikeProductPage();

    // 如果告罄页没有暴露左侧原商品的可点击DOM，仍然可以从当前任务SKU / search product_id
    // 唯一确定原商品。此时直接进入 /product/SKU/?oos_search=false，与手动点击左侧原商品后的目标一致，
    // 且绝不读取右侧推荐商品链接。
    if (result?.directOnly && expectedId) {
      const directUrl = `https://www.ozon.ru/product/${encodeURIComponent(expectedId)}/?oos_search=false`;
      log(`告罄页未暴露左侧可点击入口；根据当前原SKU ${expectedId} 安全进入原商品详情页`, 'warn');
      location.assign(directUrl);
      return;
    }

    async function clickAt(x, y, label) {
      x = Math.max(2, Math.min(innerWidth - 3, Number(x) || 2));
      y = Math.max(2, Math.min(innerHeight - 3, Number(y) || 2));
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit.closest?.('#kagura-ozon-panel')) return false;

      const chain = [];
      for (let cur = hit, depth = 0; cur && cur !== document.body && depth < 10; cur = cur.parentElement, depth += 1) chain.push(cur);
      let target = chain.find(el => el.matches?.('a[href]'))
        || chain.find(el => ['link','button'].includes((el.getAttribute?.('role') || '').toLowerCase()))
        || chain.find(el => typeof el.onclick === 'function' || el.tabIndex >= 0 || getComputedStyle(el).cursor === 'pointer')
        || hit;

      try { target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
      await sleep(180);
      const tr = target.getBoundingClientRect?.();
      const cx = tr && tr.width > 0 ? Math.max(2, Math.min(innerWidth - 3, tr.left + tr.width / 2)) : x;
      const cy = tr && tr.height > 0 ? Math.max(2, Math.min(innerHeight - 3, tr.top + tr.height / 2)) : y;

      log(`尝试点击告罄原商品：${label}（${Math.round(cx)}, ${Math.round(cy)}）`, 'info');
      try { target.focus?.({ preventScroll: true }); } catch (_) {}

      const eventInit = { bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
      for (const type of ['pointerover','mouseover','pointerenter','mouseenter','pointerdown','mousedown','pointerup','mouseup','click']) {
        try {
          const Ctor = type.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent;
          target.dispatchEvent(new Ctor(type, eventInit));
        } catch (_) {}
      }
      try { target.click?.(); } catch (_) {}
      await sleep(1200);
      return pageChanged();
    }

    // 先尝试精确 href；这是左侧卡片本身有原SKU链接时最可靠的方式。
    if (result.exact && result.url) {
      try {
        const anchor = result.element?.matches?.('a[href]') ? result.element : result.element?.closest?.('a[href]');
        if (anchor && isVisible(anchor)) {
          log(`找到左侧精确SKU链接，优先点击真实链接：${sku}`, 'info');
          anchor.click();
          await sleep(1500);
          if (pageChanged()) return;
        }
      } catch (_) {}
    }

    // 告罄卡片有时没有标准 a 标签，只能对左侧卡片的图片/上部/主体多个位置依次点击。
    const points = Array.isArray(result.clickPoints) && result.clickPoints.length
      ? result.clickPoints
      : [{ x: result.clickX, y: result.clickY, label: '识别区域中心' }];
    for (const point of points) {
      if (await clickAt(point.x, point.y, point.label || '左侧原商品')) return;
    }

    // 再直接点击识别到的 DOM 元素/祖先，防止 elementFromPoint 命中透明覆盖层。
    try {
      const element = result.element;
      if (element && isVisible(element)) {
        log(`坐标点击未跳转，直接触发左侧原商品DOM点击：${sku}`, 'warn');
        try { element.click?.(); } catch (_) {}
        try { HTMLElement.prototype.click.call(element); } catch (_) {}
        await sleep(1400);
        if (pageChanged()) return;
      }
    } catch (_) {}

    // 最终安全兜底：只根据“当前正在处理的原SKU”构造原商品详情地址。
    // 不读取、不点击右侧相似商品，因此不会进入推荐商品。
    if (expectedId) {
      const directUrl = `https://www.ozon.ru/product/${encodeURIComponent(expectedId)}/?oos_search=false`;
      log(`左侧卡片点击仍未触发跳转；使用当前原SKU ${expectedId} 直达原商品详情页（不会使用相似推荐链接）`, 'warn');
      location.assign(directUrl);
      return;
    }

    throw new Error('已识别告罄页左侧原商品，但多点点击仍未进入详情页，且无法构造原SKU详情地址');
  }

  function currentProductIdFromPage() {
    const byUrl = productIdFromHref(location.href);
    if (byUrl) return byUrl;
    const body = (document.body?.innerText || '').slice(0, 9000);
    const match = body.match(/Артикул\s*[:：]?\s*(\d{6,})/i);
    return match ? normalizeProductId(match[1]) : '';
  }

  async function processProductPage(sku) {
    if (state.soldOutExpectedSku) {
      const expected = normalizeProductId(state.soldOutExpectedSku);
      const current = currentProductIdFromPage();
      if (expected && current && current !== expected) {
        const wrong = current;
        state.soldOutExpectedSku = '';
        state.phase = 'search';
        saveState();
        throw new Error(`告罄商品点击进入了错误商品详情（期望SKU ${expected}，实际商品 ${wrong}），已阻止抓取错误主图`);
      }
      if (expected && current === expected) {
        log(`已确认进入告罄原商品详情页：${expected}`, 'success');
      }
      state.soldOutExpectedSku = '';
      saveState();
    }
    statusText.textContent = `正在识别 ${sku} 的主图…`;
    const found = await waitUntil(() => {
      if (detectBlockedPage()) throw new Error('检测到Ozon验证或访问限制，请暂停后手动完成验证');
      return findMainImage();
    }, settings.imageTimeout, 650);

    if (!found) throw new Error('在商品页未找到可下载的主图');
    log(`已识别主图：${sku}`, 'info');

    await saveOzonImageForSku(sku, found.src, location.href, '主图');
  }

  async function processSearchPage(sku) {
    statusText.textContent = `正在按SKU搜索 ${sku}（保存名：${getCustomSkuForSearchSku(sku)}）…`;
    const searchStartedAt = Date.now();
    const outcome = await waitUntil(() => {
      if (detectBlockedPage()) throw new Error('检测到Ozon验证或访问限制，请暂停后手动完成验证');
      if (looksLikeProductPage()) return { type: 'current-product', url: location.href };

      // 只有页面明确告罄时才启用“左侧原商品”特殊逻辑；正常商品完全沿用原来的搜索逻辑。
      if (isSoldOutSearchPage()) {
        const soldOutOriginal = findSoldOutOriginalProductTarget(sku);
        if (soldOutOriginal) return { type: 'sold-out-original', result: soldOutOriginal };

        // 诊断已确认：部分告罄页的“Похожие предложения”标题 DOM 左边界会变成 0，
        // 左侧原商品也可能不暴露 a/button 等可点击节点。此时不能因为找不到DOM就失败。
        // 当前任务 sku 与 URL 的 product_id 都明确指向原商品，因此构造一个只依赖原SKU的安全入口。
        const expectedId = normalizeProductId(sku) || normalizeProductId(new URLSearchParams(location.search).get('product_id'));
        if (expectedId) {
          return {
            type: 'sold-out-original',
            result: {
              element: null,
              url: `https://www.ozon.ru/product/${encodeURIComponent(expectedId)}/?oos_search=false`,
              method: '告罄页无可点击DOM，使用当前原SKU安全直达',
              exact: true,
              directOnly: true,
              clickPoints: [],
            },
          };
        }
        statusText.textContent = `检测到 ${sku} 已告罄，但无法确定原商品SKU…`;
        return null;
      }

      // 正常商品保持原来的处理逻辑：优先精确SKU商品链接，其次仍按普通搜索结果兜底进入详情页。
      const exactUrl = findExactProductLink(sku);
      if (exactUrl) return { type: 'exact-product', url: exactUrl };

      // 给精确商品/告罄卡片约 2.5 秒的优先加载窗口，再使用普通首个商品作为兜底。
      if (Date.now() - searchStartedAt < 2500) return null;
      const fallback = findFirstProductLink();
      return fallback ? { type: 'fallback-product', url: fallback } : null;
    }, settings.searchTimeout, 700);

    if (!outcome) {
      if (isSoldOutSearchPage()) {
        throw new Error('检测到原商品已告罄，但无法从当前任务SKU或product_id确定原商品详情入口；不会进入右侧相似推荐商品');
      }
      throw new Error('搜索页没有找到商品结果');
    }

    if (outcome.type === 'sold-out-original') {
      await processSoldOutSearchResult(sku, outcome.result);
      return;
    }

    if (outcome.type === 'current-product' || looksLikeProductPage()) {
      state.phase = 'product';
      saveState();
      await processProductPage(sku);
      return;
    }

    state.phase = 'product';
    saveState();
    if (outcome.type === 'exact-product') {
      log(`已按SKU精确匹配原商品链接，进入商品页：${sku}`, 'info');
    } else {
      log(`未找到精确SKU卡片，使用普通搜索结果兜底进入商品页：${sku}`, 'warn');
    }
    await sleep(800 + Math.floor(Math.random() * 700));
    location.assign(outcome.url);
  }

  async function failAndContinue(sku, error) {
    const message = error?.message || String(error);
    addResult(sku, '失败', message);
    state.index += 1;
    state.phase = 'search';
    state.currentSku = '';
    saveState();
    log(`${sku}：${message}`, 'error');

    if (/验证|访问限制|权限已失效|没有选择输出文件夹/.test(message)) {
      state.running = false;
      saveState();
      if (statusText) statusText.textContent = `任务已暂停：${message}`;
      log(`任务已暂停：${message}`, 'error');
      return;
    }

    await sleep(randomDelay());
    navigateToCurrentSku();
  }

  function navigateToCurrentSku() {
    if (!state.running) return;
    if (state.index >= state.skus.length) {
      finishTask();
      return;
    }
    const sku = state.skus[state.index];
    state.currentSku = sku;
    state.phase = 'search';
    saveState();
    location.assign(`${SEARCH_URL}${encodeURIComponent(sku)}`);
  }

  async function worker() {
    if (isWorkerActive || !state.running) return;
    isWorkerActive = true;
    try {
      if (!state.skus.length || state.index >= state.skus.length) {
        finishTask();
        return;
      }

      const sku = state.skus[state.index];
      state.currentSku = sku;
      saveState();

      if (detectBlockedPage()) throw new Error('检测到Ozon验证或访问限制，请暂停后手动完成验证');

      const directoryHandle = await getDirectoryHandle();
      if (!directoryHandle || (await getDirectoryPermission(directoryHandle, false)) !== 'granted') {
        state.running = false;
        saveState();
        log('文件夹授权不可用，请点击“选择文件夹”重新授权后继续', 'warn');
        return;
      }

      if (looksLikeProductPage()) {
        state.phase = 'product';
        saveState();
        await processProductPage(sku);
      } else if (location.pathname.startsWith('/search')) {
        await processSearchPage(sku);
      } else {
        navigateToCurrentSku();
      }
    } catch (error) {
      const sku = state.skus[state.index] || state.currentSku || '未知SKU';
      await failAndContinue(sku, error);
    } finally {
      isWorkerActive = false;
    }
  }

  function finishTask() {
    state.running = false;
    state.phase = 'done';
    state.currentSku = '';
    saveState();
    const successCount = state.results.filter(item => item.status === '成功').length;
    const failCount = state.results.filter(item => item.status === '失败').length;
    log(`全部完成：成功 ${successCount}，失败 ${failCount}`, failCount ? 'warn' : 'success');
    if (statusText) statusText.textContent = `全部完成：成功 ${successCount}，失败 ${failCount}`;
  }

  function exportResultsCsv() {
    if (!state.results.length) {
      log('暂时没有可导出的结果。', 'warn');
      if (statusText) statusText.textContent = '暂时没有可导出的结果';
      return;
    }
    const headers = ['搜索SKU', '自定义SKU/保存名', '状态', '信息/文件名', '商品链接', '图片链接', '时间'];
    const rows = state.results.map(item => [item.sku, item.customSku || getCustomSkuForSearchSku(item.sku), item.status, item.message, item.productUrl, item.imageUrl, item.time]);
    const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Ozon主图下载结果_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function startOrResume() {
    if (!state.skus.length) {
      log('请先选择Excel文件。', 'warn');
      if (statusText) statusText.textContent = '请先选择Excel文件';
      return;
    }

    let directoryHandle = await getDirectoryHandle();
    if (!directoryHandle) {
      try {
        directoryHandle = await chooseFolder();
      } catch (error) {
        if (error?.name !== 'AbortError') {
          log(error.message || String(error), 'error');
          if (statusText) statusText.textContent = error.message || String(error);
        }
        return;
      }
    }

    const permission = await getDirectoryPermission(directoryHandle, true);
    if (permission !== 'granted') {
      log('没有获得文件夹写入权限，请重新选择文件夹。', 'error');
      if (statusText) statusText.textContent = '没有文件夹写入权限，请重新选择';
      return;
    }

    if (state.index >= state.skus.length) {
      state.index = 0;
      state.results = [];
    }
    state.running = true;
    state.phase = 'search';
    state.startedAt = Date.now();
    saveState();
    log(`任务开始，共 ${state.skus.length} 个SKU`, 'success');
    navigateToCurrentSku();
  }

  function pauseTask() {
    state.running = false;
    saveState();
    log('任务已暂停', 'warn');
  }

  function resetTask() {
    if (!confirm('确定清空当前任务、进度和结果吗？已下载到文件夹的图片不会删除。')) return;
    state = { ...DEFAULT_STATE };
    GM_deleteValue(STATE_KEY);
    saveState();
    log('任务记录已清空', 'warn');
  }

  function createButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `kagura-ozon-button ${className || ''}`;
    button.textContent = text;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(onClick(event)).catch(error => {
        console.error(error);
        log(error.message || String(error), 'error');
      });
    });
    return button;
  }

  function bindOzonLogResizer(logElement, handle, targetPanel) {
    if (!logElement || !handle || !targetPanel) return;
    let startY = 0;
    let startH = 0;
    let startTop = 0;
    let dragging = false;

    handle.addEventListener('mousedown', event => {
      const panelRect = targetPanel.getBoundingClientRect();
      dragging = true;
      startY = event.clientY;
      startH = logElement.getBoundingClientRect().height;
      startTop = panelRect.top;

      targetPanel.style.top = `${panelRect.top}px`;
      targetPanel.style.bottom = 'auto';

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
      event.preventDefault();
      event.stopPropagation();
    });

    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      const delta = startY - event.clientY;
      const minHeight = 110;
      const maxByViewport = window.innerHeight * 0.55;
      const maxByTopSpace = startH + Math.max(0, startTop - 8);
      const maxHeight = Math.max(minHeight, Math.min(maxByViewport, maxByTopSpace));
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, startH + delta));
      const actualDelta = nextHeight - startH;

      logElement.style.height = `${nextHeight}px`;
      targetPanel.style.top = `${Math.max(8, startTop - actualDelta)}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    });
  }

  function createPanel() {
    GM_addStyle(`
      #kagura-ozon-panel { position: fixed; z-index: 2147483647; right: 16px; top: 90px; width: 365px; color: #172033; background: rgba(255,255,255,.98); border: 1px solid #d9e2f2; border-radius: 14px; box-shadow: 0 12px 36px rgba(20,45,90,.22); font: 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; overflow: hidden; }
      #kagura-ozon-panel * { box-sizing: border-box; }
      .kagura-ozon-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; color:#fff; background:linear-gradient(135deg,#005bff,#1b74ff); font-weight:700; cursor:move; user-select:none; }
      .kagura-ozon-body { padding:12px; }
      .kagura-ozon-row { display:flex; gap:8px; align-items:center; margin-bottom:9px; }
      .kagura-ozon-label { width:72px; flex:0 0 72px; color:#65738a; }
      .kagura-ozon-value { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
      .kagura-ozon-file { display:block; width:100%; padding:8px; border:1px dashed #a9b9d4; border-radius:8px; background:#f7faff; }
      .kagura-ozon-buttons { display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin:10px 0; }
      .kagura-ozon-button { border:0; border-radius:8px; padding:8px 7px; cursor:pointer; font-weight:650; background:#eef3fb; color:#244061; }
      .kagura-ozon-button:hover { filter:brightness(.97); }
      .kagura-ozon-primary { background:#005bff; color:#fff; }
      .kagura-ozon-danger { background:#ffe9e9; color:#b42318; }
      .kagura-ozon-success { background:#e8f7ee; color:#087a3f; }
      .kagura-ozon-settings { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:8px 0; }
      .kagura-ozon-settings label { color:#65738a; font-size:12px; }
      .kagura-ozon-settings input { width:100%; margin-top:3px; padding:6px; border:1px solid #d8e0ec; border-radius:6px; }
      .kagura-ozon-status { padding:8px 10px; border-radius:8px; background:#f2f6fc; margin:8px 0; color:#364d6b; }
      .kagura-ozon-progress { font-weight:700; color:#005bff; }
      .kagura-ozon-logbox { height:130px; min-height:110px; max-height:55vh; overflow:auto; padding:7px; border:1px solid #e0e7f0; border-radius:8px; background:#0f172a; color:#dbeafe; font:11px/1.45 Consolas,monospace; }
      .kagura-ozon-log-resizer { height:10px; margin:8px 0 4px; cursor:ns-resize; display:flex; align-items:center; justify-content:center; }
      .kagura-ozon-log-resizer::before { content:''; width:56px; height:4px; border-radius:99px; background:#cbd5e1; }
      .kagura-ozon-log { margin-bottom:3px; word-break:break-all; }
      .kagura-ozon-log-error { color:#fda4af; }
      .kagura-ozon-log-success { color:#86efac; }
      .kagura-ozon-log-warn { color:#fde68a; }
      .kagura-ozon-note { color:#7b8ba3; font-size:11px; margin-top:7px; }
      .kagura-ozon-toggle { border:0; background:transparent; color:#fff; cursor:pointer; font-size:17px; min-width:24px; min-height:24px; padding:0 2px; font-weight:800; }
      #kagura-ozon-panel.kagura-collapsed { width:48px !important; height:48px !important; min-width:48px; min-height:48px; border-radius:50%; overflow:hidden; background:transparent; }
      #kagura-ozon-panel.kagura-collapsed .kagura-ozon-body { display:none; }
      #kagura-ozon-panel.kagura-collapsed .kagura-ozon-header { width:48px; height:48px; padding:0; justify-content:center; border-radius:50%; cursor:move; }
      #kagura-ozon-panel.kagura-collapsed .kagura-ozon-header-title { display:none; }
      #kagura-ozon-panel.kagura-collapsed .kagura-ozon-toggle { width:48px; height:48px; padding:0; border-radius:50%; font-size:12px; letter-spacing:.2px; cursor:move; touch-action:none; user-select:none; }
    `);

    panel = document.createElement('section');
    panel.id = 'kagura-ozon-panel';
    panel.innerHTML = `
      <div class="kagura-ozon-header">
        <span class="kagura-ozon-header-title">Ozon SKU主图下载器 V${APP_VERSION}</span>
        <button class="kagura-ozon-toggle" title="折叠/展开">−</button>
      </div>
      <div class="kagura-ozon-body">
        <input class="kagura-ozon-file" type="file" accept=".xlsx,.xls,.xlsm,.csv" />
        <div class="kagura-ozon-row" style="margin-top:9px"><span class="kagura-ozon-label">表格</span><span class="kagura-ozon-value" data-role="file">未选择</span></div>
        <div class="kagura-ozon-row"><span class="kagura-ozon-label">输出文件夹</span><span class="kagura-ozon-value" data-role="folder">未选择</span></div>
        <div class="kagura-ozon-row"><span class="kagura-ozon-label">进度</span><span class="kagura-ozon-value kagura-ozon-progress" data-role="progress">0 / 0</span></div>
        <div class="kagura-ozon-status" data-role="status">等待导入Excel</div>
        <div class="kagura-ozon-settings">
          <label>最短间隔(ms)<input type="number" min="500" step="100" data-setting="delayMin"></label>
          <label>最长间隔(ms)<input type="number" min="500" step="100" data-setting="delayMax"></label>
        </div>
        <div class="kagura-ozon-buttons" data-role="buttons"></div>
        <div class="kagura-ozon-log-resizer" title="向上拖动：日志框向上扩展；向下拖动：缩小日志框"></div>
        <div class="kagura-ozon-logbox" data-role="log"></div>
        <div class="kagura-ozon-note">图片以“SKU.jpg”命名。任务运行时请保留当前Ozon标签页，不要手动切换商品页。</div>
      </div>`;
    document.documentElement.appendChild(panel);

    logBox = panel.querySelector('[data-role="log"]');
    bindOzonLogResizer(logBox, panel.querySelector('.kagura-ozon-log-resizer'), panel);
    statusText = panel.querySelector('[data-role="status"]');
    progressText = panel.querySelector('[data-role="progress"]');
    folderText = panel.querySelector('[data-role="folder"]');
    const fileText = panel.querySelector('[data-role="file"]');
    const fileInput = panel.querySelector('input[type="file"]');
    const buttons = panel.querySelector('[data-role="buttons"]');

    startButton = createButton('开始/继续', 'kagura-ozon-primary', startOrResume);
    buttons.append(
      createButton('选择文件夹', 'kagura-ozon-success', chooseFolder),
      startButton,
      createButton('暂停', '', pauseTask),
      createButton('导出结果', '', exportResultsCsv),
      createButton('重新搜索当前', '', () => {
        state.phase = 'search';
        state.running = true;
        saveState();
        navigateToCurrentSku();
      }),
      createButton('清空任务', 'kagura-ozon-danger', resetTask),
    );

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        statusText.textContent = '正在读取Excel…';
        const parsed = await parseExcel(file);
        state = {
          ...DEFAULT_STATE,
          skus: parsed.skus,
          customSkuMap: parsed.customSkuMap,
          importedFileName: file.name,
          importedSheetName: parsed.sheetName,
          importedHeader: parsed.header,
        };
        saveState();
        fileText.textContent = `${file.name}（${parsed.skus.length}个SKU）`;
        fileText.title = `${parsed.sheetName} / 搜索列：${parsed.header} / 保存名列：${parsed.customHeader}`;
        log(`已读取 ${parsed.skus.length} 组对应关系；按“${parsed.header}”搜索，按“${parsed.customHeader}”命名保存`, 'success');
      } catch (error) {
        statusText.textContent = 'Excel读取失败';
        log(error.message || String(error), 'error');
      } finally {
        fileInput.value = '';
      }
    });

    panel.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      input.value = settings[key];
      input.addEventListener('change', () => {
        settings[key] = Number(input.value) || DEFAULT_SETTINGS[key];
        if (settings.delayMax < settings.delayMin) settings.delayMax = settings.delayMin;
        saveSettings();
        panel.querySelector('[data-setting="delayMax"]').value = settings.delayMax;
      });
    });

    panel.querySelector('.kagura-ozon-toggle').addEventListener('click', event => {
      event.stopPropagation();
      if (panel.dataset.kaguraSuppressToggle === '1') {
        delete panel.dataset.kaguraSuppressToggle;
        return;
      }
      panel.classList.toggle('kagura-collapsed');
      const collapsed = panel.classList.contains('kagura-collapsed');
      event.currentTarget.textContent = collapsed ? 'OZ' : '−';
      event.currentTarget.title = collapsed ? '按住可拖动；点击恢复 Ozon 爬取窗口' : '缩小为图标';
      if (!collapsed) clampExpandedPanel(panel);
    });

    makeDraggable(panel, panel.querySelector('.kagura-ozon-header'));

    getDirectoryHandle().then(async handle => {
      if (!handle) return;
      folderText.textContent = handle.name;
      folderText.title = handle.name;
      const permission = await getDirectoryPermission(handle, false);
      if (permission !== 'granted') folderText.textContent = `${handle.name}（需重新授权）`;
    }).catch(error => log(error.message, 'warn'));

    if (state.importedFileName) {
      fileText.textContent = `${state.importedFileName}（${state.skus.length}个SKU）`;
      fileText.title = `${state.importedSheetName} / ${state.importedHeader}`;
    }

    updatePanel();
  }

  function updatePanel() {
    if (!panel) return;
    const total = state.skus.length;
    const done = Math.min(state.index, total);
    progressText.textContent = `${done} / ${total}`;
    if (!total) statusText.textContent = '等待导入Excel';
    else if (state.running) { const s = state.currentSku || state.skus[state.index] || ''; statusText.textContent = `运行中：搜索 ${s}${s ? ` → 保存 ${getCustomSkuForSearchSku(s)}` : ''}`; }
    else if (state.phase === 'done') statusText.textContent = '全部完成';
    else { const s = state.skus[state.index] || ''; statusText.textContent = s ? `已暂停：下一项搜索 ${s} → 保存 ${getCustomSkuForSearchSku(s)}` : '已暂停：无待处理项'; }
    startButton.textContent = state.running ? '运行中' : '开始/继续';
  }

  function makeDraggable(target, handle) {
    let pressed = false;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;
    const threshold = 5;

    handle.addEventListener('mousedown', event => {
      const onButton = Boolean(event.target.closest('button'));
      // 完整窗口时按钮维持原本点击行为；缩成图标后整个圆形按钮既可点击也可拖动。
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

  function clampExpandedPanel(target) {
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

  function initChatGPTModule() {
    const MODULE_NAME = `ChatGPT 批量生图下载器 V${APP_VERSION}`;
    const C_STATE_KEY = 'chatgptBatchImageStateV1';
    const C_SETTINGS_KEY = 'chatgptBatchImageSettingsV1';
    const C_DB_NAME = 'kagura-chatgpt-batch-image';
    const C_DB_STORE = 'handles';
    const C_SOURCE_DIR_KEY = 'source-directory';
    const C_OUTPUT_DIR_KEY = 'output-directory';
    const C_TEMPLATE_KEY = 'template-file';

    const MODULE_VERSION = APP_VERSION;
    const MODULE_CHANGELOG = [
      `V${APP_VERSION} 更新内容：`,
      '1. 修复运行记录框拖拽方向：向上拖动时，日志框和脚本窗口会向上扩展，不再向下越拉越长。',
      '2. 调整为“底部固定”逻辑：增大日志时保持脚本窗口底部基本不动，顶部随拖动方向移动。',
      '3. 向下拖动可缩小运行记录框，操作逻辑与常见窗口上边缘缩放一致。',
      '4. Ozon主图爬取模块和ChatGPT生图模块都加入同样的运行记录拖拽逻辑。',
      '5. 保留 V3.0.23 的待发送观察明细、上传失败整批重试、自适应识别等全部功能。'
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

    function cNowText() {
      return new Date().toLocaleTimeString('zh-CN', { hour12: false });
    }

    function cLog(message, type = 'info') {
      const prefix = type === 'error' ? '失败' : type === 'success' ? '成功' : type === 'warn' ? '提示' : '信息';
      console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](`[${MODULE_NAME}] ${message}`);
      if (!cLogBox) return;
      const line = document.createElement('div');
      line.className = `kagura-gpt-log kagura-gpt-log-${type}`;
      line.textContent = `[${cNowText()}] ${prefix}：${message}`;
      cLogBox.appendChild(line);
      while (cLogBox.children.length > 120) cLogBox.firstChild.remove();
      cLogBox.scrollTop = cLogBox.scrollHeight;
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
      const handle = await picker.call(unsafeWindow, { mode: 'read' });
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

    function cFindCreateImageMenuItem() {
      /*
       * 直接移植参考脚本 click_create_image 的核心识别策略：
       * - 只在当前可见区域寻找；
       * - 排除历史消息与本脚本面板；
       * - 从“创建图片”文字节点向上定位整行容器；
       * - “可视化呈现任何内容”及菜单浮层中的候选优先。
       */
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
      const primaryRegex = /(创建图片|创作图片|生成图片|create\s*image|generate\s*image)/i;
      const candidates = [];
      const seen = new Set();

      const visible = el => {
        if (!(el instanceof Element)) return false;
        const r = el.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return false;
        if (r.bottom < 0 || r.top > viewportH || r.right < 0 || r.left > viewportW) return false;
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0;
      };

      const menuLike = el => Boolean(el.closest?.([
        '[popover]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-menu-content]',
        '[data-headlessui-portal]',
        '[data-floating-ui-portal]',
        '[role="menu"]',
        '[role="dialog"]',
        '[role="listbox"]'
      ].join(',')));

      const addRow = (row, leafText = '') => {
        if (!(row instanceof Element) || seen.has(row) || !visible(row)) return;
        if (cIsInsideMessage(row) || cIsInsideOwnPanel(row)) return;
        const r = row.getBoundingClientRect();
        const rowText = cPlainText(row);
        const allText = `${rowText} ${row.getAttribute('aria-label') || ''} ${row.getAttribute('title') || ''}`.trim();
        if (!primaryRegex.test(allText)) return;
        if (rowText.length > 180) return;
        if (r.width < 110 || r.width > Math.min(900, viewportW * 0.82)) return;
        if (r.height < 28 || r.height > 125) return;

        // 与参考脚本一致，排除页面左上正文及最右侧悬浮面板区域。
        const minTop = Math.min(220, viewportH * 0.24);
        const minLeft = Math.min(250, viewportW * 0.15);
        if (r.top < minTop || r.left < minLeft || r.right > viewportW - 40) return;

        let score = 0;
        if (/^创建图片(?:\s|$)/.test(rowText)) score += 1500;
        else if (/^(创作图片|生成图片)(?:\s|$)/.test(rowText)) score += 1300;
        else if (/^(create\s*image|generate\s*image)(?:\s|$)/i.test(rowText)) score += 1300;
        else score += 600;
        if (/可视化/.test(rowText)) score += 1000;
        if (/任何内容/.test(rowText)) score += 500;
        if (/visualize|visualise/i.test(rowText)) score += 700;
        if (menuLike(row)) score += 350;
        if (row.matches('button,[role="menuitem"],[role="option"],[role="button"],[data-radix-collection-item]')) score += 260;
        if (getComputedStyle(row).cursor === 'pointer') score += 100;
        if (leafText && cPlainText(row) !== leafText) score += 80;
        score += r.top * 0.05;

        seen.add(row);
        candidates.push({ element: row, score, text: rowText, rect: r });
      };

      const nodes = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],div,span')];
      for (const el of nodes) {
        if (!visible(el) || cIsInsideMessage(el) || cIsInsideOwnPanel(el)) continue;
        const text = cPlainText(el);
        const aria = el.getAttribute('aria-label') || '';
        if (!primaryRegex.test(`${text} ${aria}`) || text.length > 180) continue;

        let row = el;
        for (let depth = 0, cur = el; depth < 8 && cur; depth += 1, cur = cur.parentElement) {
          if (!visible(cur) || cIsInsideMessage(cur) || cIsInsideOwnPanel(cur)) continue;
          const r = cur.getBoundingClientRect();
          const t = cPlainText(cur);
          if (primaryRegex.test(t)
            && t.length <= 180
            && r.width >= 110 && r.width <= Math.min(900, viewportW * 0.82)
            && r.height >= 28 && r.height <= 125) {
            row = cur;
          }
        }
        addRow(row, text);
      }

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0]) {
        const best = candidates[0];
        cLog(`已定位“创建图片”菜单项：${best.text.slice(0, 90)}；坐标 ${Math.round(best.rect.left + best.rect.width / 2)},${Math.round(best.rect.top + best.rect.height / 2)}`, 'info');
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
          await cSleep(500);

          const plus = await cWaitUntil(() => cFindComposerPlusButton(), 12000, 300);
          if (!plus) throw new Error('未找到输入框左侧“+”按钮');
          cSmartClick(plus);
          cLog('已点击输入框左侧“+”按钮', 'info');

          let menuItem = await cWaitUntil(() => cFindCreateImageMenuItem(), 8000, 250);
          if (!menuItem) {
            // 与参考脚本行为一致：首次点击可能只聚焦输入框，再点击一次展开菜单。
            cSmartClick(plus);
            await cSleep(700);
            menuItem = await cWaitUntil(() => cFindCreateImageMenuItem(), 6000, 250);
          }
          if (!menuItem) throw new Error('没有在当前加号菜单浮层里找到“创建图片”');

          cSmartClick(menuItem);
          cLog('已点击“创建图片”整行菜单项', 'info');

          const activated = await cWaitUntil(() => cHasCreateImageChip(), 5000, 300);
          if (!activated) throw new Error('点击后未检测到输入框附近的“创建图片”标签');

          cLog('创建图片模式添加成功', 'success');
          return;
        } catch (error) {
          lastError = error;
          cLog(`第 ${attempt} 次添加创建图片模式失败：${error.message || error}`, 'warn');
          cResetCreateImageMenuState();
          if (attempt < maxAttempts) await cSleep(2500);
        }
      }

      throw new Error(`创建图片模式添加失败，已原地重试 ${maxAttempts} 次。最后错误：${lastError?.message || lastError || '未知错误'}`);
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
        if (imgs.length < 2) continue;

        seen.add(node);
        let score = imgs.length * 100;
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
      const postCompleteSweepMs = 45000;
      const refreshFlags = (cState.resumeContext && cState.resumeContext.flags) ? cState.resumeContext.flags : {};

      while (Date.now() - started < timeout) {
        if (!cState.running) throw new CPausedError();
        const stopVisible = cIsStopButtonVisible();
        if (stopVisible) sawStop = true;

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
          cLog(`生图状态：${stateLabel}，图片数量已稳定 ${stableSince ? Math.floor((Date.now() - stableSince) / 1000) : 0} 秒`, 'info');
          lastLogAt = Date.now();
        }

        const stableFor = stableSince ? Date.now() - stableSince : 0;
        const reachedExpected = expectedCount <= 0 || ready.length >= expectedCount;
        const missingExpected = expectedCount > 0 && ready.length < expectedCount;

        if (missingExpected && completion.complete && !shortageLogged) {
          shortageLogged = true;
          cLog(`页面已显示生成完成，但当前仅识别 ${ready.length}/${expectedCount} 张。正在继续遍历右侧缩略图列表并等待 Chrome 懒加载，不会立即按少图结束。`, 'warn');
        }


        if (!completion.complete && stopVisible && elapsed >= 360000 && countStableFor >= 90000 && !refreshFlags.noFinishRefreshDone) {
          return cTriggerRefreshAndResume('生成已持续约6分钟，且图片数量 90 秒没有变化（仍在生成中）', 'noFinishRefreshDone');
        }
        if (ready.length === 0 && elapsed >= 600000 && !refreshFlags.zeroImageRefreshDone) {
          return cTriggerRefreshAndResume('长时间仍未检测到生成图，准备刷新页面后继续检测', 'zeroImageRefreshDone');
        }
        if (ready.length === 0 && !stopVisible && elapsed >= 360000 && countStableFor >= 60000) {
          throw new CSilentGenerationAbortError('已发送任务，但 6 分钟内始终未生成图片，且页面已不再显示生成状态，判定为静默中断');
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
          && stableFor >= 12000) {
          cLog(`完成后已额外遍历图库 ${Math.round(postCompleteSweepMs / 1000)} 秒，仍只识别 ${ready.length}/${expectedCount} 张。按异常批次保存现有结果并进入待确认。`, 'warn');
          return ready;
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

      cState.currentBatch = batchPaths;
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

            await cUploadFiles(sourceFiles, '原图');
            await cActivateCreateImage();
            const expectedAttachmentCount = await cUploadFiles([templateFile], '模板图');
            await cSetPrompt(cSettings.prompt);
            await cSendPrompt(expectedAttachmentCount, cSettings.prompt);
            promptSent = true;
            cState.phase = 'generating';
            cSaveState();
          } else {
            baselineKeys = new Set();
            promptSent = true;
            cState.phase = 'generating';
            cSaveState();
            if (cState.resumeContext?.kind === 'generation-refresh') {
              cLog(`已按刷新恢复机制回到第 ${cState.batchNo} 批，等待 10 秒后继续检测当前对话中的生成结果`, 'warn');
              await cSleep(10000);
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

          const saved = await cDownloadGenerated(generated, batchPaths, cState.batchNo);
          cState.results.push({
            batchNo: cState.batchNo,
            sourceFiles: batchPaths,
            generatedCount: generated.length,
            savedFiles: saved,
            time: new Date().toISOString(),
          });
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

          if (error instanceof CSilentGenerationAbortError && !silentResendUsed) {
            silentResendUsed = true;
            cState.resumeContext = {
              kind: 'retry-resend',
              batchNo: cState.batchNo,
              batchPaths: [...batchPaths],
              prompt: cSettings.prompt,
              flags: { ...(cState.resumeContext?.flags || {}), silentResendDone: true },
            };
            cSaveState();
            cLog('检测到 6 分钟 0 图且页面已停止生成，准备自动整批重发一次', 'warn');
            generalRetryCount += 1;
            mode = 'full';
            continue;
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
      }
      cState.running = true;
      cState.phase = 'ready';
      cState.startedAt = Date.now();
      cSaveState();
      cLog(`任务开始：${cState.imagePaths.length} 张原图，每批 ${cSettings.batchSize} 张`, 'success');
      cWorker();
    }

    function cPause() {
      cState.running = false;
      cSaveState();
      cLog('已请求暂停；当前页面操作结束后停止', 'warn');
    }

    function cSkipBatch() {
      if (!cState.imagePaths.length) return;
      const batchSize = Math.max(1, Number(cSettings.batchSize) || 10);
      const skipped = cState.imagePaths.slice(cState.index, cState.index + batchSize);
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
        .kagura-gpt-logbox { height:130px; overflow:auto; padding:7px; border:1px solid #d9e3df; border-radius:8px; background:#0f172a; color:#dbeafe; font:11px/1.45 Consolas,monospace; min-height:110px; max-height:55vh; }
        .kagura-gpt-log-resizer { height:10px; margin:8px 0 4px; cursor:ns-resize; display:flex; align-items:center; justify-content:center; }
        .kagura-gpt-log-resizer::before { content:''; width:56px; height:4px; border-radius:99px; background:#cbd5e1; }
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
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="progress">0 / 0</span></div>
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
          <div class="kagura-gpt-log-resizer" title="向上拖动：日志框向上扩展；向下拖动：缩小日志框"></div>
          <div class="kagura-gpt-logbox" data-role="log"></div>
          <div class="kagura-gpt-note">运行记录框上方灰色拖动条可向上拉大。</div>
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
      cBindLogResizer(cLogBox, cPanel.querySelector('.kagura-gpt-log-resizer'), cPanel);

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
      cProgressText.textContent = `${Math.min(cState.index, total)} / ${total}（第${cState.batchNo}批）`;
      if (cPendingText) cPendingText.textContent = `${pendingCount} 个异常批次`;
      if (!total) cStatusText.textContent = '请选择原图文件夹并扫描';
      else if (cState.running && cState.phase === 'batch_wait') { /* 倒计时由 cWaitBetweenBatches 实时更新 */ }
      else if (cState.running) cStatusText.textContent = `运行中：${cState.phase}`;
      else if (cState.phase === 'done') cStatusText.textContent = pendingCount ? `全部完成；待确认 ${pendingCount} 批` : '全部完成';
      else if (cState.phase === 'error') cStatusText.textContent = '发生错误，已暂停';
      else cStatusText.textContent = `已暂停：下一张 ${cState.imagePaths[cState.index] || '无'}`;
      cStartButton.textContent = cState.running ? '运行中' : '开始/继续';
    }

    cCreatePanel();
    cMaybeShowUpdateNotice();
    if (cState.running && cState.resumeContext?.kind === 'generation-refresh') {
      cLog(`检测到刷新恢复任务：第 ${cState.resumeContext.batchNo || cState.batchNo} 批，将在页面稳定后自动恢复检测`, 'warn');
      setTimeout(() => cWorker(), 1500);
    } else if (cState.running) {
      cState.running = false;
      cState.phase = 'ready';
      cSaveState();
      cLog('页面重新加载后已自动暂停，请重新授权并点击“开始/继续”', 'warn');
    }
  }


  createPanel();
  if (state.running) setTimeout(worker, 1200);
})();

/* ===== Kagura 手动更新检查 V3.0.33（检查版本 + 打开 Tampermonkey） ===== */
(() => {
  'use strict';

  const KAGURA_MANUAL_VERSION = '3.0.34';
  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';

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

  function openTampermonkeyUpdate(result) {
    const steps = '请在 Tampermonkey 中找到“ Ozon主图下载 + ChatGPT批量生图助手 ” → 铅笔/编辑 → 设置 → 检查用户脚本的更新 → Overwrite（覆盖）。';
    try {
      const tm = unsafeWindow?.external?.Tampermonkey || window?.external?.Tampermonkey;
      if (tm && typeof tm.openOptions === 'function') {
        tm.openOptions('nav=dashboard');
        result.textContent += `\n\n已尝试打开 Tampermonkey 管理面板。${steps}`;
        return true;
      }
    } catch (error) {
      console.warn('[Kagura] 打开 Tampermonkey 管理面板失败：', error);
    }
    result.textContent += `\n\n当前浏览器没有向网页开放 Tampermonkey 管理面板入口。${steps}`;
    return false;
  }

  function showUpdateDialog(panel) {
    let overlay = panel.querySelector(':scope > .kagura-manual-update-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'kagura-manual-update-overlay';
      overlay.innerHTML = `
        <div class="kagura-manual-update-modal">
          <div class="kagura-manual-update-title">手动检查更新</div>
          <div class="kagura-manual-update-result" data-role="result">当前版本：V${KAGURA_MANUAL_VERSION}\n\n脚本窗口只负责手动检查版本；实际更新请使用 Tampermonkey 原生“检查用户脚本的更新”并选择 Overwrite（覆盖）。</div>
          <div class="kagura-manual-update-actions">
            <button type="button" data-role="check">检查更新</button>
            <button type="button" data-role="open-tm" style="display:none">前往 Tampermonkey 更新</button>
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
              `发现新版本：V${info.latest}\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\n\n点击“前往 Tampermonkey 更新”打开 Tampermonkey 管理面板。为避免产生重复脚本，不会打开 Raw 安装页；实际更新请使用本脚本的“检查用户脚本的更新”并点 Overwrite（覆盖）。`;
            openTm.style.display = '';
            openTm.onclick = () => openTampermonkeyUpdate(result);
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
      `当前版本：V${KAGURA_MANUAL_VERSION}\n\n点击“检查更新”只查询 GitHub 版本；发现新版后可点“前往 Tampermonkey 更新”打开管理面板。实际覆盖仍由 Tampermonkey 原生更新流程完成。`;
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
    const header = panel.querySelector('.kagura-gpt-header-title, .kagura-ozon-header-title');
    if (header) {
      const prefix = panel.id === 'kagura-gpt-panel'
        ? 'ChatGPT 批量生图下载器'
        : 'Ozon SKU主图下载器';
      header.textContent = `${prefix} V${KAGURA_MANUAL_VERSION}`;
    }

    // 在脚本窗口右下角“版本处”增加检查更新按钮。
    const body = panel.querySelector('.kagura-gpt-body, .kagura-ozon-body') || panel;
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
    document.querySelectorAll('#kagura-gpt-panel, #kagura-ozon-panel').forEach(patchPanel);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  document.querySelectorAll('#kagura-gpt-panel, #kagura-ozon-panel').forEach(patchPanel);
})();

/* KAGURA_UPDATE_UI_V3034 */
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
    return node?.closest?.('#kagura-gpt-panel, #kagura-ozon-panel')
      || document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
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

  // Capture the old update buttons before their original click handlers run.
  document.addEventListener('click', event => {
    const updateButton = event.target.closest?.('.kagura-startup-update-now, .kagura-manual-update-actions [data-role="open-tm"]');
    if (updateButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showGuide(updateButton);
      return;
    }

    const versionButton = event.target.closest?.('[data-role="version"], .kagura-gpt-version-btn, .kagura-ozon-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHistory(versionButton);
    }
  }, true);
})();
