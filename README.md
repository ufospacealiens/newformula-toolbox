# 新配方的工具箱

官網：https://newformula.pages.dev/ （Cloudflare Pages，程式碼推到 main 就更新）

## 自己改文字、新增工具

打開 `public/tools.txt`，按鉛筆圖示編輯。一個工具一段，段落之間空一行，欄位說明寫在檔案最上面。
新工具的圖示放進 `public/icons/`，用 192×192 的 PNG。

## 上傳新版軟體

| 工具 | 怎麼更新 |
|---|---|
| 遊戲時光管理器 | 照平常一鍵發布。官網會讀它的線上更新清單，約 5 分鐘內跟上 |
| 麥克風音量100％一鍵控制 | 在 GitHub 的 Releases 新增一版，標籤填 `mic-版本`，例如 `mic-1.3.0`，把 EXE 拖進去 |
| GoFile IDM / XDM 下載器 | 同上，標籤填 `gofile-版本`，例如 `gofile-1.1.0` |

發布後「更新下載檔」流程會自動改好 `public/releases.json`，官網的版本、大小、日期、下載網址跟著更新。

## 給 AI 助手

- 使用者用繁體中文溝通，非工程背景，請用白話說明。
- 修改先開新分支給預覽網址看，使用者說「發布」才合併到 main。
- 推送前執行 `node test.mjs`，必須通過。
- 這個儲存庫是公開的：不可放金鑰、個人資料、交易紀錄、任何軟體的原始碼。
- 外觀已定案：裝備欄、復古掌機配色、掌機工具箱標誌、思源黑體加像素編號、右上角螺帽球。要改外觀先問使用者。
- 不使用寶貝球或其他遊戲的圖案。
- 大型檔案放 Releases，不放進儲存庫（Cloudflare Pages 單檔上限 25 MB）。

| 檔案 | 用途 |
|---|---|
| `public/tools.txt` | 工具清單 |
| `public/tools-core.js` | 讀清單、合併版本（網頁、Function、測試共用） |
| `public/app.js`、`styles.css`、`index.html` | 畫面 |
| `functions/api/live.js` | 讀軟體的線上更新清單 |
| `.github/workflows/releases.yml` | Releases 有變動時更新 `releases.json` |

作者：新配方
