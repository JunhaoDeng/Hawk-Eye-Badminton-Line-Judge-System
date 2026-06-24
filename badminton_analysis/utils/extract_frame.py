"""Extract a frame from a video at a given timestamp and save as PNG.

Usage:
    python -m badminton_analysis.utils.extract_frame \
        --video-path <path> \
        --output-path <path> \
        --timestamp <seconds>

Returns JSON: {success, frame_path, width, height} or {success, error}
"""

import argparse
import json
import sys


def extract_frame(video_path: str, output_path: str, timestamp: float = 2.0) -> dict:
    try:
        import cv2
    except ModuleNotFoundError:
        return {"success": False, "error": "cv2 not installed. Run: pip install -r requirements.txt"}

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"success": False, "error": f"Cannot open video: {video_path}"}

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    frame_number = int(timestamp * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)

    ret, frame = cap.read()
    cap.release()

    if not ret:
        return {"success": False, "error": f"Cannot read frame at {timestamp}s"}

    import os
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    cv2.imwrite(output_path, frame)

    height, width = frame.shape[:2]
    return {"success": True, "frame_path": output_path, "width": width, "height": height}


def main():
    parser = argparse.ArgumentParser(description="Extract frame from video")
    parser.add_argument("--video-path", required=True, help="Path to input video")
    parser.add_argument("--output-path", required=True, help="Path to output PNG")
    parser.add_argument("--timestamp", type=float, default=2.0, help="Timestamp in seconds (default: 2.0)")
    args = parser.parse_args()

    result = extract_frame(args.video_path, args.output_path, args.timestamp)
    print(json.dumps(result))
    if not result["success"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
