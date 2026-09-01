// ==UserScript==
// @name         ChatGPT服装POD统一工作台 V1.2.2
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.7
// @namespace    https://github.com/Kagura-userscripts
// @version      1.5.7
// @description  服装POD统一工作台：V1.5.7 新增发送前检查详细诊断与最多2次安全原地恢复；保留长提示词性能修复、后台断层保护与发送后at-most-once规则。
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      *.oaiusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==
