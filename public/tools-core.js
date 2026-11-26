// 讀取工具清單、合併線上版本資料。網頁、Cloudflare Function、測試共用同一份。
const FIELDS = {
  '代號': 'id', '名稱': 'name', '說明': 'desc', '類型': 'type', '系統': 'platform', '顏色': 'color',
  '圖示': 'icon', '版本': 'version', '大小': 'size', '更新日期': 'date', '網址': 'url',
  '版本來源': 'source', '下載區': 'release', '檔案': 'file',
};
export const COLORS = {
  '橘紅': '#C93A10', '藍': '#2F5D8C', '黃': '#F2B632', '綠': '#7E9A4C',
  '紫': '#8A5A9E', '青': '#3E8E8A', '橘': '#D9772B', '灰': '#6B6B70',
};
const FALLBACK_COLORS = Object.values(COLORS);

export function parseTools(text) {
  const tools = [];
  let current = null;
  const push = () => { if (current && current.id && current.name) tools.push(current); current = null; };
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { push(); continue; }
    if (line.startsWith('#')) continue;
    const m = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    const key = m && FIELDS[m[1].trim()];
    if (!key) continue;
    // 忘了空行時，遇到下一個「代號」也視為新的一段。
    if (key === 'id' && current && current.id) push();
    current = current || {};
    current[key] = m[2].trim();
  }
  push();
  const seen = new Set();
  return tools.filter((t) => {
    t.id = t.id.toLowerCase();
    if (!/^[a-z0-9-]{1,40}$/.test(t.id) || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).map((t, i) => ({
    ...t,
    type: t.type === '網頁' ? '網頁' : '下載',
    colorValue: COLORS[t.color] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    size: /^\d+$/.test(t.size || '') ? Number(t.size) : null,
    url: safeUrl(t.url),
    source: safeUrl(t.source),
    icon: /^[\w.-]+$/.test(t.icon || '') ? t.icon : '',
    // 私人下載的檔名，例如 App.exe（也可以放資料夾：app/App.exe）
    file: /^\w[\w.-]*(\/\w[\w.-]*)*$/.test(t.file || '') && !t.file.includes('..') ? t.file : '',
  }));
}

// 放在 R2 私人空間的檔案的下載網址（公開或私人都走這裡，公開時檔案不用搬）
export function fileUrl(file) {
  return '/api/private/file/' + String(file).split('/').map(encodeURIComponent).join('/');
}

export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

// 軟體的線上更新清單 → 網站要用的欄位。下載網址必須和清單在同一個網域。
export function readManifest(json, sourceUrl, lastModified) {
  const version = String(json?.version || '');
  const url = safeUrl(json?.downloadUrl);
  if (!/^\d+(\.\d+){1,3}$/.test(version) || !url) return null;
  if (new URL(url).host !== new URL(sourceUrl).host) return null;
  const size = Number(json.fileSize);
  return {
    version, url,
    size: Number.isSafeInteger(size) && size > 0 ? size : null,
    date: toDate(lastModified),
    notes: String(json.releaseNotes || '').split(/[；;\n]/).map((s) => s.replace(/^版本\s*[\d.]+\s*[：:]/, '').trim()).filter(Boolean).slice(0, 8),
  };
}

// GitHub Releases → 每個下載區的最新版。標籤格式：代號-版本，例如 app-1.0.0。
export function readReleases(list) {
  const out = {};
  for (const r of Array.isArray(list) ? list : []) {
    if (r.draft || r.prerelease) continue;
    const m = String(r.tag_name || '').match(/^([a-z0-9-]+?)-v?(\d+(?:\.\d+){1,3})$/);
    const asset = m && (r.assets || []).find((a) => /\.(exe|zip|msi)$/i.test(a.name));
    if (!asset || !safeUrl(asset.browser_download_url)) continue;
    if (out[m[1]] && compareVersions(out[m[1]].version, m[2]) >= 0) continue;
    out[m[1]] = {
      version: m[2], url: asset.browser_download_url, size: asset.size || null,
      date: toDate(asset.updated_at || r.published_at),
      notes: String(r.body || '').split(/\r?\n/).map((s) => s.replace(/^[-*\s]+/, '').trim()).filter(Boolean).slice(0, 8),
    };
  }
  return out;
}

export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

function toDate(value) {
  const d = new Date(value || NaN);
  // 以台灣時間顯示日期
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 10);
}

export function mergeTool(tool, live) {
  if (!live) return tool;
  const merged = { ...tool };
  for (const k of ['version', 'url', 'size', 'date', 'notes']) if (live[k]) merged[k] = live[k];
  return merged;
}

export function formatSize(bytes) {
  return bytes ? Math.round(bytes / 1048576) + ' MB' : '';
}
