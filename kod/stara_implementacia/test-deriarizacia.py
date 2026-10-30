import math
import os
import statistics
import wave
from array import array
from pathlib import Path
import numpy as np

import easygui


def resolve_audio_input(audio_path: str) -> Path:
    """Overí, či bol zadaný existujúci WAV súbor."""
    input_path = Path(audio_path).expanduser()

    if input_path.is_dir():
        raise SystemExit(f"'{input_path}' je priečinok. Vyber konkrétny .wav súbor.")

    if not input_path.exists():
        raise SystemExit(f"Súbor '{input_path}' neexistuje.")

    if input_path.suffix.lower() != ".wav":
        raise SystemExit(f"Zadaný súbor '{input_path}' nie je .wav. Potrebujem audio súbor vo formáte .wav.")

    return input_path


def _read_wav_mono(path: Path) -> tuple[int, int, np.ndarray]:
    """Načíta bežný nekomprimovaný WAV a vráti mono vzorky v rozsahu -1 až 1 ako numpy pole."""
    with wave.open(str(path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        raw_audio = wav_file.readframes(frame_count)

    if sample_width not in (1, 2, 4):
        raise SystemExit("Builtin režim podporuje iba 8-, 16- alebo 32-bitový PCM WAV.")

    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[sample_width]
    values = np.frombuffer(raw_audio, dtype=dtype)
    
    if channels > 1:
        values = values.reshape(-1, channels).mean(axis=1)
        
    scale = 128.0 if sample_width == 1 else float(1 << (sample_width * 8 - 1))
    
    if sample_width == 1:
        mono = (values.astype(np.float32) - 128.0) / scale
    else:
        mono = values.astype(np.float32) / scale
        
    return sample_rate, sample_width, mono


def _frame_features(frame: np.ndarray, sample_rate: int, frame_size: int) -> list[float]:
    """Vypočíta jednoduché hlasové črty s využitím numpy: energia, ZCR, výška a spektrálne ťažisko."""
    if len(frame) < frame_size:
        frame = np.pad(frame, (0, frame_size - len(frame)))
    else:
        frame = frame[:frame_size]
        
    rms = np.sqrt(np.mean(frame**2))
    zero_crossings = np.sum(frame[:-1] * frame[1:] < 0)
    
    min_lag = max(1, sample_rate // 400)
    max_lag = min(frame_size // 2, sample_rate // 60)
    lags = np.arange(min_lag, max_lag)
    
    if len(lags) > 0:
        autocorr = np.correlate(frame, frame, mode='full')
        ac_vals = autocorr[frame_size - 1 + lags]
        best_idx = np.argmax(ac_vals)
        pitch_lag = lags[best_idx] if len(ac_vals) > 0 else 0
        pitch = sample_rate / pitch_lag if pitch_lag else 0.0
    else:
        pitch = 0.0

    bin_count = 24
    fft_vals = np.abs(np.fft.rfft(frame))
    mags = fft_vals[1:bin_count + 1]
    if len(mags) < bin_count:
        mags = np.pad(mags, (0, bin_count - len(mags)))
        
    magnitude_sum = np.sum(mags)
    if magnitude_sum == 0:
        magnitude_sum = 1.0
    centroid = np.sum(np.arange(1, bin_count + 1) * mags) / magnitude_sum
    
    return [math.log10(rms + 1e-6), float(zero_crossings) / frame_size, float(pitch) / 300.0, float(centroid) / bin_count]


def _region_features(samples: np.ndarray, sample_rate: int, frame_size: int) -> list[float]:
    """Vypočíta stabilné črty z viacerých okien počas celého hlasového úseku."""
    hop_size = max(1, frame_size // 2)
    features = []
    for start in range(0, max(1, len(samples) - frame_size + 1), hop_size):
        frame = samples[start:start + frame_size]
        features.append(_frame_features(frame, sample_rate, frame_size))
        
    return np.mean(features, axis=0).tolist() if features else [0.0, 0.0, 0.0, 0.0]


def _normalise(features: list[list[float]]) -> list[list[float]]:
    f = np.array(features)
    means = np.mean(f, axis=0)
    stds = np.std(f, axis=0)
    stds[stds == 0] = 1.0
    return ((f - means) / stds).tolist()


def _cluster(features: list[list[float]], cluster_count: int) -> list[int]:
    """Malé deterministické k-means; poradie vstupných úsekov nie je rozhodujúce."""
    centres = [features[index * len(features) // cluster_count][:] for index in range(cluster_count)]
    labels = [-1] * len(features)
    for _ in range(30):
        new_labels = [min(range(cluster_count), key=lambda cluster: sum(
            (value - centres[cluster][dimension]) ** 2 for dimension, value in enumerate(row)))
                      for row in features]
        if new_labels == labels:
            break
        labels = new_labels
        for cluster in range(cluster_count):
            members = [row for row, label in zip(features, labels) if label == cluster]
            if members:
                centres[cluster] = [statistics.mean(values) for values in zip(*members)]
    return labels


def run_builtin_diarization(
    audio_path: str,
    output_dir: str,
    speaker_count: int = 2,
) -> None:
    """Rozdelí rečníkov lokálne a vytvorí WAV aj TXT pre každého rečníka."""
    if speaker_count < 1:
        raise SystemExit("--speakers musí byť kladné celé číslo.")
    input_path = resolve_audio_input(audio_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sample_rate, sample_width, samples = _read_wav_mono(input_path)
    frame_size = max(256, int(sample_rate * 0.03))
    hop_size = max(128, int(sample_rate * 0.015))
    
    squared_samples = samples ** 2
    window = np.ones(frame_size) / frame_size
    mean_squares = np.convolve(squared_samples, window, mode='valid')
    frame_rms = np.sqrt(np.maximum(mean_squares[::hop_size], 0)).tolist()
    
    sorted_rms = sorted(frame_rms)
    noise_floor = sorted_rms[max(0, len(sorted_rms) // 10)] if sorted_rms else 0.0
    threshold = max(0.01, noise_floor * 2.0)
    voiced = [energy > threshold for energy in frame_rms]

    regions = []
    start_frame = None
    last_voiced = None
    max_gap_frames = max(1, int(0.35 * sample_rate / hop_size))
    for frame_index, is_voiced in enumerate(voiced + [False] * (max_gap_frames + 1)):
        if is_voiced:
            start_frame = frame_index if start_frame is None else start_frame
            last_voiced = frame_index
        elif start_frame is not None and frame_index - last_voiced > max_gap_frames:
            start = start_frame * hop_size
            end = min(len(samples), (last_voiced + 1) * hop_size + frame_size)
            if end - start >= int(0.5 * sample_rate):
                regions.append((start, end))
            start_frame = None
            last_voiced = None

    if not regions:
        raise SystemExit("Nenašiel som hlasové úseky. Skús WAV s menším šumom alebo hlasnejšou rečou.")
    actual_count = min(speaker_count, len(regions))
    features = [_region_features(samples[start:end], sample_rate, frame_size) for start, end in regions]
    labels = _cluster(_normalise(features), actual_count)
    speaker_audio = {speaker: [] for speaker in range(actual_count)}
    timeline = []
    for (start, end), label in zip(regions, labels):
        speaker_audio[label].append(samples_to_pcm(samples[start:end], sample_width))
        timeline.append(f"speaker_{label + 1:02d}\t{start / sample_rate:.2f}\t{end / sample_rate:.2f}")

    silence = b"\x00" * int(sample_rate * 0.1) * sample_width
    for speaker, audio_bytes in speaker_audio.items():
        output_file = out_dir / f"speaker_{speaker + 1:02d}.wav"
        _write_wav(output_file, sample_rate, 1, sample_width, silence.join(audio_bytes))
    (out_dir / "diarizacia.txt").write_text("rečník\tzačiatok_s\tkoniec_s\n" + "\n".join(timeline), encoding="utf-8")
    transcribe_speaker_files(out_dir)
    print(f"Nájdených úsekov: {len(regions)}; zoskupených rečníkov: {actual_count}")
    print(f"Výstupy sú v: {out_dir.resolve()}")


def samples_to_pcm(samples: np.ndarray, sample_width: int) -> bytes:
    limit = (1 << (sample_width * 8 - 1)) - 1
    if sample_width == 1:
        values = np.clip(samples * 127 + 128, 0, 255).astype(np.uint8)
    elif sample_width == 2:
        values = np.clip(samples * limit, -limit - 1, limit).astype(np.int16)
    else:
        values = np.clip(samples * limit, -limit - 1, limit).astype(np.int32)
    return values.tobytes()


def _write_wav(path: Path, sample_rate: int, channels: int, sample_width: int, audio: bytes) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio)


def transcribe_speaker_files(output_dir: Path) -> None:
    """Prepíše každý lokálne vytvorený speaker_XX.wav do samostatného TXT."""
    if os.name == "nt":
        import site
        for site_directory in [site.getsitepackages(), site.getusersitepackages()]:
            directories = site_directory if isinstance(site_directory, list) else [site_directory]
            for directory in directories:
                for dll_directory in Path(directory).glob("nvidia/*/bin"):
                    os.add_dll_directory(str(dll_directory))

    try:
        # pyrefly: ignore [missing-import]
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "Chýba faster-whisper. Nainštaluj: pip install faster-whisper"
        ) from exc

    try:
        model = WhisperModel(
            "large-v2",
            device="cuda",
            compute_type="float16",
            local_files_only=False,
        )
        device = "cuda"
        print("Používam GPU režim.")
    except Exception as gpu_error:
        print(f"GPU nie je dostupné ({gpu_error}). Prepínam na CPU.")
        try:
            model = WhisperModel(
                "large-v2",
                device="cpu",
                compute_type="int8",
                local_files_only=False,
            )
            device = "cpu"
        except Exception as exc:
            raise SystemExit("Lokálny faster-whisper model nie je dostupný.") from exc

    for speaker_wav in sorted(output_dir.glob("speaker_*.wav")):
        try:
            segments, _ = model.transcribe(str(speaker_wav), language="sk")
            text = "\n".join(segment.text.strip() for segment in segments if segment.text.strip())
        except Exception as gpu_error:
            if device != "cuda":
                raise
            print(f"GPU prepis zlyhal ({gpu_error}). Prepínam na CPU.")
            model = WhisperModel(
                "large-v2",
                device="cpu",
                compute_type="int8",
                local_files_only=False,
            )
            device = "cpu"
            segments, _ = model.transcribe(str(speaker_wav), language="sk")
            text = "\n".join(segment.text.strip() for segment in segments if segment.text.strip())
        text_path = speaker_wav.with_suffix(".txt")
        text_path.write_text(text, encoding="utf-8")
        print(f"Prepis uložený: {text_path}")


def main() -> None:
    input_path = easygui.fileopenbox(
        title="Vyberte WAV audio súbor",
        filetypes=["*.wav"],
    )
    if not input_path:
        print("[INFO] Nebol vybraný žiadny audio súbor.")
        return

    speaker_count = easygui.integerbox(
        msg="Koľko rečníkov sa má hľadať?",
        title="Počet rečníkov",
        default=2,
        lowerbound=1,
    )
    if speaker_count is None:
        return

    output_dir = str(Path(__file__).resolve().parent)
    run_builtin_diarization(input_path, output_dir, speaker_count=speaker_count)


if __name__ == "__main__":
    main()
