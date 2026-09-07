from pathlib import Path
import json
import re
import subprocess

VERSION = "1.5.10"
CORE_VERSION = "1.5.8"
CORE_COMMIT = "56194dc106d34a31f2734aa33d4b628f756837f5"
TODAY = "2026-09-07"
root = Path(".")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label} 标记数量异常：{count}")
    return text.replace(old, new, 1)


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"缺少开始标记：{label}")
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"缺少结束标记：{label}")
    return text[:start] + replacement + text[end:]


# 复用当前 V1.5.9 已验证的事件驱动“创建图片”兼容块，不重新设计该逻辑。
wrapper = root.joinpath("POD_ChatGPT.user.js").read_text(encoding="utf-8")
if "// @version      1.5.9" not in wrapper:
    raise RuntimeError("当前正式 POD 脚本不是 V1.5.9，停止发布")
match = re.search(r"const CREATE_BLOCK = String\.raw`([\s\S]*?)`;\n\n  function replaceOnce", wrapper)
if not match:
    raise RuntimeError("无法从 V1.5.9 提取事件驱动创建图片兼容块")
create_block = match.group(1)

# 固定从 V1.5.8 生产稳定核心生成，V1.5.9 创建图片逻辑按上面原样复用。
source = subprocess.check_output(
    ["git", "show", f"{CORE_COMMIT}:POD_ChatGPT.user.js"],
    text=True,
    encoding="utf-8",
)
if len(source) < 150000:
    raise RuntimeError(f"V{CORE_VERSION} 稳定核心长度异常：{len(source)}")

# ===== 版本与产品名称 =====
source = replace_once(source, "// @name         ChatGPT服装POD统一工作台 V1.2.2", "// @name         Kagura POD Studio", "@name")
source = replace_once(source, "// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.8", "// @name:zh-CN   Kagura POD智能创意中心 V1.5.10", "@name:zh-CN")
source = replace_once(source, "// @version      1.5.8", "// @version      1.5.10", "@version")
source = replace_once(
    source,
    "// @description  服装POD统一工作台：V1.5.8 修复创建图片已成功却被后续误判的问题；加入本批短期成功凭证、多重创建图片检测，并在真正连续3次激活失败且尚未发送时仅刷新1次后自动重试。",
    "// @description  AI驱动的POD商品视觉生产系统：V1.5.10 新增0～任意张有序参考素材队列、附件Manifest与旧模板/Logo自动迁移，并保留V1.5.9创建图片事件驱动兼容及V1.5.8发送安全核心。",
    "@description",
)
source = replace_once(source, "   * ChatGPT服装POD统一工作台 V1.5.8", "   * Kagura POD Studio V1.5.10", "核心标题")
source = replace_once(
    source,
    " * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。",
    " * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。\n * - V1.5.9 创建图片入口改为事件驱动局部检测，兼容 ChatGPT Composer 重载，不恢复 V1.6.x 撤回版的常驻全页高频扫描。\n * - V1.5.10 升级为 Kagura POD Studio：批量生图的模板图/Logo图改为0～任意张有序参考素材队列；附件顺序持久化到 Attachment Manifest，旧模板/Logo授权自动迁移。",
    "版本说明",
)
source = replace_once(source, "const APP_VERSION = '1.5.8';", "const APP_VERSION = '1.5.10';", "APP_VERSION")
source = replace_once(source, "const APP_NAME = `ChatGPT服装POD统一工作台 V${APP_VERSION}`;", "const APP_NAME = `Kagura POD Studio V${APP_VERSION}`;", "APP_NAME")

# ===== 保留 V1.5.9 已验证的事件驱动创建图片兼容层 =====
pattern = re.compile(r"  function visibleMenuRoots\(\)\{[\s\S]*?\n  function setNativeValue")
source, count = pattern.subn(create_block + "\n\n  function setNativeValue", source, count=1)
if count != 1:
    raise RuntimeError(f"创建图片兼容块替换失败：{count}")

# ===== 参考素材队列存储与旧数据兼容 =====
source = replace_once(
    source,
    "  const TEMPLATE_KEY = 'template-file';\n  const LOGO_KEY = 'logo-file';",
    "  const TEMPLATE_KEY = 'template-file'; // legacy migration only\n  const LOGO_KEY = 'logo-file'; // legacy migration only\n  const REFERENCE_FILES_KEY = 'reference-files';",
    "参考素材存储键",
)
source = replace_once(
    source,
    "    if (!Array.isArray(merged.currentBatchPaths)) merged.currentBatchPaths = [];\n    return merged;",
    "    if (!Array.isArray(merged.currentBatchPaths)) merged.currentBatchPaths = [];\n    if (!merged.attachmentManifest || typeof merged.attachmentManifest !== 'object') merged.attachmentManifest = null;\n    return merged;",
    "attachmentManifest 状态迁移",
)
source = source.replace("uploading_assets:'上传模板/Logo图'", "uploading_assets:'上传参考素材'")
source = source.replace("uploading_template:'上传模板图'", "uploading_template:'上传参考素材'")

new_reference_functions = r'''  let referenceFiles=[];
  function referenceEntryId(handle,order){return `ref-${String(Number(order)+1).padStart(3,'0')}:${String(handle?.name||'unnamed')}`;}
  function makeReferenceEntries(handles){return (Array.isArray(handles)?handles:[]).filter(Boolean).map((file,order)=>({id:referenceEntryId(file,order),file,name:String(file?.name||`参考素材${order+1}`),order,enabled:true}));}
  async function loadReferenceFiles({migrate=true}={}){
    let handles=await getHandle(REFERENCE_FILES_KEY).catch(()=>null);
    if(!Array.isArray(handles)&&migrate){
      const legacyTemplate=await getHandle(TEMPLATE_KEY).catch(()=>null),legacyLogo=await getHandle(LOGO_KEY).catch(()=>null);
      handles=[legacyTemplate,legacyLogo].filter(Boolean);
      if(handles.length){await saveHandle(REFERENCE_FILES_KEY,handles);log(`已自动迁移旧模板图/Logo图为参考素材队列：${handles.map(h=>h.name).join('、')}`,'success');}
    }
    if(!Array.isArray(handles))handles=[];
    referenceFiles=makeReferenceEntries(handles);
    return referenceFiles;
  }
  async function chooseReferenceFiles(){
    const picker=unsafeWindow.showOpenFilePicker||window.showOpenFilePicker;if(typeof picker!=='function')throw new Error('当前浏览器不支持选择参考素材');
    const hs=await picker.call(unsafeWindow,{multiple:true,types:[{description:'参考素材图片',accept:{'image/*':['.jpg','.jpeg','.png','.webp']}}]});if(!hs?.length)return;
    await saveHandle(REFERENCE_FILES_KEY,[...hs]);referenceFiles=makeReferenceEntries([...hs]);state.attachmentManifest=null;saveState(false);log(`参考素材队列已更新：${referenceFiles.length} 张｜${referenceFiles.map((x,i)=>`${i+1}.${x.name}`).join('、')}`,'success');await updateFolderLabels();
  }
  async function clearReferenceFiles(){
    await deleteHandle(REFERENCE_FILES_KEY).catch(()=>{});await deleteHandle(TEMPLATE_KEY).catch(()=>{});await deleteHandle(LOGO_KEY).catch(()=>{});referenceFiles=[];state.attachmentManifest=null;saveState(false);log('参考素材队列已清空；后续批次可在0张素材下直接运行','warn');await updateFolderLabels();
  }
  async function orderedReferenceEntries(manifest=null,request=false){
    const entries=await loadReferenceFiles({migrate:true});
    for(const e of entries){if(await permission(e.file,'read',request)!=='granted')throw new Error(`没有参考素材读取权限：${e.name}`);}
    const m=manifest&&typeof manifest==='object'?manifest:null;if(!m||!Array.isArray(m.entries)||!m.entries.length)return entries;
    const byId=new Map(entries.map(e=>[e.id,e])),ordered=m.entries.map(x=>byId.get(String(x?.id||''))).filter(Boolean);
    if(ordered.length!==Number(m.count||m.entries.length))throw new Error('当前参考素材队列与本批 Attachment Manifest 不一致；为避免错序已暂停，请重新选择原素材或重置当前批次');
    return ordered;
  }
  function makeAttachmentManifest(entries){
    const list=(Array.isArray(entries)?entries:[]).filter(x=>x?.enabled!==false).sort((a,b)=>Number(a.order)-Number(b.order));
    return{version:1,count:list.length,files:list.map(x=>x.name),entries:list.map(x=>({id:x.id,name:x.name,order:Number(x.order),enabled:true})),batchNo:Number(state.batchNo||0),batchKey:`${Number(state.batchNo||0)}|${(state.currentBatchKeys||[]).join('|')}`,createdAt:new Date().toISOString()};
  }
'''
source = replace_between(source, "  async function chooseTemplate(){", "  async function writeBlob(", new_reference_functions + "  async function writeBlob(", "旧模板/Logo选择函数")

# ===== 批次提示词与授权校验 =====
new_prompt_validate = r'''  function buildBatchPrompt(tasks,manifest=state.attachmentManifest){
    const common=publicPrompt(),m=manifest&&typeof manifest==='object'?manifest:null,refNames=Array.isArray(m?.files)?m.files:[],refCount=Number(m?.count)||refNames.length;
    const lines=[];
    if(common){lines.push('【公共规则】',common,'');}
    lines.push('【本批任务】');
    tasks.forEach((t,i)=>{lines.push(`第${i+1}张结果｜任务编号：${t.id}`);lines.push('完整要求：');lines.push(String(t.prompt||'').trim());lines.push('');});
    lines.push('【固定执行要求】');
    if(refCount>0){
      lines.push(`本批提供 ${refCount} 张参考素材，请严格按照上传顺序理解和使用。`);
      for(let i=0;i<refCount;i++)lines.push(`第${i+1}张：${refNames[i]||`参考素材${i+1}`}`);
    }
    lines.push(`本批共有 ${tasks.length} 个独立任务，必须严格生成 ${tasks.length} 张结果图；第1张对应第1个任务、第2张对应第2个任务，依此类推。`);
    lines.push('不同任务之间禁止混用任何设计内容；不要把多个任务合并到同一张图中。');
    return flattenPromptForComposer(lines.filter((x,i,a)=>!(x===''&&a[i-1]==='')).join('\n').trim());
  }

  async function validateHandles(request=true){
    if(!state.importedFileName||!state.tasks.length)throw new Error('请先导入 Excel 任务表');
    refreshMissingPromptStates();
    const outputRoot=await getHandle(OUTPUT_KEY);if(!outputRoot)throw new Error('请先选择输出目录');
    if(await permission(outputRoot,'readwrite',request)!=='granted')throw new Error('没有输出目录写入权限');
    const references=await orderedReferenceEntries(state.resumeContext?.kind==='create-refresh'?state.attachmentManifest:null,request);
    const output=await getTaskOutputDir(outputRoot,{create:true,requestPermission:request});
    settings.useLogoFile=false;
    return{output,outputRoot,references};
  }
'''
source = replace_between(source, "  function buildBatchPrompt(tasks){", "\n\n  // ========================== 风格反推项目/母版/步骤状态", new_prompt_validate, "批次提示词与授权校验")

# ===== 批次执行：动态附件数量、Manifest 与恢复顺序 =====
old_prompt_line = "    const prompt=flattenPromptForComposer(state.resumeContext?.prompt||buildBatchPrompt(tasks));let uploadRetries=0;let execution=0;"
new_prompt_line = "    const reuseManifest=Boolean(resumeKind==='create-refresh'&&state.currentBatchKeys.length&&state.attachmentManifest);if(!reuseManifest&&!detectOnly&&!confirmOnly){state.attachmentManifest=makeAttachmentManifest(handles.references);saveState(false);}\n    const prompt=flattenPromptForComposer(state.resumeContext?.prompt||buildBatchPrompt(tasks,state.attachmentManifest));let uploadRetries=0;let execution=0;"
source = replace_once(source, old_prompt_line, new_prompt_line, "批次 prompt/manifest 初始化")

old_upload = "          const uploadList=[await handles.template.getFile()];let uploadLabel='公共模板图';if(handles.logo){uploadList.push(await handles.logo.getFile());uploadLabel='公共模板图、公共Logo图';}\n          const expected=await uploadFiles(uploadList,uploadLabel);await activateCreate();state.phase='writing_prompt';saveState();await setPromptValue(prompt);state.phase='sending';saveState();await sendPrompt(expected,prompt);"
new_upload = "          let expected=0;if(handles.references.length){const uploadList=[];for(const ref of handles.references)uploadList.push(await ref.file.getFile());expected=await uploadFiles(uploadList,`参考素材 ${handles.references.length} 张`);state.attachmentManifest=makeAttachmentManifest(handles.references);saveState(false);log(`附件清单已锁定：${state.attachmentManifest.files.map((n,i)=>`${i+1}.${n}`).join('、')}`,'success');}else{state.attachmentManifest=makeAttachmentManifest([]);saveState(false);log('本批无参考素材，跳过上传','success');}\n          await activateCreate();state.phase='writing_prompt';saveState();await setPromptValue(prompt);state.phase='sending';saveState();await sendPrompt(expected,prompt);"
source = replace_once(source, old_upload, new_upload, "动态参考素材上传")
source = source.replace("模板/Logo图上传失败，整批清理/重试", "参考素材上传失败，整批清理/重试")
source = source.replace("每批上传 1 张公共模板图${settings.useLogoFile?' + 1 张公共Logo图':''}", "每批参考素材 ${referenceFiles.length} 张（允许0张，按选择顺序上传）")
source = source.replace("请先导入 Excel 任务表，再选择公共模板图、可选Logo图和输出目录", "请先导入 Excel 任务表并选择输出目录；参考素材可为0张")
source = source.replace("清除公共模板图、公共Logo图和输出目录授权？", "清除参考素材和输出目录授权？")
source = source.replace("模板图/Logo图/输出目录授权已清除", "参考素材/输出目录授权已清除")
source = source.replace("state.resumeContext=null;finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.batchNo++;state.phase='ready'", "state.resumeContext=null;state.attachmentManifest=null;finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.batchNo++;state.phase='ready'")
source = source.replace("finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.batchNo++;", "finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.attachmentManifest=null;state.batchNo++;")
source = source.replace("state.batchNo=1;state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;", "state.batchNo=1;state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.attachmentManifest=null;")

# ===== UI：隐藏旧模板/Logo控件，安装统一参考素材队列控件 =====
ui_block = r'''  async function updateFolderLabels(){
    if(!panel)return;if(settings.flow==='style_reverse'){updateStylePanel();return;}if(settings.flow!=='batch_generation')return;
    const refs=await loadReferenceFiles({migrate:true}).catch(()=>[]),o=await getHandle(OUTPUT_KEY).catch(()=>null),set=(role,val)=>panel.querySelectorAll(`[data-role="${role}"]`).forEach(n=>n.textContent=val);
    set('references',refs.length?`${refs.length} 张｜${refs.map((x,i)=>`${i+1}.${x.name}`).join('、')}`:'0 张（可直接运行）');set('output',outputDisplayName(o));settings.useLogoFile=false;
  }
  function kaguraInstallReferenceQueueUi(){
    if(!panel||panel.querySelector('[data-kagura-reference-queue="1"]'))return;
    const templateRow=panel.querySelector('[data-role="template"]')?.closest('.pod-row'),logoRow=panel.querySelector('[data-role="logo"]')?.closest('.pod-row');if(templateRow)templateRow.style.display='none';if(logoRow)logoRow.style.display='none';
    for(const act of ['template','logo','clearLogo']){const b=panel.querySelector(`[data-act="${act}"]`);if(b)b.style.display='none';}
    const oldNote=[...panel.querySelectorAll('.pod-section div')].find(n=>String(n.textContent||'').includes('公共模板图为必需项'));if(oldNote)oldNote.style.display='none';
    const outputRow=panel.querySelector('[data-role="output"]')?.closest('.pod-row');if(!outputRow)return;
    const row=document.createElement('div');row.className='pod-row';row.dataset.kaguraReferenceQueue='1';row.innerHTML='<span class="pod-label">参考素材</span><span class="pod-value" data-role="references">0 张（可直接运行）</span>';outputRow.parentNode.insertBefore(row,outputRow);
    const buttons=document.createElement('div');buttons.className='pod-buttons';buttons.style.gridTemplateColumns='1fr 1fr';buttons.innerHTML='<button class="pod-btn success" data-kagura-ref-select="1">选择参考素材</button><button class="pod-btn warn" data-kagura-ref-clear="1">清空参考素材</button>';outputRow.parentNode.insertBefore(buttons,outputRow.nextSibling);
    buttons.querySelector('[data-kagura-ref-select]').onclick=()=>Promise.resolve(chooseReferenceFiles()).catch(e=>{log(e.message||String(e),'error');if(e?.name!=='AbortError')alert(e.message||e)});
    buttons.querySelector('[data-kagura-ref-clear]').onclick=()=>Promise.resolve(clearReferenceFiles()).catch(e=>{log(e.message||String(e),'error');alert(e.message||e)});
    const forget=panel.querySelector('[data-act="forget"]');if(forget)forget.textContent='清除参考素材/输出授权';
  }
'''
source = replace_between(source, "  async function updateFolderLabels(){", "\n\n  function updatePanel(){", ui_block, "参考素材 UI 与标签")
source = replace_once(source, "createPanel();GM_setValue(LOG_KEY,logs);await updateFolderLabels();", "createPanel();kaguraInstallReferenceQueueUi();GM_setValue(LOG_KEY,logs);await updateFolderLabels();", "启动安装参考素材UI")
source = source.replace("POD统一工作台已启动 V${APP_VERSION}", "Kagura POD Studio 已启动 V${APP_VERSION}")
source = source.replace("批量生图模式：Excel完整提示词 + 公共模板图${settings.useLogoFile?' + 公共Logo图':''}", "批量生图模式：Excel完整提示词 + ${referenceFiles.length} 张参考素材（可为0张）")

# ===== 静态安全断言 =====
required = [
    "// @name         Kagura POD Studio",
    "// @name:zh-CN   Kagura POD智能创意中心 V1.5.10",
    "const APP_VERSION = '1.5.10';",
    "const REFERENCE_FILES_KEY = 'reference-files';",
    "let referenceFiles=[];",
    "attachmentManifest",
    "本批无参考素材，跳过上传",
    "参考素材队列已更新",
    "kaguraInstallReferenceQueueUi",
    "rememberCreateModeProof",
    "CreateModeRetryableError",
    "send-confirming",
]
for token in required:
    if token not in source:
        raise RuntimeError(f"V1.5.10 缺少关键逻辑：{token}")
if "if(!template)throw new Error('请先选择公共模板图')" in source:
    raise RuntimeError("仍存在模板图必选硬限制")
if "公共模板图为必需项" in source and "oldNote" not in source:
    raise RuntimeError("旧模板必需UI未被兼容隐藏")

# ===== 正式发布文件 =====
root.joinpath("POD_ChatGPT.user.js").write_text(source, encoding="utf-8")
meta = "\n".join(source.splitlines()[:24]) + "\n"
if "// ==/UserScript==" not in meta:
    # 元数据块长度未来变化时改用精确截取
    end = source.index("// ==/UserScript==") + len("// ==/UserScript==")
    meta = source[:end] + "\n"
root.joinpath("POD_ChatGPT.meta.js").write_text(meta, encoding="utf-8")

changelog = [
    "脚本正式升级为 Kagura POD Studio；中文名称为 Kagura POD智能创意中心，作者仍为 Kagura，namespace/updateURL/downloadURL 保持原 POD 链路。",
    "批量生图由固定模板图 + 可选Logo图升级为参考素材队列：支持0张、1张或任意多张图片，并严格按用户选择顺序上传。",
    "参考素材队列使用 referenceFiles 结构并持久化到 reference-files；旧 template-file / logo-file 授权在首次读取时自动按模板→Logo顺序迁移。",
    "每批上传完成后生成并持久化 Attachment Manifest，记录附件数量、文件名、顺序与批次标识；create-refresh 恢复时按 Manifest 校验原顺序，避免错序恢复。",
    "无参考素材时直接跳过上传并记录“本批无参考素材，跳过上传”；发送前 expected attachment count 动态为0～N。",
    "提示词图片说明改为动态：仅有素材时追加“本批提供 X 张参考素材”及逐张顺序说明；0张素材时不追加图片说明。",
    "完整保留 V1.5.9 事件驱动创建图片/Composer重载兼容，以及 V1.5.8 创建图片成功凭证、三次失败后单次刷新、发送前安全检查与 at-most-once 保护。",
    "V1.6.x 继续统一标记为已撤回开发版：功能未完成，存在已知缺陷，不建议生产使用。",
]
latest = {
    "version": VERSION,
    "install_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
    "download_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
    "published_at": TODAY,
    "changelog": changelog,
}
latest_text = json.dumps(latest, ensure_ascii=False, indent=2) + "\n"
root.joinpath("POD_ChatGPT.latest.json").write_text(latest_text, encoding="utf-8")
root.joinpath("POD_ChatGPT_latest.json").write_text(latest_text, encoding="utf-8")

history_path = root.joinpath("POD_ChatGPT.history.json")
history = json.loads(history_path.read_text(encoding="utf-8"))
versions = [v for v in history.get("versions", []) if str(v.get("version")) != VERSION]
for v in versions:
    ver = str(v.get("version", ""))
    if v.get("status") == "current":
        v["status"] = "stable"
    if ver.startswith("1.6."):
        v["status"] = "withdrawn"
        notes = [str(x) for x in v.get("notes", [])]
        standard = "【已撤回开发版】功能未完成，存在已知缺陷，不建议生产使用。"
        notes = [x for x in notes if x != standard]
        v["notes"] = [standard] + notes
entry = {
    "version": VERSION,
    "date": TODAY,
    "status": "current",
    "notes": changelog,
    "archive_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.10.txt",
    "install_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
}
history["title"] = "Kagura POD Studio"
history["versions"] = [entry] + versions
history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

archive = root / "versions" / "POD_ChatGPT统一工作台_V1.5.10.txt"
archive.parent.mkdir(parents=True, exist_ok=True)
archive.write_text(source, encoding="utf-8")

print("POD V1.5.10 reference asset queue patch applied")
