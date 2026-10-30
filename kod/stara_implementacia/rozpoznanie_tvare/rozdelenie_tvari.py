#subor na rozdelenie tvare
try:
    # pyrefly: ignore [missing-import]
    from moviepy.editor import VideoFileClip
except ModuleNotFoundError:
    print("[CHYBA] Knižnica moviepy nie je nainštalovaná. Nainštalujte ju pomocou: pip install moviepy")
    exit(1)

def split_video_moviepy(input_path, output_left_path, output_right_path):
    # Načítanie videa
    video = VideoFileClip(input_path)
    width = video.w
    height = video.h
    half_width = width // 2
    
    # Rozdelenie videa na ľavú a pravú polovicu
    left_clip = video.crop(x1=0, y1=0, x2=half_width, y2=height)
    right_clip = video.crop(x1=half_width, y1=0, x2=width, y2=height)
    
    # Uloženie rozdelených videí
    left_clip.write_videofile(output_left_path)
    right_clip.write_videofile(output_right_path)
    
    # Uvoľnenie prostriedkov
    video.close()

def spusti_rozdelenie():
    import os
    try:
        import easygui
    except ImportError:
        print("[CHYBA] Knižnica easygui nie je nainštalovaná. Nainštalujte ju pomocou: pip install easygui")
        return
        
    vstupne_video = easygui.fileopenbox(
        title="Vyberte video na rozdelenie",
        filetypes=["*.mp4", "*.avi", "*.mov"]
    )
    
    if not vstupne_video:
        print("[INFO] Žiadne video nebolo vybrané.")
    elif os.path.exists(vstupne_video):
        adresar = os.path.dirname(vstupne_video)
        nazov = os.path.basename(vstupne_video).split('.')[0]
        
        lave_video = os.path.join(adresar, f"{nazov}_lave.mp4")
        prave_video = os.path.join(adresar, f"{nazov}_prave.mp4")
        
        print(f"Rozdeľujem video: {vstupne_video}")
        split_video_moviepy(vstupne_video, lave_video, prave_video)
        print("Video bolo úspešne rozdelené.")
    else:
        print(f"Video {vstupne_video} sa nenašlo.")

if __name__ == "__main__":
    spusti_rozdelenie()
