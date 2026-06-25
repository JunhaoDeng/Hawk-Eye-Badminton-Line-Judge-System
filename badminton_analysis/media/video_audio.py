import json
import os
import shutil
import subprocess
import time

import cv2
from moviepy.editor import VideoFileClip


def _get_ffmpeg_path():
    """Return the best available FFmpeg executable path.

    Checks system PATH first, then falls back to imageio_ffmpeg's bundled binary.
    Returns None if neither is available.
    """
    path = shutil.which("ffmpeg")
    if path:
        return path
    # imageio_ffmpeg bundles a standalone FFmpeg binary for all platforms
    try:
        import imageio_ffmpeg
        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.isfile(bundled):
            return bundled
    except Exception:
        pass
    return None


def _ffmpeg_available():
    """Check if FFmpeg is available (system PATH or imageio_ffmpeg bundled)."""
    return _get_ffmpeg_path() is not None


def _ffprobe_available():
    """Check if ffprobe is installed and available on PATH."""
    return shutil.which("ffprobe") is not None


def has_audio_track(video_path):
    # If ffprobe is not available, fall back to moviepy
    if not _ffprobe_available():
        print("ffprobe not found, using moviepy to check audio track.")
        try:
            video = VideoFileClip(video_path)
            has_audio = video.audio is not None
            video.close()
            return has_audio
        except Exception as exc:
            print(f"Error checking audio track via moviepy: {exc}")
            return False

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_streams",
                video_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode == 0:
            data = json.loads(result.stdout)
            return any(stream.get("codec_type") == "audio" for stream in data.get("streams", []))

        try:
            video = VideoFileClip(video_path)
            has_audio = video.audio is not None
            video.close()
            return has_audio
        except Exception:
            return False
    except Exception as exc:
        print(f"Error checking audio track: {exc}")
        return True


def process_video_with_audio(video_path, temp_video_path, output_path, save_dir):
    try:
        print("\nProcessing video audio...")

        # If FFmpeg is not available, fall back to no-audio path
        if not _ffmpeg_available():
            print("FFmpeg not found, falling back to video without audio.")
            return process_video_without_audio(temp_video_path, output_path)

        if not has_audio_track(video_path):
            print("No audio track detected; exporting video without audio.")
            return process_video_without_audio(temp_video_path, output_path)

        if not os.path.exists(temp_video_path):
            raise FileNotFoundError(f"Temporary video not found: {temp_video_path}")

        fixed_temp_path = os.path.join(save_dir, "fixed_temp_video.mp4")
        temp_for_audio = temp_video_path
        ffmpeg = _get_ffmpeg_path()

        try:
            subprocess.call(
                [
                    ffmpeg,
                    "-y",
                    "-i",
                    temp_video_path,
                    "-c:v",
                    "copy",
                    "-movflags",
                    "faststart",
                    fixed_temp_path,
                ],
                stderr=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
            )
            if os.path.exists(fixed_temp_path) and os.path.getsize(fixed_temp_path) > 0:
                temp_for_audio = fixed_temp_path
        except Exception:
            temp_for_audio = temp_video_path

        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                temp_for_audio,
                "-i",
                video_path,
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "23",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-c:a",
                "aac",
                "-map",
                "0:v",
                "-map",
                "1:a",
                "-shortest",
                output_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise RuntimeError(f"ffmpeg failed to merge audio (code={result.returncode}): {result.stderr[:300]}")

        print(f"Video with audio saved to: {output_path}")
        cleanup_temp_files([temp_video_path, fixed_temp_path])
        return True

    except Exception as exc:
        print(f"Audio merge failed: {exc}")
        print("Falling back to video without audio.")
        return process_video_without_audio(temp_video_path, output_path)


def process_video_without_audio(temp_video_path, output_path):
    try:
        print("\nProcessing video without audio...")
        if not os.path.exists(temp_video_path):
            raise FileNotFoundError(f"Temporary video not found: {temp_video_path}")

        ffmpeg = _get_ffmpeg_path()

        # If FFmpeg is not available (e.g. on Windows without FFmpeg installed),
        # fall back to copying the temp video directly.
        if ffmpeg is None:
            print("FFmpeg not found, copying temp video directly.")
            shutil.copy2(temp_video_path, output_path)
            print(f"Video saved to: {output_path}")
            cleanup_temp_files([temp_video_path])
            return True

        # Re-encode to H.264 for browser compatibility
        try:
            result = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-i",
                    temp_video_path,
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "23",
                    "-pix_fmt",
                    "yuv420p",
                    "-movflags",
                    "+faststart",
                    "-an",
                    output_path,
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                # Fallback: just copy the temp video as-is
                print(f"H.264 encoding failed (code={result.returncode}), falling back to raw copy")
                if result.stderr:
                    print(f"ffmpeg stderr: {result.stderr[:500]}")
                shutil.copy2(temp_video_path, output_path)
        except FileNotFoundError:
            # FFmpeg vanished between check and run, fall back to copy
            print("FFmpeg not found at runtime, copying temp video directly.")
            shutil.copy2(temp_video_path, output_path)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise RuntimeError("Output video was not created")

        print(f"Video saved to: {output_path}")
        cleanup_temp_files([temp_video_path])
        return True
    except Exception as exc:
        print(f"Video processing failed: {exc}")
        # Last-resort fallback: try to copy the temp file
        try:
            if os.path.exists(temp_video_path) and not os.path.exists(output_path):
                print("Attempting last-resort copy of temp video...")
                shutil.copy2(temp_video_path, output_path)
                print(f"Video saved to: {output_path} (fallback copy)")
                return True
        except Exception:
            pass
        return False


def setup_video_writer(frame_width, frame_height, fps, temp_output_path):
    """Create a video writer with best available codec/backend.

    Returns:
        (writer, actual_path): OpenCV VideoWriter and the actual output path
        (may differ from temp_output_path if AVI fallback is used).
    """
    import platform
    os.makedirs(os.path.dirname(temp_output_path), exist_ok=True)

    output_path = temp_output_path

    # On Windows, try Media Foundation (MSMF) first — uses native OS codecs,
    # no libopenh264 / FFmpeg DLL required.
    if platform.system() == 'Windows':
        for api_name, api_pref in [('MSMF', cv2.CAP_MSMF), ('DShow', cv2.CAP_DSHOW)]:
            try:
                # H264 via Media Foundation is the most compatible choice on Windows
                fourcc = cv2.VideoWriter_fourcc(*'H264')
                writer = cv2.VideoWriter(
                    output_path, api_pref, fourcc, fps,
                    (frame_width, frame_height)
                )
                if writer.isOpened():
                    print(f"[INFO] Video writer using {api_name} backend (H264)")
                    return writer, output_path
                writer.release()
            except Exception:
                pass

    # Fallback 1: FFmpeg with mp4v (no openh264 required)
    try:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, cv2.CAP_FFMPEG, fourcc, fps,
                                 (frame_width, frame_height))
        if writer.isOpened():
            print("[INFO] Video writer using FFmpeg backend (mp4v)")
            return writer, output_path
        writer.release()
    except Exception:
        pass

    # Fallback 2: FFmpeg without explicit API preference
    for codec in ['mp4v', 'avc1', 'XVID']:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        writer = cv2.VideoWriter(output_path, fourcc, fps,
                                 (frame_width, frame_height))
        if writer.isOpened():
            print(f"[INFO] Video writer using default backend ({codec})")
            return writer, output_path
        writer.release()

    # Last resort: AVI with XVID/MJPG (least efficient but most compatible)
    avi_path = output_path.rsplit('.', 1)[0] + '.avi'
    for codec in ['XVID', 'MJPG']:
        fourcc = cv2.VideoWriter_fourcc(*codec)
        writer = cv2.VideoWriter(avi_path, fourcc, fps,
                                 (frame_width, frame_height))
        if writer.isOpened():
            print(f"[WARN] Using AVI fallback with {codec} codec: {avi_path}")
            return writer, avi_path
        writer.release()

    raise RuntimeError(
        f"Unable to create video writer: {temp_output_path}. "
        "Install FFmpeg (ffmpeg.org) or try 'pip install opencv-contrib-python-headless'."
    )


def cleanup_temp_files(file_list, keep_temp_video=False):
    for file_path in file_list:
        if keep_temp_video and file_path and "temp_detect_" in os.path.basename(file_path):
            continue
        try:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
        except Exception as exc:
            print(f"Failed to remove temporary file {file_path}: {exc}")

    time.sleep(0.1)
