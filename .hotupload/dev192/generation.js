;(() => {
  'use strict';
  const rawGet = globalThis.GM_getValue;
  const rawSet = globalThis.GM_setValue;
  if (typeof rawGet !== 'function' || typeof rawSet !== 'function') return;

  const SEND_CONFIRMING = 'send_confirming';
  const GENERATION_WAITING = 'generation_waiting';
  const GENERATING = 'generating';
  let observedSuccessfulSend = false;
  let pendingSendCheckpoint = null;

  function log(message, value) {
    if (value === undefined) console.log('[GenerationRecovery] ' + message);
    else console.log('[GenerationRecovery] ' + message, value);
  }

  function findCheckpoint(value, visited = new Set()) {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);
    if (typeof value.stage === 'string') return value;
    for (const key of ['batchCheckpoint', 'checkpoint', 'resumeCheckpoint']) {
      const found = findCheckpoint(value[key], visited);
      if (found) return found;
    }
    return null;
  }

  function isGenerationStage(stage) {
    return stage === GENERATION_WAITING || stage === GENERATING;
  }

  function lockToGenerationScan(checkpoint, reason) {
    if (!checkpoint || !isGenerationStage(checkpoint.stage)) return false;
    checkpoint.recoveryMode = 'generation_scan_only';
    checkpoint.uploadRecoveryDisabled = true;
    checkpoint.attachmentCleanupDisabled = true;
    checkpoint.templateRecoveryDisabled = true;
    checkpoint.resendDisabled = true;
    log('stage=' + checkpoint.stage + ' recovery=generation_scan_only reason=' + reason);
    return true;
  }

  function clone(value) {
    try {
      return structuredClone(value);
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function normalizeRestoredCheckpoint(key, value) {
    const checkpoint = findCheckpoint(value);
    if (!checkpoint) return value;
    if (checkpoint.stage === SEND_CONFIRMING) {
      checkpoint.stage = GENERATION_WAITING;
      lockToGenerationScan(checkpoint, 'refresh_after_send_confirming');
      rawSet(key, value);
      log('checkpoint.stage send_confirming -> generation_waiting');
      return value;
    }
    if (lockToGenerationScan(checkpoint, 'refresh_generation_state')) rawSet(key, value);
    return value;
  }

  function persistGenerationWaiting() {
    if (!pendingSendCheckpoint) return;
    const { key, value } = pendingSendCheckpoint;
    const checkpoint = findCheckpoint(value);
    if (!checkpoint || checkpoint.stage !== SEND_CONFIRMING) return;
    checkpoint.stage = GENERATION_WAITING;
    lockToGenerationScan(checkpoint, 'successful_send');
    rawSet(key, value);
    pendingSendCheckpoint = null;
    log('checkpoint.stage generation_waiting');
  }

  globalThis.GM_getValue = function guardedCheckpointGet(key, fallback) {
    return normalizeRestoredCheckpoint(key, rawGet(key, fallback));
  };

  globalThis.GM_setValue = function guardedCheckpointSet(key, value) {
    const checkpoint = findCheckpoint(value);
    if (checkpoint?.stage === SEND_CONFIRMING) {
      pendingSendCheckpoint = { key, value: clone(value) };
      if (observedSuccessfulSend) {
        checkpoint.stage = GENERATION_WAITING;
        lockToGenerationScan(checkpoint, 'successful_send_immediate');
      }
    } else if (checkpoint && isGenerationStage(checkpoint.stage)) {
      lockToGenerationScan(checkpoint, 'generation_state_write');
    }
    return rawSet(key, value);
  };

  function hasGenerationStarted() {
    const page = globalThis.document;
    return Boolean(page.querySelector(
      'button[data-testid*="stop" i], button[aria-label*="Stop generating" i], [data-testid*="streaming" i], [data-testid*="generating" i]'
    ));
  }

  const observer = new MutationObserver(() => {
    if (observedSuccessfulSend || !hasGenerationStarted()) return;
    observedSuccessfulSend = true;
    persistGenerationWaiting();
  });
  observer.observe(globalThis.document.documentElement, { childList: true, subtree: true });
  if (hasGenerationStarted()) {
    observedSuccessfulSend = true;
    persistGenerationWaiting();
  }
})();
