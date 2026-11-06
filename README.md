# 🧠 LoTUS-BF: Location-or-Term Unified Search for Brain Functions

[![Deploy to GitHub Pages](https://github.com/barry6007-ai/lotus-bf/actions/workflows/deploy.yml/badge.svg)](https://github.com/barry6007-ai/lotus-bf/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://barry6007-ai.github.io/lotus-bf/)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.1-646CFF?logo=vite)](https://vitejs.dev/)

> **LoTUS-BF** (Location-or-Term Unified Search for Brain Functions) 是國立臺灣大學「心智與神經資訊學 (Psychoinformatics & Neuroinformatics)」課程（指導教授：黃從仁 Tsung-Ren Huang）之第 9 週競賽專案。
> 本專案為 LoTUS-BF 打造全新、現代化、全功能響應式之專業神經造影探索前端。

---

## 🚀 線上展示 (Live Demo)

- **公開發佈網址 (Render Full-Stack - 推薦首選，免設定秒開)**:  
  👉 **[https://lotus-bf.onrender.com/lotus-bf/](https://lotus-bf.onrender.com/lotus-bf/)**
- **靜態展示站 (GitHub Pages)**:  
  👉 [https://barry6007-ai.github.io/lotus-bf/](https://barry6007-ai.github.io/lotus-bf/)
- **課程官方 HPC 伺服器**: `http://hpc.psy.ntu.edu.tw:5000`

> 💡 **瀏覽器 Mixed Content 存取提示**：
> 由於 GitHub Pages 強制使用 HTTPS，而校園課程伺服器為 HTTP 協定，若瀏覽器安全機制阻擋跨協議連線，請點擊網址列左側圖示（或鎖頭）將「不安全內容 (Insecure content)」改為「允許」並重新整理即可；亦可透過右上角「⚙️ API 設定」切換端點。

---

## ✨ 核心特色與架構

### 1. 🔤 詞彙與共現分析 (Terms & Related Terms)
- **完整詞彙庫檢索**：即時過濾檢索 1300+ 認知神經科學詞彙。
- **共現關聯分析**：動態展示 `/terms/:term` 之關聯詞彙與 Pearson 相關強度長條圖。
- **語法智能銜接**：支援「`+ AND`」、「`+ OR`」與「`替換`」三種點選模式，避免無效搜尋。

### 2. ⚡ 複合查詢建構器 (Query Builder)
- **布林邏輯與座標支援**：支援 `AND`、`OR`、`NOT`、括號分組 `()` 以及 MNI 座標查詢（如 `[-2, 50, -6] AND reward`）。
- **語法即時診斷 (Linter)**：即時檢查括號對稱、座標格式、未閉合字串與語法錯誤。
- **歷史紀錄與自動補完**：支援常用查詢歷史儲存與詞彙自動補完推薦。

### 3. 📊 論文年份趨勢與互動式篩選 (Studies Bar Chart & Brush Selection)
- **SVG 年份趨勢圖**：具備 X 軸（年份 1990–2025）、Y 軸（文獻篇數）與網格輔助線。
- **長條圖拉選 (Brush Drag)**：可在年份長條圖上自由拖曳滑鼠拉選年份區間，或使用雙滑桿連動縮放。
- **精準筆數核對**：動態計算顯示當前過濾筆數與總筆數 `(顯示 X / 共 Y 篇)`，保持完全一致。
- **學術導出**：支援 APA 格式一鍵複製與完整 CSV 數據導出。

### 4. 📍 活化座標定位 (Locations)
- **分頁檢索與距離半徑控制**：支援 `?r=mm` 球體半徑動態調整與分頁設定。
- **跨組件聯動**：點擊任一論文座標列，即時自動同步至右側 3D 大腦檢視器十字準星中心。

### 5. 🧠 3D 大腦神經影像檢視器 (NiiViewer)
- **三視圖互動切片**：MNI152 標準腦切片（軸狀面、冠狀面、矢狀面）即時渲染。
- **3D 可分離高斯平滑 (Separable Gaussian Filter)**：具備 FWHM 平滑卷積、透明度、閾值動態調節。
- **極值叢集自動偵測**：自動計算 Top 3 峰值活化座標 (Peak Voxels) 並支援一鍵跳轉。
- **原始 NIfTI 下載**：支援一鍵下載生成的 `.nii.gz` 統計圖譜。

### 6. 🎨 現代化 UI/UX
- **深色 / 淺色 / 自動主題**：無縫適配系統外觀偏好。
- **三欄可拖曳調整面板**：左右自由縮放面板寬度。
- **後端 API 彈性切換**：右上角可隨時自訂與測試後端 API 連線狀態。

---

## 🛠️ 本地開發與構建

```bash
# 1. 複製專案
git clone https://github.com/barry6007-ai/lotus-bf.git
cd lotus-bf

# 2. 安裝依賴
npm install

# 3. 啟動本地開發伺服器 (包含 Vite API Proxy)
npm run dev

# 4. 編譯生產版本 (輸出至 dist/)
npm run build
```

---

## 📜 授權與致謝

- 國立臺灣大學 心理學系 **心智與神經資訊學 (Psychoinformatics & Neuroinformatics)**
- 指導教授：黃從仁 (Tsung-Ren Huang)
