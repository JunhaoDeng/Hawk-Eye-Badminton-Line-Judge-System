"""Thin CLI wrapper around court.detector.auto_detect_court_corners().

This script loads the TEMPLATE image (not video screenshot) and auto-detects
court corners using the Good-Badminton detector. If --video-path is provided,
corners are scaled to match the video dimensions so that system.py's
perspective transform works correctly.

Usage:
    python badminton_analysis/utils/auto_detect_corners.py \\
        --image-path <template_path> \\
        --output-dir <path> \\
        [--video-path <path>]

Returns JSON to stdout:
    {success, corners: [[x,y],...], confidence: 0-1, strategy: "court_line", error: ""}
"""

import argparse
import json
import sys
import os

# Ensure project root is on sys.path so absolute imports work
# (the server sets PYTHONPATH, but add a fallback for direct CLI usage)
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

MAX_SCORE_REFERENCE = 250.0  # approximate ceiling for _score_court_quad


def _imread_unicode(path, flags=1):
    """cv2.imread that handles non-ASCII paths on Windows (e.g. Chinese characters)."""
    import cv2
    import numpy as np
    try:
        f = open(path, 'rb')
        try:
            data = np.frombuffer(f.read(), dtype=np.uint8)
        finally:
            f.close()
        return cv2.imdecode(data, flags)
    except Exception:
        return None


def _imwrite_unicode(path, img, ext='.png'):
    """cv2.imwrite that handles non-ASCII paths on Windows."""
    import cv2
    success, encoded = cv2.imencode(ext, img)
    if success:
        with open(path, 'wb') as f:
            f.write(encoded.tobytes())
        return True
    return False


def get_video_dimensions(video_path):
    """Return (width, height) of the video, or None if unreadable."""
    import cv2
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return (w, h)


def scale_corners(corners, scale_x, scale_y):
    """Scale corner coordinates by given factors."""
    return [[round(x * scale_x), round(y * scale_y)] for x, y in corners]


def main():
    parser = argparse.ArgumentParser(description='Auto-detect badminton court corners on template image')
    parser.add_argument('--image-path', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--video-path', default=None, help='Video path for scaling corners to video dimensions')
    args = parser.parse_args()

    try:
        import cv2
        import numpy as np
    except ModuleNotFoundError:
        result = {"success": False, "corners": None, "confidence": 0, "strategy": "none",
                  "error": "cv2/numpy not installed"}
        print(json.dumps(result))
        return

    # --- Load image ---
    image = _imread_unicode(args.image_path)
    if image is None:
        result = {"success": False, "corners": None, "confidence": 0, "strategy": "none",
                  "error": f"Cannot read image: {args.image_path}"}
        print(json.dumps(result))
        return

    # --- Get video dimensions for corner scaling ---
    video_dims = None
    if args.video_path:
        video_dims = get_video_dimensions(args.video_path)

    # --- Resize to fixed size for consistent detection (same as annotate_court) ---
    original_height, original_width = image.shape[:2]
    fixed_size = (1080, 720)
    resized = cv2.resize(image, fixed_size)

    try:
        from badminton_analysis.court.detector import auto_detect_court_corners, render_auto_court_preview
        from badminton_analysis.court.mapper import compute_expanded_roi
    except ImportError as e:
        result = {"success": False, "corners": None, "confidence": 0, "strategy": "none",
                  "error": f"Import error: {e}"}
        print(json.dumps(result))
        return

    corners_resized, line_mask, debug = auto_detect_court_corners(resized)

    if corners_resized is None:
        # Save debug preview on failure
        preview = render_auto_court_preview(resized, None, None, debug)
        preview_path = os.path.join(args.output_dir, 'auto_court_preview.png')
        _imwrite_unicode(preview_path, preview)

        result = {"success": False, "corners": None, "confidence": 0, "strategy": "none",
                  "error": "No reliable court boundary found"}
        print(json.dumps(result))
        return

    # Scale corners back to original image dimensions
    sx = original_width / fixed_size[0]
    sy = original_height / fixed_size[1]
    original_corners = [[int(round(x * sx)), int(round(y * sy))] for x, y in corners_resized]

    # If video dimensions differ from template dimensions, scale corners to match the video
    final_corners = original_corners
    if video_dims:
        video_w, video_h = video_dims
        if video_w != original_width or video_h != original_height:
            scale_x = video_w / original_width
            scale_y = video_h / original_height
            final_corners = scale_corners(original_corners, scale_x, scale_y)

    # Compute confidence from debug score
    score = debug.get("score", 0) or 0
    confidence = max(0.0, min(1.0, score / MAX_SCORE_REFERENCE))

    # Save preview (using original corners in original template space)
    roi = compute_expanded_roi(corners_resized, resized.shape)
    preview = render_auto_court_preview(resized, corners_resized, roi, debug)
    preview_path = os.path.join(args.output_dir, 'auto_court_preview.png')
    _imwrite_unicode(preview_path, preview)

    result = {
        "success": True,
        "corners": final_corners,
        "confidence": round(confidence, 4),
        "strategy": "court_line",
        "error": ""
    }
    print(json.dumps(result))

    # Write court_annotations.txt so system.py can use the corners
    annotations_path = os.path.join(args.output_dir, 'court_annotations.txt')
    os.makedirs(args.output_dir, exist_ok=True)

    # Use video dimensions for ROI computation if available, otherwise original template
    roi_shape = tuple(video_dims[::-1]) if video_dims else (original_height, original_width)
    from badminton_analysis.court.mapper import CourtMapper, compute_expanded_roi
    roi_corners = compute_expanded_roi(final_corners, roi_shape)
    court_mapper = CourtMapper(final_corners)
    mid_height = court_mapper.mid_height

    with open(annotations_path, 'w') as f:
        f.write(f"corners={final_corners}\n")
        f.write(f"roi_corners={roi_corners}\n")
        f.write(f"mid_height={mid_height}\n")
        f.write(f"template_shape={[roi_shape[0], roi_shape[1]]}\n")


if __name__ == "__main__":
    main()
