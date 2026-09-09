// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V4 DEV
// @namespace    https://github.com/Kagura-userscripts/v4-dev
// @version      4.1.0-dev.20
// @description  Kagura AI 电商图片助手 V4 DEV TEST：修复Excel任务表误选、历史日志误触发上传额度、折叠AI入口纵向拉伸；继承dev.19.3创建图片优先顺序。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/testing/4.1.0-dev.19.2/Ozon_ChatGPT_DEV_4.1.0-dev.19.2_TEST.user.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/testing/4.1.0-dev.19.3/Ozon_ChatGPT_DEV_4.1.0-dev.19.3_TEST.user.js
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
// @connect      kagura-auth-v2-staging.1715396266.workers.dev
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/protected/Ozon_ChatGPT_DEV.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/protected/Ozon_ChatGPT_DEV.user.js
// ==/UserScript==

;(() => {
  'use strict';

  const VERSION = '4.1.0-dev.20';
  const TAG = '[KaguraDev20]';
  const log = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);

  // FIX A - Excel任务表只按“成对业务表头”资格识别，不按工作表名/总行数/!ref。
  function normalizeHeader(value) {
    return String(value ?? '').replace(/[\s\u3000]+/g, '').trim().toLowerCase();
  }

  const SKU_HEADERS = new Set(['跟卖sku']);
  const NAME_HEADERS = new Set(['自定义货号', '自定义sku', '上架sku']);

  function analyzeTaskSheet(sheet, sheetIndex) {
    if (!sheet || !globalThis.XLSX?.utils?.sheet_to_json) return null;
    let rows;
    try {
      rows = globalThis.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
    } catch (_) {
      return null;
    }
    if (!Array.isArray(rows) || !rows.length) return null;

    const scanLimit = Math.min(rows.length, 60);
    let best = null;
    for (let headerRow = 0; headerRow < scanLimit; headerRow++) {
      const row = Array.isArray(rows[headerRow]) ? rows[headerRow] : [];
      const normalized = row.map(normalizeHeader);
      const skuCol = normalized.findIndex(v => SKU_HEADERS.has(v));
      const nameCol = normalized.findIndex(v => NAME_HEADERS.has(v));
      if (skuCol < 0 || nameCol < 0) continue;

      let validPairs = 0;
      let partiallyUsed = 0;
      for (let r = headerRow + 1; r < rows.length; r++) {
        const current = Array.isArray(rows[r]) ? rows[r] : [];
        const sku = normalizeHeader(current[skuCol]);
        const name = normalizeHeader(current[nameCol]);
        if (sku || name) partiallyUsed++;
        if (sku && name) validPairs++;
      }
      const density = validPairs / Math.max(1, partiallyUsed);
      const candidate = { sheetIndex, headerRow, skuCol, nameCol, validPairs, density };
      if (!best || candidate.validPairs > best.validPairs ||
          (candidate.validPairs === best.validPairs && candidate.density > best.density) ||
          (candidate.validPairs === best.validPairs && candidate.density === best.density && candidate.headerRow < best.headerRow)) best = candidate;
    }
    return best;
  }

  function selectQualifiedTaskSheet(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets) return workbook;
    const originalNames = [...workbook.SheetNames];
    const candidates = [];
    originalNames.forEach((sheetName, sheetIndex) => {
      const info = analyzeTaskSheet(workbook.Sheets[sheetName], sheetIndex);
      if (info) candidates.push({ ...info, sheetName });
    });

    if (!candidates.length) {
      warn('Excel结构选表：未找到同时包含【跟卖SKU】和【自定义货号/自定义SKU/上架SKU】的工作表；保持原Workbook交给核心报错。');
      return workbook;
    }

    candidates.sort((a, b) => b.validPairs - a.validPairs || b.density - a.density || a.sheetIndex - b.sheetIndex);
    const winner = candidates[0];
    workbook.SheetNames = [winner.sheetName];
    try {
      Object.defineProperty(workbook, '__kaguraDev20OriginalSheetNames', { value: originalNames, configurable: true, enumerable: false });
      Object.defineProperty(workbook, '__kaguraDev20TaskSheet', { value: winner, configurable: true, enumerable: false });
    } catch (_) {}

    log('Excel结构选表完成', {
      sheet: winner.sheetName,
      validPairs: winner.validPairs,
      density: Number(winner.density.toFixed(4)),
      headerRow: winner.headerRow + 1,
      candidates: candidates.map(x => `${x.sheetName}:${x.validPairs}`),
    });
    return workbook;
  }

  function installExcelTaskSheetGuard() {
    const XLSX = globalThis.XLSX;
    if (!XLSX || typeof XLSX.read !== 'function') { warn('XLSX.read 不可用，Excel结构选表保护未安装'); return; }
    if (XLSX.read.__kaguraDev20Wrapped) return;
    const originalRead = XLSX.read;
    function guardedRead(...args) {
      const workbook = originalRead.apply(this, args);
      try { return selectQualifiedTaskSheet(workbook); }
      catch (error) { warn('Excel结构选表保护异常，回退原Workbook', error); return workbook; }
    }
    Object.defineProperty(guardedRead, '__kaguraDev20Wrapped', { value: true });
    XLSX.read = guardedRead;
    log('Excel任务表结构识别保护已安装：必须同时存在 跟卖SKU + 自定义货号/自定义SKU/上架SKU');
  }

  // FIX B - 上传失败/额度扫描不得读取Kagura自己的历史日志和聊天历史消息。
  function isKaguraOwnedNode(node) {
    if (!(node instanceof Element)) return false;
    try {
      if (node.closest([
        '#kagura-gpt-panel', '#kagura-ozon-panel', '#kagura-pod-panel', '#kagura-pod-log-window',
        '#kagura-auth-v4-host', '#kagura-auth-v4-member-chip', '[id^="kagura-"]',
        '[class^="kagura-"]', '[class*=" kagura-"]'
      ].join(','))) return true;
    } catch (_) {}
    return false;
  }

  function isConversationHistoryNode(node) {
    if (!(node instanceof Element)) return false;
    try { return Boolean(node.closest('[data-message-author-role], article[data-testid*="conversation"], [data-testid^="conversation-turn-"]')); }
    catch (_) { return false; }
  }

  function looksLikeUploadFailureCollector(selector) {
    const s = String(selector || '').replace(/\s+/g, '').replace(/'/g, '"').toLowerCase();
    return s.includes('[role="alert"]') && s.includes('[role="dialog"]') &&
      (s.includes('[aria-live="assertive"]') || s.includes('[aria-live="polite"]')) && s.includes('[class*="error"]');
  }

  function installOwnLogExclusionGuard() {
    const proto = Document.prototype;
    const current = proto.querySelectorAll;
    if (typeof current !== 'function' || current.__kaguraDev20Wrapped) return;
    function guardedQuerySelectorAll(selector) {
      const result = current.call(this, selector);
      if (this !== document || !looksLikeUploadFailureCollector(selector)) return result;
      const filtered = Array.from(result).filter(node => !isKaguraOwnedNode(node) && !isConversationHistoryNode(node));
      Object.defineProperty(filtered, 'item', { value(index) { return filtered[index] ?? null; }, enumerable: false });
      if (filtered.length !== result.length) log('已从上传失败/额度检测候选中排除 Kagura 自身日志或历史消息', { before: result.length, after: filtered.length });
      return filtered;
    }
    Object.defineProperty(guardedQuerySelectorAll, '__kaguraDev20Wrapped', { value: true });
    proto.querySelectorAll = guardedQuerySelectorAll;
    log('上传失败/额度误判保护已安装：Kagura自身日志与聊天历史消息不再作为当前错误证据');
  }

  // FIX C - 折叠AI入口被旧的min-height/用户resize尺寸撑成长椭圆。
  function installCollapsedLauncherGeometryFix() {
    if (document.getElementById('kagura-dev20-collapsed-launcher-fix')) return;
    const style = document.createElement('style');
    style.id = 'kagura-dev20-collapsed-launcher-fix';
    style.textContent = `
#kagura-gpt-panel.kagura-collapsed,
#kagura-ozon-panel.kagura-collapsed {
  width:48px !important; height:48px !important;
  min-width:48px !important; min-height:48px !important;
  max-width:48px !important; max-height:48px !important;
  aspect-ratio:1 / 1 !important; border-radius:50% !important;
  resize:none !important; overflow:hidden !important;
}
#kagura-gpt-panel.kagura-collapsed .kagura-gpt-header,
#kagura-ozon-panel.kagura-collapsed .kagura-ozon-header {
  width:48px !important; height:48px !important;
  min-width:48px !important; min-height:48px !important;
  max-width:48px !important; max-height:48px !important;
  padding:0 !important; margin:0 !important; border-radius:50% !important; overflow:hidden !important;
}
#kagura-gpt-panel.kagura-collapsed #kagura-auth-v4-member-chip,
#kagura-ozon-panel.kagura-collapsed #kagura-auth-v4-member-chip { display:none !important; }
`;
    (document.head || document.documentElement).appendChild(style);
    log('折叠AI入口几何修复已安装：collapsed固定48×48，消除min-height/resize纵向拉伸');
  }

  for (const [name, installer] of [
    ['Excel结构选表', installExcelTaskSheetGuard],
    ['上传额度误判保护', installOwnLogExclusionGuard],
    ['AI折叠几何', installCollapsedLauncherGeometryFix],
  ]) {
    try { installer(); }
    catch (error) { warn(`${name} 安装失败；其它修复继续安装`, error); }
  }

  globalThis.__KaguraDev20Fixes = {
    version: VERSION,
    normalizeHeader,
    analyzeTaskSheet,
    selectQualifiedTaskSheet,
    isKaguraOwnedNode,
    looksLikeUploadFailureCollector,
  };

  log('dev.20 三项修复已启用：Excel结构选表 / 历史日志额度误判 / AI折叠长椭圆');
})();
