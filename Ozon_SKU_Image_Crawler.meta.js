// ==UserScript==
// @name         Ozon SKU主图批量下载器 TEST 1.0.1-dev.1
// @namespace    https://github.com/Kagura-userscripts/ozon-sku-image-crawler-test
// @version      1.0.1-dev.1
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/ozon-crawler-region-fallback-fix-test-20261019/Ozon_SKU_Image_Crawler.user.js
// @description  测试版：修复地区不可配送检测，并严格验证 webOutOfStock 原商品身份。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      ozone.ru
// @connect      ozon.ru
// @connect      *.ozone.ru
// @connect      *.ozon.ru
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==
