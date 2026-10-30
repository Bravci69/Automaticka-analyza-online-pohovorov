import speech_recognition as sr
import moviepy.editor as mp
import easygui
import os
from datetime import datetime

def extract_audio_and_recognize():
    """Extract audio from video and recognize speech."""
    
    # Select video file
    video_path = easygui.fileopenbox(
        title="Select video file", 
        filetypes=["*.mp4", "*.avi", "*.mov"]
    )
    
    if not video_path:
        print("[ERROR] No video file selected.")
        return
    
    print(f"[INFO] Selected video: {video_path}")
    
    # Extract audio from video
    print("\n[STEP 1/3] Extracting audio from video...")
    try:
        video = mp.VideoFileClip(video_path)
        
        if video.audio is None:
            print("[ERROR] Video has no audio track")
            return
        
        audio_duration = video.audio.duration
        temp_audio_file = "temp_audio_recognition.wav"
        
        print(f"  Duration: {format_time(audio_duration)}")
        print("  Converting to WAV...")
        video.audio.write_audiofile(temp_audio_file, verbose=False, logger=None)
        video.close()
        
        print(f"[OK] Audio extracted: {temp_audio_file}")
        
    except Exception as e:
        print(f"[ERROR] Failed to extract audio: {e}")
        return
    
    # Recognize speech from audio file
    print("\n[STEP 2/3] Recognizing speech from entire audio...")
    
    recognizer = sr.Recognizer()
    recognized_text = ""
    
    try:
        # Recording the sound from file
        print("  Loading audio file...")
        with sr.AudioFile(temp_audio_file) as source:
            # Record the ENTIRE audio
            recorded_audio = recognizer.record(source)
            print("  Done loading audio")
        
        # Recognizing the Audio
        print("  Recognizing the text...")
        print("  (This may take a moment for longer audio)...")
        text = recognizer.recognize_google(
            recorded_audio, 
            language="sk-SK"
        )
        recognized_text = text
        print(f"\n[OK] Decoded Text: {text}")
        
    except sr.UnknownValueError:
        print("[ERROR] Could not understand audio")
        recognized_text = "[ERROR] Could not understand audio"
    except sr.RequestError as e:
        print(f"[ERROR] Speech recognition service error: {e}")
        recognized_text = f"[ERROR] {str(e)}"
    except Exception as ex:
        print(f"[ERROR] {ex}")
        recognized_text = f"[ERROR] {str(ex)}"
    
    # Save to text file
    print("\n[STEP 3/3] Saving results...")
    try:
        output_filename = generate_output_filename()
        
        with open(output_filename, 'w', encoding='utf-8') as f:
            f.write("SPEECH RECOGNITION FROM VIDEO\n")
            f.write("=" * 80 + "\n\n")
            f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Source video: {os.path.basename(video_path)}\n")
            f.write(f"Audio duration: {format_time(audio_duration)}\n")
            f.write(f"Language: Slovak (sk-SK)\n")
            f.write("\n" + "=" * 80 + "\n")
            f.write("RECOGNIZED TEXT:\n")
            f.write("=" * 80 + "\n\n")
            f.write(recognized_text)
            f.write("\n\n" + "=" * 80)
        
        print(f"[OK] Saved to: {output_filename}")
        print(f"\n[SUCCESS] Complete!")
        
    except Exception as e:
        print(f"[ERROR] Failed to save: {e}")
    
    finally:
        # Cleanup
        if os.path.exists(temp_audio_file):
            os.remove(temp_audio_file)
            print("[INFO] Temporary audio file cleaned up")


def format_time(seconds):
    """Convert seconds to HH:MM:SS format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"


def generate_output_filename():
    """Generate a timestamped output filename."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"recognized_text_{timestamp}.txt"


if __name__ == "__main__":
    extract_audio_and_recognize()
