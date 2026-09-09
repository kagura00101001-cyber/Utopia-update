from pathlib import Path

src = Path('scripts/pod_v1519_patch.py').read_text(encoding='utf-8')
line = "    'sendPrompt': grab(s, 'async function sendPrompt(', 'function currentBatchTasks('),\n"
if src.count(line) != 2:
    raise SystemExit(f'Unexpected sendPrompt freeze line count: {src.count(line)}')
src = src.replace(line, '')
exec(compile(src, 'scripts/pod_v1519_patch.py', 'exec'))
