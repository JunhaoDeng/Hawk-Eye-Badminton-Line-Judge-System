#!/usr/bin/env python3
"""GPU capability detection for Good-Badminton.

Prints a JSON object describing CUDA / MPS availability and the recommended
inference device. Called by the Node.js health API via child_process.spawn.

Output format:
{
  "cuda_available": true/false,
  "cuda_device_name": "NVIDIA GeForce RTX 4090" or "",
  "mps_available": true/false,
  "recommended_device": "cuda" | "mps" | "cpu",
  "onnx_cuda": true/false
}
"""

import json
import sys


def detect_gpu():
    result = {
        "cuda_available": False,
        "cuda_device_name": "",
        "mps_available": False,
        "recommended_device": "cpu",
        "onnx_cuda": False,
    }

    # ---- PyTorch device detection -------------------------------------------
    try:
        import torch

        if torch.cuda.is_available():
            result["cuda_available"] = True
            try:
                result["cuda_device_name"] = torch.cuda.get_device_name(0)
            except Exception:
                result["cuda_device_name"] = "Unknown NVIDIA GPU"
            result["recommended_device"] = "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            result["mps_available"] = True
            result["recommended_device"] = "mps"
    except ImportError:
        pass

    # ---- ONNX Runtime provider detection -------------------------------------
    try:
        import onnxruntime as ort
        providers = ort.get_available_providers()
        result["onnx_cuda"] = "CUDAExecutionProvider" in providers
    except ImportError:
        pass

    return result


if __name__ == "__main__":
    # Use print() so that Node.js child_process can capture stdout cleanly.
    # rtmlib / onnxruntime may also print warnings to stderr, which we ignore.
    print(json.dumps(detect_gpu()))
