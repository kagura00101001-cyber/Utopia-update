// ==UserScript==
// @name         卖家国度 Ozon 多表采集 v4.3.0（统一热更新）
// @author       Kagura
// @namespace    bcserp-api-scraper
// @version      4.3.0
// @description  新增与POD工作台一致的独立手动热更新模块：启动检查新版、版本按钮手动检查、更新说明、本版本不再提醒、由Tampermonkey手动确认覆盖；保留商品订单阈值服务端筛选、搜索请求官方数组、类目TOP等多表采集。
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/BCSERP_Ozon_MultiTable.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/BCSERP_Ozon_MultiTable.user.js
// @match        https://ozon.bcserp.com/system/mp/categoryReport*
// @match        https://ozon.bcserp.com/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @run-at       document-idle
// ==/UserScript==
