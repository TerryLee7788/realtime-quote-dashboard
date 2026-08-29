# Specification-Driven Development（本專案的規格驅動開發流程）

從「需求驅動」（拿到需求就直接寫 code）轉為「規格驅動」：任何非瑣碎的功能異動，先在 `specs/` 下
留一份規格文件，把「架構決策」和「驗收標準」明確寫下來、經過確認，才開始實作。規格本身也是活文件，
實作完成後留著，成為「為什麼長這樣」的紀錄，不是用完即丟的規劃稿。

## 為什麼

這個專案有幾個容易「憑感覺做了才發現選錯」的十字路口：

- 新資料要進 Zustand store 還是走 kline 那種獨立 pub/sub？（re-render 成本）
- 新狀態要不要持久化？要的話就一定牽出 Postgres + Server Action（Node runtime），不能碰
  API route 或在後端養 WebSocket 連線。
- 功能牽不牽涉登入態？要不要碰 session payload？
- Edge Middleware 和 Node Server Component 這條 runtime 邊界，新程式碼該放哪一側？

這些決策一旦寫進 code 才發現不對，代價通常是重構整層資料流。規格驅動的重點不是「多一道流程」，
而是把這些十字路口提前攤開來決定，並留下決定的理由。

## 檔案慣例

- `specs/TEMPLATE.md` — 空白模板，每份新規格從這裡複製。
- `specs/NNNN-kebab-title.md` — 實際規格，四位數編號遞增，例如 `0001-price-alerts.md`。
- 每份規格開頭有 `Status`：
  - `Draft` — 草稿，尚未確認
  - `Approved` — 已確認，可開始實作
  - `Implemented` — 已完成，內容應反映實際行為
  - `Superseded` — 被後續規格取代，保留作歷史紀錄

## 流程

1. **提出需求** — 一句話描述想要的功能/行為。
2. **草擬規格** — 複製 `TEMPLATE.md`，逐節填寫，尤其是「架構影響分析」不能跳過。
3. **確認** — 使用者過目，尤其是架構決策那幾項，同意後把 `Status` 改成 `Approved`。
4. **依規格實作** — 對應章節指到哪個既有 skill（`auth-flow` / `market-data-client` /
   `trading-chart` / `dashboard-ui`）就照那個 skill 的既有慣例做。
5. **對照驗收** — 實作完成後逐條檢查「驗收標準」，不是「憑印象覺得做完了」。
6. **收尾** — `Status` 改成 `Implemented`；如果過程中跟規格內容有出入，補一筆到「變更記錄」，
   不要悄悄把驗收標準改成符合實作結果。

參考範例：`specs/0001-example-price-alerts.md`（示範用，`Status` 標記為 `Example`，不代表真的
要做這個功能，純粹示範各章節怎麼填）。

這套流程由 `.claude/skills/spec-driven-development/SKILL.md` 落實——之後在這個專案裡提出新功能
需求，會先走規格草擬與確認，才進入實作。
