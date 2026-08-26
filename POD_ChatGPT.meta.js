// ==UserScript==
// @name         ChatGPT服装POD统一工作台 V1.2.2
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4
// @namespace    https://github.com/Kagura-userscripts
// @version      1.6.4
// @description  服装POD统一工作台：V1.6.4 恢复已验证的“+→创建图片”弹层容错检测，并保留当前输入框绑定、侧栏排除与会话跳转保护。
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
