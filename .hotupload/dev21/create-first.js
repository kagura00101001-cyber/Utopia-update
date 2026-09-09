;(() => {
  'use strict';
  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(location.hostname)) return;

  const VERSION = '4.1.0-dev.21';
  const TAG = '[CreateImageFirst21]';
  const proto = HTMLInputElement.prototype;
  const filesDescriptor = Object.getOwnPropertyDescriptor(proto, 'files');
  const eventProto = EventTarget.prototype;
  const nativeDispatchEvent = eventProto.dispatchEvent;
  const pending = new WeakMap();
  if (!filesDescriptor?.get || !filesDescriptor?.set || typeof nativeDispatchEvent !== 'function') {
    console.warn(TAG, 'native file/event descriptors unavailable');
    return;
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const log = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);

  function visible(node) {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function normalizeText(node) {
    if (!(node instanceof Element)) return '';
    return [node.textContent, node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('data-testid')]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function lifecycle() {
    return globalThis.KaguraComposerLifecycle || null;
  }

  function currentParts() {
    return lifecycle()?.getCurrentComposer?.() || null;
  }

  function isStrictComposerInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.isConnected) return false;
    const parts = currentParts();
    if (parts?.fileInput === input && parts?.composer?.contains(input)) return true;
    const composer = input.closest('form[data-type="unified-composer"], form, [data-testid="composer"], [data-testid="conversation-composer"], [data-testid="prompt-composer"]');
    if (!composer || /^(BODY|MAIN|HTML)$/i.test(composer.tagName || '')) return false;
    const editor = composer.querySelector('[contenteditable="true"][data-id="root"], [contenteditable="true"][role="textbox"], textarea[data-id="root"], textarea[placeholder]');
    return Boolean(editor);
  }

  function hasImageFiles(fileList) {
    try {
      return Array.from(fileList || []).some(file => file instanceof File && (/^image\//i.test(file.type || '') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || '')));
    } catch (_) { return false; }
  }

  function makeFileList(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    return dt.files;
  }

  function isCreateImageActive(parts = currentParts()) {
    const composer = parts?.composer;
    if (!(composer instanceof Element) || !composer.isConnected) return false;
    const nodes = composer.querySelectorAll('button, [role="button"], [data-testid], [aria-label], [title], [aria-pressed], [aria-selected], [data-state], span, div');
    for (const node of nodes) {
      if (!visible(node)) continue;
      const text = normalizeText(node);
      if (!/创建图片|创作图片|生成图片|create\s*image|generate\s*image/i.test(text)) continue;
      if (/(删除|移除|取消|关闭).*?(创建图片|创作图片|生成图片)|remove.*create\s*image|close.*create\s*image/i.test(text)) return true;
      const pressed = String(node.getAttribute?.('aria-pressed') || '').toLowerCase();
      const selected = String(node.getAttribute?.('aria-selected') || '').toLowerCase();
      const state = String(node.getAttribute?.('data-state') || '').toLowerCase();
      if (pressed === 'true' || selected === 'true' || /^(on|active|checked|selected|open)$/.test(state)) return true;
      const clean = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(创建图片|创作图片|生成图片|Create image|Generate image)$/i.test(clean)) return true;
    }
    return false;
  }

  function findPlusButton(parts) {
    const composer = parts?.composer;
    if (!(composer instanceof Element) || !composer.isConnected) return null;
    if (visible(parts?.plusButton)) return parts.plusButton;
    const selectors = [
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid*="plus" i]',
      'button[data-testid*="attach" i]',
      'button[aria-label*="Attach" i]',
      'button[aria-label*="Add" i]',
      'button[aria-label*="添加"]',
      'button[aria-label*="附件"]',
      'button[aria-label*="上传"]'
    ];
    for (const selector of selectors) {
      const node = composer.querySelector(selector);
      if (visible(node)) return node;
    }
    const candidates = [...composer.querySelectorAll('button, [role="button"]')].filter(visible);
    return candidates.find(node => /添加|附件|上传|attach|add files|plus/i.test(normalizeText(node)) || /^\s*\+\s*$/.test(node.textContent || '')) || null;
  }

  function isKaguraNode(node) {
    try { return Boolean(node?.closest?.('[id^="kagura-"], [class^="kagura-"], [class*=" kagura-"]')); }
    catch (_) { return false; }
  }

  function isConversationNode(node) {
    try { return Boolean(node?.closest?.('[data-message-author-role], [data-testid^="conversation-turn-"]')); }
    catch (_) { return false; }
  }

  function menuCandidatesNear(plusButton) {
    const plusRect = plusButton?.getBoundingClientRect?.();
    const selectors = [
      '[role="menuitem"]', '[role="option"]', '[data-radix-collection-item]',
      '[role="menu"] button', '[role="listbox"] button',
      'body > div button', 'body > div [role="button"]',
      'body div', 'body span'
    ];
    const seen = new Set();
    const out = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node) || !visible(node) || isKaguraNode(node) || isConversationNode(node)) continue;
        seen.add(node);
        const text = normalizeText(node);
        if (!/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i.test(text)) continue;
        if (/(删除|移除|取消|关闭).*?(创建图片|创作图片|生成图片)|remove.*create\s*image|close.*create\s*image/i.test(text)) continue;
        if (text.length > 180) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 10 || rect.height > 180) continue;
        const dx = plusRect ? (rect.left + rect.width / 2) - (plusRect.left + plusRect.width / 2) : 0;
        const dy = plusRect ? (rect.top + rect.height / 2) - (plusRect.top + plusRect.height / 2) : 0;
        const distance = Math.hypot(dx, dy);
        if (plusRect && distance > 1100) continue;
        let score = 0;
        if (/^(创建图片|Create image)(?:\s|$)/i.test(text)) score += 30;
        if (/可视化呈现任何内容/i.test(text)) score += 18;
        if (node.matches('button, [role="menuitem"], [role="option"], [role="button"], [data-radix-collection-item]')) score += 8;
        if (node.tagName === 'DIV') score += 6;
        if (plusRect) score += Math.max(0, 11 - distance / 90);
        score -= Math.min(8, text.length / 30);
        score -= Math.min(5, (rect.width * rect.height) / 100000);
        out.push({ node, text, score, distance, rect });
      }
    }
    return out.sort((a,b) => b.score - a.score || a.distance - b.distance || (a.rect.width*a.rect.height) - (b.rect.width*b.rect.height));
  }

  function clickableFor(node) {
    if (!(node instanceof Element)) return null;
    const host = node.closest('button, [role="menuitem"], [role="option"], [role="button"], [data-radix-collection-item], [tabindex]');
    if (host && visible(host) && !isConversationNode(host) && !isKaguraNode(host)) return host;
    return node;
  }

  async function waitForMenuItem(plusButton, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const best = menuCandidatesNear(plusButton)[0];
      if (best) {
        log('已定位“创建图片”菜单项', { tag: best.node.tagName, role: best.node.getAttribute('role') || '-', text: best.text, distance: Math.round(best.distance) });
        return clickableFor(best.node);
      }
      await sleep(100);
    }
    return null;
  }

  function closeOpenMenu() {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    } catch (_) {}
  }

  async function waitForActiveStableComposer(timeoutMs = 15000) {
    const life = lifecycle();
    if (!life?.waitForStableComposer) throw new Error('Composer lifecycle unavailable');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const parts = await life.waitForStableComposer('create_image_toggle');
        if (parts?.composer?.isConnected && isCreateImageActive(parts)) {
          await sleep(600);
          const now = life.getCurrentComposer?.();
          if (now?.composer?.isConnected && isCreateImageActive(now)) return now;
        }
      } catch (_) {}
      await sleep(120);
    }
    throw new Error('创建图片模式或新 Composer 未在时限内稳定');
  }

  async function activateCreateImage() {
    const life = lifecycle();
    if (!life?.waitForStableComposer) throw new Error('KaguraComposerLifecycle unavailable');
    let parts = await life.waitForStableComposer('create_image_preflight');
    if (isCreateImageActive(parts)) {
      log('创建图片模式已存在；直接允许图片上传');
      return parts;
    }

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        parts = await life.waitForStableComposer('create_image_preflight_' + attempt);
        const plus = findPlusButton(parts);
        if (!plus) throw new Error('无法在严格 Composer 内定位“+”按钮');
        plus.click();
        log(`已点击“+”，先定位创建图片（第 ${attempt}/2 次）；图片仍未交给 ChatGPT`);
        const item = await waitForMenuItem(plus, 5000);
        if (!item) throw new Error('打开“+”后未找到“创建图片”菜单项（含普通DIV兼容）');
        item.click();
        log('已点击“创建图片”，等待 Composer 重挂载并确认工具 Chip');
        return await waitForActiveStableComposer();
      } catch (error) {
        lastError = error;
        warn(`创建图片前置激活第 ${attempt}/2 次失败`, error);
        closeOpenMenu();
        await sleep(350);
      }
    }
    throw lastError || new Error('创建图片前置激活失败');
  }

  async function releaseHeld(oldInput) {
    const entry = pending.get(oldInput);
    if (!entry || entry.running) return;
    entry.running = true;
    try {
      const parts = await activateCreateImage();
      const newInput = parts?.fileInput || parts?.composer?.querySelector?.('input[type="file"]');
      if (!(newInput instanceof HTMLInputElement) || newInput.type !== 'file' || !newInput.isConnected) {
        throw new Error('创建图片启用后找不到新的 Composer file input');
      }
      const list = makeFileList(entry.files);
      filesDescriptor.set.call(newInput, list);
      const types = entry.eventTypes.size ? [...entry.eventTypes] : ['change'];
      pending.delete(oldInput);
      for (const type of types) {
        nativeDispatchEvent.call(newInput, new Event(type, { bubbles: true, composed: true }));
      }
      log('执行顺序确认：创建图片 → Composer稳定 → 图片上传', { count: list.length });
    } catch (error) {
      entry.running = false;
      console.error(TAG, '创建图片前置流程失败；为避免顺序错误，本次图片没有上传', error);
    }
  }

  Object.defineProperty(proto, 'files', {
    configurable: filesDescriptor.configurable,
    enumerable: filesDescriptor.enumerable,
    get() {
      const entry = pending.get(this);
      if (entry?.fileList) return entry.fileList;
      return filesDescriptor.get.call(this);
    },
    set(value) {
      if (!hasImageFiles(value) || !isStrictComposerInput(this)) {
        filesDescriptor.set.call(this, value);
        return;
      }
      const parts = currentParts();
      if (parts && isCreateImageActive(parts)) {
        filesDescriptor.set.call(this, value);
        return;
      }
      const files = Array.from(value || []);
      const old = pending.get(this);
      const fileList = makeFileList(files);
      pending.set(this, { files, fileList, eventTypes: old?.eventTypes || new Set(), running: false });
      log('已拦截图片：先创建图片，当前文件尚未交给 ChatGPT', { count: files.length });
      void releaseHeld(this);
    }
  });

  eventProto.dispatchEvent = function dev21Dispatch(event) {
    if (this instanceof HTMLInputElement && this.type === 'file' && pending.has(this) && /^(change|input)$/i.test(event?.type || '')) {
      pending.get(this).eventTypes.add(event.type);
      log('已暂存上传事件，等待创建图片模式稳定', event.type);
      return true;
    }
    return nativeDispatchEvent.call(this, event);
  };

  globalThis.KaguraCreateImageFirst = Object.freeze({
    version: VERSION,
    activateCreateImage,
    isCreateImageActive: () => isCreateImageActive(currentParts()),
    pending
  });

  log('已安装：严格顺序 创建图片 → Composer稳定 → 上传图片；兼容普通DIV“创建图片”菜单项');
})();
