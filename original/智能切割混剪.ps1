[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$baseDir = "C:\VideoAutoCleaner"
$inputDir = "$baseDir\待切割影片"
$splitDir = "$baseDir\切割後的片段庫"
$outputDir = "$baseDir\混剪完成影片"

# 清空上一次的暫存片段
Get-ChildItem $splitDir -Filter "*.mp4" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  正在檢查待處理影片..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$videos = Get-ChildItem "$inputDir\*.mp4", "$inputDir\*.mov"
if (!$videos) {
    Write-Host "【錯誤】未在資料夾找到影片！" -ForegroundColor Red
    Write-Host "請將您的原影片檔案放入: $inputDir" -ForegroundColor Yellow
    explorer.exe $inputDir
    pause
    exit
}

$counter = 1
foreach ($vid in $videos) {
    Write-Host "`n正在處理原影片: $($vid.Name)" -ForegroundColor Cyan
    
    # 1. 取得影片總時長
    $durStr = (ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $vid.FullName)
    $totalDuration = [double]$durStr
    Write-Host "影片總長度: $([math]::Round($totalDuration, 2)) 秒" -ForegroundColor Gray
    
    # 2. 偵測鏡頭場景變化點
    $timePoints = [System.Collections.Generic.List[double]]::new()
    $timePoints.Add(0.0)
    
    $probe = ffmpeg -i $vid.FullName -filter_complex "select='gt(scene,0.3)',showinfo" -f null - 2>&1
    foreach ($line in $probe) {
        if ($line -match "pts_time:([0-9.]+)") {
            # 【修正處】這裡原本漏了 [0]，會導致型態轉換錯誤
            $t = [double]$matches[0]
            if (($t - $timePoints[$timePoints.Count - 1]) -ge 1.2 -and $t -lt ($totalDuration - 1.0)) {
                $timePoints.Add($t)
            }
        }
    }
    
    # 如果偵測到的鏡頭太少，自動啟用節奏切片 (每 2~3 秒隨機一刀)
    if ($timePoints.Count -lt 5) {
        Write-Host "偵測鏡頭較少，自動切換為黃金節奏切割模式 (1.5s~3s)..." -ForegroundColor Yellow
        $timePoints.Clear()
        $timePoints.Add(0.0)
        $curr = 0.0
        while ($curr -lt ($totalDuration - 2.0)) {
            $step = [math]::Round((Get-Random -Minimum 1.5 -Maximum 3.2), 1)
            $curr += $step
            if ($curr -lt $totalDuration) {
                $timePoints.Add($curr)
            }
        }
    }
    
    # 加入結尾時間點
    $timePoints.Add($totalDuration)
    
    Write-Host "預計切出 $($timePoints.Count - 1) 個素材片段，開始裁切..." -ForegroundColor Green
    
    # 3. 逐一裁切出小片段
    for ($i = 0; $i -lt ($timePoints.Count - 1); $i++) {
        $start = $timePoints[$i]
        $duration = $timePoints[$i+1] - $start
        if ($duration -gt 0.5) {
            $clipName = "clip_$("{0:D3}" -f $counter).mp4"
            $outClip = "$splitDir\$clipName"
            
            ffmpeg -y -ss $start -t $duration -i $vid.FullName -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 192k $outClip 2>$null
            Write-Host "  -> 切出素材: $clipName ($([math]::Round($duration, 1)) 秒)" -ForegroundColor Green
            $counter++
        }
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  步驟 2：隨機亂序重組混剪 (限制 16-30 秒)..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$allClips = Get-ChildItem "$splitDir\*.mp4" | Sort-Object { Get-Random }

if ($allClips.Count -gt 1) {
    $concatList = "$baseDir\concat_list.txt"
    $lines = $allClips | ForEach-Object { "file '$($_.FullName -replace '\\', '/')'" }
    [System.IO.File]::WriteAllLines($concatList, $lines)

    $finalOut = "$outputDir\全新混剪去重成品_$(Get-Date -Format 'yyyyMMdd_HHmmss').mp4"
    Write-Host "正在合成混剪影片，並將總長度控制在 16 至 30 秒..." -ForegroundColor Yellow
    
    # 隨機決定成品秒數 (16 到 30 秒之間)
    $targetDuration = Get-Random -Minimum 16 -Maximum 31

    # 加入 -t 參數限制最終輸出的長度
    ffmpeg -y -f concat -safe 0 -i $concatList -t $targetDuration -vf "crop=iw*0.985:ih*0.985,noise=alls=2:allf=t,eq=contrast=1.02:saturation=1.02" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k $finalOut 2>$null
    
    Remove-Item $concatList -Force -ErrorAction SilentlyContinue
    
    Write-Host "`n🎉 恭喜！長度 16-30 秒的全新混剪影片製作完成！" -ForegroundColor Green
    Write-Host "檔案位置: $finalOut" -ForegroundColor Green
    explorer.exe $outputDir
} else {
    Write-Host "切片數量異常，請確認原影片是否正常播放。" -ForegroundColor Red
}

pause