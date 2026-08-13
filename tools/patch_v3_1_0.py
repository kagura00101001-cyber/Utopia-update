from pathlib import Path
import json, re

VERSION = '3.1.0'
path = Path('Ozon_ChatGPT.user.js')
s = path.read_text(encoding='utf-8')
if '// @version      3.0.36' not in s:
    raise SystemExit('Expected V3.0.36 baseline not found')

# Archive baseline first.
versions = Path('versions')
versions.mkdir(exist_ok=True)
(versions / 'Ozon_ChatGPT批量生图下载器_V3.0.36.txt').write_text(s, encoding='utf-8')

# Version metadata.
s = s.replace('// @version      3.0.36', f'// @version      {VERSION}', 1)
s = s.replace("const APP_VERSION = '3.0.36';", f"const APP_VERSION = '{VERSION}';", 1)
s = s.replace("// @description  完整正式版：修复生成已完成但前端未渲染时误判静默中断并重复重发；已发送批次只刷新同步、不自动重发。",
              "// @description  功能增强版：详细批内生图进度、总运行/批次/生图计时、持久化运行日志、独立日志窗口及TXT/JSON诊断导出。", 1)
# Patch all internal current-version constants/comments that still point at 3.0.36.
s = s.replace("const CURRENT_VERSION = '3.0.36';", f"const CURRENT_VERSION = '{VERSION}';")
s = s.replace("const KAGURA_MANUAL_VERSION = '3.0.36';", f"const KAGURA_MANUAL_VERSION = '{VERSION}';")
s = s.replace('手动更新检查 V3.0.36', f'手动更新检查 V{VERSION}')

# Changelog shown inside the module.
pattern = re.compile(r"    const MODULE_CHANGELOG = \[.*?\n    \]\.join\('\\n'\);", re.S)
replacement = """    const MODULE_CHANGELOG = [
      `V${APP_VERSION} 更新内容：`,
      '1. 新增详细批内生图进度：实时显示当前批次、已检测生成 X/Y、停留时间和当前处理阶段。',
      '2. 新增总运行时间、当前批次耗时、当前生图耗时，并在主面板和独立日志窗口实时刷新。',
      '3. 运行日志改为持久化保存，页面刷新后历史日志仍保留，可直接用于故障排查。',
      '4. 废弃受主窗口限制的日志上拉方案；主窗口仅保留最近日志预览，新增可拖动、自由缩放、最大化/最小化的独立日志窗口。',
      '5. 日志支持搜索、级别筛选、暂停自动滚动、复制、TXT导出、JSON诊断包导出和清空。',
      '6. 保留 V3.0.36 的“已发送批次绝不自动重发”防重复生成机制。'
    ].join('\\n');"""
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('MODULE_CHANGELOG patch failed')

# Add persistent log keys.
needle = "    const C_TEMPLATE_KEY = 'template-file';\n"
insert = needle + "    const C_LOG_KEY = 'chatgptBatchImageLogsV1';\n    const C_LOG_MAX = 2500;\n"
if needle not in s:
    raise SystemExit('template key target missing')
s = s.replace(needle, insert, 1)

# Extend state.
needle = "      startedAt: 0,\n      resumeContext: null,\n"
insert = """      startedAt: 0,
      totalRunMs: 0,
      runSegmentStartedAt: 0,
      batchStartedAt: 0,
      generationStartedAt: 0,
      lastBatchElapsedMs: 0,
      lastGenerationElapsedMs: 0,
      expectedGeneratedCount: 0,
      detectedGeneratedCount: 0,
      generatedCountChangedAt: 0,
      resumeContext: null,
"""
if needle not in s:
    raise SystemExit('state timing target missing')
s = s.replace(needle, insert, 1)

# Extend UI vars and load persisted logs.
needle = """    let cOutputText;
    let cStartButton;
    let cWorkerActive = false;
"""
insert = """    let cOutputText;
    let cStartButton;
    let cBatchText;
    let cPhaseText;
    let cGeneratedText;
    let cTotalTimeText;
    let cBatchTimeText;
    let cGenerationTimeText;
    let cLogWindow = null;
    let cLogWindowBody = null;
    let cLogWindowMetrics = null;
    let cLogAutoScroll = true;
    let cLogEntries = (() => {
      const saved = GM_getValue(C_LOG_KEY, []);
      return Array.isArray(saved) ? saved.slice(-C_LOG_MAX) : [];
    })();
    let cWorkerActive = false;
"""
if needle not in s:
    raise SystemExit('UI variable target missing')
s = s.replace(needle, insert, 1)

# Replace time/log helper block with persistent structured log system + timers.
pattern = re.compile(r"    function cNowText\(\) \{.*?\n    \}\n\n    function cOpenDb\(\) \{", re.S)
replacement = r'''    function cNowText(date = new Date()) {
      return date.toLocaleTimeString('zh-CN', { hour12: false });
    }

    function cFormatDuration(ms) {
      const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    function cGetTotalRunMs() {
      return Math.max(0, Number(cState.totalRunMs || 0))
        + (cState.runSegmentStartedAt ? Math.max(0, Date.now() - Number(cState.runSegmentStartedAt)) : 0);
    }

    function cStartRunClock() {
      if (!cState.startedAt) cState.startedAt = Date.now();
      if (!cState.runSegmentStartedAt) cState.runSegmentStartedAt = Date.now();
    }

    function cStopRunClock() {
      if (!cState.runSegmentStartedAt) return;
      cState.totalRunMs = Math.max(0, Number(cState.totalRunMs || 0)) + Math.max(0, Date.now() - Number(cState.runSegmentStartedAt));
      cState.runSegmentStartedAt = 0;
    }

    function cGetBatchElapsedMs() {
      return cState.batchStartedAt ? Math.max(0, Date.now() - Number(cState.batchStartedAt)) : Math.max(0, Number(cState.lastBatchElapsedMs || 0));
    }

    function cGetGenerationElapsedMs() {
      return cState.generationStartedAt ? Math.max(0, Date.now() - Number(cState.generationStartedAt)) : Math.max(0, Number(cState.lastGenerationElapsedMs || 0));
    }

    function cFinishBatchTimers() {
      if (cState.batchStartedAt) cState.lastBatchElapsedMs = Math.max(0, Date.now() - Number(cState.batchStartedAt));
      if (cState.generationStartedAt) cState.lastGenerationElapsedMs = Math.max(0, Date.now() - Number(cState.generationStartedAt));
      cState.batchStartedAt = 0;
      cState.generationStartedAt = 0;
      cState.generatedCountChangedAt = 0;
      cState.expectedGeneratedCount = 0;
      cState.detectedGeneratedCount = 0;
    }

    function cPhaseLabel(phase = cState.phase) {
      const labels = {
        idle: '等待配置', ready: '准备开始', preparing: '准备当前批次',
        uploading_source: '上传原图', activating_create_image: '添加创建图片模式',
        uploading_template: '上传模板图', writing_prompt: '写入提示词', sending: '发送并确认提交',
        generating: '等待/检测生图', downloading: '下载保存成图', recovering: '恢复检测当前成图',
        refreshing: '刷新同步服务器结果', batch_wait: '批次间随机等待', pending: '异常转待确认',
        error: '异常暂停', done: '全部完成'
      };
      return labels[phase] || String(phase || '未知');
    }

    function cPersistLogs() {
      if (cLogEntries.length > C_LOG_MAX) cLogEntries = cLogEntries.slice(-C_LOG_MAX);
      GM_setValue(C_LOG_KEY, cLogEntries);
    }

    function cLogLineText(entry) {
      const prefix = entry.type === 'error' ? '失败' : entry.type === 'success' ? '成功' : entry.type === 'warn' ? '提示' : '信息';
      const batch = entry.batchNo ? ` [第${entry.batchNo}批]` : '';
      const progress = Number(entry.expectedGeneratedCount || 0) > 0 ? ` [生图${Number(entry.detectedGeneratedCount || 0)}/${Number(entry.expectedGeneratedCount || 0)}]` : '';
      return `[${entry.localTime || ''}] ${prefix}${batch}${progress}：${entry.message}`;
    }

    function cRenderLogPreview() {
      if (!cLogBox) return;
      cLogBox.innerHTML = '';
      for (const entry of cLogEntries.slice(-10)) {
        const line = document.createElement('div');
        line.className = `kagura-gpt-log kagura-gpt-log-${entry.type || 'info'}`;
        line.textContent = cLogLineText(entry);
        cLogBox.appendChild(line);
      }
      cLogBox.scrollTop = cLogBox.scrollHeight;
    }

    function cFilteredLogEntries() {
      if (!cLogWindow) return cLogEntries;
      const level = cLogWindow.querySelector('[data-log-filter="level"]')?.value || 'all';
      const query = String(cLogWindow.querySelector('[data-log-filter="search"]')?.value || '').trim().toLowerCase();
      return cLogEntries.filter(entry => {
        if (level !== 'all' && entry.type !== level) return false;
        if (query && !cLogLineText(entry).toLowerCase().includes(query)) return false;
        return true;
      });
    }

    function cRenderLogWindow() {
      if (!cLogWindowBody) return;
      cLogWindowBody.innerHTML = '';
      for (const entry of cFilteredLogEntries()) {
        const line = document.createElement('div');
        line.className = `kagura-log-window-line kagura-log-window-${entry.type || 'info'}`;
        line.textContent = cLogLineText(entry);
        cLogWindowBody.appendChild(line);
      }
      if (cLogAutoScroll) cLogWindowBody.scrollTop = cLogWindowBody.scrollHeight;
    }

    function cLog(message, type = 'info') {
      const now = new Date();
      const prefix = type === 'error' ? '失败' : type === 'success' ? '成功' : type === 'warn' ? '提示' : '信息';
      console[type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log'](`[${MODULE_NAME}] ${message}`);
      cLogEntries.push({
        time: now.toISOString(),
        localTime: cNowText(now),
        type,
        prefix,
        message: String(message),
        batchNo: Number(cState.batchNo || 0),
        phase: String(cState.phase || ''),
        expectedGeneratedCount: Number(cState.expectedGeneratedCount || 0),
        detectedGeneratedCount: Number(cState.detectedGeneratedCount || 0),
        url: location.href,
        version: APP_VERSION,
      });
      cPersistLogs();
      cRenderLogPreview();
      cRenderLogWindow();
    }

    function cDownloadTextFile(fileName, text, type = 'text/plain;charset=utf-8') {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function cLogStamp() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    function cBuildLogTxt() {
      const header = [
        `脚本：${MODULE_NAME}`,
        `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        `浏览器：${navigator.userAgent}`,
        `页面：${location.href}`,
        `总运行：${cFormatDuration(cGetTotalRunMs())}`,
        `当前批次：${cState.batchNo}`,
        `当前阶段：${cPhaseLabel()}`,
        `当前生图：${cState.detectedGeneratedCount || 0}/${cState.expectedGeneratedCount || 0}`,
        '-----------------------------------',
      ];
      return '\uFEFF' + [...header, ...cLogEntries.map(cLogLineText)].join('\r\n');
    }

    function cExportLogsTxt() {
      cDownloadTextFile(`ChatGPT运行日志_V${APP_VERSION}_${cLogStamp()}.txt`, cBuildLogTxt());
      cLog(`已导出运行日志 TXT，共 ${cLogEntries.length} 条`, 'success');
    }

    function cExportDiagnosticJson() {
      const safeSettings = { ...cSettings, prompt: undefined, promptLength: String(cSettings.prompt || '').length };
      const payload = {
        exportedAt: new Date().toISOString(),
        version: APP_VERSION,
        module: MODULE_NAME,
        browser: navigator.userAgent,
        url: location.href,
        timing: {
          totalRunMs: cGetTotalRunMs(),
          batchElapsedMs: cGetBatchElapsedMs(),
          generationElapsedMs: cGetGenerationElapsedMs(),
        },
        state: { ...cState },
        settings: safeSettings,
        logs: cLogEntries,
      };
      cDownloadTextFile(`ChatGPT诊断包_V${APP_VERSION}_${cLogStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      cLog(`已导出诊断 JSON，共 ${cLogEntries.length} 条日志`, 'success');
    }

    async function cCopyLogs() {
      const text = cBuildLogTxt();
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      cLog('运行日志已复制到剪贴板', 'success');
    }

    function cClearLogs() {
      if (!confirm('确定清空全部运行日志吗？此操作不会影响任务进度和已保存图片。')) return;
      cLogEntries = [];
      GM_deleteValue(C_LOG_KEY);
      cRenderLogPreview();
      cRenderLogWindow();
    }

    function cOpenDb() {'''
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('log helper replacement failed')

# Add independent log window functions before draggable helper.
needle = "    function cMakeDraggable(target, handle) {\n"
log_window_block = r'''    function cCreateLogWindow() {
      if (cLogWindow && document.contains(cLogWindow)) return cLogWindow;
      GM_addStyle(`
        #kagura-gpt-log-window { position:fixed; z-index:2147483647; left:7vw; top:7vh; width:min(820px,86vw); height:76vh; min-width:420px; min-height:260px; resize:both; overflow:hidden; display:flex; flex-direction:column; background:#0f172a; color:#e5e7eb; border:1px solid #334155; border-radius:12px; box-shadow:0 18px 50px rgba(2,6,23,.45); font:12px/1.5 Consolas,"Microsoft YaHei",monospace; }
        #kagura-gpt-log-window * { box-sizing:border-box; }
        .kagura-log-head { display:flex; align-items:center; gap:10px; padding:9px 10px; background:#111827; border-bottom:1px solid #334155; cursor:move; user-select:none; }
        .kagura-log-title { font-weight:800; color:#fff; white-space:nowrap; }
        .kagura-log-metrics { flex:1; min-width:0; color:#a7f3d0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .kagura-log-head button { border:0; border-radius:6px; min-width:28px; height:26px; background:#334155; color:#fff; cursor:pointer; }
        .kagura-log-toolbar { display:flex; gap:7px; align-items:center; padding:8px 10px; background:#172033; border-bottom:1px solid #334155; }
        .kagura-log-toolbar input[type="search"] { flex:1; min-width:120px; background:#0b1220; color:#fff; border:1px solid #475569; border-radius:7px; padding:6px 8px; }
        .kagura-log-toolbar select { background:#0b1220; color:#fff; border:1px solid #475569; border-radius:7px; padding:6px 8px; }
        .kagura-log-toolbar label { display:flex; align-items:center; gap:5px; white-space:nowrap; color:#cbd5e1; }
        .kagura-log-body { flex:1; min-height:0; overflow:auto; padding:9px 10px; background:#020617; }
        .kagura-log-window-line { padding:2px 0; white-space:pre-wrap; word-break:break-word; border-bottom:1px solid rgba(51,65,85,.22); }
        .kagura-log-window-info { color:#dbeafe; } .kagura-log-window-success { color:#86efac; } .kagura-log-window-warn { color:#fde68a; } .kagura-log-window-error { color:#fda4af; }
        .kagura-log-footer { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; padding:8px 10px; background:#111827; border-top:1px solid #334155; }
        .kagura-log-footer button { border:0; border-radius:7px; padding:7px 10px; background:#334155; color:#fff; cursor:pointer; }
        .kagura-log-footer button[data-danger="1"] { background:#7f1d1d; }
        #kagura-gpt-log-window.kagura-log-max { left:8px !important; top:8px !important; width:calc(100vw - 16px) !important; height:calc(100vh - 16px) !important; resize:none; }
        #kagura-gpt-log-window.kagura-log-min { width:210px !important; height:44px !important; min-width:210px !important; min-height:44px !important; resize:none; }
        #kagura-gpt-log-window.kagura-log-min .kagura-log-toolbar, #kagura-gpt-log-window.kagura-log-min .kagura-log-body, #kagura-gpt-log-window.kagura-log-min .kagura-log-footer, #kagura-gpt-log-window.kagura-log-min .kagura-log-metrics { display:none; }
      `);
      cLogWindow = document.createElement('section');
      cLogWindow.id = 'kagura-gpt-log-window';
      cLogWindow.innerHTML = `
        <div class="kagura-log-head">
          <span class="kagura-log-title">运行日志 V${APP_VERSION}</span>
          <span class="kagura-log-metrics" data-role="metrics"></span>
          <button type="button" data-role="min" title="最小化">—</button>
          <button type="button" data-role="max" title="最大化/恢复">□</button>
          <button type="button" data-role="close" title="关闭">×</button>
        </div>
        <div class="kagura-log-toolbar">
          <input type="search" data-log-filter="search" placeholder="搜索日志关键词…">
          <select data-log-filter="level"><option value="all">全部</option><option value="info">信息</option><option value="success">成功</option><option value="warn">提示</option><option value="error">失败</option></select>
          <label><input type="checkbox" data-role="auto" checked> 自动滚动</label>
        </div>
        <div class="kagura-log-body" data-role="body"></div>
        <div class="kagura-log-footer">
          <button type="button" data-role="copy">复制日志</button>
          <button type="button" data-role="txt">导出 TXT</button>
          <button type="button" data-role="json">导出诊断 JSON</button>
          <button type="button" data-role="clear" data-danger="1">清空日志</button>
        </div>`;
      document.documentElement.appendChild(cLogWindow);
      cLogWindowBody = cLogWindow.querySelector('[data-role="body"]');
      cLogWindowMetrics = cLogWindow.querySelector('[data-role="metrics"]');
      const head = cLogWindow.querySelector('.kagura-log-head');
      cMakeDraggable(cLogWindow, head);
      cLogWindow.querySelector('[data-log-filter="search"]').addEventListener('input', cRenderLogWindow);
      cLogWindow.querySelector('[data-log-filter="level"]').addEventListener('change', cRenderLogWindow);
      cLogWindow.querySelector('[data-role="auto"]').addEventListener('change', event => { cLogAutoScroll = Boolean(event.target.checked); });
      cLogWindow.querySelector('[data-role="copy"]').addEventListener('click', () => cCopyLogs());
      cLogWindow.querySelector('[data-role="txt"]').addEventListener('click', cExportLogsTxt);
      cLogWindow.querySelector('[data-role="json"]').addEventListener('click', cExportDiagnosticJson);
      cLogWindow.querySelector('[data-role="clear"]').addEventListener('click', cClearLogs);
      cLogWindow.querySelector('[data-role="close"]').addEventListener('click', () => { cLogWindow.style.display = 'none'; });
      cLogWindow.querySelector('[data-role="min"]').addEventListener('click', event => {
        event.stopPropagation();
        cLogWindow.classList.toggle('kagura-log-min');
        if (cLogWindow.classList.contains('kagura-log-min')) cLogWindow.classList.remove('kagura-log-max');
      });
      cLogWindow.querySelector('[data-role="max"]').addEventListener('click', event => {
        event.stopPropagation();
        cLogWindow.classList.remove('kagura-log-min');
        cLogWindow.classList.toggle('kagura-log-max');
      });
      cRenderLogWindow();
      cUpdateLogWindowMetrics();
      return cLogWindow;
    }

    function cOpenLogWindow() {
      const win = cCreateLogWindow();
      win.style.display = 'flex';
      win.classList.remove('kagura-log-min');
      cRenderLogWindow();
      cUpdateLogWindowMetrics();
    }

    function cUpdateLogWindowMetrics() {
      if (!cLogWindowMetrics) return;
      const expected = Number(cState.expectedGeneratedCount || 0);
      const detected = Number(cState.detectedGeneratedCount || 0);
      cLogWindowMetrics.textContent = `总运行 ${cFormatDuration(cGetTotalRunMs())} ｜ 第${cState.batchNo}批 ｜ ${cPhaseLabel()} ｜ 生图 ${detected}/${expected || 0} ｜ 本批 ${cFormatDuration(cGetBatchElapsedMs())} ｜ 生图 ${cFormatDuration(cGetGenerationElapsedMs())}`;
    }

    function cMakeDraggable(target, handle) {
'''
if needle not in s:
    raise SystemExit('draggable insertion target missing')
s = s.replace(needle, log_window_block, 1)

# Explicit fine-grained phases in processing pipeline.
repls = [
("            await cUploadFiles(sourceFiles, '原图');", "            cState.phase = 'uploading_source'; cSaveState();\n            await cUploadFiles(sourceFiles, '原图');"),
("            await cActivateCreateImage();", "            cState.phase = 'activating_create_image'; cSaveState();\n            await cActivateCreateImage();"),
("            const expectedAttachmentCount = await cUploadFiles([templateFile], '模板图');", "            cState.phase = 'uploading_template'; cSaveState();\n            const expectedAttachmentCount = await cUploadFiles([templateFile], '模板图');"),
("            await cSetPrompt(cSettings.prompt);", "            cState.phase = 'writing_prompt'; cSaveState();\n            await cSetPrompt(cSettings.prompt);"),
("            await cSendPrompt(expectedAttachmentCount, cSettings.prompt);", "            cState.phase = 'sending'; cSaveState();\n            await cSendPrompt(expectedAttachmentCount, cSettings.prompt);"),
]
for old, new in repls:
    if old not in s:
        raise SystemExit(f'phase target missing: {old[:40]}')
    s = s.replace(old, new, 1)

# Initialize batch timers/progress at cProcessBatch start.
needle = """      cState.currentBatch = batchPaths;
      cState.phase = 'preparing';
      cSaveState();
"""
insert = """      const continuingSameBatch = cSameBatchPaths(cState.currentBatch || [], batchPaths) && Boolean(cState.batchStartedAt);
      cState.currentBatch = batchPaths;
      if (!continuingSameBatch) {
        cState.batchStartedAt = Date.now();
        cState.generationStartedAt = 0;
        cState.detectedGeneratedCount = 0;
        cState.generatedCountChangedAt = Date.now();
      }
      cState.expectedGeneratedCount = batchPaths.length;
      cState.phase = 'preparing';
      cSaveState();
"""
if needle not in s:
    raise SystemExit('batch timer init target missing')
s = s.replace(needle, insert, 1)

# Set generation timer after confirmed send / in detect-only recovery.
needle = """            promptSent = true;
            cState.phase = 'generating';
            cSaveState();
"""
insert = """            promptSent = true;
            if (!cState.generationStartedAt) cState.generationStartedAt = Date.now();
            if (!cState.generatedCountChangedAt) cState.generatedCountChangedAt = Date.now();
            cState.expectedGeneratedCount = batchPaths.length;
            cState.phase = 'generating';
            cSaveState();
"""
# occurs twice; replace both.
if s.count(needle) < 2:
    raise SystemExit('generation timer target count insufficient')
s = s.replace(needle, insert, 2)

# Track detected image count and improve periodic generation log.
needle = """        if (ready.length !== lastCount) {
          lastCount = ready.length;
          lastCountChangeAt = Date.now();
        }
        const countStableFor = Date.now() - lastCountChangeAt;
"""
insert = """        if (ready.length !== lastCount) {
          lastCount = ready.length;
          lastCountChangeAt = Date.now();
          cState.detectedGeneratedCount = ready.length;
          cState.expectedGeneratedCount = expectedCount;
          cState.generatedCountChangedAt = Date.now();
          cSaveState();
        }
        const countStableFor = Date.now() - lastCountChangeAt;
"""
if needle not in s:
    raise SystemExit('generated count tracking target missing')
s = s.replace(needle, insert, 1)

old = "          cLog(`生图状态：${stateLabel}，图片数量已稳定 ${stableSince ? Math.floor((Date.now() - stableSince) / 1000) : 0} 秒`, 'info');"
new = "          cLog(`生图进度：${ready.length}/${expectedCount || '?'}；状态：${stateLabel}；当前数量已停留 ${Math.floor(countStableFor / 1000)} 秒`, 'info');"
if old not in s:
    raise SystemExit('periodic generation log target missing')
s = s.replace(old, new, 1)

# Before successful download set phase; on finish preserve last timers then clear current timers.
needle = """          const saved = await cDownloadGenerated(generated, batchPaths, cState.batchNo);
          cState.results.push({
"""
insert = """          cState.detectedGeneratedCount = generated.length;
          cState.expectedGeneratedCount = batchPaths.length;
          cState.phase = 'downloading';
          cSaveState();
          const saved = await cDownloadGenerated(generated, batchPaths, cState.batchNo);
          cState.results.push({
"""
if needle not in s:
    raise SystemExit('download phase target missing')
s = s.replace(needle, insert, 1)

needle = """          cState.index += batchPaths.length;
          cState.batchNo += 1;
          cState.currentBatch = [];
          cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
"""
insert = """          cFinishBatchTimers();
          cState.index += batchPaths.length;
          cState.batchNo += 1;
          cState.currentBatch = [];
          cState.phase = cState.index >= cState.imagePaths.length ? 'done' : 'ready';
"""
if needle not in s:
    raise SystemExit('success finish timer target missing')
s = s.replace(needle, insert, 1)

# Pending batch should also record batch/generation elapsed then clear current timers.
needle = """      cState.resumeContext = null;
      cState.index += batchPaths.length;
      cState.batchNo += 1;
      cState.currentBatch = [];
"""
insert = """      cState.resumeContext = null;
      cState.phase = 'pending';
      cFinishBatchTimers();
      cState.index += batchPaths.length;
      cState.batchNo += 1;
      cState.currentBatch = [];
"""
if needle not in s:
    raise SystemExit('pending timer target missing')
s = s.replace(needle, insert, 1)

# Total run clock lifecycle.
old = """      cState.running = true;
      cState.phase = 'ready';
      cState.startedAt = Date.now();
      cSaveState();
"""
new = """      cState.running = true;
      cState.phase = 'ready';
      cStartRunClock();
      cSaveState();
"""
if old not in s:
    raise SystemExit('start clock target missing')
s = s.replace(old, new, 1)

old = """    function cPause() {
      cState.running = false;
      cSaveState();
"""
new = """    function cPause() {
      cStopRunClock();
      cState.running = false;
      cSaveState();
"""
if old not in s:
    raise SystemExit('pause clock target missing')
s = s.replace(old, new, 1)

old = """      cState.running = false;
      cState.index += skipped.length;
"""
new = """      cStopRunClock();
      cFinishBatchTimers();
      cState.running = false;
      cState.index += skipped.length;
"""
if old not in s:
    raise SystemExit('skip clock target missing')
s = s.replace(old, new, 1)

# On completely new rerun after done, reset time accounting too.
needle = """      if (cState.index >= cState.imagePaths.length) {
        cState.index = 0;
        cState.batchNo = 1;
        cState.results = [];
      }
"""
insert = """      if (cState.index >= cState.imagePaths.length) {
        cState.index = 0;
        cState.batchNo = 1;
        cState.results = [];
        cState.startedAt = 0;
        cState.totalRunMs = 0;
        cState.runSegmentStartedAt = 0;
        cState.lastBatchElapsedMs = 0;
        cState.lastGenerationElapsedMs = 0;
        cFinishBatchTimers();
      }
"""
if needle not in s:
    raise SystemExit('rerun timer reset target missing')
s = s.replace(needle, insert, 1)

# Worker done/error clock stop.
old = """        if (cState.running && cState.index >= cState.imagePaths.length) {
          cState.running = false;
          cState.phase = 'done';
"""
new = """        if (cState.running && cState.index >= cState.imagePaths.length) {
          cStopRunClock();
          cState.running = false;
          cState.phase = 'done';
"""
if old not in s:
    raise SystemExit('worker done clock target missing')
s = s.replace(old, new, 1)

old = """        } else {
          cState.running = false;
          cState.phase = 'error';
"""
new = """        } else {
          cStopRunClock();
          cState.running = false;
          cState.phase = 'error';
"""
if old not in s:
    raise SystemExit('worker error clock target missing')
s = s.replace(old, new, 1)

# Main panel: detailed rows + compact preview instead of resizer.
needle = """          <div class="kagura-gpt-row"><span class="kagura-gpt-label">进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="progress">0 / 0</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">待确认</span><span class="kagura-gpt-value" data-role="pending">0 个异常批次</span></div>
          <div class="kagura-gpt-status" data-role="status">等待配置</div>
"""
insert = """          <div class="kagura-gpt-row"><span class="kagura-gpt-label">任务进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="progress">0 / 0</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">当前批次</span><span class="kagura-gpt-value" data-role="batch">-</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">当前阶段</span><span class="kagura-gpt-value" data-role="phase">等待配置</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">生图进度</span><span class="kagura-gpt-value kagura-gpt-progress" data-role="generated">0 / 0</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">总运行</span><span class="kagura-gpt-value" data-role="total-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">本批耗时</span><span class="kagura-gpt-value" data-role="batch-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">生图耗时</span><span class="kagura-gpt-value" data-role="generation-time">00:00:00</span></div>
          <div class="kagura-gpt-row"><span class="kagura-gpt-label">待确认</span><span class="kagura-gpt-value" data-role="pending">0 个异常批次</span></div>
          <div class="kagura-gpt-status" data-role="status">等待配置</div>
"""
if needle not in s:
    raise SystemExit('panel detailed rows target missing')
s = s.replace(needle, insert, 1)

needle = """          <div class="kagura-gpt-buttons" data-role="buttons"></div>
          <div class="kagura-gpt-log-resizer" title="向上拖动：日志框向上扩展；向下拖动：缩小日志框"></div>
          <div class="kagura-gpt-logbox" data-role="log"></div>
          <div class="kagura-gpt-note">运行记录框上方灰色拖动条可向上拉大。</div>
"""
insert = """          <div class="kagura-gpt-buttons" data-role="buttons"></div>
          <div class="kagura-gpt-note">最近日志预览（完整记录请点击“运行日志”）</div>
          <div class="kagura-gpt-logbox" data-role="log"></div>
"""
if needle not in s:
    raise SystemExit('log preview target missing')
s = s.replace(needle, insert, 1)

# Compact preview CSS by overriding old logbox rules; hide obsolete resizer if any remains.
needle = "        .kagura-gpt-logbox { height:130px; overflow:auto;"
if needle not in s:
    raise SystemExit('logbox css target missing')
s = s.replace(needle, "        .kagura-gpt-logbox { height:96px; overflow:auto;", 1)
s = s.replace("        .kagura-gpt-log-resizer { height:10px; margin:8px 0 4px; cursor:ns-resize; display:flex; align-items:center; justify-content:center; }", "        .kagura-gpt-log-resizer { display:none !important; }")
s = s.replace("        .kagura-gpt-log-resizer::before { content:''; width:56px; height:4px; border-radius:99px; background:#cbd5e1; }", "        .kagura-gpt-log-resizer::before { display:none; }")

# Bind new UI references.
needle = """      cProgressText = cPanel.querySelector('[data-role="progress"]');
      cPendingText = cPanel.querySelector('[data-role="pending"]');
"""
insert = """      cProgressText = cPanel.querySelector('[data-role="progress"]');
      cBatchText = cPanel.querySelector('[data-role="batch"]');
      cPhaseText = cPanel.querySelector('[data-role="phase"]');
      cGeneratedText = cPanel.querySelector('[data-role="generated"]');
      cTotalTimeText = cPanel.querySelector('[data-role="total-time"]');
      cBatchTimeText = cPanel.querySelector('[data-role="batch-time"]');
      cGenerationTimeText = cPanel.querySelector('[data-role="generation-time"]');
      cPendingText = cPanel.querySelector('[data-role="pending"]');
"""
if needle not in s:
    raise SystemExit('panel refs target missing')
s = s.replace(needle, insert, 1)

# Add log controls to button grid.
needle = """        cCreateButton('跳过当前批', '', cSkipBatch),
        cCreateButton('清空图片', 'kagura-gpt-danger', cClearSourceAndOutputImages),
"""
insert = """        cCreateButton('跳过当前批', '', cSkipBatch),
        cCreateButton('运行日志', 'kagura-gpt-success', cOpenLogWindow),
        cCreateButton('导出日志', 'kagura-gpt-success', cExportLogsTxt),
        cCreateButton('清空图片', 'kagura-gpt-danger', cClearSourceAndOutputImages),
"""
if needle not in s:
    raise SystemExit('log buttons target missing')
s = s.replace(needle, insert, 1)

# Remove old resizer binding and render persistent preview.
s = s.replace("      cBindLogResizer(cLogBox, cPanel.querySelector('.kagura-gpt-log-resizer'), cPanel);", "      cRenderLogPreview();")

# Replace cUpdatePanel with detailed version.
pattern = re.compile(r"    function cUpdatePanel\(\) \{.*?\n    \}\n\n    cCreatePanel\(\);", re.S)
replacement = r'''    function cUpdatePanel() {
      if (!cPanel) return;
      const total = cState.imagePaths.length;
      const pendingCount = Array.isArray(cState.pendingQueue) ? cState.pendingQueue.length : 0;
      const batchSize = Math.max(1, Number(cSettings.batchSize) || 10);
      const totalBatches = total ? Math.ceil(total / batchSize) : 0;
      const expected = Number(cState.expectedGeneratedCount || (cState.currentBatch?.length || 0));
      const detected = Number(cState.detectedGeneratedCount || 0);
      const stuckSeconds = cState.generatedCountChangedAt ? Math.max(0, Math.floor((Date.now() - Number(cState.generatedCountChangedAt)) / 1000)) : 0;
      const batchFiles = Array.isArray(cState.currentBatch) ? cState.currentBatch.map(x => String(x).split('/').pop()).join('、') : '';

      cProgressText.textContent = `${Math.min(cState.index, total)} / ${total}`;
      if (cBatchText) {
        cBatchText.textContent = totalBatches ? `第 ${Math.min(cState.batchNo, totalBatches)} / ${totalBatches} 批` : '-';
        cBatchText.title = batchFiles || '当前无活动批次';
      }
      if (cPhaseText) cPhaseText.textContent = cPhaseLabel();
      if (cGeneratedText) {
        cGeneratedText.textContent = `${detected} / ${expected || 0}${cState.phase === 'generating' && expected ? `（停留 ${stuckSeconds}秒）` : ''}`;
      }
      if (cTotalTimeText) cTotalTimeText.textContent = cFormatDuration(cGetTotalRunMs());
      if (cBatchTimeText) cBatchTimeText.textContent = cFormatDuration(cGetBatchElapsedMs());
      if (cGenerationTimeText) cGenerationTimeText.textContent = cFormatDuration(cGetGenerationElapsedMs());
      if (cPendingText) cPendingText.textContent = `${pendingCount} 个异常批次`;

      if (!total) cStatusText.textContent = '请选择原图文件夹并扫描';
      else if (cState.running && cState.phase === 'batch_wait') { /* 倒计时由 cWaitBetweenBatches 实时更新 */ }
      else if (cState.running && cState.phase === 'generating') cStatusText.textContent = `正在生图：已检测 ${detected}/${expected || '?'}，当前数量停留 ${stuckSeconds} 秒`;
      else if (cState.running) cStatusText.textContent = `运行中：${cPhaseLabel()}`;
      else if (cState.phase === 'done') cStatusText.textContent = pendingCount ? `全部完成；待确认 ${pendingCount} 批` : '全部完成';
      else if (cState.phase === 'error') cStatusText.textContent = '发生错误，已暂停';
      else cStatusText.textContent = `已暂停：下一张 ${cState.imagePaths[cState.index] || '无'}`;
      cStartButton.textContent = cState.running ? '运行中' : '开始/继续';
      cUpdateLogWindowMetrics();
    }

    cCreatePanel();'''
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('cUpdatePanel replacement failed')

# Add live 1-second UI timer immediately after panel creation.
needle = """    cCreatePanel();
    cMaybeShowUpdateNotice();
"""
insert = """    cCreatePanel();
    setInterval(() => {
      try { cUpdatePanel(); } catch (_) {}
    }, 1000);
    cMaybeShowUpdateNotice();
"""
if needle not in s:
    raise SystemExit('live timer insertion target missing')
s = s.replace(needle, insert, 1)

# On non-recovery reload, stop active clock before auto-pause. On refresh recovery keep clock alive.
needle = """    } else if (cState.running) {
      cState.running = false;
      cState.phase = 'ready';
"""
insert = """    } else if (cState.running) {
      cStopRunClock();
      cState.running = false;
      cState.phase = 'ready';
"""
if needle not in s:
    raise SystemExit('reload pause clock target missing')
s = s.replace(needle, insert, 1)

# Update current version in any remaining exact current-version tokens, but not historical archive strings.
s = s.replace("const KAGURA_MANUAL_VERSION = '3.0.36';", f"const KAGURA_MANUAL_VERSION = '{VERSION}';")

# Save formal script and version archive.
path.write_text(s, encoding='utf-8')
(versions / f'Ozon_ChatGPT批量生图下载器_V{VERSION}.txt').write_text(s, encoding='utf-8')

# Native Tampermonkey metadata.
Path('Ozon_ChatGPT.meta.js').write_text(f'''// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      {VERSION}
// @description  Ozon主图下载 + ChatGPT批量生图助手 更新元数据
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// ==/UserScript==
''', encoding='utf-8')

notes = [
    '新增详细批内生图进度：主面板实时显示当前批次、当前阶段、已检测生成 X/Y 和当前数量停留时间。',
    '新增总运行时间、当前批次耗时、当前生图耗时，页面每秒实时刷新。',
    '运行日志改为持久化保存，ChatGPT 页面刷新后历史日志仍保留，解决刷新后无法回看排查记录的问题。',
    '废弃受主脚本窗口高度限制的日志上拉方案；主窗口只保留最近10条日志预览。',
    '新增独立运行日志窗口：支持拖动、自由缩放、最大化、最小化、搜索、日志级别筛选和暂停自动滚动。',
    '新增复制日志、导出 TXT、导出诊断 JSON、清空日志；诊断包包含版本、浏览器、当前状态、时间统计和完整结构化日志。',
    '保留 V3.0.36 的防重复生成逻辑：已确认发送成功的批次只刷新同步或进入待确认，不自动重新发送。'
]
latest = {
    'version': VERSION,
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js',
    'published_at': '2026-08-13',
    'changelog': notes,
}
Path('latest.json').write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

history_path = Path('history.json')
history = json.loads(history_path.read_text(encoding='utf-8')) if history_path.exists() else {'title': 'Ozon主图下载 + ChatGPT批量生图助手', 'since': '3.0.34', 'versions': []}
history['versions'] = [x for x in history.get('versions', []) if str(x.get('version')) != VERSION]
history['versions'].insert(0, {'version': VERSION, 'date': '2026-08-13', 'notes': notes})
history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('patched', VERSION)
