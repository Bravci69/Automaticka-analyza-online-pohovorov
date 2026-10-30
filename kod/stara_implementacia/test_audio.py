import moviepy as mp   # namiesto "import moviepy.editor as mp"
import speech_recognition as sr
import easygui

video = easygui.fileopenbox(title="Vyberte videonahrávku", filetypes=["*.mp4", "*.avi", "*.mov"])
print(video)
video = mp.VideoFileClip(video)

audio_file = video.audio
audio_file.write_audiofile("geeksforgeeks.wav")

r = sr.Recognizer()
with sr.AudioFile("geeksforgeeks.wav") as source:
    data = r.record(source)

text = r.recognize_google(data)
print("\nThe resultant text from video is: \n")
print(text)