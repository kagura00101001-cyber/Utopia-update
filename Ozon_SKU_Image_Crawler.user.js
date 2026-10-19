// ==UserScript==
// @name         Ozon SKU主图批量下载器
// @namespace    https://github.com/Kagura-userscripts/ozon-sku-image-crawler
// @version      1.0.1-dev.1
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.user.js
// @description  独立版 Ozon SKU 主图批量下载器，支持 Excel、断点续跑和地区不可配送安全恢复。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
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

/* KAGURA_OZON_CRAWLER_UPDATE_V100 */
(() => {
  'use strict';

  const CURRENT_VERSION = '1.0.1-dev.1';
  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/ozon-sku-image-crawler.latest.json?ref=ozon-crawler-region-fallback-fix-test-20261019';
  const INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.user.js';
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
    document.querySelectorAll('[id*="version-modal"]').forEach(node => {
      if (String(node.textContent || '').includes('脚本更新说明')) node.remove();
    });
  }

  const legacyStyle = document.createElement('style');
  legacyStyle.id = 'kagura-disable-legacy-release-note';
  legacyStyle.textContent = '[id*="version-modal"]{display:none!important;}';
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
      const panel = document.querySelector('#kagura-ozon-panel');
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

  const APP_VERSION = '1.0.0';

  if (!/(^|\.)ozon\.ru$/i.test(location.hostname)) return;

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
    expectedDetailSku: '',
    expectedDetailSource: '',
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

  function normalizeOzonText(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function inspectRegionUnavailableEvidence() {
    const regionPattern = /не\s+доставляется\s+в\s+(?:ваш|выбранный|указанный)\s+регион|не\s+доставляется\s+по\s+вашему\s+адресу|(?:не\s+доступен|недоступен)\s+для\s+доставки\s+в\s+(?:ваш|выбранный|указанный)\s+регион|not\s+available\s+for\s+delivery\s+to\s+your\s+region|not\s+delivered\s+to\s+your\s+region|cannot\s+be\s+delivered\s+to\s+your\s+region|can't\s+be\s+delivered\s+to\s+your\s+region|not\s+deliverable\s+to\s+your\s+region|无法配送到.{0,12}地区|不支持配送到.{0,12}地区/i;
    const similarPattern = /похожие\s+(?:предложения|товары)|рекомендуем\s+также|similar\s+(?:offers|products)|you\s+may\s+also\s+like|we\s+also\s+recommend|相似(?:推荐|商品)|为您推荐/i;
    const elements = [...document.querySelectorAll('h1,h2,h3,h4,div,span,p')].filter(isVisible);
    const texts = elements.map(element => normalizeOzonText(element.innerText || element.textContent || '')).filter(text => text.length > 0);
    const markerVisible = texts.filter(text => text.length <= 240).some(text => regionPattern.test(text));
    const similarLayoutVisible = texts.filter(text => text.length <= 120).some(text => similarPattern.test(text));
    return { markerVisible, similarLayoutVisible, confirmed: markerVisible };
  }

  function safeExactOzonProductUrl(href, expectedId) {
    if (!href || !/^\d{6,}$/.test(String(expectedId || ''))) return '';
    try {
      const url = new URL(String(href), location.href);
      if (url.protocol !== 'https:' || !/(^|\.)ozon\.ru$/i.test(url.hostname)) return '';
      if (!/\/product\//i.test(url.pathname)) return '';
      return productIdFromHref(url.href) === String(expectedId) ? url.href : '';
    } catch (_) { return ''; }
  }

  function findRegionUnavailableNativeTarget(sku) {
    const targetId = cleanSku(sku);
    const widgets = [...document.querySelectorAll('[id^="state-webOutOfStock-"]')];
    log('OZON_REGION_OOS_STATE_SCANNED: expected=' + targetId + '; count=' + widgets.length, widgets.length ? 'info' : 'warn');
    let mismatchCount = 0;
    let invalidCount = 0;
    for (const node of widgets) {
      let state;
      try { state = JSON.parse(node.getAttribute('data-state') || ''); }
      catch (_) { invalidCount += 1; continue; }
      const action = state?.common?.action;
      if (action?.behavior !== 'BEHAVIOR_TYPE_REDIRECT' || !String(action?.link || '').trim()) {
        invalidCount += 1; continue;
      }
      let parsedUrl;
      try { parsedUrl = new URL(String(action.link), location.href); }
      catch (_) { invalidCount += 1; continue; }
      const actualId = productIdFromHref(parsedUrl.href);
      if (actualId !== targetId) { mismatchCount += 1; continue; }
      const safeUrl = safeExactOzonProductUrl(parsedUrl.href, targetId);
      if (!safeUrl) { invalidCount += 1; continue; }
      log('OZON_REGION_OOS_STATE_EXACT_FOUND: expected=' + targetId + '; source=webOutOfStock', 'success');
      return { url: safeUrl, productId: actualId, method: 'native-webOutOfStock' };
    }
    if (mismatchCount) log('OZON_REGION_OOS_STATE_MISMATCH: expected=' + targetId + '; rejected=' + mismatchCount, 'warn');
    if (invalidCount) log('OZON_REGION_OOS_STATE_INVALID: rejected=' + invalidCount, 'warn');
    return null;
  }

  async function processRegionUnavailableSearchResult(sku) {
    const targetId = cleanSku(sku);
    if (!/^\d{6,}$/.test(targetId)) {
      throw new Error('REGION_EXACT_NOT_FOUND: input SKU is not a valid numeric product ID (' + (targetId || 'empty') + ')');
    }
    let targetUrl = safeExactOzonProductUrl(findExactProductLink(targetId), targetId);
    let method = 'region-exact-href';
    if (targetUrl) {
      log('OZON_REGION_EXACT_HREF_FOUND: sku=' + targetId, 'success');
    } else {
      const nativeTarget = findRegionUnavailableNativeTarget(targetId);
      if (nativeTarget) { targetUrl = nativeTarget.url; method = 'region-native-widget'; }
    }
    if (!targetUrl) {
      log('REGION_EXACT_NOT_FOUND: expected=' + targetId + '; no exact visible href or exact webOutOfStock identity', 'error');
      throw new Error('REGION_EXACT_PRODUCT_NOT_FOUND: no exact original-product identity was found in the visible link or webOutOfStock data-state; recommended products were not used');
    }
    state.phase = 'product';
    state.currentSku = sku;
    state.expectedDetailSku = targetId;
    state.expectedDetailSource = method;
    state.soldOutExpectedSku = '';
    saveState();
    statusText.textContent = '地区不可配送：仅尝试原 SKU ' + targetId + '（' + method + '）…';
    log('REGION_UNAVAILABLE: sku=' + targetId + '; recovery=' + method + '; recommended products are forbidden', 'success');
    await sleep(400 + Math.floor(Math.random() * 400));
    location.assign(targetUrl);
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
    state.expectedDetailSku = cleanSku(sku);
    state.expectedDetailSource = 'sold-out-recovery';
    state.soldOutExpectedSku = cleanSku(sku);
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
    const expectedSku = cleanSku(state.expectedDetailSku || state.soldOutExpectedSku);
    const expectedSource = cleanSku(state.expectedDetailSource) || (state.soldOutExpectedSku ? 'sold-out-recovery' : '');
    if (expectedSku) {
      const expected = normalizeProductId(expectedSku);
      const current = currentProductIdFromPage();
      if (!/^\d{6,}$/.test(expected) || !current) {
        state.expectedDetailSku = ''; state.expectedDetailSource = ''; state.soldOutExpectedSku = '';
        state.phase = 'search'; saveState();
        throw new Error((expectedSource.startsWith('region-') ? 'REGION_EXACT_NOT_FOUND: ' : 'DETAIL_ID_UNVERIFIABLE: ') + 'expected SKU ' + expectedSku + '; current detail ID could not be verified; image download blocked');
      }
      if (current !== expected) {
        state.expectedDetailSku = ''; state.expectedDetailSource = ''; state.soldOutExpectedSku = '';
        state.phase = 'search'; saveState();
        throw new Error((expectedSource.startsWith('region-') ? 'REGION_EXACT_NOT_FOUND: ' : 'DETAIL_ID_MISMATCH: ') + 'expected SKU ' + expected + '; actual product ' + current + '; image download blocked');
      }
      log('OZON_DETAIL_ID_VERIFIED: expected=' + expected + '; source=' + (expectedSource || 'existing-flow'), 'success');
      if (expectedSource === 'region-safe-fallback') log('OZON_REGION_OOS_FALLBACK_SUCCESS: verified product ID=' + expected, 'success');
      state.expectedDetailSku = ''; state.expectedDetailSource = ''; state.soldOutExpectedSku = '';
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

      // 正常商品的精确链接始终优先；仅在没有精确 href 时才进入地区不可配送恢复。
      const exactUrl = findExactProductLink(sku);
      if (exactUrl) return { type: 'exact-product', url: exactUrl };
      const regionEvidence = inspectRegionUnavailableEvidence();
      // 明确的不可配送文案本身足以判定异常，不依赖推荐模块是否存在。
      if (regionEvidence.confirmed) return { type: 'region-unavailable', evidence: regionEvidence };
      if (regionEvidence.markerVisible) {
        statusText.textContent = '检测到地区不可配送提示，正在等待可验证的原商品入口（' + sku + '）…';
        return null;
      }

      // 给精确商品/告罄卡片约 2.5 秒的优先加载窗口，再使用普通首个商品作为兜底。
      if (Date.now() - searchStartedAt < 2500) return null;
      const fallback = findFirstProductLink();
      return fallback ? { type: 'fallback-product', url: fallback } : null;
    }, settings.searchTimeout, 700);

    if (!outcome) {
      if (isSoldOutSearchPage()) {
        throw new Error('检测到原商品已告罄，但无法从当前任务SKU或product_id确定原商品详情入口；不会进入右侧相似推荐商品');
      }
      const regionEvidence = inspectRegionUnavailableEvidence();
      if (regionEvidence.markerVisible) {
        throw new Error('REGION_EXACT_NOT_FOUND: visible region-unavailable marker detected but no safe original-product entry was found; similar/recommended products were not used');
      }
      throw new Error('搜索页没有找到商品结果');
    }

    if (outcome.type === 'sold-out-original') {
      await processSoldOutSearchResult(sku, outcome.result);
      return;
    }

    if (outcome.type === 'region-unavailable') {
      await processRegionUnavailableSearchResult(sku);
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

      if ((state.expectedDetailSku || state.soldOutExpectedSku) && !looksLikeProductPage()) {
        const expected = cleanSku(state.expectedDetailSku || state.soldOutExpectedSku);
        const expectedSource = cleanSku(state.expectedDetailSource);
        state.expectedDetailSku = ''; state.expectedDetailSource = ''; state.soldOutExpectedSku = '';
        state.phase = 'search'; saveState();
        throw new Error((expectedSource.startsWith('region-') ? 'REGION_EXACT_NOT_FOUND: ' : 'DETAIL_ID_UNVERIFIABLE: ') + 'expected SKU ' + expected + '; navigation did not reach a product detail page; image download blocked');
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

  createPanel();
  if (state.running) setTimeout(worker, 1200);
})();

/* ===== Kagura 手动更新检查 V1.0.0（Ozon crawler-only） ===== */
(() => {
  'use strict';

  const KAGURA_MANUAL_VERSION = '1.0.0';
  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/ozon-sku-image-crawler.latest.json?ref=ozon-crawler-region-fallback-fix-test-20261019';
  const KAGURA_INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.user.js';

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
    const header = panel.querySelector('.kagura-ozon-header-title');
    if (header) {
      const prefix = panel.id === 'kagura-ozon-panel'
        ? 'Ozon SKU主图批量下载器'
        : 'Ozon SKU主图批量下载器';
      header.textContent = `${prefix} V${KAGURA_MANUAL_VERSION}`;
    }

    // 在脚本窗口右下角“版本处”增加检查更新按钮。
    const body = panel.querySelector('.kagura-ozon-body') || panel;
    let versionButton = body.querySelector('[data-role="version"], .kagura-ozon-version-btn');
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
    document.querySelectorAll('#kagura-ozon-panel').forEach(patchPanel);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  document.querySelectorAll('#kagura-ozon-panel').forEach(patchPanel);
})();

/* KAGURA_UPDATE_UI_V100_OZON_ONLY */
(() => {
  'use strict';

  const HISTORY_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/ozon-sku-image-crawler.history.json?ref=main';
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
    return node?.closest?.('#kagura-ozon-panel')
      || document.querySelector('#kagura-ozon-panel');
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
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">2</span><div class="kagura-update-guide-text">进入 <b>管理面板</b>，找到“ Ozon SKU主图批量下载器 ”。</div></div>
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
    const versionButton = event.target.closest?.('[data-role="version"], .kagura-ozon-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHistory(versionButton);
    }
  }, true);
})();
