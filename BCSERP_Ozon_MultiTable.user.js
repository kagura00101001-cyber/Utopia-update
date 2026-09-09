// ==UserScript==
// @name         卖家国度 Ozon 多表采集
// @author       Kagura
// @namespace    bcserp-api-scraper
// @version      4.4.1
// @description  BCSERP Ozon 多表采集 V4.4.1：服务端预筛（订单/上架天数/无品牌）、低成本查询符合数量、查询运行反馈，并保留 POD 风格手动热更新。
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

(async function () {
    'use strict';

    // 发布包固定绑定 V4.4.1。只有 Tampermonkey 用户手动确认安装新版本后，
    // 才会切换到新版本的 loader；旧版本不会跟随 GitHub payload 自动变更。
    const RELEASE_VERSION = '4.4.1';
    const RELEASE_SHA256 = '13e56d6a633e8d6ccf19e1f4936c0ec4c634e0dd4447743de1551799ae1b0c1c';
    const PAYLOAD_PARTS = 5;
    const RAW_BASE = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main';
    const CACHE_KEY = `bcserp_ozon_multitable_release_source_${RELEASE_VERSION}_${RELEASE_SHA256.slice(0, 12)}`;

    function requestText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 30000,
                onload: (resp) => {
                    if (resp.status >= 200 && resp.status < 300) {
                        resolve(String(resp.responseText || '').trim());
                        return;
                    }
                    reject(new Error(`HTTP ${resp.status}: ${url}`));
                },
                onerror: () => reject(new Error(`网络请求失败：${url}`)),
                ontimeout: () => reject(new Error(`网络请求超时：${url}`)),
            });
        });
    }

    async function sha256Hex(text) {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function decodePayload(base64Text) {
        const binary = atob(base64Text);
        const compressed = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) compressed[i] = binary.charCodeAt(i);
        if (typeof DecompressionStream !== 'function') {
            throw new Error('当前浏览器不支持 DecompressionStream(gzip)，请使用最新版 Chromium/Edge/Chrome。');
        }
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text();
    }

    async function loadReleaseSource() {
        const cached = GM_getValue(CACHE_KEY, '');
        if (cached && typeof cached === 'string') {
            const cachedHash = await sha256Hex(cached);
            if (cachedHash === RELEASE_SHA256) return cached;
        }

        const parts = [];
        for (let i = 1; i <= PAYLOAD_PARTS; i += 1) {
            const url = `${RAW_BASE}/BCSERP_Ozon_MultiTable.v${RELEASE_VERSION}.payload.${i}.b64`;
            parts.push(await requestText(url));
        }
        const source = await decodePayload(parts.join(''));
        const actualHash = await sha256Hex(source);
        if (actualHash !== RELEASE_SHA256) {
            throw new Error(`发布包完整性校验失败：expected=${RELEASE_SHA256}, actual=${actualHash}`);
        }
        GM_setValue(CACHE_KEY, source);
        return source;
    }

    function showLoadError(error) {
        console.error('[卖家国度 Ozon 多表采集] V4.4.1 发布包加载失败', error);
        const root = document.body || document.documentElement;
        if (!root || document.getElementById('bcserp-release-load-error')) return;
        const box = document.createElement('div');
        box.id = 'bcserp-release-load-error';
        box.style.cssText = [
            'position:fixed', 'right:18px', 'bottom:18px', 'z-index:2147483647',
            'max-width:520px', 'padding:12px 14px', 'border-radius:10px',
            'background:#7f1d1d', 'color:#fff', 'font:13px/1.55 system-ui,sans-serif',
            'box-shadow:0 8px 30px rgba(0,0,0,.35)',
        ].join(';');
        box.textContent = `卖家国度 Ozon 多表采集 V${RELEASE_VERSION} 加载失败：${error?.message || error}`;
        root.appendChild(box);
    }

    try {
        const source = await loadReleaseSource();
        // 直接 eval 在同一个 Tampermonkey 沙箱中执行，确保完整脚本仍可使用本 loader 声明的 GM_* 权限与 XLSX。
        eval(source);
    } catch (error) {
        showLoadError(error);
    }
})();
