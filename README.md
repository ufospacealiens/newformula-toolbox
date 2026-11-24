# 新配方的工具箱

官網：https://newformula.pages.dev/ （Cloudflare Pages，程式碼推到 main 就更新）

## 自己改文字、新增工具

打開 `public/tools.txt`，按鉛筆圖示編輯。一個工具一段，段落之間空一行，欄位說明寫在檔案最上面。
新工具的圖示放進 `public/icons/`，用 192×192 的 WebP 或 PNG（WebP 小很多，比較快）。

## 上傳新版軟體

| 工具 | 怎麼更新 |
|---|---|
| 遊戲時光管理器 | 照平常一鍵發布。官網會讀它的線上更新清單，約 5 分鐘內跟上 |
| 麥克風音量100％一鍵控制 | 在 GitHub 的 Releases 新增一版，標籤填 `mic-版本`，例如 `mic-1.3.0`，把 EXE 拖進去 |
| GoFile IDM / XDM 下載器 | 同上，標籤填 `gofile-版本`，例如 `gofile-1.1.0` |

發布後「更新下載檔」流程會自動改好 `public/releases.json`，官網的版本、大小、日期、下載網址跟著更新。

## 換一台電腦或手機操作

什麼都不用安裝，用瀏覽器登入 GitHub 帳號 `ufospacealiens` 就可以。

1. **改文字、加工具**：打開 `public/tools.txt` → 鉛筆圖示 → 改好 → Commit changes。選 `main` 約一分鐘後正式網址就更新；想先看就改在 `v1` 分支，看 https://v1.newformula.pages.dev/ 。
2. **上傳麥克風、GoFile 新版**：Releases → Draft a new release → 標籤填 `mic-版本` 或 `gofile-版本` → 拖入 EXE → Publish release。官網會自動跟上。
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
- 這個儲存庫是公開的：不可放金鑰、個人資料、交易紀錄、任何軟體的原始碼。
- 外觀已定案：裝備欄、復古掌機配色、掌機工具箱標誌、思源黑體加像素編號、右上角螺帽球。要改外觀先問使用者。
- 下載工具一律標「PC 下載」（橘紅、電腦圖示，說明牌標「PC 版」），網頁工具標「網頁版」（藍、地球圖示）。手機看 PC 軟體時要提醒不能安裝。
- 左下角作者連到 YouTube：https://www.youtube.com/@新配方
- 預設不選任何工具，右邊顯示介紹（`index.html` 的「介紹」那一段）；點空白處、按 Esc、點標誌都會回到介紹。手機的介紹放在工具格下面。
- 不使用寶貝球或其他遊戲的圖案。
- 大型檔案放 Releases，不放進儲存庫（Cloudflare Pages 單檔上限 25 MB）。

| 檔案 | 用途 |
|---|---|
| `public/tools.txt` | 工具清單 |
| `public/tools-core.js` | 讀清單、合併版本（網頁、Function、測試共用） |
| `public/app.js`、`styles.css`、`index.html` | 畫面 |
| `scripts/build-fonts.mjs`、`scripts/stamp.mjs` | 產生精簡字型、更新快取代碼 |
| `functions/api/live.js` | 讀軟體的線上更新清單 |
| `.github/workflows/releases.yml` | Releases 有變動時更新 `releases.json` |

作者：新配方
