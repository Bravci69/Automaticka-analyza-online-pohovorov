import datetime
import logging
import os
import sys
from pathlib import Path

import cv2
import easygui


os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
logging.getLogger("tensorflow").setLevel(logging.ERROR)

from deepface import DeepFace

try:
    from .hodnotenie_emocie import prelozenie_emocii, ulozenie_unikatnych_emocii
except ImportError:
    from hodnotenie_emocie import prelozenie_emocii, ulozenie_unikatnych_emocii


def ulozenie_emocii_do_suboru(emocie, subor):
    """Uloží zoznam emócií do textového súboru."""
    try:
        with open(subor, 'a', encoding='utf-8') as f:
            for emocia in emocie:
                f.write(f"{emocia}\n")
        print(f"[INFO] Emócie boli uložené do súboru: {subor}")
    except Exception as e:
        print(f"[ERROR] Nepodarilo sa uložiť emócie do súboru: {e}")

def zistenie_emocii(video_path=None, vrat_subor=False, progress_callback=None):
    progress_callback = progress_callback or (lambda message, percent: None)
    if video_path is None:
        video_path = easygui.fileopenbox(
            title="Vyberte videonahrávku",
            filetypes=["*.mp4", "*.avi", "*.mov"],
        )

    if not video_path:
        print("[INFO] Žiadne video nebolo vybrané.")
        return 1

    print(video_path)
    cas = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    vystupny_subor = Path(__file__).resolve().parent / f"emocie_{cas}.txt"
    cascade_path=cv2.data.haarcascades+"haarcascade_frontalface_default.xml"
    face_cascade=cv2.CascadeClassifier(cascade_path)

    cap=cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video file: {video_path}")

    celkovo_snimok = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    spracovanych_snimok = 0
    progress_callback("Rozpoznávanie tváre: načítavanie videa", 0)

    while True:
        ret, frame=cap.read()
        if not ret:
            break

        spracovanych_snimok += 1
        progress_callback(
            f"Rozpoznávanie tváre: snímka {spracovanych_snimok}",
            spracovanych_snimok / celkovo_snimok * 100
            if celkovo_snimok else 0,
        )

        gray=cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces=face_cascade.detectMultiScale(gray,scaleFactor=1.1,minNeighbors=5,minSize=(30,30))

        for (x,y,w,h) in faces:
            cv2.rectangle(frame,(x,y),(x+w,y+h),(0,255,0),2)
            face_roi=frame[y:y+h,x:x+w]

            try:
                prediction=DeepFace.analyze(face_roi, actions=['emotion'], enforce_detection=False)
                dominant_emotion = prediction[0]['dominant_emotion']
                prelozena_emocia = prelozenie_emocii(dominant_emotion)
                print(f"Detected emotion: {prelozena_emocia}")
                ulozenie_emocii_do_suboru([prelozena_emocia], str(vystupny_subor))
                ulozenie_unikatnych_emocii(
                    [prelozena_emocia],
                    Path(__file__).resolve().parent,
                )
            except Exception as e:
                print(f"Error analyzing face: {e}")

        cv2.imshow("Face Detection",frame)
        if cv2.waitKey(1)& 0xFF==ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    return str(vystupny_subor) if vrat_subor else 0

if __name__ == "__main__":
    exit_code = zistenie_emocii()
    sys.exit(exit_code)
