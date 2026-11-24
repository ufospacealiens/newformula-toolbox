// GitHub 發布新檔案時執行：把每個下載區的最新版寫進 public/releases.json。
// 用法：gh api "repos/OWNER/REPO/releases?per_page=100" | node scripts/build-releases.mjs
import fs from 'node:fs';
import { readReleases } from '../public/tools-core.js';

const input = fs.readFileSync(0, 'utf8');
const out = readReleases(JSON.parse(input));
fs.writeFileSync(new URL('../public/releases.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('已更新：' + (Object.entries(out).map(([k, v]) => k + ' ' + v.version).join('、') || '沒有可下載的檔案'));
