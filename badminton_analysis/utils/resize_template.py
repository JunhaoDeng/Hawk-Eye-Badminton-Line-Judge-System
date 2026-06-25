"""Resize a court template image to match the video dimensions.

The court template is used by cv2.matchTemplate() in system.py's is_court_view().
The template MUST be <= the video frame size, otherwise matchTemplate returns
empty results and every frame is treated as "non-court view" — no detection happens.

Usage:
    python resize_template.py --template-path templates/demo.png \
        --video-path videos/my_video.mp4 --output-path results/my_video/template.png
"""
import argparse
import json
import sys
import cv2


def _imread_unicode(path, flags=cv2.IMREAD_COLOR):
    """cv2.imread that handles non-ASCII paths on Windows (e.g. Chinese characters)."""
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
    success, encoded = cv2.imencode(ext, img)
    if success:
        with open(path, 'wb') as f:
            f.write(encoded.tobytes())
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description='Resize template to match video dimensions')
    parser.add_argument('--template-path', required=True, help='Path to the original court template')
    parser.add_argument('--video-path', required=True, help='Path to the video file')
    parser.add_argument('--output-path', required=True, help='Where to save the resized template')
    args = parser.parse_args()

    try:
        # Read template (using _imread_unicode for non-ASCII paths on Windows)
        template = _imread_unicode(args.template_path)
        if template is None:
            print(json.dumps({"success": False, "error": f"Cannot read template: {args.template_path}"}))
            sys.exit(1)

        # Get video dimensions
        cap = cv2.VideoCapture(args.video_path)
        if not cap.isOpened():
            print(json.dumps({"success": False, "error": f"Cannot open video: {args.video_path}"}))
            sys.exit(1)

        video_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        video_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        tpl_h, tpl_w = template.shape[:2]

        if tpl_w <= video_w and tpl_h <= video_h:
            # Template already fits, just copy
            _imwrite_unicode(args.output_path, template)
            print(json.dumps({
                "success": True,
                "resized": False,
                "template_size": [tpl_w, tpl_h],
                "video_size": [video_w, video_h]
            }))
            return

        # Calculate scale factor (fit within video dimensions while maintaining aspect ratio)
        scale = min(video_w / tpl_w, video_h / tpl_h)
        new_w = int(tpl_w * scale)
        new_h = int(tpl_h * scale)

        resized = cv2.resize(template, (new_w, new_h), interpolation=cv2.INTER_AREA)
        _imwrite_unicode(args.output_path, resized)

        print(json.dumps({
            "success": True,
            "resized": True,
            "original_size": [tpl_w, tpl_h],
            "resized_size": [new_w, new_h],
            "video_size": [video_w, video_h],
            "scale": scale
        }))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
