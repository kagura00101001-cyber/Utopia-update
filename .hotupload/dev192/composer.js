;(() => {
  'use strict';
  if (!/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(location.hostname)) return;

  const COMPOSER_READY = 'COMPOSER_READY';
  const COMPOSER_TRANSITION = 'COMPOSER_TRANSITION';
  const COMPOSER_RECOVERING = 'COMPOSER_RECOVERING';
  const STABLE_CHECK_DELAY_MS = 500;
  const WAIT_TIMEOUT_MS = 15000;
  const nodeIds = new WeakMap();
  let nextNodeId = 1;
  let state = COMPOSER_RECOVERING;
  let currentComposer = null;
  let recoveryPromise = null;
  let lastTransitionReason = 'page_refresh_recovery';

  function composerLog(message, value) {
    if (value === undefined) console.log('[Composer] ' + message);
    else console.log('[Composer] ' + message, value);
  }

  function nodeLabel(node) {
    if (!node) return 'none';
    if (!nodeIds.has(node)) nodeIds.set(node, nextNodeId++);
    const id = node.id ? '#' + node.id : '';
    const testId = node.getAttribute?.('data-testid');
    return (node.tagName || 'node').toLowerCase() + id + (testId ? '[data-testid=' + testId + ']' : '') + '@' + nodeIds.get(node);
  }

  function isUsable(node) {
    return Boolean(node && node.isConnected && node.nodeType === Node.ELEMENT_NODE);
  }

  function isSafeComposerScope(scope) {
    if (!isUsable(scope)) return false;
    const name = String(scope.tagName || '').toLowerCase();
    return name !== 'body' && name !== 'main' && name !== 'html';
  }

  function visible(nodes) {
    return nodes.find(node => {
      if (!isUsable(node)) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function findComposerParts() {
    const page = globalThis.document;
    const editors = [...page.querySelectorAll(
      '[contenteditable="true"][data-id="root"], [contenteditable="true"][role="textbox"], textarea[data-id="root"], textarea[placeholder]'
    )];
    for (const editor of editors) {
      if (!isUsable(editor)) continue;
      const composer = editor.closest('form, [data-testid="composer"], [data-testid="conversation-composer"], [data-testid="prompt-composer"]');
      if (!isSafeComposerScope(composer)) continue;
      const fileInput = visible([...composer.querySelectorAll('input[type="file"]')]);
      const sendButton = visible([...composer.querySelectorAll(
        'button[data-testid*="send"], button[aria-label*="Send" i], button[aria-label*="发送"], button[type="submit"]'
      )]);
      if (!fileInput || !sendButton) continue;
      const plusButton = visible([...composer.querySelectorAll(
        'button[aria-label*="Attach" i], button[aria-label*="添加"], button[aria-label*="上传"], button[data-testid*="plus"], button[data-testid*="attach"]'
      )]);
      return { composer, editor, fileInput, plusButton, sendButton };
    }
    return null;
  }

  function signature(parts) {
    if (!parts) return 'none';
    return [parts.composer, parts.editor, parts.fileInput, parts.plusButton, parts.sendButton].map(nodeLabel).join('|');
  }

  function isValidComposer(parts) {
    return Boolean(parts && isSafeComposerScope(parts.composer) && isUsable(parts.editor) && isUsable(parts.fileInput) && isUsable(parts.sendButton));
  }

  function getCurrentComposer() {
    return isValidComposer(currentComposer) ? currentComposer : null;
  }

  function enterTransition(reason) {
    const oldComposer = getCurrentComposer()?.composer || currentComposer?.composer || null;
    lastTransitionReason = reason;
    state = COMPOSER_TRANSITION;
    composerLog('event=' + reason);
    composerLog('state=TRANSITION');
    composerLog('waiting new composer...');
    composerLog('oldComposer=' + nodeLabel(oldComposer));
  }

  async function waitForStableComposer(reason = lastTransitionReason) {
    if (recoveryPromise) return recoveryPromise;
    recoveryPromise = (async () => {
      enterTransition(reason);
      const deadline = Date.now() + WAIT_TIMEOUT_MS;
      let previousSignature = '';
      while (Date.now() < deadline) {
        const first = findComposerParts();
        if (!isValidComposer(first)) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        const firstSignature = signature(first);
        await new Promise(resolve => setTimeout(resolve, STABLE_CHECK_DELAY_MS));
        const second = findComposerParts();
        if (!isValidComposer(second) || firstSignature !== signature(second)) continue;
        if (previousSignature && previousSignature !== firstSignature) continue;
        previousSignature = firstSignature;
        currentComposer = second;
        state = COMPOSER_READY;
        composerLog('newComposer=' + nodeLabel(second.composer));
        composerLog('stable=true');
        composerLog('state=READY');
        return second;
      }
      currentComposer = null;
      state = COMPOSER_RECOVERING;
      composerLog('state=RECOVERING');
      throw new Error('[Composer] timed out waiting for a stable Composer after ' + reason);
    })();
    try {
      return await recoveryPromise;
    } finally {
      recoveryPromise = null;
    }
  }

  function scheduleRecovery(reason) {
    if (state === COMPOSER_READY || !recoveryPromise) void waitForStableComposer(reason).catch(error => composerLog('recovery_failed', error));
  }

  function targetAction(event) {
    const target = event.target instanceof Element ? event.target.closest('button, [role="menuitem"], [role="option"], input[type="file"]') : null;
    if (!target) return '';
    return [target.textContent, target.getAttribute('aria-label'), target.getAttribute('title'), target.getAttribute('data-testid')].filter(Boolean).join(' ');
  }

  globalThis.KaguraComposerLifecycle = Object.freeze({
    COMPOSER_READY,
    COMPOSER_TRANSITION,
    COMPOSER_RECOVERING,
    getCurrentComposer,
    getState: () => state,
    waitForStableComposer,
    beforeUpload: () => waitForStableComposer('upload_before'),
    beforeTemplateUpload: () => waitForStableComposer('template_upload_before'),
    beforeSend: () => waitForStableComposer('send_before'),
    recoverAfterPageLoad: () => waitForStableComposer('page_refresh_recovery'),
  });

  globalThis.document.addEventListener('click', event => {
    const action = targetAction(event);
    if (/创建图片|create image/i.test(action)) scheduleRecovery('create_image_toggle');
    if (/删除.*创建图片|remove.*create image/i.test(action)) scheduleRecovery('remove_create_image_toggle');
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') scheduleRecovery('upload_before');
    if (/send|发送/i.test(action)) scheduleRecovery('send_before');
  }, true);
  globalThis.document.addEventListener('change', event => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'file') scheduleRecovery('template_upload_before');
  }, true);

  const observer = new MutationObserver(() => {
    const active = getCurrentComposer();
    const found = findComposerParts();
    if (!active || !isValidComposer(found) || signature(active) !== signature(found)) scheduleRecovery('composer_remount');
  });
  observer.observe(globalThis.document.documentElement, { childList: true, subtree: true });
  void waitForStableComposer('page_refresh_recovery').catch(error => composerLog('startup_recovery_failed', error));
})();
