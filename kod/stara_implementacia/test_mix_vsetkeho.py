import cv2
import sys
import easygui
from deepface import DeepFace
import speech_recognition as sr
import moviepy.editor as mp
import easygui
import os
from datetime import datetime

video_path=easygui.fileopenbox(title="Vyberte videonahrávku", filetypes=["*.mp4", "*.avi", "*.mov"])
print(video_path)
cascade_path=cv2.data.haarcascades+"haarcascade_frontalface_default.xml"
face_cascade=cv2.CascadeClassifier(cascade_path)

cap=cv2.VideoCapture(str(video_path))
if not cap.isOpened():
    raise RuntimeError(f"Cannot open video file: {video_path}")

while True:
    ret, frame=cap.read()
    if not ret:
        break

    gray=cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces=face_cascade.detectMultiScale(gray,scaleFactor=1.1,minNeighbors=5,minSize=(30,30))

    for (x,y,w,h) in faces:
        cv2.rectangle(frame,(x,y),(x+w,y+h),(0,255,0),2)
        face_roi=frame[y:y+h,x:x+w]

        try:
            prediction=DeepFace.analyze(face_roi, actions=['emotion'], enforce_detection=False)
            dominant_emotion=prediction[0]['dominant_emotion']
            print(f"Detected emotion: {dominant_emotion}")
        except Exception as e:
            print(f"Error analyzing face: {e}")

    cv2.imshow("Face Detection",frame)
    if cv2.waitKey(1)& 0xFF==ord('q'):
        break

cap.release()
cv2.destroyAllWindows()


def zpracuj_video():
    
    video = video_path
    if not video:
        return
    
    print(f"[INFO] Video: {video}")
    
    # Extrakcia audia
    print("\n[KROK 1/3] Extrakcia audia...")
    try:
        vid=mp.VideoFileClip(video)
        if not vid.audio:
            print("[ERROR] Video nemá audio")
            return
        
        trvanie=vid.audio.duration
        audiofile="temp_audio.wav"
        vid.audio.write_audiofile(audiofile,verbose=False,logger=None)
        vid.close()
        print(f"[OK] Trvanie: {format_cas(trvanie)}")
    except Exception as e:
        print(f"[ERROR] {e}")
        return
    
    # Rozdelenie a rozpoznavanie reci
    print("\n[KROK 2/3] Rozpoznávanie reči...")
    try:
        rozpoznavac=sr.Recognizer()
        vysledky=[]
        
        with sr.AudioFile(audiofile) as zdroj:
            audio=rozpoznavac.record(zdroj)
        
        # Rozdelenie na mensie casti (60 sekund)
        audio_data=audio.get_wav_data()
        fps=audio.sample_rate
        bytes_kus=60*fps*2
        
        for i in range(0,len(audio_data),bytes_kus):
            kusok=audio_data[i:i+bytes_kus]
            audio_kus=sr.AudioData(kusok,fps,2)
            
            try:
                text=rozpoznavac.recognize_google(audio_kus,language="sk-SK")
                vysledky.append(text)
                print(f"[OK] Kus {len(vysledky)}")
            except sr.UnknownValueError:
                vysledky.append("[NEČITATEĽNÝ]")
            except sr.RequestError as e:
                vysledky.append(f"[ERROR: {e}]")
        
        finalny_text=" ".join(vysledky)
        
    except Exception as e:
        print(f"[ERROR] {e}")
        if os.path.exists(audiofile):
            os.remove(audiofile)
        return
    
    # Uloženie
    print("\n[KROK 3/3] Uloženie...")
    try:
        cas=datetime.now().strftime("%Y%m%d_%H%M%S")
        vystup=f"preklad_{cas}.txt"
        
        with open(vystup,'w',encoding='utf-8') as f:
            f.write("ROZPOZNÁVANIE REČI Z VIDEA\n")
            f.write("="*80+"\n")
            f.write(f"Čas: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Video: {os.path.basename(video)}\n")
            f.write(f"Trvanie: {format_cas(trvanie)}\n")
            f.write(f"Jazyk: Slovenčina (sk-SK)\n")
            f.write("\n"+"="*80+"\n")
            f.write("TEXT:\n")
            f.write("="*80+"\n")
            f.write(finalny_text)
        
        print(f"[OK] Uložené: {vystup}")
        print("\n"+"="*80)
        print("VÝSLEDOK:")
        print("="*80)
        print(finalny_text[:500]+("..." if len(finalny_text)>500 else ""))
        print("="*80)
        
    except Exception as e:
        print(f"[ERROR] {e}")
    finally:
        if os.path.exists(audiofile):
            os.remove(audiofile)


def format_cas(sekundy):
    """Konverzia sekúnd na formát HH:MM:SS."""
    h=int(sekundy//3600)
    m=int((sekundy%3600)//60)
    s=int(sekundy%60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


zpracuj_video()