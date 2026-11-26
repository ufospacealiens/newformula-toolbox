-- 遊戲區帳號與金幣（Cloudflare D1 資料庫 newformula-game）
-- 第一次建立：npx wrangler d1 execute newformula-game --remote --file schema/game.sql
-- 可以重複執行，不會清掉資料。

-- 玩家：只存 Google 帳號的編號和名字，不存 email
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,                 -- 'g:' + Google 帳號編號
  name TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins >= 0),
  gift_pos INTEGER NOT NULL DEFAULT 0, -- 下一次領第幾天（0～6）
  gift_count INTEGER NOT NULL DEFAULT 0,
  gift_day TEXT,                       -- 最後一次領禮包的日期（台灣時間 YYYY-MM-DD）
  relief_day TEXT,                     -- 最後一次領救濟金的日期
  created_at INTEGER NOT NULL
);

-- 登入狀態：瀏覽器只拿到一串隨機碼，這裡只存它的雜湊
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);

-- 金幣進出紀錄：查問題用
CREATE TABLE IF NOT EXISTS coin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_log_player ON coin_log(player_id, at);
