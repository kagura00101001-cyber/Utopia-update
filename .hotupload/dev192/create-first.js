;(() => {
  'use strict';
  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(location.hostname)) return;

  // dev.19.2: make "Create image" a hard precondition for every programmatic image upload.
  // We do not broaden attachment scope and we do not touch send-confirming/generation recovery.
  const TAG = '[CreateImageFirst]';
  const pending = new WeakMap();
  const proto = HTMLInputElement.prototype;
  const filesDescriptor = Object.getOwnPropertyDescriptor(proto, 'files');
  const eventProto = EventTarget.prototype;
  const nativeDispatchEvent = eventProto.dispatchEvent;
  if (!filesDescriptor?.get || !filesDescriptor?.set || typeof nativeDispatchEvent !== 'function') return;

  function log(message, value) {
    if (value === undefined) console.log(TAG + ' ' + message);
    else console.log(TAG + ' ' + message, value);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function visible(node) {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizeText(node) {
    return [node?.textContent, node?.getAttribute?.('aria-label'), node?.getAttribute?.('title'), node?.getAttribute?.('data-testid')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasImageFiles(fileList) {
    try {
      return Array.from(fileList || []).some(file => /^image\//i.test(String(file?.type || '')) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(String(file?.name || '')));
    } catch (_) {
      return false;
    }
  }

  function lifecycle() {
    return globalThis.KaguraComposerLifecycle || null;
  }

  function isStrictComposerInput(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.isConnected) return false;
    const life = lifecycle();
    const current = life?.getCurrentComposer?.();
    if (current?.fileInput === input && current?.composer?.contains(input)) return true;
    const scope = input.closest('form, [data-testid="composer"], [data-testid="conversation-composer"], [data-testid="prompt-composer"]');
    if (!scope || /^(BODY|MAIN|HTML)$/i.test(scope.tagName || '')) return false;
    const editor = scope.querySelector('[contenteditable="true"][data-id="root"], [contenteditable="true"][role="textbox"], textarea[data-id="root"], textarea[placeholder]');
    const send = scope.querySelector('button[data-testid*="send"], button[aria-label*="Send" i], button[aria-label*="发送"], button[type="submit"]');
    return Boolean(editor && send);
  }

  function isCreateImageActive(parts) {
    const composer = parts?.composer;
    if (!(composer instanceof Element) || !composer.isConnected) return false;
    const candidates = composer.querySelectorAll('button, [role="button"], [data-testid], [aria-label], [title]');
    for (const node of candidates) {
      if (!visible(node)) continue;
      const text = normalizeText(node);
      if (/创建图片|create image/i.test(text) && !/删除.*创建图片|remove.*create image/i.test(text)) return true;
      // Some builds expose the active chip via an accessible remove label.
      if (/删除.*创建图片|remove.*create image/i.test(text)) return true;
    }
    return false;
  }

  function findPlusButton(parts) {
    const composer = parts?.composer;
    if (!(composer instanceof Element)) return null;
    if (visible(parts?.plusButton)) return parts.plusButton;
    const candidates = [...composer.querySelectorAll('button')].filter(visible);
    const scored = candidates.map(node => {
      const text = normalizeText(node);
      let score = 0;
      if (/data-testid=.*(plus|attach)/i.test(text)) score += 8;
      if (/attach|添加|上传|附件/i.test(text)) score += 6;
      if (/^\s*\+\s*$/.test(node.textContent || '')) score += 4;
      if (/send|发送|停止生成/i.test(text)) score -= 10;
      return { node, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].node : null;
  }

  function menuCandidatesNear(plusButton) {
    const plusRect = plusButton?.getBoundingClientRect?.();
    const selectors = [
      '[role="menuitem"]',
      '[role="option"]',
      '[data-radix-collection-item]',
      '[role="menu"] button',
      '[role="listbox"] button',
      'body > div button'
    ];
    const seen = new Set();
    const results = [];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node) || !visible(node)) continue;
        seen.add(node);
        const text = normalizeText(node);
        if (!/创建图片|create image/i.test(text)) continue;
        if (/删除.*创建图片|remove.*create image/i.test(text)) continue;
        const rect = node.getBoundingClientRect();
        const dx = plusRect ? (rect.left + rect.width / 2) - (plusRect.left + plusRect.width / 2) : 0;
        const dy = plusRect ? (rect.top + rect.height / 2) - (plusRect.top + plusRect.height / 2) : 0;
        const distance = Math.hypot(dx, dy);
        let score = 0;
        if (/^创建图片(?:\s|$)|^create image(?:\s|$)/i.test(text)) score += 20;
        if (/可视化呈现任何内容/i.test(text)) score += 10;
        if (node.matches('[role="menuitem"], [role="option"], button, [data-radix-collection-item]')) score += 5;
        if (plusRect && distance < 900) score += Math.max(0, 9 - distance / 100);
        results.push({ node, score, distance, text });
      }
    }

    // Fallback for ChatGPT variants where the clickable menu row is a plain div.
    if (!results.length) {
      for (const node of document.querySelectorAll('body div')) {
        if (!visible(node)) continue;
        const text = normalizeText(node);
        if (!/^创建图片(?:\s|$)|^create image(?:\s|$)/i.test(text)) continue;
        if (text.length > 120) continue;
        const rect = node.getBoundingClientRect();
        const dx = plusRect ? (rect.left + rect.width / 2) - (plusRect.left + plusRect.width / 2) : 0;
        const dy = plusRect ? (rect.top + rect.height / 2) - (plusRect.top + plusRect.height / 2) : 0;
        const distance = Math.hypot(dx, dy);
        if (plusRect && distance > 900) continue;
        results.push({ node, score: 5 + (text.includes('可视化呈现任何内容') ? 10 : 0), distance, text });
      }
    }
    return results.sort((a, b) => b.score - a.score || a.distance - b.distance);
  }

  async function waitForCreateImageMenu(plusButton, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const candidate = menuCandidatesNear(plusButton)[0];
      if (candidate) return candidate.node;
      await sleep(100);
    }
    return null;
  }

  async function waitForActiveCreateImage(timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const life = lifecycle();
      if (!life?.waitForStableComposer) throw new Error('Composer lifecycle unavailable');
      let parts = null;
      try {
        parts = await life.waitForStableComposer('create_image_before_upload');
      } catch (_) {
        await sleep(150);
        continue;
      }
      if (isCreateImageActive(parts)) return parts;
      await sleep(150);
    }
    throw new Error('创建图片模式未在超时内确认激活');
  }

  async function ensureCreateImageBeforeUpload() {
    const life = lifecycle();
    if (!life?.waitForStableComposer) throw new Error('KaguraComposerLifecycle unavailable');

    let parts = await life.waitForStableComposer('create_image_preflight');
    if (isCreateImageActive(parts)) {
      log('创建图片模式已存在，允许上传');
      return parts;
    }

    const plusButton = findPlusButton(parts);
    if (!plusButton) throw new Error('无法在严格 Composer 内定位“+”按钮');

    log('上传前先启用创建图片模式');
    plusButton.click();
    const menuItem = await waitForCreateImageMenu(plusButton);
    if (!menuItem) throw new Error('未找到“创建图片”菜单项');

    const clickable = menuItem.closest?.('button, [role="menuitem"], [role="option"], [data-radix-collection-item], [tabindex]') || menuItem;
    clickable.click();
    log('已点击创建图片，等待 Composer 重挂载');

    parts = await waitForActiveCreateImage();
    log('创建图片模式已稳定，开始释放图片上传');
    return parts;
  }

  function makeFileList(files) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    return dt.files;
  }

  function cloneEvent(event) {
    return new Event(event.type, {
      bubbles: event.bubbles !== false,
      cancelable: event.cancelable === true,
      composed: event.composed === true,
    });
  }

  async function gateProgrammaticUpload(oldInput, files) {
    const entry = pending.get(oldInput);
    if (!entry || entry.running) return;
    entry.running = true;
    try {
      const parts = await ensureCreateImageBeforeUpload();
      const newInput = parts?.fileInput;
      if (!(newInput instanceof HTMLInputElement) || newInput.type !== 'file' || !isStrictComposerInput(newInput)) {
        throw new Error('创建图片启用后无法确认新的严格 Composer file input');
      }

      // Tool toggling may destroy the old Composer. Transfer the original File objects to the new input.
      const list = makeFileList(files);
      filesDescriptor.set.call(newInput, list);

      const queuedEvents = entry.events.length ? entry.events : [new Event('change', { bubbles: true, composed: true })];
      pending.delete(oldInput);
      for (const event of queuedEvents) nativeDispatchEvent.call(newInput, cloneEvent(event));
      log('执行顺序确认：创建图片 → 原图/图片上传');
    } catch (error) {
      pending.delete(oldInput);
      console.error(TAG + ' 为保证执行顺序，已阻止本次图片上传：', error);
      // Do not replay the upload event. The existing upload timeout/recovery path can pause safely.
    }
  }

  Object.defineProperty(proto, 'files', {
    configurable: filesDescriptor.configurable,
    enumerable: filesDescriptor.enumerable,
    get: filesDescriptor.get,
    set(value) {
      // Keep the native setter synchronous so the caller can inspect input.files immediately.
      filesDescriptor.set.call(this, value);
      if (!hasImageFiles(value) || !isStrictComposerInput(this)) return;

      const parts = lifecycle()?.getCurrentComposer?.();
      if (parts && isCreateImageActive(parts)) return;

      const files = Array.from(value || []);
      const previous = pending.get(this);
      pending.set(this, {
        running: false,
        events: previous?.events || [],
        files,
      });
      void gateProgrammaticUpload(this, files);
    },
  });

  eventProto.dispatchEvent = function(event) {
    if (this instanceof HTMLInputElement && this.type === 'file') {
      const entry = pending.get(this);
      if (entry && (event?.type === 'change' || event?.type === 'input')) {
        entry.events.push(event);
        log('已暂存图片上传事件，先完成创建图片模式');
        return true;
      }
    }
    return nativeDispatchEvent.call(this, event);
  };

  globalThis.KaguraCreateImageFirst = Object.freeze({
    version: '4.1.0-dev.19.2',
    ensureCreateImageBeforeUpload,
    isCreateImageActive: () => isCreateImageActive(lifecycle()?.getCurrentComposer?.()),
  });

  log('dev.19.2 pre-upload gate installed');
})();
