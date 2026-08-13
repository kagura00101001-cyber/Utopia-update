from pathlib import Path
import json

ROOT = Path('.')
SCRIPT = ROOT / 'Ozon_ChatGPT.user.js'
META = ROOT / 'Ozon_ChatGPT.meta.js'
LATEST = ROOT / 'latest.json'
HISTORY = ROOT / 'history.json'
VERSIONS = ROOT / 'versions'

s = SCRIPT.read_text(encoding='utf-8')
if '// @version      3.0.35' not in s:
    raise SystemExit('Expected baseline V3.0.35 not found')

VERSIONS.mkdir(exist_ok=True)
(VERSIONS / 'Ozon_ChatGPT批量生图下载器_V3.0.35.txt').write_text(s, encoding='utf-8')

# Version metadata
s = s.replace('// @version      3.0.35', '// @version      3.0.36', 1)
s = s.replace("const APP_VERSION = '3.0.35';", "const APP_VERSION = '3.0.36';", 1)
s = s.replace("const CURRENT_VERSION = '3.0.35';", "const CURRENT_VERSION = '3.0.36';", 1)
s = s.replace("const KAGURA_MANUAL_VERSION = '3.0.35';", "const KAGURA_MANUAL_VERSION = '3.0.36';", 1)
s = s.replace(
    '// @description  完整正式版：新增清空原图目录和成品目录全部图片功能，二次确认防误删；保留历史更新与原生覆盖更新。',
    '// @description  完整正式版：修复生成已完成但前端未渲染时误判静默中断并重复重发；已发送批次只刷新同步、不自动重发。',
    1,
)

# 1) Track the moment when the stop button disappears after it was seen.
old_vars = """      let shortageLogged = false;\n      let lastCount = -1;\n      let lastCountChangeAt = Date.now();\n      const postCompleteSweepMs = 45000;"""
new_vars = """      let shortageLogged = false;\n      let lastCount = -1;\n      let lastCountChangeAt = Date.now();\n      let stopGoneSince = 0;\n      const postCompleteSweepMs = 45000;"""
if old_vars not in s:
    raise SystemExit('wait vars target not found')
s = s.replace(old_vars, new_vars, 1)

old_stop = """        const stopVisible = cIsStopButtonVisible();\n        if (stopVisible) sawStop = true;"""
new_stop = """        const stopVisible = cIsStopButtonVisible();\n        if (stopVisible) {\n          sawStop = true;\n          stopGoneSince = 0;\n        } else if (sawStop && !stopGoneSince) {\n          stopGoneSince = Date.now();\n        }"""
if old_stop not in s:
    raise SystemExit('stop tracking target not found')
s = s.replace(old_stop, new_stop, 1)

# 2) Replace the dangerous 0-image silent-resend path with refresh-only synchronization.
old_logic = """        if (!completion.complete && stopVisible && elapsed >= 360000 && countStableFor >= 90000 && !refreshFlags.noFinishRefreshDone) {\n          return cTriggerRefreshAndResume('生成已持续约6分钟，且图片数量 90 秒没有变化（仍在生成中）', 'noFinishRefreshDone');\n        }\n        if (ready.length === 0 && elapsed >= 600000 && !refreshFlags.zeroImageRefreshDone) {\n          return cTriggerRefreshAndResume('长时间仍未检测到生成图，准备刷新页面后继续检测', 'zeroImageRefreshDone');\n        }\n        if (ready.length === 0 && !stopVisible && elapsed >= 360000 && countStableFor >= 60000) {\n          throw new CSilentGenerationAbortError('已发送任务，但 6 分钟内始终未生成图片，且页面已不再显示生成状态，判定为静默中断');\n        }"""
new_logic = """        const composerIdle = !stopVisible && !cIsSendButtonBusy();\n        const stopGoneFor = stopGoneSince ? Date.now() - stopGoneSince : 0;\n        const alreadySyncedAfterZero = Boolean(\n          refreshFlags.finishedButHiddenRefreshDone\n          || refreshFlags.idleZeroRefreshDone\n          || refreshFlags.zeroImageRefreshDone\n        );\n\n        // ChatGPT 偶发：服务器已经生成完成，但前端没有把 assistant 回复/图库挂到 DOM。\n        // 如果本轮确实出现过“停止生成”按钮，随后按钮恢复且仍 0 图，优先刷新同步，绝不重发。\n        if (ready.length === 0 && sawStop && composerIdle && stopGoneFor >= 20000 && !refreshFlags.finishedButHiddenRefreshDone) {\n          return cTriggerRefreshAndResume(\n            '检测到生成按钮已恢复，但页面仍未渲染任何生成图；判定为前端回复可能未挂载，刷新页面同步服务器结果',\n            'finishedButHiddenRefreshDone',\n          );\n        }\n\n        if (!completion.complete && stopVisible && elapsed >= 360000 && countStableFor >= 90000 && !refreshFlags.noFinishRefreshDone) {\n          return cTriggerRefreshAndResume('生成已持续约6分钟，且图片数量 90 秒没有变化（仍在生成中）', 'noFinishRefreshDone');\n        }\n\n        // 没有任何图片、页面也已空闲时，不再判定“静默中断并重发”。\n        // 已确认发送成功的批次必须保持 at-most-once：先刷新同步，再决定待确认。\n        if (ready.length === 0 && composerIdle && elapsed >= 360000 && countStableFor >= 60000 && !alreadySyncedAfterZero) {\n          return cTriggerRefreshAndResume(\n            '已发送任务约6分钟仍为0图，但页面已恢复空闲；为避免重复生成，先刷新页面同步已有回复，不重新发送',\n            'idleZeroRefreshDone',\n          );\n        }\n\n        // 刷新同步后仍然 0 图时，给页面 3 分钟重新挂载；仍无结果则交给待确认，绝不自动重发。\n        if (ready.length === 0 && composerIdle && alreadySyncedAfterZero && elapsed >= 180000 && countStableFor >= 60000) {\n          cLog('刷新同步后仍未检测到生成图。为避免重复生成，本批不再自动发送，将以0图异常进入待确认。', 'warn');\n          return ready;\n        }\n\n        if (ready.length === 0 && elapsed >= 600000 && !refreshFlags.zeroImageRefreshDone && !alreadySyncedAfterZero) {\n          return cTriggerRefreshAndResume('长时间仍未检测到生成图，准备刷新页面后继续检测', 'zeroImageRefreshDone');\n        }"""
if old_logic not in s:
    raise SystemExit('old zero-image logic target not found')
s = s.replace(old_logic, new_logic, 1)

# 3) Disable the only post-submit automatic resend branch.
old_resend = """          if (error instanceof CSilentGenerationAbortError && !silentResendUsed) {\n            silentResendUsed = true;\n            cState.resumeContext = {\n              kind: 'retry-resend',\n              batchNo: cState.batchNo,\n              batchPaths: [...batchPaths],\n              prompt: cSettings.prompt,\n              flags: { ...(cState.resumeContext?.flags || {}), silentResendDone: true },\n            };\n            cSaveState();\n            cLog('检测到 6 分钟 0 图且页面已停止生成，准备自动整批重发一次', 'warn');\n            generalRetryCount += 1;\n            mode = 'full';\n            continue;\n          }"""
new_resend = """          if (error instanceof CSilentGenerationAbortError) {\n            const partial = cCollectCurrentGeneratedForPending(cSettings.prompt);\n            cState.resumeContext = null;\n            cLog('检测到发送后的静默异常。V3.0.36 起禁止自动重发已提交批次，转入待确认以避免重复生成。', 'warn');\n            return cFinalizePendingBatch(\n              batchPaths,\n              partial,\n              `已发送任务后出现静默异常：${error?.message || String(error)}；为避免重复生成，本批未自动重发。`,\n              { phase: cState.phase || 'generating' },\n            );\n          }"""
if old_resend not in s:
    raise SystemExit('silent resend target not found')
s = s.replace(old_resend, new_resend, 1)

# Keep the unused variable harmless but clarify log/version marker if present.
s = s.replace('/* ===== Kagura 手动更新检查 V3.0.33（检查版本 + 打开 Tampermonkey） ===== */',
              '/* ===== Kagura 手动更新检查 V3.0.36（检查版本 + 打开 Tampermonkey） ===== */', 1)

SCRIPT.write_text(s, encoding='utf-8')
(VERSIONS / 'Ozon_ChatGPT批量生图下载器_V3.0.36.txt').write_text(s, encoding='utf-8')

META.write_text('''// ==UserScript==\n// @name         Ozon主图下载 + ChatGPT批量生图助手\n// @namespace    https://github.com/Kagura-userscripts\n// @version      3.0.36\n// @description  Ozon主图下载 + ChatGPT批量生图助手 更新元数据\n// @author       Kagura\n// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js\n// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js\n// ==/UserScript==\n''', encoding='utf-8')

changelog = [
    '修复 ChatGPT 已完成生成但前端未渲染 assistant 回复时，脚本误判“静默中断”并把同一批重新发送的问题。',
    '已确认发送成功的批次改为 at-most-once：后续 0 图、页面空闲、回复未挂载等异常只允许刷新同步，不再自动重新发送提示词。',
    '如果本轮曾出现“停止生成”按钮，随后按钮恢复但仍 0 图，等待约20秒后自动刷新页面，并以 detect-only 模式恢复当前批次。',
    '普通 0 图且页面空闲达到约6分钟时，也改为先刷新同步；刷新后再观察约3分钟仍无图，则直接进入待确认。',
    '保留上传失败发生在发送之前的附件整批重试；该重试不属于已提交任务的重复生成。'
]
latest = {
    'version': '3.0.36',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js',
    'published_at': '2026-08-13',
    'changelog': changelog,
}
LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

history = json.loads(HISTORY.read_text(encoding='utf-8')) if HISTORY.exists() else {
    'title': 'Ozon主图下载 + ChatGPT批量生图助手', 'since': '3.0.34', 'versions': []
}
items = [x for x in history.get('versions', []) if str(x.get('version')) != '3.0.36']
items.insert(0, {'version': '3.0.36', 'date': '2026-08-13', 'notes': changelog})
history['versions'] = items
history['since'] = '3.0.34'
HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
