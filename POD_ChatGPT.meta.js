// ==UserScript==
// @name         Kagura POD Studio
// @name:zh-CN   Kagura POD智能创意中心 V1.5.10
// @namespace    https://github.com/Kagura-userscripts
// @version      1.5.10
// @description  AI驱动的POD商品视觉生产系统：V1.5.10 新增0～任意张有序参考素材队列、附件Manifest与旧模板/Logo自动迁移，并保留V1.5.9创建图片事件驱动兼容及V1.5.8发送安全核心。
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
