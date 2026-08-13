// ==UserScript==
// @name         Ozon 自动投诉 V1.0.0
// @name:zh-CN   Ozon 自动投诉 V1.1.2
// @namespace    kagura.ozon.auto.complaint
// @version      1.1.2
// @description  从 Excel/CSV 读取 SKU 与申诉链接自动循环投诉；支持 GitHub 手动检查更新。
// @author       Kagura
// @match        https://seller.ozon.ru/*
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_ID = 'kagura-ozon-complaint';
  const STORAGE_KEY = 'kagura_ozon_complaint_v1_state';
  const UI_STORAGE_KEY = 'kagura_ozon_complaint_ui_v1';
  const VERSION = '1.1.2';

  // 热更新采用与之前稳定版相同的“完整脚本 + latest.json + 手动检查更新”结构。
  // 不做运行时远程载荷/Base64 分片加载，避免旧版 atob 分片错误。
  const UPDATE_MANIFEST_URL =
    'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_Complaint.latest.json';
  const UPDATE_FALLBACK_INSTALL_URL =
    'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_Complaint.user.js';

  const DEFAULTS = {
    reply1Terms: ['要确认内容的版权', '发送给我们'],
    reply2Terms: ['感谢您提供的信息', '核查'],
    readyTerms: ['把您要投诉的商品', 'SKU'],
    replyTimeoutMs: 120000,
    readyTimeoutMs: 30000,
    actionMinMs: 700,
    actionMaxMs: 1500,
    cycleMinMs: 1800,
    cycleMaxMs: 3500,
  };

  let state = loadState();
  let uiState = loadUiState();
  let running = false;
  let stopRequested = false;
  let currentRunToken = 0;

  function loadUiState() {
    try {
      const raw = localStorage.getItem(UI_STORAGE_KEY);
      if (!raw) return { minimized: false, x: null, y: null };
      const obj = JSON.parse(raw);
      return {
        minimized: Boolean(obj.minimized),
        x: Number.isFinite(Number(obj.x)) ? Number(obj.x) : null,
        y: Number.isFinite(Number(obj.y)) ? Number(obj.y) : null,
      };
    } catch {
      return { minimized: false, x: null, y: null };
    }
  }

  function saveUiState() {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState));
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), Math.max(min, max));
  }

  function applyUiPosition(box) {
    if (!box) return;

    const rect = box.getBoundingClientRect();
    let x = uiState.x;
    let y = uiState.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      x = Math.max(8, window.innerWidth - rect.width - 16);
      y = Math.max(8, window.innerHeight - rect.height - 16);
    }

    x = clamp(x, 8, window.innerWidth - rect.width - 8);
    y = clamp(y, 8, window.innerHeight - rect.height - 8);

    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
    box.style.right = 'auto';
    box.style.bottom = 'auto';

    uiState.x = Math.round(x);
    uiState.y = Math.round(y);
    saveUiState();
  }

  function applyUiMode(box) {
    if (!box) return;
    box.classList.toggle('kg-minimized', uiState.minimized);
    requestAnimationFrame(() => applyUiPosition(box));
  }

  function setMinimized(minimized) {
    uiState.minimized = Boolean(minimized);
    saveUiState();
    const box = document.getElementById(SCRIPT_ID);
    applyUiMode(box);
  }

  function enableDrag(box) {
    if (!box || box.dataset.dragReady === '1') return;
    box.dataset.dragReady = '1';

    let drag = null;

    const startDrag = (e, source) => {
      if (e.button !== 0) return;
      if (source === 'head' && e.target.closest('button, input, label, a')) return;

      const rect = box.getBoundingClientRect();
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
        source,
      };

      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
      e.preventDefault();
    };

    const moveDrag = e => {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;

      const rect = box.getBoundingClientRect();
      const x = clamp(drag.left + dx, 8, window.innerWidth - rect.width - 8);
      const y = clamp(drag.top + dy, 8, window.innerHeight - rect.height - 8);

      box.style.left = `${Math.round(x)}px`;
      box.style.top = `${Math.round(y)}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    };

    const endDrag = e => {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const moved = drag.moved;
      const source = drag.source;
      drag = null;

      const rect = box.getBoundingClientRect();
      uiState.x = Math.round(rect.left);
      uiState.y = Math.round(rect.top);
      saveUiState();

      if (source === 'icon' && !moved) setMinimized(false);
    };

    const head = box.querySelector('.kg-head');
    const icon = box.querySelector('.kg-collapsed-icon');

    head?.addEventListener('pointerdown', e => startDrag(e, 'head'));
    icon?.addEventListener('pointerdown', e => startDrag(e, 'icon'));
    window.addEventListener('pointermove', moveDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    window.addEventListener('resize', () => applyUiPosition(box));
  }

  function defaultState() {
    return {
      version: VERSION,
      fileName: '',
      skuHeader: '',
      linkHeader: '',
      rows: [],
      settings: { ...DEFAULTS },
      logs: [],
      updatedAt: Date.now(),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const obj = JSON.parse(raw);
      return {
        ...defaultState(),
        ...obj,
        settings: { ...DEFAULTS, ...(obj.settings || {}) },
        rows: Array.isArray(obj.rows) ? obj.rows : [],
        logs: Array.isArray(obj.logs) ? obj.logs.slice(-200) : [],
      };
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    state.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  }

  function log(msg, level = 'info') {
    const time = new Date().toLocaleTimeString();
    state.logs.push({ time, msg, level });
    state.logs = state.logs.slice(-200);
    console[level === 'error' ? 'error' : 'log'](`[Ozon投诉] ${msg}`);
    saveState();
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function randomMs(min, max) {
    return Math.round(min + Math.random() * Math.max(0, max - min));
  }

  function actionDelay() {
    return sleep(randomMs(state.settings.actionMinMs, state.settings.actionMaxMs));
  }

  function cycleDelay() {
    return sleep(randomMs(state.settings.cycleMinMs, state.settings.cycleMaxMs));
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      s.opacity !== '0' &&
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth;
  }

  function normalize(s) {
    return String(s ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function editableText(el) {
    if (!el) return '';
    if ('value' in el) return String(el.value || '');
    return String(el.innerText || el.textContent || '');
  }

  function findComposer() {
    const selectors = [
      'textarea[placeholder*="客服"]',
      'textarea[placeholder*="短信"]',
      'textarea[placeholder*="сообщ"]',
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      'input[type="text"]',
    ];

    let candidates = [];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!isVisible(el)) continue;
        if (el.closest(`#${SCRIPT_ID}`)) continue;

        const ph = normalize(el.getAttribute('placeholder') || '');
        if (/搜索|search|根据请求/i.test(ph)) continue;

        const r = el.getBoundingClientRect();
        let score = 0;
        if (/客服|短信|сообщ|message/i.test(ph)) score += 100;
        if (el.tagName === 'TEXTAREA') score += 40;
        if (el.getAttribute('contenteditable') === 'true') score += 30;
        score += Math.max(0, r.top / 10); // 越靠下越优先
        if (r.width > 300) score += 20;
        candidates.push({ el, score });
      }
      if (candidates.length) break;
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function setNativeValue(el, value) {
    el.focus();

    if (el.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      try {
        document.execCommand('insertText', false, value);
      } catch {
        el.textContent = value;
      }
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSendButton(composer) {
    const cr = composer.getBoundingClientRect();
    let root = composer.parentElement;
    let buttons = [];

    for (let depth = 0; root && depth < 6; depth++, root = root.parentElement) {
      const local = [...root.querySelectorAll('button, [role="button"]')]
        .filter(el => isVisible(el) && !el.closest(`#${SCRIPT_ID}`));

      for (const el of local) {
        const r = el.getBoundingClientRect();
        const aria = normalize(
          (el.getAttribute('aria-label') || '') + ' ' +
          (el.getAttribute('title') || '') + ' ' +
          (el.textContent || '')
        );
        if (/附件|attach|paperclip/i.test(aria)) continue;

        let score = 0;
        if (/发送|send|отправ/i.test(aria)) score += 200;
        if (r.left >= cr.right - 30) score += 80;
        if (Math.abs((r.top + r.bottom) / 2 - (cr.top + cr.bottom) / 2) < 80) score += 50;
        if (r.width <= 80 && r.height <= 80) score += 20;
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') score -= 500;
        buttons.push({ el, score });
      }
      if (buttons.some(x => x.score >= 200)) break;
    }

    buttons.sort((a, b) => b.score - a.score);
    return buttons.find(x => x.score > 0)?.el || null;
  }

  async function sendText(text) {
    const composer = findComposer();
    if (!composer) throw new Error('找不到聊天输入框');

    setNativeValue(composer, String(text));
    await sleep(250);

    if (!normalize(editableText(composer))) {
      throw new Error('文字未成功写入聊天输入框');
    }

    let sent = false;
    const btn = findSendButton(composer);
    if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
      btn.click();
      await sleep(600);
      sent = !normalize(editableText(composer));
    }

    if (!sent) {
      composer.focus();
      composer.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }));
      composer.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }));
      await sleep(700);
      sent = !normalize(editableText(composer));
    }

    if (!sent) {
      throw new Error('未确认消息已发送，为避免重复投诉已自动暂停');
    }
  }

  function textFromMutation(m) {
    const chunks = [];

    if (m.type === 'characterData') {
      const p = m.target?.parentElement;
      if (p && !p.closest?.(`#${SCRIPT_ID}`)) {
        chunks.push(normalize(p.innerText || p.textContent || ''));
        if (p.parentElement && !p.parentElement.closest?.(`#${SCRIPT_ID}`)) {
          chunks.push(normalize(p.parentElement.innerText || p.parentElement.textContent || ''));
        }
      }
    }

    for (const n of m.addedNodes || []) {
      const el = n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
      if (!el || el.closest?.(`#${SCRIPT_ID}`)) continue;
      const txt = normalize(el.innerText || el.textContent || n.textContent || '');
      if (txt) chunks.push(txt);

      const p = el.parentElement;
      if (p && !p.closest?.(`#${SCRIPT_ID}`)) {
        const pt = normalize(p.innerText || p.textContent || '');
        if (pt && pt.length < 1500) chunks.push(pt);
      }
    }

    return chunks.join('\n');
  }

  function waitForNewText(terms, timeoutMs, label) {
    const required = terms.map(normalize).filter(Boolean);
    if (!required.length) return Promise.resolve('');

    return new Promise((resolve, reject) => {
      let done = false;
      const started = Date.now();

      const cleanup = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
      };

      const observer = new MutationObserver(mutations => {
        if (done) return;
        for (const m of mutations) {
          const txt = textFromMutation(m);
          if (!txt) continue;
          if (required.every(t => txt.includes(t))) {
            cleanup();
            resolve(txt);
            return;
          }
        }
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${label || '等待客服回复'}超时（${Math.round((Date.now() - started) / 1000)}秒）`));
      }, timeoutMs);
    });
  }

  function exactTextCandidates(text) {
    const target = normalize(text);
    const nodes = [...document.querySelectorAll('button, [role="button"], a, span, div')];
    const out = [];

    for (const el of nodes) {
      if (!isVisible(el) || el.closest(`#${SCRIPT_ID}`)) continue;
      const t = normalize(el.innerText || el.textContent || '');
      if (t !== target) continue;

      // 优先最小文本节点 / 可点击元素，避免选中大容器
      const childSame = [...el.children].some(c => normalize(c.innerText || c.textContent || '') === target);
      if (childSame && !['BUTTON', 'A'].includes(el.tagName) && el.getAttribute('role') !== 'button') continue;

      const r = el.getBoundingClientRect();
      let score = r.top;
      if (['BUTTON', 'A'].includes(el.tagName) || el.getAttribute('role') === 'button') score += 10000;
      if (getComputedStyle(el).cursor === 'pointer') score += 5000;
      out.push({ el, score, r });
    }

    out.sort((a, b) => b.score - a.score);
    return out;
  }

  async function clickReturn() {
    await actionDelay();
    const cands = exactTextCandidates('返回');
    if (!cands.length) throw new Error('找不到“返回”按钮');

    const target = cands[0].el;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(300);
    target.click();
  }

  function currentTokenValid(token) {
    return token === currentRunToken && !stopRequested;
  }

  async function processRow(row, idx, token) {
    row.status = 'running';
    row.error = '';
    saveState();

    log(`第 ${idx + 1}/${state.rows.length} 条：发送 SKU ${row.sku}`);

    let p1 = waitForNewText(
      state.settings.reply1Terms,
      state.settings.replyTimeoutMs,
      '等待“发送证据链接”回复'
    );
    await sendText(row.sku);

    if (!currentTokenValid(token)) return;
    await p1;
    log(`SKU ${row.sku}：已收到“发送证据链接”回复`);

    await actionDelay();
    if (!currentTokenValid(token)) return;

    let p2 = waitForNewText(
      state.settings.reply2Terms,
      state.settings.replyTimeoutMs,
      '等待“核查完成受理”回复'
    );
    await sendText(row.link);

    if (!currentTokenValid(token)) return;
    await p2;
    log(`SKU ${row.sku}：链接已提交，已收到核查回复`);

    await actionDelay();
    if (!currentTokenValid(token)) return;

    const readyPromise = waitForNewText(
      state.settings.readyTerms,
      state.settings.readyTimeoutMs,
      '等待下一轮 SKU 提示'
    ).catch(() => null);

    await clickReturn();
    await readyPromise;

    row.status = 'done';
    row.completedAt = Date.now();
    saveState();
    log(`SKU ${row.sku}：完成`);
  }

  async function runQueue() {
    if (running) return;
    if (!state.rows.length) {
      log('请先导入表格', 'error');
      return;
    }

    running = true;
    stopRequested = false;
    const token = ++currentRunToken;
    render();

    try {
      for (let i = 0; i < state.rows.length; i++) {
        if (!currentTokenValid(token)) break;

        const row = state.rows[i];
        if (row.status === 'done') continue;

        try {
          await processRow(row, i, token);
        } catch (err) {
          row.status = 'error';
          row.error = String(err?.message || err);
          saveState();
          log(`SKU ${row.sku} 失败：${row.error}`, 'error');

          // 不自动重发，避免产生重复投诉
          stopRequested = true;
          break;
        }

        if (!currentTokenValid(token)) break;
        await cycleDelay();
      }
    } finally {
      running = false;
      render();

      if (state.rows.length && state.rows.every(r => r.status === 'done')) {
        log('全部 SKU 已完成');
      } else if (stopRequested) {
        log('任务已暂停，可处理异常后点击“继续”');
      }
    }
  }

  function pauseRun() {
    stopRequested = true;
    currentRunToken++;
    running = false;
    render();
    log('已请求暂停；不会继续发送下一条');
  }

  function resetProgress() {
    for (const r of state.rows) {
      r.status = 'pending';
      r.error = '';
      delete r.completedAt;
    }
    saveState();
    log('已重置全部进度');
  }

  function clearAll() {
    stopRequested = true;
    currentRunToken++;
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    render();
  }

  function cellDisplay(cell) {
    if (!cell) return '';
    if (cell.w != null && cell.w !== '') return String(cell.w).trim();
    if (cell.v != null) return String(cell.v).trim();
    return '';
  }

  function cellLink(cell) {
    if (!cell) return '';
    if (cell.l?.Target) return String(cell.l.Target).trim();
    const v = cellDisplay(cell);
    const m = v.match(/https?:\/\/\S+/i);
    return m ? m[0] : v;
  }

  function findHeaderIndex(headers, type) {
    const hs = headers.map(x => normalize(x).toLowerCase());
    const patterns = type === 'sku'
      ? [/^sku$/i, /商品.?sku/i, /投诉.?sku/i, /货号/i, /自定义.?sku/i]
      : [/申诉.?链接/i, /证据.?链接/i, /链接/i, /^url$/i, /^link$/i, /google.?drive/i, /版权.?链接/i];

    for (const re of patterns) {
      const idx = hs.findIndex(h => re.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseSheetRows(ws) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const headerRow = range.s.r;
    const headers = [];

    for (let c = range.s.c; c <= range.e.c; c++) {
      headers.push(cellDisplay(ws[XLSX.utils.encode_cell({ r: headerRow, c })]));
    }

    const skuIdx = findHeaderIndex(headers, 'sku');
    const linkIdx = findHeaderIndex(headers, 'link');

    if (skuIdx < 0 || linkIdx < 0) {
      throw new Error(`无法自动识别列。表头需要包含 SKU/货号 列，以及 申诉链接/证据链接/链接 列。当前表头：${headers.join(' | ')}`);
    }

    const rows = [];
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const skuCell = ws[XLSX.utils.encode_cell({ r, c: range.s.c + skuIdx })];
      const linkCell = ws[XLSX.utils.encode_cell({ r, c: range.s.c + linkIdx })];
      const sku = cellDisplay(skuCell).replace(/\.0$/, '').trim();
      const link = cellLink(linkCell).trim();

      if (!sku && !link) continue;
      if (!sku || !link) {
        rows.push({
          sku,
          link,
          status: 'error',
          error: !sku ? 'SKU 为空' : '申诉链接为空',
          sourceRow: r + 1,
        });
        continue;
      }

      rows.push({
        sku,
        link,
        status: 'pending',
        error: '',
        sourceRow: r + 1,
      });
    }

    return {
      rows,
      skuHeader: headers[skuIdx],
      linkHeader: headers[linkIdx],
    };
  }

  async function importFile(file) {
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellText: true, cellDates: false });
      const first = wb.SheetNames[0];
      if (!first) throw new Error('表格没有工作表');

      const parsed = parseSheetRows(wb.Sheets[first]);

      state.fileName = file.name;
      state.skuHeader = parsed.skuHeader;
      state.linkHeader = parsed.linkHeader;
      state.rows = parsed.rows;
      saveState();

      log(`已导入 ${file.name}：${parsed.rows.length} 条；SKU列=${parsed.skuHeader}；链接列=${parsed.linkHeader}`);
    } catch (err) {
      log(`导入失败：${err?.message || err}`, 'error');
    }
  }

  function exportCsv() {
    if (!state.rows.length) return;

    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['序号', 'SKU', '申诉链接', '状态', '错误', '原表行号'].map(esc).join(','),
      ...state.rows.map((r, i) => [
        i + 1,
        r.sku,
        r.link,
        r.status,
        r.error || '',
        r.sourceRow || '',
      ].map(esc).join(',')),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Ozon投诉执行结果_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }


  function compareVersions(a, b) {
    const pa = String(a || '').split('.').map(v => parseInt(v, 10) || 0);
    const pb = String(b || '').split('.').map(v => parseInt(v, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const av = pa[i] || 0;
      const bv = pb[i] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  function requestText(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const finalUrl = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;

      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: finalUrl,
          timeout,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          onload: res => {
            if (res.status >= 200 && res.status < 300) {
              resolve(res.responseText || '');
            } else {
              reject(new Error(`HTTP ${res.status}`));
            }
          },
          onerror: () => reject(new Error('网络请求失败')),
          ontimeout: () => reject(new Error('检查更新超时')),
        });
        return;
      }

      fetch(finalUrl, { cache: 'no-store' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(resolve, reject);
    });
  }

  function normalizeChangelog(value) {
    if (Array.isArray(value)) return value.map(x => String(x)).filter(Boolean);
    if (typeof value === 'string') {
      return value
        .split(/\r?\n/)
        .map(x => x.replace(/^\s*[-•]\s*/, '').trim())
        .filter(Boolean);
    }
    return [];
  }

  function showUpdatePanel(info) {
    const box = document.getElementById(SCRIPT_ID);
    if (!box) return;

    const panel = box.querySelector('#kg-update-panel');
    const title = box.querySelector('#kg-update-title');
    const body = box.querySelector('#kg-update-body');
    const installBtn = box.querySelector('#kg-update-install');

    title.textContent = info.title || '检查更新';
    body.innerHTML = info.html || '';
    installBtn.style.display = info.installUrl ? '' : 'none';
    installBtn.dataset.url = info.installUrl || '';
    installBtn.textContent = info.installText || '打开更新安装页';
    panel.style.display = 'flex';
  }

  function hideUpdatePanel() {
    const box = document.getElementById(SCRIPT_ID);
    const panel = box?.querySelector('#kg-update-panel');
    if (panel) panel.style.display = 'none';
  }

  async function checkForUpdate() {
    const box = document.getElementById(SCRIPT_ID);
    const btn = box?.querySelector('#kg-check-update');
    if (btn?.dataset.checking === '1') return;

    if (btn) {
      btn.dataset.checking = '1';
      btn.textContent = '检查中…';
    }

    log(`正在检查更新：当前 V${VERSION}`);

    try {
      const text = await requestText(UPDATE_MANIFEST_URL);
      let manifest;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new Error('latest.json 格式错误');
      }

      const latest = normalize(manifest.version || manifest.latest_version);
      if (!latest) throw new Error('latest.json 缺少 version');

      const installUrl = normalize(
        manifest.install_url ||
        manifest.download_url ||
        manifest.user_js ||
        UPDATE_FALLBACK_INSTALL_URL
      );
      const changes = normalizeChangelog(
        manifest.changelog || manifest.notes || manifest.update_notes
      );

      if (compareVersions(latest, VERSION) > 0) {
        const listHtml = changes.length
          ? `<div class="kg-update-list">${changes.map(x => `<div>• ${escapeHtml(x)}</div>`).join('')}</div>`
          : '<div class="kg-mini">未提供更新说明。</div>';

        showUpdatePanel({
          title: '发现新版本',
          html:
            `<div class="kg-update-vers">当前版本：<b>V${escapeHtml(VERSION)}</b><br>` +
            `最新版本：<b style="color:#146cff">V${escapeHtml(latest)}</b></div>` +
            `<div style="margin-top:8px;font-weight:600">更新内容</div>${listHtml}` +
            `<div class="kg-update-tip">点击“打开更新安装页”后，由 Tampermonkey 显示更新确认页。确认更新后会覆盖同一条脚本，不使用运行时远程载荷。</div>`,
          installUrl,
        });
        log(`发现新版本 V${latest}`);
      } else {
        showUpdatePanel({
          title: '已经是最新版本',
          html:
            `<div>当前版本：<b>V${escapeHtml(VERSION)}</b></div>` +
            `<div style="margin-top:6px">GitHub 最新版本：<b>V${escapeHtml(latest)}</b></div>`,
        });
        log(`当前已是最新版本 V${VERSION}`);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      showUpdatePanel({
        title: '检查更新失败',
        html:
          `<div style="color:#c62828">${escapeHtml(msg)}</div>` +
          `<div class="kg-update-tip">请确认 GitHub 中已上传 Ozon_Complaint.latest.json 和 Ozon_Complaint.user.js，并且仓库可通过 Raw 地址访问。</div>`,
      });
      log(`检查更新失败：${msg}`, 'error');
    } finally {
      if (btn) {
        btn.dataset.checking = '0';
        btn.textContent = `V${VERSION} · 检查更新`;
      }
    }
  }

  function openInstallUrl(url) {
    if (!url) return;
    try {
      if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: true, insert: true, setParent: true });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function ensureUI() {
    if (document.getElementById(SCRIPT_ID)) return;

    const box = document.createElement('div');
    box.id = SCRIPT_ID;
    box.innerHTML = `
      <style>
        #${SCRIPT_ID}{
          position:fixed; right:16px; bottom:16px; z-index:2147483647;
          width:360px; background:#fff; color:#202124;
          border:1px solid #dfe3e8; border-radius:12px;
          box-shadow:0 8px 30px rgba(0,0,0,.16);
          font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
          overflow:hidden;
        }
        #${SCRIPT_ID} *{box-sizing:border-box}
        #${SCRIPT_ID} .kg-head{
          display:flex; align-items:center; justify-content:space-between;
          padding:10px 10px 10px 12px; font-weight:700; background:#f7f9fc;
          border-bottom:1px solid #e8ecf1; cursor:move; user-select:none;
          touch-action:none;
        }
        #${SCRIPT_ID} .kg-head-left{display:flex;align-items:center;gap:8px;min-width:0}
        #${SCRIPT_ID} .kg-head-actions{display:flex;align-items:center;gap:5px}
        #${SCRIPT_ID} .kg-ver{font-weight:400;color:#8a94a3;font-size:12px;white-space:nowrap}
        #${SCRIPT_ID} .kg-minimize{
          width:27px;height:27px;padding:0;border:0!important;border-radius:6px!important;
          font-size:18px!important;line-height:24px;background:transparent!important;color:#667085;
          cursor:pointer!important;
        }
        #${SCRIPT_ID} .kg-minimize:hover{background:#e9eef6!important;color:#146cff}
        #${SCRIPT_ID} .kg-collapsed-icon{
          display:none;width:50px;height:50px;border-radius:14px;
          align-items:center;justify-content:center;
          background:#146cff;color:#fff;font-size:25px;font-weight:700;
          box-shadow:0 8px 25px rgba(20,108,255,.30);
          cursor:move;user-select:none;touch-action:none;
          border:2px solid rgba(255,255,255,.92);
        }
        #${SCRIPT_ID}.kg-minimized{
          width:50px;height:50px;background:transparent;border:0;border-radius:14px;
          box-shadow:none;overflow:visible;
        }
        #${SCRIPT_ID}.kg-minimized .kg-head,
        #${SCRIPT_ID}.kg-minimized .kg-body,
        #${SCRIPT_ID}.kg-minimized .kg-update-panel{display:none!important}
        #${SCRIPT_ID}.kg-minimized .kg-collapsed-icon{display:flex}
        #${SCRIPT_ID} .kg-body{padding:10px 12px}
        #${SCRIPT_ID} .kg-row{display:flex;gap:7px;align-items:center;margin:7px 0}
        #${SCRIPT_ID} button,#${SCRIPT_ID} .kg-file{
          border:1px solid #ccd3dd; background:#fff; border-radius:7px;
          padding:6px 10px; cursor:pointer; font-size:12px;
        }
        #${SCRIPT_ID} button:hover,#${SCRIPT_ID} .kg-file:hover{background:#f3f6fa}
        #${SCRIPT_ID} button.kg-primary{background:#146cff;color:#fff;border-color:#146cff}
        #${SCRIPT_ID} button.kg-danger{color:#c62828}
        #${SCRIPT_ID} input[type=file]{display:none}
        #${SCRIPT_ID} .kg-stat{
          padding:8px; background:#f7f9fc; border-radius:8px; color:#4b5563;
        }
        #${SCRIPT_ID} .kg-log{
          height:150px; overflow:auto; resize:vertical;
          border:1px solid #e3e8ef; border-radius:8px; padding:7px;
          background:#0f1720; color:#dbe7f5; font:12px/1.45 Consolas,monospace;
        }
        #${SCRIPT_ID} .kg-log .error{color:#ffb4b4}
        #${SCRIPT_ID} .kg-mini{font-size:12px;color:#6b7280;word-break:break-all}
        #${SCRIPT_ID} .kg-progress{
          height:6px;background:#e8edf3;border-radius:999px;overflow:hidden;margin-top:7px
        }
        #${SCRIPT_ID} .kg-progress>i{
          display:block;height:100%;background:#146cff;width:0%
        }
        #${SCRIPT_ID} .kg-footer{
          margin-top:8px;padding-top:8px;border-top:1px solid #edf0f4;
          display:flex;justify-content:flex-end;
        }
        #${SCRIPT_ID} .kg-update-link{
          border:0;background:transparent;padding:2px 0;color:#6b7280;
          cursor:pointer;font-size:12px;
        }
        #${SCRIPT_ID} .kg-update-link:hover{color:#146cff;background:transparent}
        #${SCRIPT_ID} .kg-update-panel{
          display:none;position:absolute;inset:0;z-index:10;
          background:rgba(20,28,40,.25);align-items:center;justify-content:center;
          padding:14px;
        }
        #${SCRIPT_ID} .kg-update-card{
          width:100%;max-height:90%;overflow:auto;background:#fff;
          border-radius:10px;box-shadow:0 12px 35px rgba(0,0,0,.2);
          padding:14px;
        }
        #${SCRIPT_ID} .kg-update-title{font-size:15px;font-weight:700;margin-bottom:8px}
        #${SCRIPT_ID} .kg-update-list{
          margin-top:5px;padding:8px;background:#f7f9fc;border-radius:7px;
          max-height:150px;overflow:auto;
        }
        #${SCRIPT_ID} .kg-update-tip{
          margin-top:9px;padding:8px;border-radius:7px;background:#fff8e8;
          color:#725c1d;font-size:12px;
        }
        #${SCRIPT_ID} .kg-update-actions{
          display:flex;gap:8px;justify-content:flex-end;margin-top:12px
        }
      </style>
      <div class="kg-head" title="按住标题栏可拖动">
        <div class="kg-head-left">
          <span>Ozon 自动投诉</span>
          <span class="kg-ver">V${VERSION}</span>
        </div>
        <div class="kg-head-actions">
          <button id="kg-minimize" class="kg-minimize" title="缩小成图标">−</button>
        </div>
      </div>
      <div class="kg-collapsed-icon" title="拖动可移动；单击恢复">⚑</div>
      <div class="kg-body">
        <div class="kg-row">
          <label class="kg-file">选择 Excel/CSV
            <input id="kg-file-input" type="file" accept=".xlsx,.xls,.csv">
          </label>
          <button id="kg-start" class="kg-primary">开始/继续</button>
          <button id="kg-pause">暂停</button>
        </div>
        <div class="kg-row">
          <button id="kg-reset">重置进度</button>
          <button id="kg-export">导出结果</button>
          <button id="kg-clear" class="kg-danger">清空</button>
        </div>
        <div id="kg-stat" class="kg-stat"></div>
        <div id="kg-fileinfo" class="kg-mini" style="margin:7px 0"></div>
        <div class="kg-progress"><i id="kg-progress-bar"></i></div>
        <div style="margin:8px 0 5px;font-weight:600">运行记录</div>
        <div id="kg-log" class="kg-log"></div>
        <div class="kg-footer">
          <button id="kg-check-update" class="kg-update-link">V${VERSION} · 检查更新</button>
        </div>
      </div>

      <div id="kg-update-panel" class="kg-update-panel">
        <div class="kg-update-card">
          <div id="kg-update-title" class="kg-update-title">检查更新</div>
          <div id="kg-update-body"></div>
          <div class="kg-update-actions">
            <button id="kg-update-close">关闭</button>
            <button id="kg-update-install" class="kg-primary" style="display:none">打开更新安装页</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(box);

    box.querySelector('#kg-file-input').addEventListener('change', e => {
      importFile(e.target.files?.[0]);
      e.target.value = '';
    });
    box.querySelector('#kg-start').addEventListener('click', runQueue);
    box.querySelector('#kg-pause').addEventListener('click', pauseRun);
    box.querySelector('#kg-reset').addEventListener('click', () => {
      if (confirm('确认把所有执行状态重置为待处理？')) resetProgress();
    });
    box.querySelector('#kg-export').addEventListener('click', exportCsv);
    box.querySelector('#kg-clear').addEventListener('click', () => {
      if (confirm('确认清空已导入的数据和进度？')) clearAll();
    });
    box.querySelector('#kg-check-update').addEventListener('click', checkForUpdate);
    box.querySelector('#kg-minimize').addEventListener('click', () => setMinimized(true));
    box.querySelector('#kg-update-close').addEventListener('click', hideUpdatePanel);
    box.querySelector('#kg-update-install').addEventListener('click', e => {
      const url = e.currentTarget.dataset.url || '';
      if (url) {
        log('已打开 Tampermonkey 更新安装页，请确认覆盖更新');
        openInstallUrl(url);
      }
    });

    enableDrag(box);
    applyUiMode(box);
    render();
  }

  function render() {
    const box = document.getElementById(SCRIPT_ID);
    if (!box) return;

    const total = state.rows.length;
    const done = state.rows.filter(r => r.status === 'done').length;
    const err = state.rows.filter(r => r.status === 'error').length;
    const runningCount = state.rows.filter(r => r.status === 'running').length;
    const pending = total - done - err - runningCount;
    const pct = total ? Math.round(done / total * 100) : 0;

    box.querySelector('#kg-stat').innerHTML =
      `总数 <b>${total}</b> ｜ 完成 <b>${done}</b> ｜ 待处理 <b>${Math.max(0,pending)}</b> ｜ 异常 <b>${err}</b>` +
      (running ? ' ｜ <b style="color:#146cff">运行中</b>' : '');

    box.querySelector('#kg-fileinfo').textContent = state.fileName
      ? `文件：${state.fileName} ｜ SKU列：${state.skuHeader || '-'} ｜ 链接列：${state.linkHeader || '-'}`
      : '未导入表格';

    box.querySelector('#kg-progress-bar').style.width = `${pct}%`;

    const icon = box.querySelector('.kg-collapsed-icon');
    if (icon) {
      icon.title = running
        ? `Ozon 自动投诉运行中｜完成 ${done}/${total}｜拖动可移动；单击恢复`
        : `Ozon 自动投诉｜完成 ${done}/${total}｜拖动可移动；单击恢复`;
    }

    const logBox = box.querySelector('#kg-log');
    logBox.innerHTML = state.logs.slice(-80).map(x =>
      `<div class="${x.level === 'error' ? 'error' : ''}">[${x.time}] ${escapeHtml(x.msg)}</div>`
    ).join('');
    logBox.scrollTop = logBox.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function boot() {
    if (!/seller\.ozon\.ru$/i.test(location.hostname)) return;
    ensureUI();

    // Ozon 是 SPA，页面切换后保证面板仍在
    setInterval(() => {
      if (!document.getElementById(SCRIPT_ID)) ensureUI();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
