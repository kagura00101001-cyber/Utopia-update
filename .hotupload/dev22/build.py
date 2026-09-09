from pathlib import Path
import hashlib

OLD = '4.1.0-dev.21'
VERSION = '4.1.0-dev.22'
BASE = Path('dev/testing/4.1.0-dev.21/Ozon_ChatGPT_DEV_4.1.0-dev.21_TEST.user.js')
GUARD = Path('.hotupload/dev22/runtime-guard.js')
OUT = Path('dev/testing/4.1.0-dev.22/Ozon_ChatGPT_DEV_4.1.0-dev.22_TEST.user.js')
TXT = Path('dev/testing/4.1.0-dev.22/Ozon_ChatGPT_DEV_4.1.0-dev.22_TEST.txt')

BASE_BYTES = 2152716
BASE_SHA256 = '1fb12e8a2a467821546994e5f0daa7c5a3c670a65c04d287fa65f816da13af22'

base_bytes = BASE.read_bytes()
assert len(base_bytes) == BASE_BYTES, (len(base_bytes), BASE_BYTES)
assert hashlib.sha256(base_bytes).hexdigest() == BASE_SHA256

guard_bytes = GUARD.read_bytes()
assert b'KaguraRuntime22' in guard_bytes
assert b'preexisting_kagura_runtime' in guard_bytes
guard = guard_bytes.decode('utf-8').rstrip()

s = base_bytes.decode('utf-8')
s = s.replace(OLD, VERSION)
s = s.replace('CreateImageFirst21', 'CreateImageFirst22')
s = s.replace('KaguraDev21Fixes', 'KaguraDev22Fixes')
s = s.replace('KaguraVersion21', 'KaguraVersion22')
s = s.replace(
    'Kagura AI 电商图片助手 V4 DEV TEST：创建图片必须先于上传；修复创建图片普通DIV菜单定位、Excel任务表识别、历史额度误判、折叠入口显示，并统一运行时版本。',
    'Kagura AI 电商图片助手 V4 DEV TEST：新增 Runtime 单例/混合版本保护，防止旧核心与新上传拦截同时运行；保留创建图片优先、Excel选表、额度误判和折叠入口修复。',
)

marker = '// ==/UserScript=='
pos = s.find(marker)
assert pos >= 0
end = pos + len(marker)
meta = s[:end]
body = s[end:].lstrip('\n')

# Fault package + manual diagnostic export both record the runtime fingerprint.
needle = "'version':_0x7ca766,'module':_0xcd1a63,"
assert body.count(needle) == 2, body.count(needle)
body = body.replace(
    needle,
    "'version':_0x7ca766,'runtimeFingerprint':globalThis.__KaguraRuntimeFingerprint?.()||null,'module':_0xcd1a63,",
)

# The create-image-first layer may only patch native upload/event APIs when this runtime owns the page.
needle2 = "  const pending = new WeakMap();\n  if (!filesDescriptor?.get || !filesDescriptor?.set || typeof nativeDispatchEvent !== 'function') {"
assert body.count(needle2) == 1
body = body.replace(
    needle2,
    """  const pending = new WeakMap();
  const runtimeGuard = globalThis.KaguraRuntimeGuard;
  if (runtimeGuard && (!runtimeGuard.isOwner?.() || runtimeGuard.mixed || runtimeGuard.secondary)) {
    console.warn(TAG, 'Runtime ownership unsafe; create-image-first hook not installed', runtimeGuard.fingerprint?.());
    return;
  }
  if (!filesDescriptor?.get || !filesDescriptor?.set || typeof nativeDispatchEvent !== 'function') {""",
    1,
)

needle3 = """  globalThis.KaguraCreateImageFirst = Object.freeze({
    version: VERSION,"""
assert body.count(needle3) == 1
body = body.replace(
    needle3,
    """  const restoreRuntimeHooks = () => {
    try { Object.defineProperty(proto, 'files', filesDescriptor); } catch (_) {}
    try { eventProto.dispatchEvent = nativeDispatchEvent; } catch (_) {}
    console.warn(TAG, 'Runtime ownership lost; restored native file/event hooks');
  };
  runtimeGuard?.registerCleanup?.(restoreRuntimeHooks);

  globalThis.KaguraCreateImageFirst = Object.freeze({
    version: VERSION,""",
    1,
)

# Dev.22 does not boot its core until the page has been checked for a pre-existing Kagura runtime.
wrapped = (
    meta
    + '\n\n'
    + guard
    + "\n\n;(async () => {\n"
    + "  const __kaguraRuntimeGuard = globalThis.KaguraRuntimeGuard;\n"
    + "  if (__kaguraRuntimeGuard && !(await __kaguraRuntimeGuard.preflight(2200))) {\n"
    + "    __kaguraRuntimeGuard.renderStatus?.();\n"
    + "    console.error('[KaguraRuntime22] core boot blocked to prevent mixed-runtime execution', __kaguraRuntimeGuard.fingerprint?.());\n"
    + "    return;\n"
    + "  }\n\n"
    + body
    + "\n})();\n"
)

assert f'// @version      {VERSION}' in wrapped
assert OLD not in wrapped
assert '4.1.0-dev.18' not in wrapped
assert 'KaguraRuntime22' in wrapped
assert 'CreateImageFirst22' in wrapped
assert 'KaguraDev22Fixes' in wrapped
assert 'runtimeFingerprint' in wrapped
assert "const _0x7ca766='4.1.0-dev.22';" in wrapped
assert '// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dev/testing/' not in wrapped

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(wrapped, 'utf-8')
TXT.write_text(wrapped, 'utf-8')

out_bytes = OUT.read_bytes()
print('built', OUT, len(out_bytes), hashlib.sha256(out_bytes).hexdigest())
