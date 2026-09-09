[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$baseDir = "C:\VideoAutoCleaner"
$inputDir = "$baseDir\待切割影片"
$voiceDir = "$baseDir\新口播音訊"
$bgmDir = "$baseDir\新背景音樂BGM"
$splitDir = "$baseDir\切割後的片段庫"
$outputDir = "$baseDir\混剪完成影片"

# 清空上一次的暫存片段
Get-ChildItem $splitDir -Filter "*.mp4" -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  全能混剪系統：檢查素材庫..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$videos = Get-ChildItem "$inputDir\*.mp4", "$inputDir\*.mov"
if (!$videos) {
    Write-Host "【提示】未在「待切割影片」找到原影片！" -ForegroundColor Red
    explorer.exe $inputDir
    pause
    exit
}

$voiceFile = Get-ChildItem "$voiceDir\*.mp3", "$voiceDir\*.wav", "$voiceDir\*.m4a" | Select-Object -First 1
$bgmFile = Get-ChildItem "$bgmDir\*.mp3", "$bgmDir\*.wav", "$bgmDir\*.m4a" | Select-Object -First 1

if ($voiceFile) { Write-Host "✔ 偵測到新口播音訊: $($voiceFile.Name)" -ForegroundColor Green } else { Write-Host "ℹ 未放入新口播音訊（將不注入新人聲）" -ForegroundColor Gray }
if ($bgmFile) { Write-Host "✔ 偵測到新背景音樂: $($bgmFile.Name)" -ForegroundColor Green } else { Write-Host "ℹ 未放入新 BGM（將不注入新音樂）" -ForegroundColor Gray }

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  步驟 1：智能鏡頭切割（切出獨立素材段落）..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$counter = 1
foreach ($vid in $videos) {
    Write-Host "正在分析: $($vid.Name) ..." -ForegroundColor Cyan
    $durStr = (ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $vid.FullName)
    $totalDuration = [double]$durStr
    
    $timePoints = [System.Collections.Generic.List[double]]::new()
    $timePoints.Add(0.0)
    
    # 鏡頭場景變化偵測
    $probe = ffmpeg -i $vid.FullName -filter_complex "select='gt(scene,0.3)',showinfo" -f null - 2>&1
    foreach ($line in $probe) {
        if ($line -match "pts_time:([0-9.]+)") {
            # 【修正處】補上 [0] 避免型態錯誤
            $t = [double]$matches[0]
            if (($t - $timePoints[$timePoints.Count - 1]) -ge 1.2 -and $t -lt ($totalDuration - 1.0)) {
                $timePoints.Add($t)
            }
        }
    }
    
    # 若鏡頭轉換少，啟用起號大師節奏切片 (1.5s~3s)
    if ($timePoints.Count -lt 5) {
        $timePoints.Clear()
        $timePoints.Add(0.0)
        $curr = 0.0
        while ($curr -lt ($totalDuration - 2.0)) {
            $curr += [math]::Round((Get-Random -Minimum 1.5 -Maximum 3.2), 1)
            if ($curr -lt $totalDuration) { $timePoints.Add($curr) }
        }
    }
    $timePoints.Add($totalDuration)
    
    for ($i = 0; $i -lt ($timePoints.Count - 1); $i++) {
        $start = $timePoints[$i]
        $duration = $timePoints[$i+1] - $start
        if ($duration -gt 0.5) {
            $clipName = "clip_$("{0:D3}" -f $counter).mp4"
            $outClip = "$splitDir\$clipName"
            ffmpeg -y -ss $start -t $duration -i $vid.FullName -an -c:v libx264 -preset veryfast -crf 20 $outClip 2>$null
            Write-Host "  -> 切出片段: $clipName ($([math]::Round($duration, 1)) 秒)" -ForegroundColor Green
            $counter++
        }
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  步驟 2：執行【亂序混剪 ＋ 限制 16-30 秒 ＋ 混音】..." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$allClips = Get-ChildItem "$splitDir\*.mp4" | Sort-Object { Get-Random }
if ($allClips.Count -lt 2) {
    Write-Host "切出的片段數不足，無法混剪。" -ForegroundColor Red
    pause
    exit
}

$concatList = "$baseDir\concat_list.txt"
$lines = $allClips | ForEach-Object { "file '$($_.FullName -replace '\\', '/')'" }
[System.IO.File]::WriteAllLines($concatList, $lines)

$finalOut = "$outputDir\深度去重混剪成品_$(Get-Date -Format 'yyyyMMdd_HHmmss').mp4"

# 隨機決定成品總秒數 (16 到 30 秒之間)
$targetDuration = Get-Random -Minimum 16 -Maximum 31
Write-Host "本次隨機產出的目標影片長度為: $targetDuration 秒" -ForegroundColor Cyan

$videoFilter = "crop=iw*0.96:ih*0.96,drawbox=x=0:y=ih*0.82:w=iw:h=ih*0.13:color=black@0.65:t=fill,noise=alls=2:allf=t,eq=contrast=1.02:saturation=1.02"

if ($voiceFile -and $bgmFile) {
    Write-Host "正在合成：畫面 ＋ 新口播 ＋ 智慧壓音 BGM (限時 $targetDuration 秒)..." -ForegroundColor Yellow
    ffmpeg -y -f concat -safe 0 -i $concatList -i $voiceFile.FullName -stream_loop -1 -i $bgmFile.FullName `
      -filter_complex "[0:v]$videoFilter[v];[2:a]volume=0.15[bgm];[1:a][bgm]amix=inputs=2:duration=first[a]" `
      -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t $targetDuration $finalOut 2>$null
} elseif ($voiceFile) {
    Write-Host "正在合成：畫面 ＋ 新口播音訊 (限時 $targetDuration 秒)..." -ForegroundColor Yellow
    ffmpeg -y -f concat -safe 0 -i $concatList -i $voiceFile.FullName `
      -filter_complex "[0:v]$videoFilter[v]" `
      -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t $targetDuration $finalOut 2>$null
} elseif ($bgmFile) {
    Write-Host "正在合成：畫面 ＋ 新背景音樂 (限時 $targetDuration 秒)..." -ForegroundColor Yellow
    ffmpeg -y -f concat -safe 0 -i $concatList -stream_loop -1 -i $bgmFile.FullName `
      -filter_complex "[0:v]$videoFilter[v]" `
      -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t $targetDuration $finalOut 2>$null
} else {
    Write-Host "正在合成：畫面去重（限時 $targetDuration 秒）..." -ForegroundColor Yellow
    ffmpeg -y -f concat -safe 0 -i $concatList `
      -vf "$videoFilter" -an -c:v libx264 -preset fast -crf 20 -t $targetDuration $finalOut 2>$null
}

Remove-Item $concatList -Force -ErrorAction SilentlyContinue

Write-Host "`n🎉 恭喜！16-30 秒深度去重混剪大功告成！" -ForegroundColor Green
Write-Host "成品輸出於: $finalOut" -ForegroundColor Green
explorer.exe $outputDir
pause