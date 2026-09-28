"""Assemble the SIMULATED DATA narration video from cards, browser capture, and audio.

Structure:
  Segments 1-3, 9-13  -> title card PNG held for audio duration
  Segments 4-8        -> slices of demo footage matching audio durations

Requires ffmpeg, ffprobe, title cards and audio in their asset folders, and
the PNG frames produced by capture-demo.mjs.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUDIO = HERE / "audio"
TITLES = HERE / "titles"
FRAMES = HERE / "frames"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

FFMPEG = os.environ.get("FFMPEG", shutil.which("ffmpeg") or "")
FFPROBE = os.environ.get("FFPROBE", shutil.which("ffprobe") or "")
OUTPUT = HERE / "demo-video.mp4"
VIDEO_FILTER = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1"


def duration(path: Path) -> float:
    result = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def encode_clip(video_input: list[str], audio_path: Path, output_path: Path, clip_duration: float) -> None:
    cmd = [
        FFMPEG, "-y", *video_input,
        "-i", str(audio_path),
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", VIDEO_FILTER,
        "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-t", f"{clip_duration:.6f}", "-movflags", "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def require(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"Required video asset is missing: {path}")


def encode_demo(frames: list[Path], out_path: Path) -> float:
    """Encode the contiguous 1 fps PNG capture to a 30 fps presentation master."""
    pattern = FRAMES / "frame-%06d.png"
    # Bound the output with -t, never -frames:v: the capture is 1 fps and the
    # filter chain resamples it to 30 fps, so a -frames:v cap is applied to the
    # *resampled* stream and truncates the clip to len(frames)/30 seconds.
    cmd = [
        FFMPEG, "-y", "-framerate", "1", "-start_number", "0",
        "-i", str(pattern),
        "-vf", VIDEO_FILTER,
        "-r", "30", "-t", str(len(frames)),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
        str(out_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    result = duration(out_path)
    print(f"  demo.mp4 encoded: {result:.2f}s ({len(frames)} PNG frames at 1 fps)")
    return result


def main():
    if not FFMPEG or not FFPROBE:
        raise RuntimeError("ffmpeg and ffprobe must be available on PATH or set through FFMPEG/FFPROBE.")
    with open(HERE / "segments.json", "r", encoding="utf-8") as f:
        segs = json.load(f)
    if not segs:
        raise ValueError("segments.json contains no narration segments.")

    frame_paths = sorted(
        (path for path in FRAMES.iterdir() if re.fullmatch(r"frame-\d{6}\.png", path.name)),
        key=lambda path: int(path.stem.split("-")[1]),
    ) if FRAMES.is_dir() else []
    if not frame_paths:
        raise FileNotFoundError("No PNG demo frames found; run node tooling/video/capture-demo.mjs first.")
    for index, path in enumerate(frame_paths):
        if path.name != f"frame-{index:06d}.png":
            raise ValueError(f"Frame sequence is not contiguous at {path.name}.")

    audios = []
    durations = []
    for index in range(1, len(segs) + 1):
        audio = AUDIO / f"seg{index:02d}.mp3"
        title = TITLES / f"seg{index:02d}.png"
        require(audio)
        require(title)
        audios.append(audio)
        durations.append(duration(audio))

    demo_segments = {4, 5, 6, 7, 8}
    demo_needed = sum(durations[index - 1] for index in demo_segments if index <= len(durations))
    demo_master = HERE / "demo.mp4"
    demo_duration = encode_demo(frame_paths, demo_master)
    if demo_duration + 0.25 < demo_needed:
        raise ValueError(
            f"Browser presentation is too short ({demo_duration:.2f}s) for narration "
            f"segments 4–8 ({demo_needed:.2f}s)."
        )

    clips = []
    demo_cursor = 0.0
    for index, _segment in enumerate(segs, 1):
        audio = audios[index - 1]
        clip = OUT / f"clip{index:02d}.mp4"
        clip_duration = durations[index - 1]
        if index in demo_segments:
            start = demo_cursor
            encode_clip([
                "-ss", f"{start:.6f}", "-t", f"{clip_duration:.6f}",
                "-i", str(demo_master),
            ], audio, clip, clip_duration)
            demo_cursor += clip_duration
        else:
            image = TITLES / f"seg{index:02d}.png"
            encode_clip(["-loop", "1", "-framerate", "30", "-i", str(image)], audio, clip, clip_duration)
        actual = duration(clip)
        if abs(actual - clip_duration) > 0.15:
            raise ValueError(f"Clip {index:02d} is {actual:.2f}s but its narration is {clip_duration:.2f}s.")
        print(f"  clip {index:02d}: {actual:.2f}s")
        clips.append(clip)

    concat_list = OUT / "concat.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for clip in clips:
            normalized = clip.resolve().as_posix()
            if "'" in normalized:
                raise ValueError(f"Cannot safely quote concat path: {normalized}")
            f.write(f"file '{normalized}'\n")

    cmd = [
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_list), "-c", "copy", "-movflags", "+faststart",
        str(OUTPUT),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    final_duration = duration(OUTPUT)
    if abs(final_duration - sum(durations)) > 1.0:
        raise ValueError(
            f"Final video is {final_duration:.2f}s; narration totals {sum(durations):.2f}s."
        )

    manifest = {
        "data_mode": "simulated",
        "output": OUTPUT.name,
        "duration_seconds": round(final_duration, 3),
        "audio_seconds": round(sum(durations), 3),
        "resolution": "1280x720",
        "frame_rate": 30,
        "video_codec": "h264",
        "audio_codec": "aac",
        "narration_segments": len(segs),
        "browser_capture_frames": len(frame_paths),
        "simulated_evaluation": "tooling/eval/simulated-tenant/demo-tickets.json",
        "historical_500_ticket_source": "tooling/eval/simulated-tenant/phase5-deployed-run-0aec9773442c4282.json",
        "historical_500_ticket_source_is_development_evidence": True,
    }
    with open(HERE / "demo-video-manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"\nFinal video: {OUTPUT} ({final_duration:.2f}s)")


if __name__ == "__main__":
    main()
