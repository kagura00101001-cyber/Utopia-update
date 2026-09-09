from pathlib import Path
import json

p = Path('POD_ChatGPT.user.js')
s = p.read_text(encoding='utf-8')
if "const APP_VERSION = '1.5.18';" not in s:
    raise SystemExit('Expected V1.5.18 main script')

def grab(src, start, end):
    a = src.index(start)
    b = src.index(end, a)
    return src[a:b]

frozen = {
    'ensureFileInput': grab(s, 'async function ensureFileInput()', 'function countAttachments()'),
    'countAttachments': grab(s, 'function countAttachments()', 'function detectUploadFailure()'),
    'waitUploads_uploadFiles': grab(s, 'async function waitUploads(', 'function plainText('),
    'activateCreate': grab(s, 'async function activateCreate()', 'function setNativeValue('),
    'sendPrompt': grab(s, 'async function sendPrompt(', 'function currentBatchTasks('),
}

s = s.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.18', '// @name:zh-CN   Kagura POD智能创意中心 V1.5.19', 1)
s = s.replace('// @version      1.5.18', '// @version      1.5.19', 1)
s = s.replace('// @description  AI驱动的POD商品视觉生产系统：V1.5.18 修复拒绝/异常后残留附件导致已上传却被误判超时：新批次上传前同时清理残留提示词与附件；上传核心保持不变。', '// @description  AI驱动的POD商品视觉生产系统：V1.5.19 修复Composer瞬时缺失时把整页图片误判为残留附件，并为创建图片后输入框丢失增加一次安全刷新恢复；上传/创建/发送核心保持不变。', 1)
s = s.replace(' * Kagura POD Studio V1.5.18', ' * Kagura POD Studio V1.5.19', 1)
if ' * - V1.5.19 Composer守卫修复：' not in s:
    insert_at = s.index(' * - V1.5.16 ')
    s = s[:insert_at] + ' * - V1.5.19 Composer守卫修复：批次清场只在真实Composer根节点内统计/删除附件，Composer瞬时缺失时绝不回退document扫描；创建图片后30秒仍找不到提示词输入框时复用一次发送前安全刷新恢复。\n' + s[insert_at:]
s = s.replace("const APP_VERSION = '1.5.18';", "const APP_VERSION = '1.5.19';", 1)

old_guard = '''  function composerAttachmentRemoveButtons(){
    const c=findComposer();
    return [...c.querySelectorAll('button[aria-label*="移除"],button[aria-label*="删除"],button[aria-label*="Remove"],button[aria-label*="Delete"],button[data-testid*="remove-attachment"],button[data-testid*="attachment-remove"]')].filter(isVisible);
  }
  async function ensureComposerAttachmentsEmptyBeforeBatch(){
    let residual=countAttachments();
    if(!residual)return true;
    log(`下一批开始前检测到 ${residual} 个残留附件，先移除并复检，避免上一批附件影响本批上传计数`,'warn');
    for(let attempt=1;attempt<=3;attempt++){
      const buttons=composerAttachmentRemoveButtons();
      if(buttons.length){
        for(const b of buttons){
          try{b.click()}catch(_){try{smartClick(b)}catch(__){}}
          await sleep(250);
        }
      }
      await sleep(700);
      residual=countAttachments();
      if(!residual){
        log('下一批残留附件清场完成；确认为0后继续上传本批参考素材','success');
        return true;
      }
      log(`残留附件清理第 ${attempt}/3 次后仍检测到 ${residual} 个附件，继续清理`,'warn');
    }
    throw new Error(`下一批启动前残留附件自动清理失败（仍检测到 ${residual} 个）；为避免上传数量误判已停止`);
  }
'''

new_guard = '''  function strictComposerRoot(){
    const e=findPromptEditor();
    const candidates=[
      e?.closest?.('form[data-type="unified-composer"]'),
      e?.closest?.('[data-composer-surface="true"]'),
      e?.closest?.('form'),
      ...document.querySelectorAll('form[data-type="unified-composer"],[data-composer-surface="true"]')
    ].filter(Boolean);
    return candidates.find(c=>c instanceof Element&&isVisible(c)&&!c.closest('#kagura-pod-panel'))||null;
  }
  function strictComposerAttachmentCount(){
    const c=strictComposerRoot();
    if(!c)return null;
    const rm=[...c.querySelectorAll('button[aria-label*="移除附件"],button[aria-label*="删除附件"],button[aria-label*="Remove attachment"],button[aria-label*="Delete attachment"],button[aria-label*="移除文件"],button[aria-label*="删除文件"],button[aria-label*="Remove file"],button[aria-label*="Delete file"],button[data-testid*="remove-attachment"],button[data-testid*="attachment-remove"]')].filter(isVisible);
    if(rm.length)return rm.length;
    const explicit=[...c.querySelectorAll('[data-testid="composer-attachment"],[data-testid="attachment"],[data-testid*="attachment-item"]')].filter(isVisible);
    if(explicit.length)return explicit.length;
    return [...c.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return isVisible(img)&&r.width>=32&&r.height>=32&&r.width<=240&&r.height<=240}).length;
  }
  function composerAttachmentRemoveButtons(){
    const c=strictComposerRoot();
    if(!c)return [];
    return [...c.querySelectorAll('button[aria-label*="移除附件"],button[aria-label*="删除附件"],button[aria-label*="Remove attachment"],button[aria-label*="Delete attachment"],button[aria-label*="移除文件"],button[aria-label*="删除文件"],button[aria-label*="Remove file"],button[aria-label*="Delete file"],button[data-testid*="remove-attachment"],button[data-testid*="attachment-remove"]')].filter(isVisible);
  }
  async function ensureComposerAttachmentsEmptyBeforeBatch(){
    let residual=strictComposerAttachmentCount();
    if(residual===null){
      log('下一批附件清场前Composer瞬时不可用；等待Composer恢复，不扫描整页图片','warn');
      const root=await waitUntil(()=>strictComposerRoot(),10000,250);
      if(!root)throw new CreateModeRetryableError('下一批清场前10秒仍未找到有效Composer，无法安全检查残留附件');
      residual=strictComposerAttachmentCount();
    }
    if(!residual)return true;
    log(`下一批开始前检测到 ${residual} 个残留附件，先移除并复检，避免上一批附件影响本批上传计数`,'warn');
    for(let attempt=1;attempt<=3;attempt++){
      const buttons=composerAttachmentRemoveButtons();
      if(buttons.length){
        for(const b of buttons){
          try{b.click()}catch(_){try{smartClick(b)}catch(__){}}
          await sleep(250);
        }
      }
      await sleep(700);
      residual=strictComposerAttachmentCount();
      if(residual===null){
        log(`残留附件清理第 ${attempt}/3 次复检时Composer瞬时不可用；等待恢复，不扫描整页图片`,'warn');
        const root=await waitUntil(()=>strictComposerRoot(),5000,250);
        if(!root)throw new CreateModeRetryableError('附件清场复检时5秒仍未找到有效Composer');
        residual=strictComposerAttachmentCount();
      }
      if(!residual){
        log('下一批残留附件清场完成；确认为0后继续上传本批参考素材','success');
        return true;
      }
      log(`残留附件清理第 ${attempt}/3 次后仍检测到 ${residual} 个附件，继续清理`,'warn');
    }
    throw new Error(`下一批启动前残留附件自动清理失败（仍检测到 ${residual} 个）；为避免上传数量误判已停止`);
  }
'''

if old_guard not in s:
    raise SystemExit('V1.5.18 attachment guard block not found')
s = s.replace(old_guard, new_guard, 1)

old_prompt = "let e=await waitUntil(()=>findPromptEditor(),30000,300);if(!e)throw new Error('未找到提示词输入框');"
new_prompt = "let e=await waitUntil(()=>findPromptEditor(),30000,300);if(!e)throw new CreateModeRetryableError('创建图片后30秒仍未找到提示词输入框，需刷新重建Composer');"
if old_prompt not in s:
    raise SystemExit('Prompt editor wait block not found')
s = s.replace(old_prompt, new_prompt, 1)

old_post = "await sleep(1000);e=findPromptEditor();if(!promptMatches(e,expected))throw new Error(`提示词写入后校验失败（当前识别${readEditor(e).length}字）`);"
new_post = "await sleep(1000);e=findPromptEditor();if(!e)throw new CreateModeRetryableError('提示词写入后输入框节点丢失，需刷新重建Composer');if(!promptMatches(e,expected))throw new Error(`提示词写入后校验失败（当前识别${readEditor(e).length}字）`);"
if old_post not in s:
    raise SystemExit('Prompt post-write guard not found')
s = s.replace(old_post, new_post, 1)

old_log = "log(`创建图片模式连续3次真实激活失败，当前批尚未发送；刷新页面后自动重新准备本批（刷新 1/1），不会重复发送：${e.message||e}`,'warn');"
new_log = "log(`发送前Composer/创建图片状态异常，当前批尚未发送；刷新页面后自动重新准备本批（刷新 1/1），不会重复发送：${e.message||e}`,'warn');"
if old_log not in s:
    raise SystemExit('Pre-send refresh log not found')
s = s.replace(old_log, new_log, 1)

old_boot = "log(`检测到创建图片刷新恢复：第${state.batchNo}批尚未发送，自动重新准备当前批（刷新 ${Number(state.resumeContext?.createRefreshCount)||1}/1），会重新上传附件并重新激活创建图片，不会重复发送${rr}`,'warn');"
new_boot = "log(`检测到发送前状态刷新恢复：第${state.batchNo}批尚未发送，自动重新准备当前批（刷新 ${Number(state.resumeContext?.createRefreshCount)||1}/1），会重新上传附件并重新激活创建图片，不会重复发送${rr}`,'warn');"
if old_boot not in s:
    raise SystemExit('Boot refresh log not found')
s = s.replace(old_boot, new_boot, 1)

p.write_text(s, encoding='utf-8')
after = p.read_text(encoding='utf-8')

frozen_after = {
    'ensureFileInput': grab(after, 'async function ensureFileInput()', 'function countAttachments()'),
    'countAttachments': grab(after, 'function countAttachments()', 'function detectUploadFailure()'),
    'waitUploads_uploadFiles': grab(after, 'async function waitUploads(', 'function plainText('),
    'activateCreate': grab(after, 'async function activateCreate()', 'function setNativeValue('),
    'sendPrompt': grab(after, 'async function sendPrompt(', 'function currentBatchTasks('),
}
for k, v in frozen.items():
    if frozen_after[k] != v:
        raise SystemExit(f'Frozen core changed unexpectedly: {k}')

header = after[:after.index('// ==/UserScript==') + len('// ==/UserScript==')] + '\n'
Path('POD_ChatGPT.meta.js').write_text(header, encoding='utf-8')

notes = [
    '修复V1.5.18残留附件守卫误判：当ChatGPT输入框/Composer瞬时不存在时，不再让findComposer回退document后把聊天历史中的生成图当成27/36/81个残留附件。',
    '批次附件清场改为严格Composer作用域：只在真实可见Composer根节点内统计与移除附件；Composer瞬时缺失时先等待，仍不可用则走一次发送前安全刷新恢复，绝不扫描整页或点击整页删除按钮。',
    '修复创建图片后偶发“未找到提示词输入框”：等待30秒仍找不到输入框，或写入后输入框节点丢失时，当前批尚未发送则自动刷新1次并重新准备本批；不会产生重复发送。',
    '附件上传、创建图片激活、发送确认、生图检测、下载核心保持不变；V1.5.16拒绝重试和V1.5.17停滞刷新继续保留。'
]
latest = {
    'version': '1.5.19',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'download_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'published_at': '2026-09-09',
    'changelog': notes,
}
latest_text = json.dumps(latest, ensure_ascii=False, indent=2) + '\n'
for name in ['POD_ChatGPT.latest.json', 'POD_ChatGPT_latest.json']:
    if Path(name).exists():
        Path(name).write_text(latest_text, encoding='utf-8')

hp = Path('POD_ChatGPT.history.json')
if hp.exists():
    hist = json.loads(hp.read_text(encoding='utf-8'))
    versions = hist.setdefault('versions', [])
    for v in versions:
        if v.get('status') == 'current':
            v['status'] = 'stable'
    versions[:] = [v for v in versions if v.get('version') != '1.5.19']
    versions.insert(0, {
        'version': '1.5.19', 'date': '2026-09-09', 'status': 'current', 'notes': notes,
        'archive_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.19.txt',
        'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js'
    })
    hp.write_text(json.dumps(hist, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

Path('versions').mkdir(exist_ok=True)
Path('versions/POD_ChatGPT统一工作台_V1.5.19.txt').write_text(after, encoding='utf-8')
