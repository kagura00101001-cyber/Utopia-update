// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V4 DEV
// @namespace    https://github.com/Kagura-userscripts/v4-dev
// @version      4.0.0-dev.2
// @description  V4账号授权开发测试版：未登录仅显示独立授权页，登录后解锁完整工作台；支持Token刷新、心跳和任务启动授权Gate。
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

  const DEV_VERSION = '4.0.0-dev.2';
  const AUTH_PANEL_ID = 'kagura-auth-v4-host';
  const MEMBER_CHIP_ID = 'kagura-auth-v4-member-chip';
  const STYLE_ID = 'kagura-auth-v4-shell-style';
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

  function findPanelHeader(panel) {
    if (!panel) return null;
    return panel.querySelector('.kagura-gpt-header, .kagura-ozon-header') || panel.firstElementChild;
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

  function ensureShellStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #kagura-gpt-panel[data-kagura-auth="guest"] .kagura-gpt-body > *:not(#${AUTH_PANEL_ID}),
      #kagura-ozon-panel[data-kagura-auth="guest"] .kagura-ozon-body > *:not(#${AUTH_PANEL_ID}) {
        display:none !important;
      }
      #${AUTH_PANEL_ID} { display:block; padding:6px 0 2px; }
      #${AUTH_PANEL_ID}[hidden] { display:none !important; }
      #${AUTH_PANEL_ID} .kagura-auth-v4 {
        margin:0; padding:22px 18px 18px; border:1px solid #d8e3df; border-radius:13px;
        background:linear-gradient(180deg,#ffffff 0%,#f7fbf9 100%); box-shadow:0 6px 22px rgba(15,23,42,.06);
      }
      #${AUTH_PANEL_ID} .kagura-auth-v4-shell-title {
        margin:0 0 4px; text-align:center; color:#15211d; font-size:19px; font-weight:850; letter-spacing:.2px;
      }
      #${AUTH_PANEL_ID} .kagura-auth-v4-shell-subtitle {
        margin:0 0 18px; text-align:center; color:#72817c; font-size:11px;
      }
      #${AUTH_PANEL_ID} .kagura-auth-v4-row { margin:9px 0; }
      #${AUTH_PANEL_ID} .kagura-auth-v4-label { width:46px; flex-basis:46px; }
      #${AUTH_PANEL_ID} .kagura-auth-v4-input { padding:9px 10px; }
      #${AUTH_PANEL_ID} .kagura-auth-v4-actions { margin-top:12px; }
      #${AUTH_PANEL_ID} .kagura-auth-v4-button { min-width:88px; padding:9px 14px; }
      #${AUTH_PANEL_ID} .kagura-auth-v4-shell-footer {
        display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:15px; padding-top:12px;
        border-top:1px solid #e6ece9; color:#84918c; font-size:10px;
      }
      #${AUTH_PANEL_ID} .kagura-auth-v4-shell-update {
        border:0; border-radius:999px; padding:6px 10px; cursor:pointer; background:#edf5f2; color:#25715e; font-weight:750;
      }
      #${MEMBER_CHIP_ID} {
        display:inline-flex; align-items:center; gap:6px; margin-left:auto; padding:3px 5px 3px 8px;
        border-radius:999px; background:rgba(255,255,255,.17); color:#fff; font:10px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
      }
      #${MEMBER_CHIP_ID}[hidden] { display:none !important; }
      #${MEMBER_CHIP_ID} [data-role="name"] { max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
      #${MEMBER_CHIP_ID} button { border:0; border-radius:999px; padding:3px 7px; cursor:pointer; background:rgba(255,255,255,.2); color:#fff; font:10px/1 inherit; }
    `;
    document.documentElement.appendChild(style);
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
    return Boolean(button?.closest?.('.kagura-auth-v4, #' + MEMBER_CHIP_ID));
  }

  function isProtectedTaskButton(button) {
    if (!button || button.disabled) return false;
    if (!button.closest('#kagura-gpt-panel, #kagura-ozon-panel')) return false;
    if (isAuthButton(button) || isVersionOrUpdateButton(button)) return false;

    const text = normalizeButtonText(button);
    if (!text) return false;

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

  function triggerOriginalUpdateCheck(panel) {
    const buttons = [...panel.querySelectorAll('button')]
      .filter(button => !button.closest('#' + AUTH_PANEL_ID));
    const exact = buttons.find(button => /检查更新/.test(normalizeButtonText(button)));
    const fallback = buttons.find(button => button.classList.contains('kagura-gpt-version-button'));
    const target = exact || fallback;
    if (!target) {
      setAuthMessage('暂未找到更新入口，请登录后从工作台检查更新');
      return;
    }
    target.click();
  }

  function decorateLoginShell(host, panel) {
    const root = host.querySelector('.kagura-auth-v4');
    if (!root || root.querySelector('.kagura-auth-v4-shell-title')) return;

    const title = document.createElement('div');
    title.className = 'kagura-auth-v4-shell-title';
    title.textContent = 'Kagura 授权登录';

    const subtitle = document.createElement('div');
    subtitle.className = 'kagura-auth-v4-shell-subtitle';
    subtitle.textContent = '登录后使用完整工作台';

    root.prepend(subtitle);
    root.prepend(title);

    const footer = document.createElement('div');
    footer.className = 'kagura-auth-v4-shell-footer';
    footer.innerHTML = `<span>V${DEV_VERSION}</span><button type="button" class="kagura-auth-v4-shell-update">检查更新</button>`;
    root.appendChild(footer);
    footer.querySelector('button').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      triggerOriginalUpdateCheck(panel);
    });
  }

  function decorateDevTitle(panel) {
    const title = panel.querySelector('.kagura-gpt-header-title, .kagura-ozon-header-title');
    if (!title) return;
    title.textContent = String(title.textContent || '')
      .replace(/V\d+(?:\.\d+){2}(?:[-.\w]*)?/i, 'V4 DEV');
  }

  function ensureMemberChip(panel) {
    let chip = document.getElementById(MEMBER_CHIP_ID);
    if (chip) return chip;

    const header = findPanelHeader(panel);
    if (!header) return null;

    chip = document.createElement('span');
    chip.id = MEMBER_CHIP_ID;
    chip.hidden = true;
    chip.innerHTML = `<span data-role="name">-</span><button type="button">退出</button>`;
    header.appendChild(chip);

    chip.addEventListener('mousedown', event => event.stopPropagation());
    chip.addEventListener('click', event => event.stopPropagation());
    chip.querySelector('button').addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await globalThis.KaguraAuth.logout();
      } finally {
        button.disabled = false;
      }
    });
    return chip;
  }

  function applyPanelMode(state) {
    const panel = findMainPanel();
    if (!panel) return;
    const host = document.getElementById(AUTH_PANEL_ID);
    const chip = ensureMemberChip(panel);
    const authenticated = Boolean(state?.authenticated);

    panel.dataset.kaguraAuth = authenticated ? 'member' : 'guest';

    if (!authenticated) {
      panel.classList.remove('kagura-collapsed');
      if (host) host.hidden = false;
      if (chip) chip.hidden = true;
    } else {
      if (host) host.hidden = true;
      if (chip) {
        chip.hidden = false;
        const name = chip.querySelector('[data-role="name"]');
        if (name) name.textContent = state?.username || '已授权';
      }
    }
  }

  async function mountAuthUI() {
    const panel = await waitForMainPanel();
    if (!panel || document.getElementById(AUTH_PANEL_ID)) return;

    ensureShellStyle();
    decorateDevTitle(panel);

    const body = findPanelBody(panel);
    if (!body) return;

    const host = document.createElement('div');
    host.id = AUTH_PANEL_ID;
    body.prepend(host);

    globalThis.KaguraAuthUI.mount(host, {
      onAuthorized(state) {
        setAuthMessage('授权验证通过', true);
        console.log('[Kagura V4 DEV] 登录成功：', state?.username || '');
      },
      onUnauthorized(error) {
        if (error?.code === 'LOGOUT') return;
        console.warn('[Kagura V4 DEV] 授权不可用：', error?.code || 'UNKNOWN');
      },
    });

    decorateLoginShell(host, panel);
    ensureMemberChip(panel);
    applyPanelMode(globalThis.KaguraAuth.getPublicState());
  }

  function installAuthStateWatcher() {
    globalThis.KaguraAuth?.onChange?.(state => {
      applyPanelMode(state);
    });
  }

  async function boot() {
    if (!globalThis.KaguraAuth || !globalThis.KaguraAuthGate || !globalThis.KaguraAuthUI) {
      console.error('[Kagura V4 DEV] Auth模块加载失败');
      return;
    }

    installStartGate();
    await mountAuthUI();
    installAuthStateWatcher();

    const state = globalThis.KaguraAuth.getPublicState();
    applyPanelMode(state);

    if (state.authenticated) {
      const result = await globalThis.KaguraAuthGate.check({ force: true, reason: 'startup' });
      if (!result?.ok) {
        setAuthMessage(result?.message || '登录状态已失效，请重新登录');
        applyPanelMode(globalThis.KaguraAuth.getPublicState());
      }
    }

    console.log('[Kagura V4 DEV] 独立登录壳已启动');
  }

  setTimeout(() => void boot(), 400);
})();
