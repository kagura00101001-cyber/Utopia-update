// ==UserScript==
// @name         ChatGPT服装POD统一工作台
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.2.3
// @namespace    https://github.com/Kagura-userscripts
// @version      1.2.3
// @description  服装POD统一工作台：V1.2.3 修复Excel空白表头误判和34条问题，按有效任务量选择工作表，完整中文生图提示词最高优先，并优化任务表导入显示。
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
