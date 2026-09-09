from pathlib import Path
import hashlib, re
VERSION='4.1.0-dev.21'
BASE=Path('dev/testing/4.1.0-dev.19.2/Ozon_ChatGPT_DEV_4.1.0-dev.19.2_TEST.user.js')
DEV20=Path('dev/testing/4.1.0-dev.20/Ozon_ChatGPT_DEV_4.1.0-dev.20_TEST.user.js')
WRAP=Path('.hotupload/dev21/create-first.js')
OUT=Path('dev/testing/4.1.0-dev.21/Ozon_ChatGPT_DEV_4.1.0-dev.21_TEST.user.js')
TXT=Path('dev/testing/4.1.0-dev.21/Ozon_ChatGPT_DEV_4.1.0-dev.21_TEST.txt')
EXPECTED_BYTES=2154355
EXPECTED_SHA256='19c5f4596a31d8aaad8929c5de1876172acf09837afaf39d5795664ee9b29d5d'

s=BASE.read_text('utf-8')
s=s.replace('// @version      4.1.0-dev.19.2', f'// @version      {VERSION}',1)
s=s.replace('// @description  Kagura AI 电商图片助手 V4 DEV：Ozon 主图下载 + ChatGPT 批量生图自动化；支持 Auth v2 邀请码自助注册、账号授权、设备审批与会话校验，并使用受保护混淆构建。', '// @description  Kagura AI 电商图片助手 V4 DEV TEST：创建图片必须先于上传；修复创建图片普通DIV菜单定位、Excel任务表识别、历史额度误判、折叠入口显示，并统一运行时版本。',1)
old="const _0x7ca766=_0x24dba2(_0x37ecab._0x476f75)+_0x24dba2(_0x37ecab._0x41bc6f);"
assert s.count(old)==1
s=s.replace(old, f"const _0x7ca766='{VERSION}';",1)
mi=s.find("const TAG = '[CreateImageFirst]';")
assert mi>0
start=s.rfind(';(() => {',0,mi)
assert start>0
s=s[:start].rstrip()+"\n\n"
assert s.count('if (!fileInput || !sendButton) continue;')==1
s=s.replace('if (!fileInput || !sendButton) continue;','if (!fileInput) continue;',1)
oldvalid='return Boolean(parts && isSafeComposerScope(parts.composer) && isUsable(parts.editor) && isUsable(parts.fileInput) && isUsable(parts.sendButton));'
assert s.count(oldvalid)==1
s=s.replace(oldvalid,'return Boolean(parts && isSafeComposerScope(parts.composer) && isUsable(parts.editor) && isUsable(parts.fileInput));',1)

create_first=WRAP.read_text('utf-8').rstrip()
d20=DEV20.read_text('utf-8')
body=d20[d20.find(';(() => {'):]
body=body.replace("const VERSION = '4.1.0-dev.20';", "const VERSION = '4.1.0-dev.21';",1)
body=body.replace("const TAG = '[KaguraDev20]';", "const TAG = '[KaguraDev21Fixes]';",1)
body=body.replace('__kaguraDev20','__kaguraDev21').replace('kagura-dev20-','kagura-dev21-').replace('dev.20 三项修复已启用','dev.21 兼容修复已启用')
selfcheck=""";(() => {\n  'use strict';\n  const EXPECTED = '4.1.0-dev.21';\n  globalThis.KaguraRuntimeVersion = EXPECTED;\n  setTimeout(() => {\n    try {\n      const apiVersion = globalThis.KaguraCreateImageFirst?.version || '';\n      if (apiVersion && apiVersion !== EXPECTED) console.error('[KaguraVersion21] runtime mismatch', { expected: EXPECTED, createImageFirst: apiVersion });\n      else console.log('[KaguraVersion21] runtime version unified=' + EXPECTED);\n    } catch (_) {}\n  }, 0);\n})();"""
s=s+create_first+'\n\n\n'+body.strip()+'\n\n'+selfcheck+'\n'
versions=sorted(set(re.findall(r'4\.1\.0-dev\.[0-9.]+',s)))
assert versions==[VERSION], versions
assert '// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/testing/' not in s
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(s,'utf-8'); TXT.write_text(s,'utf-8')
b=OUT.read_bytes(); sha=hashlib.sha256(b).hexdigest()
assert len(b)==EXPECTED_BYTES,(len(b),EXPECTED_BYTES)
assert sha==EXPECTED_SHA256,(sha,EXPECTED_SHA256)
print('built',OUT,len(b),sha)
