import cv2
import sys
import easygui
from deepface import DeepFace

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