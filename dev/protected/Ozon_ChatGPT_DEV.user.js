// ==UserScript==
// @name         Kagura AI 电商图片助手 V4 DEV
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

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function findMainPanel() { return document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel'); }

  // ...
})();