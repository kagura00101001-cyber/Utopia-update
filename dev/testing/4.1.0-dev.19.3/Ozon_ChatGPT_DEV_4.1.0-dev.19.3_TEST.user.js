// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V4 DEV
// @namespace    https://github.com/Kagura-userscripts/v4-dev
// @version      4.1.0-dev.19.3
// @description  Kagura AI 电商图片助手 V4 DEV TEST：严格先启用创建图片并等待 Composer 重挂载稳定，再把图片文件交给 ChatGPT 上传。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/testing/4.1.0-dev.19.2/Ozon_ChatGPT_DEV_4.1.0-dev.19.2_TEST.user.js
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
  if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname)) return;

  const TAG = '[CreateImageFirst193]';
  const proto = HTMLInputElement.prototype;
  const previousFiles = Object.getOwnPropertyDescriptor(proto, 'files');
  if (!previousFiles?.get || !previousFiles?.set) {
    console.warn(TAG, 'files descriptor unavailable');
    return;
  }

  const eventProto = EventTarget.prototype;
  const previousDispatch = eventProto.dispatchEvent;
  const pending = new WeakMap();

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const log = (...args) => console.log(TAG, ...args);

  function visible(node) {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function norm(node) {
    if (!(node instanceof Element)) return '';
    return [
      node.textContent || '',
      node.getAttribute('aria-label') || '',
      node.getAttribute('title') || '',
      node.getAttribute('data-testid') || '',
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function strictComposer() {
    const api = globalThis.__KaguraComposerLifecycleDev19;
    const parts = api?.getCurrentComposer?.();
    if (parts?.composer instanceof Element && parts.composer.isConnected) return parts.composer;
    const forms = [...document.querySelectorAll('form[data-type="unified-composer"]')].filter(visible);
    return forms.length === 1 ? forms[0] : null;
  }

  function strictComposerForInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return null;
    const composer = input.closest('form[data-type="unified-composer"]');
    return composer && composer.isConnected ? composer : null;
  }

  function hasImageFiles(value) {
    try {
      return Array.from(value || []).some(file => file instanceof File && /^image\//i.test(file.type || ''));
    } catch (_) {
      return false;
    }
  }

  function makeFileList(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    return dt.files;
  }

  function activeEvidence(composer) {
    if (!(composer instanceof Element) || !composer.isConnected) return false;
    const nodes = composer.querySelectorAll('button, [role="button"], [aria-pressed], [aria-selected], [aria-checked], [data-state], [aria-label], [title], span, div');
    for (const node of nodes) {
      if (!visible(node)) continue;
      const text = norm(node);
      if (!/创建图片|create image/i.test(text)) continue;
      const state = String(node.getAttribute?.('data-state') || '').toLowerCase();
      const pressed = String(node.getAttribute?.('aria-pressed') || '').toLowerCase();
      const selected = String(node.getAttribute?.('aria-selected') || '').toLowerCase();
      const checked = String(node.getAttribute?.('aria-checked') || '').toLowerCase();
      if (pressed === 'true' || selected === 'true' || checked === 'true' || /^(on|active|checked|selected|open)$/.test(state)) return true;
      if (/(删除|移除|取消|关闭).*创建图片|remove.*create image|close.*create image/i.test(text)) return true;
    }

    const exactLabels = [...composer.querySelectorAll('span, div, p')].filter(node => {
      if (!visible(node)) return false;
      return /^(创建图片|Create image)$/i.test(String(node.textContent || '').replace(/\s+/g, ' ').trim());
    });
    for (const label of exactLabels) {
      let host = label.parentElement;
      for (let depth = 0; depth < 4 && host && host !== composer; depth++, host = host.parentElement) {
        const controls = [...host.querySelectorAll('button, [role="button"]')].filter(visible);
        if (controls.some(btn => /(删除|移除|取消|关闭|remove|close)/i.test(norm(btn)))) return true;
        if (controls.length >= 1 && host !== label.parentElement) return true;
      }
    }
    return false;
  }

  function findPlus(composer) {
    if (!(composer instanceof Element)) return null;
    const preferred = [
      'button[data-testid="composer-plus-btn"]',
      'button[aria-label*="Add" i]',
      'button[aria-label*="attach" i]',
      'button[aria-label*="添加"]',
      'button[aria-label*="附件"]',
    ];
    for (const selector of preferred) {
      const node = composer.querySelector(selector);
      if (visible(node)) return node;
    }
    const buttons = [...composer.querySelectorAll('button, [role="button"]')].filter(visible);
    return buttons.find(node => /添加|附件|attach|add files|plus/i.test(norm(node))) || null;
  }

  function findCreateImageAction() {
    const candidates = [...document.querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"]')].filter(visible);
    return candidates.find(node => /^(创建图片|Create image)$/i.test(norm(node))) ||
      candidates.find(node => /创建图片|create image/i.test(norm(node))) || null;
  }

  async function clickCreateImage(oldComposer) {
    if (activeEvidence(oldComposer)) return { clicked: false, oldComposer };
    const plus = findPlus(oldComposer);
    if (!plus) throw new Error('找不到“+ / 添加附件”按钮');
    plus.click();
    log('已先点击“+”，准备启用创建图片');

    let action = null;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      action = findCreateImageAction();
      if (action) break;
      await sleep(100);
    }
    if (!action) throw new Error('打开“+”菜单后找不到“创建图片”');
    action.click();
    log('已点击“创建图片”；当前仍未把图片文件交给 ChatGPT');
    return { clicked: true, oldComposer };
  }

  async function waitNewStableComposer(oldComposer, clicked, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let candidate = null;
    let candidateSince = 0;
    let transitionSeen = !clicked;

    while (Date.now() < deadline) {
      const current = strictComposer();
      if (clicked && (!oldComposer?.isConnected || (current && current !== oldComposer))) transitionSeen = true;

      const acceptable = current && current.isConnected && (activeEvidence(current) || transitionSeen);
      if (acceptable) {
        if (candidate === current) {
          if (Date.now() - candidateSince >= 600) return current;
        } else {
          candidate = current;
          candidateSince = Date.now();
        }
      } else {
        candidate = null;
        candidateSince = 0;
      }
      await sleep(120);
    }
    throw new Error('创建图片后新的 Composer 未在时限内稳定');
  }

  function pickFileInput(composer) {
    const inputs = [...composer.querySelectorAll('input[type="file"]')];
    if (!inputs.length) return null;
    return inputs.find(input => /image/i.test(input.accept || '')) || inputs[0];
  }

  async function releaseHeld(oldInput) {
    const entry = pending.get(oldInput);
    if (!entry || entry.running) return;
    entry.running = true;

    try {
      let composer = strictComposer();
      if (!composer) throw new Error('当前严格 Composer 不可用');

      const { clicked, oldComposer } = await clickCreateImage(composer);
      composer = await waitNewStableComposer(oldComposer, clicked);
      const newInput = pickFileInput(composer);
      if (!newInput) throw new Error('创建图片 Composer 中找不到 file input');

      const list = makeFileList(entry.files);
      previousFiles.set.call(newInput, list);
      log('创建图片已激活且 Composer 已稳定；现在才开始上传图片', { count: list.length });

      const types = entry.eventTypes.size ? [...entry.eventTypes] : ['change'];
      for (const type of types) {
        previousDispatch.call(newInput, new Event(type, { bubbles: true, composed: true }));
      }
      pending.delete(oldInput);
    } catch (error) {
      entry.running = false;
      console.error(TAG, '严格“创建图片优先”失败；为避免顺序错误，本次没有上传图片', error);
    }
  }

  Object.defineProperty(proto, 'files', {
    configurable: previousFiles.configurable,
    enumerable: previousFiles.enumerable,
    get() {
      const entry = pending.get(this);
      if (entry?.fileList) return entry.fileList;
      return previousFiles.get.call(this);
    },
    set(value) {
      if (!hasImageFiles(value) || !strictComposerForInput(this)) {
        previousFiles.set.call(this, value);
        return;
      }

      const composer = strictComposer();
      if (composer && activeEvidence(composer)) {
        previousFiles.set.call(this, value);
        return;
      }

      const files = Array.from(value || []);
      const previous = pending.get(this);
      const entry = {
        files,
        fileList: makeFileList(files),
        eventTypes: previous?.eventTypes || new Set(),
        running: false,
      };
      pending.set(this, entry);
      log('已拦截原图上传：先创建图片，图片文件尚未交给 ChatGPT', { count: files.length });
      void releaseHeld(this);
    },
  });

  eventProto.dispatchEvent = function dev193Dispatch(event) {
    if (this instanceof HTMLInputElement && pending.has(this) && /^(change|input)$/i.test(event?.type || '')) {
      pending.get(this).eventTypes.add(event.type);
      log('已暂存上传事件，等待创建图片模式稳定', event.type);
      return true;
    }
    return previousDispatch.call(this, event);
  };

  globalThis.__KaguraCreateImageFirstDev193 = {
    version: '4.1.0-dev.19.3',
    pending,
    activeEvidence,
  };

  log('严格执行顺序已安装：创建图片 → Composer稳定 → 上传图片');
})();
