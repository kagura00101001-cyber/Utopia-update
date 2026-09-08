// ==UserScript==
// @name         Kagura POD Studio
// @name:zh-CN   Kagura POD智能创意中心 V1.5.16
// @namespace    https://github.com/Kagura-userscripts
// @version      1.5.16
// @description  AI驱动的POD商品视觉生产系统：V1.5.16 新增明确内容限制拒绝识别：当前批自动重试1次，第二次仍被拒绝则跳过当前批并继续；不改动上传/创建图片/发送核心。
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
