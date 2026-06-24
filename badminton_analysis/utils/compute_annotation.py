"""Compute court annotation data from 4 corner points and write court_annotations.txt.

This script receives 4 corner coordinates (from web canvas) in the original template
pixel space. If the video dimensions differ from the template, corners are scaled to
match the video resolution, so that system.py's perspective transform works correctly.

Usage:
    python -m badminton_analysis.utils.compute_annotation \
        --corners-json '[(100,200),(500,200),(500,800),(100,800)]' \
        --template-path templates/demo.png \
        --video-path videos/my_video.mp4 \
        --output-dir <path>

Returns JSON: {success, corners, roi_corners, mid_height} or {success, error}
"""

import argparse
import json
import sys
import os


def compute_annotation(corners_json: str, image_shape_json: str, output_dir: str) -> dict:
    try:
        import cv2
        import numpy as np
    except ModuleNotFoundError:
        return {"success": False, "error": "cv2/numpy not installed. Run: pip install -r requirements.txt"}

    try:
        corners = json.loads(corners_json)
        image_shape = json.loads(image_shape_json)
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON parse error: {e}"}

    if len(corners) != 4:
        return {"success": False, "error": f"Expected 4 corners, got {len(corners)}"}

    # Import compute_expanded_roi and CourtMapper from the project
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from badminton_analysis.court.mapper import CourtMapper, compute_expanded_roi

    # Compute ROI
    roi_corners = compute_expanded_roi(corners, image_shape)

    # Compute mid_height via CourtMapper
    court_mapper = CourtMapper(corners)
    mid_height = court_mapper.mid_height

    # Write court_annotations.txt in system.py compatible format
    annotations_path = os.path.join(output_dir, 'court_annotations.txt')
    os.makedirs(output_dir, exist_ok=True)

    with open(annotations_path, 'w') as f:
        f.write(f"corners={corners}\n")
        f.write(f"roi_corners={roi_corners}\n")
        f.write(f"mid_height={mid_height}\n")
        f.write(f"template_shape={image_shape}\n")

    return {
        "success": True,
        "corners": corners,
        "roi_corners": roi_corners,
        "mid_height": mid_height,
        "annotations_path": annotations_path
    }


def scale_corners(corners, scale_x, scale_y):
    """Scale corner coordinates by given factors."""
    return [[round(x * scale_x), round(y * scale_y)] for x, y in corners]


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


def main():
    parser = argparse.ArgumentParser(description="Compute court annotation from 4 corner points")
    parser.add_argument("--corners-json", required=True, help="JSON array of 4 corner points [[x1,y1],...]")
    parser.add_argument("--image-shape-json", default=None, help="JSON array [height, width] of the template image")
    parser.add_argument("--template-path", default=None, help="Path to template image (reads dimensions from file)")
    parser.add_argument("--video-path", default=None, help="Path to video file (for scaling corners to video dimensions)")
    parser.add_argument("--output-dir", required=True, help="Directory to write court_annotations.txt")
    args = parser.parse_args()

    # Get image shape from template-path if provided, otherwise from image-shape-json
    image_shape_json = args.image_shape_json
    if args.template_path:
        try:
            import cv2
            tmpl = cv2.imread(args.template_path)
            if tmpl is not None:
                h, w = tmpl.shape[:2]
                image_shape_json = json.dumps([h, w])
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read template: {e}"}))
            sys.exit(1)

    if not image_shape_json:
        print(json.dumps({"success": False, "error": "Either --image-shape-json or --template-path is required"}))
        sys.exit(1)

    # Scale corners if video dimensions differ from template dimensions
    corners = json.loads(args.corners_json)
    if args.video_path and args.template_path:
        video_dims = get_video_dimensions(args.video_path)
        if video_dims:
            import cv2
            tmpl = cv2.imread(args.template_path)
            if tmpl is not None:
                tpl_h, tpl_w = tmpl.shape[:2]
                video_w, video_h = video_dims
                if tpl_w != video_w or tpl_h != video_h:
                    scale_x = video_w / tpl_w
                    scale_y = video_h / tpl_h
                    corners = scale_corners(corners, scale_x, scale_y)
                    args.corners_json = json.dumps(corners)
                    # Also update image_shape for ROI computation
                    image_shape_json = json.dumps([video_h, video_w])

    result = compute_annotation(args.corners_json, image_shape_json, args.output_dir)
    print(json.dumps(result))
    if not result["success"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
