# 新配方的工具箱

官網：https://newformula.pages.dev/ （Cloudflare Pages，程式碼推到 main 就更新）

## 自己改文字、新增工具

打開 `public/tools.txt`，按鉛筆圖示編輯。一個工具一段，段落之間空一行，欄位說明寫在檔案最上面。
新工具的圖示放進 `public/icons/`，用 192×192 的 WebP 或 PNG（WebP 小很多，比較快）。
**換圖示要用新的檔名**（例如 `xxx-2.webp`），再改清單裡的「圖示」：瀏覽器會把圖片記住一天，同一個檔名換了內容，大家還是會看到舊圖。

## 上傳新版軟體

| 工具 | 怎麼更新 |
|---|---|
| 遊戲時光管理器 | 照平常一鍵發布。官網會讀它的線上更新清單，約 5 分鐘內跟上 |
| 其他公開的 PC 軟體 | 在 GitHub 的 Releases 新增一版，標籤填 `代號-版本`，例如 `app-1.0.0`，把 EXE 拖進去。發布後「更新下載檔」流程會自動改好 `public/releases.json` |
| 私人軟體 | 見下面「私人下載」 |

## 私人下載（有密碼才看得到）

還不想公開的軟體放這裡。外人只看到頁尾一個小鎖頭；輸入密碼後，私人軟體接在工具格最後面，標「私人」。
**私人軟體不能放進這個儲存庫或 GitHub Releases**（都是公開的），名稱也不能寫進公開的 `tools.txt`。

- 檔案和清單放在 Cloudflare R2 的私人儲存空間 `newformula-private`（不要開公開網址）：
  - `tools.txt`：私人軟體清單，格式和公開的一樣，多一個「檔案：檔名.exe」；大小會自動讀檔案
  - 各軟體的 EXE，直接放最上層，例如 `App.exe`
- Cloudflare → Workers & Pages → newformula → 設定（正式版和預覽版都要）：
  - 綁定 R2 儲存空間，變數名稱 `PRIVATE`
  - 機密變數 `PRIVATE_PASSWORD`：密碼，只有本人設定。換密碼後所有人都要重新輸入
- 換新版：R2 → `newformula-private` → 上傳新的 EXE 蓋掉舊的 → 下載 `tools.txt` 改版本和日期再上傳回去
- 要公開某個軟體：**EXE 不用搬**。把它那一段從私人 `tools.txt` 移到公開的 `tools.txt`（保留「檔案」那一行），就不用密碼也能下載；再把名字從 `test.mjs` 的「私人軟體不能出現在公開的檔案裡」那行拿掉
- 解鎖一次 30 天有效；同一個 IP 打錯 5 次要等 10 分鐘

## 遊戲區帳號（登入、金幣、每日禮包、救濟金）

只在「遊戲區」分頁出現。用 Google 帳號登入，只記名字，不記 email；不需要任何密碼或金鑰。

- 規則（使用者 2026-11-26 決定）：新帳號 1,000 金幣，所有遊戲共用；不能儲值、不能換錢、玩家之間不能送金幣。
  - 每日禮包 7 天一輪：100、150、200、250、300、400、1,000；漏領不會重來，台灣時間半夜 12 點換日。
  - 救濟金平常看不到：金幣不到 100 才出現，補到 500，每天一次。
- 金幣存在 Cloudflare D1 資料庫 `newformula-game`（表格見 `schema/game.sql`），每一筆進出都記在 `coin_log`。
- Cloudflare → Workers & Pages → newformula → 設定 → 繫結（正式版和預覽版都要）：D1 資料庫，變數名稱 `GAME_DB`。
- Google 登入的「用戶端 ID」寫在 `lib/game-server.js` 的 `CLIENT_ID`（會出現在登入網址裡，不是密碼）。Google Cloud 的 OAuth 用戶端「已授權的重新導向 URI」要加入每個網址的 `/login`，例如 `https://newformula.pages.dev/login`、`https://v1.newformula.pages.dev/login`（Cloudflare 會把 `/login.html` 自動改成 `/login`）。
- Google 登入設定在 Google Cloud 專案 `newformula-game` → Google Auth Platform（應用程式名稱「新配方的遊戲區」，用戶端「新配方官網」）。品牌頁的隱私權政策連結是 `https://newformula.pages.dev/privacy`（`public/privacy.html`），改登入要記的資料時要一起改這一頁。
- 還沒設定好資料庫或用戶端 ID 時，登入那一條不會顯示，網站其他部分照常。
- 其他遊戲（例如吹牛骰子）要用同一個 `newformula-game` 資料庫，玩家用 `g:` 加 Google 帳號編號辨認，才會是同一個錢包。

## 換一台電腦或手機操作

什麼都不用安裝，用瀏覽器登入 GitHub 帳號 `ufospacealiens` 就可以。

1. **改文字、加工具**：打開 `public/tools.txt` → 鉛筆圖示 → 改好 → Commit changes。選 `main` 約一分鐘後正式網址就更新；想先看就改在 `v1` 分支，看 https://v1.newformula.pages.dev/ 。
2. **上傳公開 PC 軟體新版**：Releases → Draft a new release → 標籤填 `代號-版本` → 拖入 EXE → Publish release。官網會自動跟上。私人軟體見「私人下載」。
3. **遊戲時光管理器**：要在有「一鍵發布」的那台電腦操作。
4. **請 AI 修改**：在 claude.ai/code 選這個儲存庫（第一次要授權 GitHub），或把這個儲存庫的網址給其他 AI，請它先讀這份說明。
5. **改壞了要退回**：Cloudflare → Workers & Pages → newformula → Deployments → 選前一個正式版本 → Rollback。

需要的帳號：GitHub（改內容）、Cloudflare（只有退回或改設定時才需要）。密碼和驗證碼只由本人輸入。

## 給 AI 助手

- 有權限時，先讀私人儲存庫 `ufospacealiens/00-start-here`（所有專案的總覽和合作方式）。
- 使用者用繁體中文溝通，非工程背景，請用白話說明。
- 修改先開新分支給預覽網址看，使用者說「發布」才合併到 main。
- 推送前執行 `node scripts/stamp.mjs` 和 `node test.mjs`，測試必須通過。
- 速度：字型只帶用到的字（`public/fonts/`，文字大改時執行 `node scripts/build-fonts.mjs` 再 `stamp.mjs`）；新出現的字網頁會自動補。所有檔案一起下載，不要改回一個等一個，也不要在 `index.html` 加外部字型或外部程式。
- 這個儲存庫是公開的：不可放金鑰、個人資料、交易紀錄、任何軟體的原始碼，也不可放私人軟體的名稱或檔案（測試會檢查）。
- 外觀已定案：裝備欄、復古掌機配色、掌機工具箱標誌、思源黑體加像素編號、右上角螺帽球。要改外觀先問使用者。
- 下載工具一律標「PC 下載」（橘紅、電腦圖示，說明牌標「PC 版」），網頁工具標「網頁版」（藍、地球圖示）。手機看 PC 軟體時要提醒不能安裝。
- 左下角作者連到 YouTube：https://www.youtube.com/@新配方
- 預設不選任何工具，右邊顯示介紹（`index.html` 的「介紹」那一段）；點空白處、按 Esc、點標誌都會回到介紹。手機的介紹放在工具格下面。
- 手機順暢：動畫只動位置和透明度；說明牌先準備內容再滑出，可往下拉關閉；不要加一直重畫的動畫，高度用 `svh` 不用 `dvh`。
- 說明牌不顯示「這一版更新了什麼」（使用者 2026-11-25 決定），不要加回。
- 修改前先抓 main 最新的檔案再改，不要用舊檔案整份上傳，會蓋掉別人的修改。
- 不使用寶貝球或其他遊戲的圖案。
- 大型檔案放 Releases，不放進儲存庫（Cloudflare Pages 單檔上限 25 MB）。

| 檔案 | 用途 |
|---|---|
| `public/tools.txt` | 工具清單 |
| `public/tools-core.js` | 讀清單、合併版本（網頁、Function、測試共用） |
| `public/app.js`、`styles.css`、`index.html` | 畫面 |
| `scripts/build-fonts.mjs`、`scripts/stamp.mjs` | 產生精簡字型、更新快取代碼 |
| `functions/api/live.js` | 讀軟體的線上更新清單 |
| `functions/api/private/[[path]].js` | 私人下載：檢查密碼、給清單和檔案 |
| `lib/game-server.js`、`functions/api/game/[[path]].js` | 遊戲區帳號：Google 登入、金幣、每日禮包、救濟金 |
| `public/account.js`、`public/login.html`、`public/login.js` | 遊戲區帳號的畫面和動畫、Google 登入完回來的那一頁 |
| `schema/game.sql` | 遊戲帳號資料庫的表格 |
| `.github/workflows/releases.yml` | Releases 有變動時更新 `releases.json` |

作者：新配方
