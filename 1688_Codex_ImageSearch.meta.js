// ==UserScript==
// @name         1688 Codex 图搜助手
// @name:zh-CN   Ozon→1688 Codex 找同款助手 V1.9.0
// @namespace    kagura.1688.codex.image.search
// @version      1.9.0
// @description  热更新通道正式版：接入 Utopia-update，与现有脚本一致自动检测新版并弹窗提醒；仅手动确认覆盖更新，不自动下载安装。保留 V1.8.3 全部找同款/结批能力。
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/1688_Codex_ImageSearch.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/1688_Codex_ImageSearch.user.js
// @match        https://1688.com/*
// @match        https://*.1688.com/*
// @match        https://ozon.ru/*
// @match        https://www.ozon.ru/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @connect      www.ozon.ru
// @connect      api.ozon.ru
// @connect      ir.ozone.ru
// @connect      *.ozone.ru
// @run-at       document-idle
// @noframes
// ==/UserScript==
