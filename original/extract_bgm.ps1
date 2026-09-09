[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bgmDir = "C:\VideoAutoCleaner\BGM音樂庫"
New-Item -ItemType Directory -Path $bgmDir -Force | Out-Null

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  正在從剪映電腦版快取與素材庫提取熱門 BGM..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# 掃描目標：剪映專業版快取 + 桌面素材大禮包
$searchPaths = @(
    "$env:LOCALAPPDATA\JianyingPro",
    "$env:LOCALAPPDATA\CapCut",
    "C:\Users\$env:USERNAME\Desktop\copy0527",
    "C:\Users\$env:USERNAME\Desktop\速傳手機",
    "C:\Users\$env:USERNAME\Desktop\剪映大禮包"
)

$allAudioFiles = @()
foreach ($p in $searchPaths) {
    if (Test-Path $p) {
        Write-Host "正在掃描目錄: $p ..." -ForegroundColor Gray
        $allAudioFiles += Get-ChildItem -Path $p -Include "*.mp3", "*.wav", "*.m4a", "*.aac" -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -gt 350KB -and $_.Length -lt 25MB -and $_.FullName -notlike "*VideoAutoCleaner*" }
    }
}

if ($allAudioFiles) {
    # 依檔名分組去重
    $uniqueAudios = $allAudioFiles | Group-Object Name | ForEach-Object { $_.Group[0] }
    
    $newCount = 0
    foreach ($audio in $uniqueAudios) {
        $target = Join-Path $bgmDir $audio.Name
        if (!(Test-Path $target)) {
            Copy-Item -Path $audio.FullName -Destination $target -Force
            Write-Host "✔ 成功提取新配樂: $($audio.Name) ($([math]::Round($audio.Length/1MB, 2)) MB)" -ForegroundColor Green
            $newCount++
        }
    }
    
    if ($newCount -gt 0) {
        Write-Host "`n🎉 本次共成功提取了 $newCount 首全新剪映配樂！" -ForegroundColor Green
    } else {
        Write-Host "`nℹ 剪映中下載的音樂已經全部都在音樂庫中了，無須重複匯入。" -ForegroundColor Cyan
    }
} else {
    Write-Host "`n未在剪映快取中發現新音訊。請在剪映電腦版中多點幾首音樂下載！" -ForegroundColor Yellow
}

$totalBgms = Get-ChildItem "$bgmDir\*" -Include "*.mp3", "*.wav", "*.m4a", "*.aac"
Write-Host "`n目前 BGM 音樂庫中的歌曲總數: $($totalBgms.Count) 首" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "提取完成！您可以直接關閉此視窗。" -ForegroundColor Green