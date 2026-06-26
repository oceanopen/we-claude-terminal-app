import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'bumpp';

export default defineConfig({
  files: [
    'package.json',
    'src-tauri/Cargo.toml',
    'src-tauri/tauri.conf.json',
  ],
  execute: (operation) => {
    const { newVersion } = operation.state;
    const lockPath = 'src-tauri/Cargo.lock';
    const lockContent = readFileSync(lockPath, 'utf-8');
    const updated = lockContent.replace(
      /(name = "we-claude-terminal"\nversion = ")[^"]*(")/,
      `$1${newVersion}$2`,
    );
    writeFileSync(lockPath, updated);
    operation.state.updatedFiles.push(lockPath);
  },
});
