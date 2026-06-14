from pathlib import Path

root = Path(__file__).resolve().parent.parent
old = 'github.com/tmp/marketplace'
new = 'marketplace'
changed = []
for path in root.rglob('*.go'):
    try:
        text = path.read_text(encoding='utf-8')
        if old in text:
            path.write_text(text.replace(old, new), encoding='utf-8')
            changed.append(str(path.relative_to(root)))
    except Exception as e:
        print(f"Error processing {path}: {e}")
for p in changed:
    print(p)
print(f'Replaced {len(changed)} files')
