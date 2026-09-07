// ==UserScript==
// @name         Kagura POD Studio
// @name:zh-CN   Kagura POD智能创意中心 V1.5.12
// @namespace    https://github.com/Kagura-userscripts
// @version      1.5.12
// @description  AI驱动的POD商品视觉生产系统：V1.5.12 修复ChatGPT新版“+ → 添加照片和文件”上传入口：不再误用页面其它隐藏file input，并在上传未启动时自动重走菜单链路。
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
