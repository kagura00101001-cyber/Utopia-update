// ==UserScript==
// @name         ChatGPT服装POD统一工作台 V1.2.2
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.2
// @namespace    https://github.com/Kagura-userscripts
// @version      1.6.2
// @description  服装POD统一工作台：V1.6.2 修复“创建图片”入口误匹配聊天/项目标题导致切换会话的问题，并将入口严格绑定当前输入框菜单。
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
