import os
import sys
import glob
import random
import subprocess
import asyncio
from datetime import datetime

BASE_DIR = r"C:\VideoAutoCleaner"
INPUT_DIR = os.path.join(BASE_DIR, "待切割影片")
BGM_DIR = os.path.join(BASE_DIR, "BGM音樂庫")
SPLIT_DIR = os.path.join(BASE_DIR, "切割後的片段庫")
OUTPUT_DIR = os.path.join(BASE_DIR, "混剪完成影片")

os.makedirs(SPLIT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(BGM_DIR, exist_ok=True)

HOOK_TEMPLATES = [
    "家人們，這款好物真心強烈推薦！實用度直接拉滿，幾秒鐘就能輕鬆搞定，質量做工超好，省時省力必備神器，強烈推薦入手試試！",
    "真心推薦這款神仙好物！做工非常紮實耐用，操作簡單又方便，廚房生活有一大半的麻煩事它都能解決，還沒入手的趕緊安排一個！",
    "挖掘到一款實用度拉滿的必備好物！以前手動備料弄得手忙腳亂，現在一按搞定，省心又省力，性價比超高，趁現在優惠千萬別猶豫！"
]

def get_random_bgm():
    bgms = glob.glob(os.path.join(BGM_DIR, "*.mp3")) + glob.glob(os.path.join(BGM_DIR, "*.wav"))
    return random.choice(bgms) if bgms else None

async def generate_voiceover(text, output_file):
    import edge_tts
    voice = "zh-CN-YunxiNeural"
    communicate = edge_tts.Communicate(text, voice, rate="+8%")
    await communicate.save(output_file)

def process_product_group(product_name, video_files, custom_script=None):
    print(f"\n========================================================")
    print(f"▶ 正在處理商品專案: 【{product_name}】 (素材數: {len(video_files)} 支)")
    print(f"========================================================")

    # 1. 準備專屬片段資料夾 (隔離不同商品)
    product_split_dir = os.path.join(SPLIT_DIR, product_name)
    os.makedirs(product_split_dir, exist_ok=True)
    for f in glob.glob(os.path.join(product_split_dir, "*.mp4")):
        try: os.remove(f)
        except: pass

    # 2. 隨機決定目標秒數在 16 ~ 30 秒之間
    target_dur = float(random.randint(16, 30))
    print(f">> 本次設定目標成品長度: {target_dur:.0f} 秒")

    # 3. 準備口播文案
    script_text = custom_script if custom_script else random.choice(HOOK_TEMPLATES)
    voice_file = os.path.join(product_split_dir, "voice.mp3")
    print(f">> 正在生成商品專屬口播語音...")
    asyncio.run(generate_voiceover(script_text, voice_file))

    # 4. 專屬鏡頭智能切片
    clip_counter = 1
    for vid in video_files:
        try:
            dur_cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{vid}"'
            total_dur = float(subprocess.check_output(dur_cmd, shell=True).decode().strip())
        except:
            continue

        time_points = [0.0]
        curr = 0.0
        while curr < total_dur - 2.0:
            curr += round(random.uniform(1.5, 2.5), 1)
            if curr < total_dur:
                time_points.append(curr)
        time_points.append(total_dur)

        for i in range(len(time_points) - 1):
            start = time_points[i]
            dur = time_points[i+1] - start
            clip_path = os.path.join(product_split_dir, f"clip_{clip_counter:03d}.mp4")
            cmd = f'ffmpeg -y -ss {start} -t {dur} -i "{vid}" -an -c:v libx264 -preset veryfast -crf 20 "{clip_path}"'
            subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            clip_counter += 1

    all_clips = glob.glob(os.path.join(product_split_dir, "clip_*.mp4"))
    random.shuffle(all_clips)

    if not all_clips:
        print(f"【跳過】商品 {product_name} 切片失敗。")
        return

    # 5. 拼接片段以鋪滿目標秒數
    selected_clips = []
    accumulated_dur = 0.0
    while accumulated_dur < target_dur + 1.0:
        for c in all_clips:
            selected_clips.append(c)
            try:
                c_dur = float(subprocess.check_output(f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{c}"', shell=True).decode().strip())
            except:
                c_dur = 2.0
            accumulated_dur += c_dur
            if accumulated_dur >= target_dur + 1.0:
                break

    concat_list = os.path.join(product_split_dir, "concat.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for c in selected_clips:
            f.write(f"file '{c.replace(chr(92), '/')}'\n")

    selected_bgm = get_random_bgm()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = os.path.join(OUTPUT_DIR, f"{product_name}_混剪成品_{timestamp}.mp4")

    vf = "crop=iw*0.96:ih*0.96,noise=alls=2:allf=t,eq=contrast=1.02:saturation=1.02"

    # 6. 透過 -t 參數強制把最終成品限制在 16-30 秒內
    if selected_bgm:
        print(f"✔ 搭配背景音樂: {os.path.basename(selected_bgm)}")
        af = "[2:a]volume=0.45[bgm];[1:a][bgm]amix=inputs=2:duration=first[a]"
        cmd = f'ffmpeg -y -f concat -safe 0 -i "{concat_list}" -i "{voice_file}" -stream_loop -1 -i "{selected_bgm}" -filter_complex "[0:v]{vf}[v];{af}" -map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t {target_dur} -shortest "{out_file}"'
    else:
        cmd = f'ffmpeg -y -f concat -safe 0 -i "{concat_list}" -i "{voice_file}" -filter_complex "[0:v]{vf}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -t {target_dur} -shortest "{out_file}"'

    subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"🎉 商品【{product_name}】混剪完成！已輸出 16-30 秒成品: {os.path.basename(out_file)}")

def main():
    print("========================================================")
    print("  多商品獨立批量混剪系統（已限制 16-30 秒）")
    print("========================================================")

    subdirs = [d for d in os.listdir(INPUT_DIR) if os.path.isdir(os.path.join(INPUT_DIR, d))]
    
    if subdirs:
        print(f">> 偵測到 {len(subdirs)} 個商品資料夾，啟動批量處理！")
        for folder_name in subdirs:
            folder_path = os.path.join(INPUT_DIR, folder_name)
            vids = glob.glob(os.path.join(folder_path, "*.mp4")) + glob.glob(os.path.join(folder_path, "*.mov"))
            if not vids:
                continue
            
            txt_files = glob.glob(os.path.join(folder_path, "*.txt"))
            custom_text = None
            if txt_files:
                with open(txt_files[0], "r", encoding="utf-8") as f:
                    custom_text = f.read().strip()

            process_product_group(folder_name, vids, custom_text)
    else:
        vids = glob.glob(os.path.join(INPUT_DIR, "*.mp4")) + glob.glob(os.path.join(INPUT_DIR, "*.mov"))
        if vids:
            process_product_group("單一商品", vids)
        else:
            print("【提示】請在「待切割影片」中建立商品資料夾並放入素材！")
            return

    print("\n========================================================")
    print("🎉 全體商品批量混剪完畢！")
    print("========================================================")
    os.system(f'explorer.exe "{OUTPUT_DIR}"')

if __name__ == "__main__":
    main()