// ==UserScript==
// @name         卖家国度 Ozon 多表采集
// @author       Kagura
// @namespace    bcserp-api-scraper
// @version      4.4.1
// @description  V4.4.1：商品服务端预筛支持可调订单阈值、最大上架天数、可选无品牌；新增低成本查询当前筛选数量与查询计时反馈；保留搜索请求官方数组、多表采集和 POD 风格手动热更新。
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
