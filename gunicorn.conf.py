import os

# 自動綁定 Render 提供的動態 PORT (預設 10000)
port = os.environ.get("PORT", "10000")
bind = f"0.0.0.0:{port}"

# 記憶體優化
workers = 1
timeout = 120
