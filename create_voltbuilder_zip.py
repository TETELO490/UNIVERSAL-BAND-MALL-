import os
import zipfile
import shutil

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(ROOT_DIR, "public")
OUTPUT_ZIP = os.path.join(PUBLIC_DIR, "universal-band-app.zip")

EXCLUDED_DIRS = {
    'node_modules',
    'dist',
    '.git',
    'ios',
    '.gradle',
    'build',
    '.idea',
    '__pycache__',
    'aistudio'  # Exclude conversation screenshot attachments
}

EXCLUDED_EXTS = {
    '.zip',
    '.mp4',
    '.mov'
}

def should_exclude(rel_path, file_full_path=None):
    parts = rel_path.split(os.sep)
    for part in parts:
        if part in EXCLUDED_DIRS:
            return True
    _, ext = os.path.splitext(rel_path)
    if ext.lower() in EXCLUDED_EXTS:
        return True
    if file_full_path and os.path.isfile(file_full_path):
        # Exclude files larger than 1MB
        if os.path.getsize(file_full_path) > 1024 * 1024:
            return True
    return False

def make_slim_zip():
    print("Building ultra-slim VoltBuilder zip...")
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    included_entries = [
        'package.json',
        'capacitor.config.json',
        'config.xml',
        'voltbuilder.json',
        'google-services.json',
        'firebase-applet-config.json',
        '.firebaserc',
        'vite.config.ts',
        'tsconfig.json',
        'tsconfig.app.json',
        'tsconfig.node.json',
        'index.html',
        '.npmrc',
        'src',
        'public',
        'android'
    ]

    count = 0
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for entry in included_entries:
            full_path = os.path.join(ROOT_DIR, entry)
            if not os.path.exists(full_path):
                continue
            if os.path.isfile(full_path):
                rel_path = entry
                if not should_exclude(rel_path, full_path):
                    zf.write(full_path, rel_path)
                    count += 1
            elif os.path.isdir(full_path):
                for root, dirs, files in os.walk(full_path):
                    dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
                    for f in files:
                        file_full = os.path.join(root, f)
                        rel_path = os.path.relpath(file_full, ROOT_DIR)
                        if not should_exclude(rel_path, file_full):
                            zf.write(file_full, rel_path)
                            count += 1

    size_bytes = os.path.getsize(OUTPUT_ZIP)
    size_mb = size_bytes / (1024 * 1024)
    size_kb = size_bytes / 1024
    print(f"Packaged {count} files.")
    print(f"FINAL ZIP SIZE: {size_mb:.2f} MB ({size_kb:.1f} KB)")

    # Copy to public folder aliases so all download links work
    public_dir = os.path.join(ROOT_DIR, "public")
    aliases = [
        "universal-band-app.zip",
        "universal-band-complete-app.zip",
        "app-source.zip",
        "app.zip",
        "ubmall.zip",
        "ub_mall.zip",
        "ubapp.zip"
    ]
    for alias in aliases:
        dest = os.path.join(public_dir, alias)
        if os.path.abspath(dest) != os.path.abspath(OUTPUT_ZIP):
            shutil.copyfile(OUTPUT_ZIP, dest)

if __name__ == '__main__':
    make_slim_zip()
