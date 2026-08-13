from pathlib import Path
import json, re

VERSION = '3.1.1'
BASE = '3.1.0'
path = Path('Ozon_ChatGPT.user.js')
s = path.read_text(encoding='utf-8')
if f'// @version      {BASE}' not in s:
    raise SystemExit(f'Expected V{BASE} baseline not found')

# Version metadata.
s = s.replace(f'// @version      {BASE}', f'// @version      {VERSION}', 1)
s = s.replace("// @description  功能增强版：详细批内生图进度、总运行/批次/生图计时、持久化运行日志、独立日志窗口及TXT/JSON诊断导出。",
              "// @description  稳定性修正版：当前批次原图区间显示；增强“+→创建图片”菜单展开确认、快速重试与诊断日志。", 1)
s = s.replace("const APP_VERSION = '3.1.0';", f"const APP_VERSION = '{VERSION}';", 1)
s = s.replace("const CURRENT_VERSION = '3.1.0';", f"const CURRENT_VERSION = '{VERSION}';")
s = s.replace("const KAGURA_MANUAL_VERSION = '3.1.0';", f"const KAGURA_MANUAL_VERSION = '{VERSION}';")
s = s.replace('手动更新检查 V3.1.0', f'手动更新检查 V{VERSION}')

# Changelog shown inside module.
pat = re.compile(r"    const MODULE_CHANGELOG = \[.*?\n    \]\.join\('\\n'\);", re.S)
rep = """    const MODULE_CHANGELOG = [
      `V${APP_VERSION} 更新内容：`,
      '1. 主面板新增“当前原图”显示，连续编号自动压缩为 40–42，非连续编号显示为 40、42、45。',
      '2. 重做“+ → 创建图片”流程：点击加号后先确认菜单真实展开，再寻找“创建图片”，避免把“点了+但菜单没开”误判成菜单项缺失。',
      '3. 放宽“创建图片”菜单项的定位范围，兼容 ChatGPT 动态浮层、Radix/Portal 结构变化以及菜单位置偏移。',
      '4. 创建图片失败时记录加号 aria-expanded、当前可见菜单文字和候选浮层摘要，导出诊断日志后可直接定位失败原因。',
      '5. 单次失败等待明显缩短：菜单未展开会快速复位重试，不再一次卡住几十秒到数分钟。',
      '6. 保留 V3.1.0 的详细进度、计时、持久化日志与独立日志窗口，以及 V3.0.36 的防重复生图机制。'
    ].join('\\n');"""
s, n = pat.subn(lambda m: rep, s, count=1)
if n != 1:
    raise SystemExit('MODULE_CHANGELOG patch failed')

# Add compact current-batch helper after cSameBatchPaths.
needle = """    function cSameBatchPaths(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => item === b[index]);
    }
"""
insert = needle + """

    function cCompactBatchFileLabel(paths) {
      const files = Array.isArray(paths) ? paths.map(path => String(path || '').split('/').pop()).filter(Boolean) : [];
      if (!files.length) return '-';
      const nums = files.map(name => {
        const match = name.match(/(\\d+)(?=\\.[^.]+$)/);
        return match ? Number(match[1]) : null;
      });
      if (nums.every(Number.isFinite)) {
        const consecutive = nums.every((num, index) => index === 0 || num === nums[index - 1] + 1);
        if (consecutive && nums.length > 1) return `${nums[0]}–${nums[nums.length - 1]}`;
        return nums.join('、');
      }
      if (files.length <= 3) return files.join('、');
      return `${files.slice(0, 2).join('、')} 等${files.length}张`;
    }
"""
if needle not in s:
    raise SystemExit('cSameBatchPaths target missing')
s = s.replace(needle, insert, 1)

# Replace create-image menu finder with more tolerant popup-aware finder and diagnostics.
pat = re.compile(r"    function cFindCreateImageMenuItem\(\) \{.*?\n    \}\n\n    function cSmartClick\(element\) \{", re.S)
rep = r'''    function cVisibleMenuRoots() {
      const selectors = [
        '[popover]',
        '[data-radix-popper-content-wrapper]',
        '[data-radix-menu-content]',
        '[data-headlessui-portal]',
        '[data-floating-ui-portal]',
        '[role="menu"]',
        '[role="dialog"]',
        '[role="listbox"]',
        '[data-state="open"]'
      ].join(',');
      return [...document.querySelectorAll(selectors)].filter(el => {
        if (!(el instanceof Element) || !cIsVisible(el) || cIsInsideMessage(el) || cIsInsideOwnPanel(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 80 && r.height >= 30 && r.bottom >= 0 && r.top <= innerHeight;
      });
    }

    function cIsCreateImageMenuOpen() {
      const plus = cFindComposerPlusButton();
      const expanded = plus?.getAttribute?.('aria-expanded');
      if (expanded === 'true') return true;
      if (cVisibleMenuRoots().length) return true;
      return Boolean(cFindCreateImageMenuItem(false));
    }

    function cCreateImageMenuDiagnostics() {
      const plus = cFindComposerPlusButton();
      const plusInfo = plus
        ? `+按钮 aria-expanded=${plus.getAttribute('aria-expanded') || '-'} aria-haspopup=${plus.getAttribute('aria-haspopup') || '-'} testid=${plus.getAttribute('data-testid') || '-'}`
        : '+按钮=未找到';
      const roots = cVisibleMenuRoots();
      const texts = [];
      for (const root of roots.slice(0, 6)) {
        const text = cPlainText(root).replace(/\s+/g, ' ').trim();
        if (text) texts.push(text.slice(0, 220));
      }
      if (!texts.length) {
        const candidates = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],div,span')]
          .filter(el => cIsVisible(el) && !cIsInsideMessage(el) && !cIsInsideOwnPanel(el))
          .map(el => cPlainText(el))
          .filter(text => text && text.length <= 120 && /(上传|照片|文件|图片|image|photo|file|创建|生成|创作)/i.test(text))
          .slice(-12);
        texts.push(...candidates);
      }
      return `${plusInfo}；可见菜单/候选：${texts.length ? texts.join(' || ') : '无'}`;
    }

    function cFindCreateImageMenuItem(logFound = true) {
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
      const primaryRegex = /(创建图片|创作图片|生成图片|create\s*image|generate\s*image)/i;
      const exactRegex = /^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
      const candidates = [];
      const seen = new Set();
      const composer = cFindComposer();
      const composerRect = composer?.getBoundingClientRect?.() || null;

      const visible = el => {
        if (!(el instanceof Element)) return false;
        const r = el.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) return false;
        if (r.bottom < -10 || r.top > viewportH + 10 || r.right < -10 || r.left > viewportW + 10) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
      };

      const menuSelectors = [
        '[popover]', '[data-radix-popper-content-wrapper]', '[data-radix-menu-content]',
        '[data-headlessui-portal]', '[data-floating-ui-portal]', '[role="menu"]',
        '[role="dialog"]', '[role="listbox"]', '[data-state="open"]'
      ].join(',');
      const menuLike = el => Boolean(el.closest?.(menuSelectors));
      const interactive = el => Boolean(el.matches?.('button,[role="menuitem"],[role="option"],[role="button"],[data-radix-collection-item],[tabindex]'));

      const addCandidate = (row, leafText = '') => {
        if (!(row instanceof Element) || seen.has(row) || !visible(row)) return;
        if (cIsInsideMessage(row) || cIsInsideOwnPanel(row)) return;
        const r = row.getBoundingClientRect();
        const rowText = cPlainText(row);
        const allText = `${rowText} ${row.getAttribute('aria-label') || ''} ${row.getAttribute('title') || ''}`.trim();
        if (!primaryRegex.test(allText) || rowText.length > 240) return;
        if (r.width < 70 || r.width > Math.min(1100, viewportW * 0.96)) return;
        if (r.height < 22 || r.height > 180) return;

        const inMenu = menuLike(row);
        const nearComposer = composerRect
          ? r.bottom >= composerRect.top - 520 && r.top <= composerRect.bottom + 80
          : r.top >= viewportH * 0.35;
        if (!inMenu && !nearComposer) return;

        let score = 0;
        if (exactRegex.test(rowText)) score += 1800;
        else score += 700;
        if (/可视化/.test(rowText)) score += 1000;
        if (/任何内容/.test(rowText)) score += 450;
        if (/visualize|visualise/i.test(rowText)) score += 700;
        if (inMenu) score += 700;
        if (interactive(row)) score += 420;
        if (getComputedStyle(row).cursor === 'pointer') score += 120;
        if (leafText && rowText !== leafText) score += 60;
        if (nearComposer) score += 180;
        score += Math.max(0, r.top) * 0.03;

        seen.add(row);
        candidates.push({ element: row, score, text: rowText, rect: r });
      };

      const nodes = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],div,span')];
      for (const el of nodes) {
        if (!visible(el) || cIsInsideMessage(el) || cIsInsideOwnPanel(el)) continue;
        const text = cPlainText(el);
        const aria = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        if (!primaryRegex.test(`${text} ${aria} ${title}`) || text.length > 240) continue;

        addCandidate(el, text);
        let cur = el;
        for (let depth = 0; depth < 7 && cur; depth += 1, cur = cur.parentElement) {
          if (!visible(cur) || cIsInsideMessage(cur) || cIsInsideOwnPanel(cur)) continue;
          const t = cPlainText(cur);
          if (!primaryRegex.test(t) || t.length > 240) continue;
          if (interactive(cur) || menuLike(cur)) addCandidate(cur, text);
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0]) {
        const best = candidates[0];
        if (logFound) cLog(`已定位“创建图片”菜单项：${best.text.slice(0, 100)}；坐标 ${Math.round(best.rect.left + best.rect.width / 2)},${Math.round(best.rect.top + best.rect.height / 2)}`, 'info');
        return best.element;
      }
      return null;
    }

    function cSmartClick(element) {'''
s, n = pat.subn(lambda m: rep, s, count=1)
if n != 1:
    raise SystemExit('cFindCreateImageMenuItem patch failed')

# Replace activation flow with menu-open verification + quick retry + diagnostics.
pat = re.compile(r"    async function cActivateCreateImage\(\) \{.*?\n    \}\n\n    function cSetNativeValue\(element, value\) \{", re.S)
rep = r'''    async function cActivateCreateImage() {
      cState.phase = 'activating_create_image';
      cSaveState();
      cStatusText.textContent = '正在点击加号并启用“创建图片”…';

      if (cHasCreateImageChip()) {
        cLog('输入框附近已存在“创建图片”标签，无需重复添加', 'success');
        return;
      }

      let lastError = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        cLog(`检查/添加创建图片模式，第 ${attempt}/${maxAttempts} 次`, 'info');
        try {
          cResetCreateImageMenuState();
          await cSleep(250);

          const plus = await cWaitUntil(() => cFindComposerPlusButton(), 7000, 200);
          if (!plus) throw new Error('未找到输入框左侧“+”按钮');
          try { plus.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
          cSmartClick(plus);
          cLog(`已点击输入框左侧“+”按钮；aria-expanded=${plus.getAttribute('aria-expanded') || '-'}`, 'info');

          let opened = await cWaitUntil(() => cIsCreateImageMenuOpen(), 2200, 120);
          if (!opened) {
            cLog(`第一次点击“+”后未确认菜单展开，快速重试一次。${cCreateImageMenuDiagnostics()}`, 'warn');
            cResetCreateImageMenuState();
            await cSleep(250);
            const plusAgain = cFindComposerPlusButton() || plus;
            cSmartClick(plusAgain);
            opened = await cWaitUntil(() => cIsCreateImageMenuOpen(), 2200, 120);
          }
          if (!opened) {
            throw new Error(`点击“+”后菜单未真正展开。${cCreateImageMenuDiagnostics()}`);
          }

          let menuItem = await cWaitUntil(() => cFindCreateImageMenuItem(false), 4500, 150);
          if (!menuItem) {
            throw new Error(`加号菜单已展开，但没有找到“创建图片”。${cCreateImageMenuDiagnostics()}`);
          }
          // 正式点击前再定位一次并写详细日志，防止动态菜单节点刚好被重挂载。
          menuItem = cFindCreateImageMenuItem(true) || menuItem;
          if (!cSmartClick(menuItem)) throw new Error('已找到“创建图片”，但点击动作未成功派发');
          cLog('已点击“创建图片”整行菜单项', 'info');

          const activated = await cWaitUntil(() => cHasCreateImageChip(), 5000, 220);
          if (!activated) throw new Error(`点击后未检测到输入框附近的“创建图片”标签。${cCreateImageMenuDiagnostics()}`);

          cLog('创建图片模式添加成功', 'success');
          return;
        } catch (error) {
          lastError = error;
          cLog(`第 ${attempt} 次添加创建图片模式失败：${error.message || error}`, 'warn');
          cResetCreateImageMenuState();
          if (attempt < maxAttempts) await cSleep(900);
        }
      }

      throw new Error(`创建图片模式添加失败，已快速原地重试 ${maxAttempts} 次。最后错误：${lastError?.message || lastError || '未知错误'}`);
    }

    function cSetNativeValue(element, value) {'''
s, n = pat.subn(lambda m: rep, s, count=1)
if n != 1:
    raise SystemExit('cActivateCreateImage patch failed')

# Add UI variable for current files.
needle = """    let cBatchText;
    let cPhaseText;
"""
replace = """    let cBatchText;
    let cCurrentFilesText;
    let cPhaseText;
"""
if needle not in s:
    raise SystemExit('UI var target missing')
s = s.replace(needle, replace, 1)

# Add current-files row after current batch.
needle = """          <div class=\"kagura-gpt-row\"><span class=\"kagura-gpt-label\">当前批次</span><span class=\"kagura-gpt-value\" data-role=\"batch\">-</span></div>
          <div class=\"kagura-gpt-row\"><span class=\"kagura-gpt-label\">当前阶段</span><span class=\"kagura-gpt-value\" data-role=\"phase\">等待配置</span></div>
"""
replace = """          <div class=\"kagura-gpt-row\"><span class=\"kagura-gpt-label\">当前批次</span><span class=\"kagura-gpt-value\" data-role=\"batch\">-</span></div>
          <div class=\"kagura-gpt-row\"><span class=\"kagura-gpt-label\">当前原图</span><span class=\"kagura-gpt-value kagura-gpt-progress\" data-role=\"current-files\">-</span></div>
          <div class=\"kagura-gpt-row\"><span class=\"kagura-gpt-label\">当前阶段</span><span class=\"kagura-gpt-value\" data-role=\"phase\">等待配置</span></div>
"""
if needle not in s:
    raise SystemExit('panel row target missing')
s = s.replace(needle, replace, 1)

# Bind current-files node.
needle = """      cBatchText = cPanel.querySelector('[data-role=\"batch\"]');
      cPhaseText = cPanel.querySelector('[data-role=\"phase\"]');
"""
replace = """      cBatchText = cPanel.querySelector('[data-role=\"batch\"]');
      cCurrentFilesText = cPanel.querySelector('[data-role=\"current-files\"]');
      cPhaseText = cPanel.querySelector('[data-role=\"phase\"]');
"""
if needle not in s:
    raise SystemExit('panel bind target missing')
s = s.replace(needle, replace, 1)

# Update main panel with compact range.
needle = """      if (cBatchText) {
        cBatchText.textContent = totalBatches ? `第 ${Math.min(cState.batchNo, totalBatches)} / ${totalBatches} 批` : '-';
        cBatchText.title = batchFiles || '当前无活动批次';
      }
      if (cPhaseText) cPhaseText.textContent = cPhaseLabel();
"""
replace = """      if (cBatchText) {
        cBatchText.textContent = totalBatches ? `第 ${Math.min(cState.batchNo, totalBatches)} / ${totalBatches} 批` : '-';
        cBatchText.title = batchFiles || '当前无活动批次';
      }
      if (cCurrentFilesText) {
        cCurrentFilesText.textContent = cCompactBatchFileLabel(cState.currentBatch);
        cCurrentFilesText.title = batchFiles || '当前无活动批次';
      }
      if (cPhaseText) cPhaseText.textContent = cPhaseLabel();
"""
if needle not in s:
    raise SystemExit('panel update target missing')
s = s.replace(needle, replace, 1)

# Include compact current files in log-window metrics.
needle = """      cLogWindowMetrics.textContent = `总运行 ${cFormatDuration(cGetTotalRunMs())} ｜ 第${cState.batchNo}批 ｜ ${cPhaseLabel()} ｜ 生图 ${detected}/${expected || 0} ｜ 本批 ${cFormatDuration(cGetBatchElapsedMs())} ｜ 生图 ${cFormatDuration(cGetGenerationElapsedMs())}`;
"""
replace = """      cLogWindowMetrics.textContent = `总运行 ${cFormatDuration(cGetTotalRunMs())} ｜ 第${cState.batchNo}批 ｜ 原图 ${cCompactBatchFileLabel(cState.currentBatch)} ｜ ${cPhaseLabel()} ｜ 生图 ${detected}/${expected || 0} ｜ 本批 ${cFormatDuration(cGetBatchElapsedMs())} ｜ 生图 ${cFormatDuration(cGetGenerationElapsedMs())}`;
"""
if needle not in s:
    raise SystemExit('log metrics target missing')
s = s.replace(needle, replace, 1)

# Write main source.
path.write_text(s, encoding='utf-8')

# Meta file = userscript header.
header = s.split('// ==/UserScript==', 1)[0] + '// ==/UserScript==\n'
Path('Ozon_ChatGPT.meta.js').write_text(header, encoding='utf-8')

# Latest manifest.
notes = [
    '主面板新增“当前原图”，连续编号自动压缩显示为 40–42，非连续编号显示为 40、42、45；悬停仍可查看完整文件名。',
    '重做“+ → 创建图片”流程：先确认加号菜单真实展开，再寻找创建图片，避免菜单未展开时误判菜单项缺失。',
    '放宽创建图片菜单项定位范围，兼容 ChatGPT 动态浮层、Portal/Radix 结构和菜单位置变化。',
    '创建图片失败时把加号 aria-expanded、可见菜单/候选文字写入运行日志和诊断包，便于直接排查。',
    '缩短创建图片失败等待：菜单未展开会快速复位重试，避免单次失败卡住几十秒甚至数分钟。'
]
latest = {
    'version': VERSION,
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js',
    'published_at': '2026-08-13',
    'changelog': notes,
}
Path('latest.json').write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# History prepend.
history_path = Path('history.json')
history = json.loads(history_path.read_text(encoding='utf-8'))
versions = history.setdefault('versions', [])
versions = [v for v in versions if str(v.get('version')) != VERSION]
versions.insert(0, {'version': VERSION, 'date': '2026-08-13', 'notes': notes})
history['versions'] = versions
history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Version archive TXT.
archive_dir = Path('versions')
archive_dir.mkdir(exist_ok=True)
(archive_dir / f'Ozon_ChatGPT批量生图下载器_V{VERSION}.txt').write_text(s, encoding='utf-8')

print(f'Patched V{VERSION}')
