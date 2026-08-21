// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V4 DEV
// @namespace    https://github.com/Kagura-userscripts/v4-dev
// @version      4.0.0-dev.1
// @description  V4账号授权开发测试版：在V3.2.0稳定功能外接入登录、Token刷新、心跳和任务启动授权Gate。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/dev/v4-auth/dev/kagura-auth-client-v4.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/dev/v4-auth/dev/kagura-auth-config-v4.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/dev/v4-auth/dev/kagura-auth-gate-v4.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/dev/v4-auth/dev/kagura-auth-ui-v4.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/dev/v4-auth/Ozon_ChatGPT.user.js
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
// @connect      kagura-license-api.1715396266.workers.dev
// @connect      *
// @run-at       document-idle
// ==/UserScript==

/* KAGURA_V4_AUTH_DEV_WRAPPER */
(() => {
  'use strict';

  const AUTH_PANEL_ID = 'kagura-auth-v4-host';
  const BYPASS_ATTR = 'data-kagura-auth-start-bypass';
  const validatingButtons = new WeakSet();

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function findMainPanel() {
    return document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
  }

  function findPanelBody(panel) {
    if (!panel) return null;
    return panel.querySelector('.kagura-gpt-body, .kagura-ozon-body') ||
      [...panel.children].find(node => /body/i.test(String(node.className || ''))) ||
      panel;
  }

  async function waitForMainPanel(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const panel = findMainPanel();
      if (panel) return panel;
      await sleep(200);
    }
    return null;
  }

  function setAuthMessage(text, ok = false) {
    const host = document.getElementById(AUTH_PANEL_ID);
    const message = host?.querySelector('.kagura-auth-v4-message');
    if (!message) return;
    message.textContent = String(text || '');
    message.style.color = ok ? '#08785e' : '#b42318';
  }

  function focusAuthBox() {
    const host = document.getElementById(AUTH_PANEL_ID);
    if (!host) return;
    host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const input = host.querySelector('input[data-role="username"], input[data-role="password"]');
    if (input && !input.hidden) setTimeout(() => input.focus(), 50);
  }

  function normalizeButtonText(button) {
    return String(button?.innerText || button?.textContent || '')
      .replace(/\s+/g, '')
      .trim();
  }

  function isVersionOrUpdateButton(button) {
    const text = normalizeButtonText(button);
    return /检查更新|立刻更新|版本|更新说明|我知道了|不再提醒|关闭/.test(text) ||
      button?.classList?.contains('kagura-gpt-version-button');
  }

  function isAuthButton(button) {
    return Boolean(button?.closest?.('.kagura-auth-v4'));
  }

  function isProtectedTaskButton(button) {
    if (!button || button.disabled) return false;
    if (!button.closest('#kagura-gpt-panel, #kagura-ozon-panel')) return false;
    if (isAuthButton(button) || isVersionOrUpdateButton(button)) return false;

    const text = normalizeButtonText(button);
    if (!text) return false;

    // 只保护真正会启动/继续自动任务的入口；文件夹、导入、设置等按钮仍可在未登录时配置。
    return /^(开始|开始任务|开始下载|开始批量|开始运行|继续|继续任务|继续下载|继续未完成|恢复|恢复任务|运行|执行)$/.test(text) ||
      /开始.*(任务|下载|批量|运行|采集)|继续.*(任务|下载|未完成)|恢复.*任务/.test(text);
  }

  async function guardAndReplay(button) {
    if (validatingButtons.has(button)) return;
    validatingButtons.add(button);

    try {
      const state = globalThis.KaguraAuth?.getPublicState?.();
      if (!state?.authenticated) {
        setAuthMessage('请先登录账号后再开始任务');
        focusAuthBox();
        return;
      }

      setAuthMessage('正在验证授权…', true);
      const result = await globalThis.KaguraAuthGate.requireForStart({
        taskName: location.hostname.includes('chatgpt') ? 'ChatGPT批量生图' : 'Ozon主图下载',
      });

      if (!result?.ok) {
        setAuthMessage(result?.message || '授权校验失败，请重新登录');
        focusAuthBox();
        return;
      }

      setAuthMessage('', true);
      button.setAttribute(BYPASS_ATTR, '1');
      try {
        button.click();
      } finally {
        queueMicrotask(() => button.removeAttribute(BYPASS_ATTR));
      }
    } finally {
      validatingButtons.delete(button);
    }
  }

  function installStartGate() {
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('button');
      if (!button || !isProtectedTaskButton(button)) return;
      if (button.getAttribute(BYPASS_ATTR) === '1') return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void guardAndReplay(button);
    }, true);
  }

  async function mountAuthUI() {
    const panel = await waitForMainPanel();
    if (!panel || document.getElementById(AUTH_PANEL_ID)) return;

    const body = findPanelBody(panel);
    if (!body) return;

    const host = document.createElement('div');
    host.id = AUTH_PANEL_ID;
    body.prepend(host);

    globalThis.KaguraAuthUI.mount(host, {
      onAuthorized(state) {
        setAuthMessage('授权验证通过', true);
        setTimeout(() => setAuthMessage('', true), 1200);
        console.log('[Kagura V4 DEV] 登录成功：', state?.username || '');
      },
      onUnauthorized(error) {
        if (error?.code === 'LOGOUT') return;
        console.warn('[Kagura V4 DEV] 授权不可用：', error?.code || 'UNKNOWN');
      },
    });
  }

  function installAuthStateWatcher() {
    globalThis.KaguraAuth?.onChange?.(state => {
      if (!state?.authenticated) {
        const panel = findMainPanel();
        if (panel) panel.dataset.kaguraAuth = 'guest';
      } else {
        const panel = findMainPanel();
        if (panel) panel.dataset.kaguraAuth = 'member';
      }
    });
  }

  async function boot() {
    if (!globalThis.KaguraAuth || !globalThis.KaguraAuthGate || !globalThis.KaguraAuthUI) {
      console.error('[Kagura V4 DEV] Auth模块加载失败');
      return;
    }

    installStartGate();
    installAuthStateWatcher();
    await mountAuthUI();

    // 如果已经存在本地Token，启动时强制向服务器确认一次，失败则Auth模块会清理会话。
    const state = globalThis.KaguraAuth.getPublicState();
    if (state.authenticated) {
      const result = await globalThis.KaguraAuthGate.check({ force: true, reason: 'startup' });
      if (!result?.ok) setAuthMessage(result?.message || '登录状态已失效，请重新登录');
    }

    console.log('[Kagura V4 DEV] Auth集成已启动');
  }

  setTimeout(() => void boot(), 400);
})();
