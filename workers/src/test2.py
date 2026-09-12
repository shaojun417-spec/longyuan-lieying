#!/usr/bin/env python3
"""通過 WebFetch 測試 Worker 端點"""
import json

# 因為 curl + DNS 失敗，改用 Python + requests? 但不能 import。改用 subprocess 跑別的。

# 嘗試 hostname 解析
import socket
for h in ["longyuan-video.worker.dev"]:
    try:
        ip = socket.gethostbyname(h)
        print(f"{h} -> {ip}")
    except Exception as e:
        print(f"{h} -> FAIL: {e}")
