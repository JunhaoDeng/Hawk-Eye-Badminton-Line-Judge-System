# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 项目概述

Good-Badminton 是一个基于计算机视觉的羽毛球比赛视频分析工具，能够检测球员姿态、追踪羽毛球、映射球场坐标、统计运动数据，并输出带标注的分析视频。

## 常用命令

### 环境准备

```bash
# 创建虚拟环境并安装依赖（macOS/Linux）
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 运行分析

```bash
# 基础运行（首次会弹出文件选择框让你选球场模板图）
python main.py --video-path videos/demo.mp4

# 指定模板图（无界面/headless 环境必须传此参数）
python main.py --video-path videos/demo.mp4 --template-path templates/demo.png

# 使用 RTMO 轻量模型
python main.py --video-path videos/demo.mp4 --pose-family rtmo --pose-mode lightweight

# 使用 YOLO Pose
python main.py --video-path videos/demo.mp4 --pose-family yolo-pose --yolo-pose-model yolo11n-pose.pt

# 英文界面输出
python main.py --video-path videos/demo.mp4 --language en

# 不显示预览窗口（适合服务器环境）
python main.py --video-path videos/demo.mp4 --display false --template-path templates/demo.png
```

### 验证 GPU 加速

```bash
python -c "import torch; print('cuda:', torch.cuda.is_available())"
python -c "import onnxruntime as ort; print(ort.get_available_providers())"
```

## 代码架构

### 入口流程

`main.py` 解析命令行参数，调用 `load_runtime_dependencies()` 延迟加载重型依赖（确保 `--help` 快速响应），然后构造 `BadmintonAnalysisSystem` 并调用 `process_video()`，最后调用 `analyze_player_positions()` 生成热力图/散点图。

### 核心模块职责

| 路径 | 职责 |
|------|------|
| `badminton_analysis/system.py` | 主流程编排类 `BadmintonAnalysisSystem`，逐帧处理、回合检测状态机、资源管理 |
| `badminton_analysis/court/mapper.py` | `CourtMapper`：透视变换，图像坐标 ↔ 球场米制坐标（6.1m×13.4m）；`annotate_court()`：交互式四点标注工具 |
| `badminton_analysis/detection/rtmpose.py` | `RTMPoseProcessor`：RTMPose / RTMO 多档位人体姿态检测（ONNX） |
| `badminton_analysis/detection/yolo_pose.py` | `YOLOPoseProcessor`：Ultralytics YOLO Pose 姿态检测 |
| `badminton_analysis/detection/shuttlecock.py` | `ShuttlecockTracker`：YOLO 羽毛球检测 + 轨迹管理 |
| `badminton_analysis/tracking/player.py` | `PlayerTracker`：球员质心追踪、上下半场分配、移动距离/速度统计 |
| `badminton_analysis/visualization/court_trajectory.py` | `CourtTrajectoryVisualizer`：球场轨迹叠加层渲染 |
| `badminton_analysis/visualization/player_pose.py` | `PlayerPoseVisualizer`：骨架绘制、球员 ROI 裁剪 |
| `badminton_analysis/visualization/stats.py` | `StatsVisualizer`：画面统计信息文字渲染 |
| `badminton_analysis/visualization/player_positions_zh.py` | 生成中文热力图/散点图 |
| `badminton_analysis/visualization/player_positions_en.py` | 生成英文热力图/散点图 |
| `badminton_analysis/data/writer.py` | `JsonlDetectionWriter`：逐帧检测结果写入 `detections.jsonl` |
| `badminton_analysis/media/video_audio.py` | 视频写入器配置、FFmpeg 音频合并 |

### 关键设计点

**球场标注缓存**：`court_annotations.txt` 保存在 `results/<视频名>/` 下，下次运行同一输出目录会自动复用，不会重复要求标注。删除该文件可重新标注。

**回合检测状态机**：`is_court_view()` 用 `cv2.matchTemplate` 将当前帧与模板图比对（阈值 0.75）。连续 5 帧匹配到 → 回合开始；连续 5 帧未匹配 → 回合结束。非球场视图帧不做姿态/羽毛球检测，直接透传。

**姿态检测 ROI**：`compute_expanded_roi()` 根据四个球场角点自动生成矩形检测区域（横向 8% padding，纵向撑满画面高度），姿态推理只在此区域内执行；羽毛球检测仍在全帧上执行。

**坐标系统**：原点在球场左下角，X 轴为宽度方向（0~6.1m），Y 轴为长度方向（0~13.4m），中线在 Y=6.7m 处，以此区分上下半场球员。

### 输出文件结构

```
results/<视频名>/
├── detect_<视频名>.mp4        # 带标注的输出视频
├── detections.jsonl           # 逐帧检测记录（含回合编号、球场坐标、速度）
├── metadata.json              # 视频/模型/球场参数元数据
├── court_annotations.txt      # 四点标注缓存
├── detect_images/             # --save-images 时保存的逐帧图像
└── position_visualizations/
    ├── heatmaps/              # 球员位置热力图（match + 各回合）
    └── scatter_plots/         # 球员位置散点图
```

## 模型权重

所有权重放在 `weights/` 目录：

- `yolo11s-ball.pt`：羽毛球 YOLO 检测模型，从 GitHub Release 下载
- `yolox_nano_8xb8-300e_humanart-40f6f0d0.onnx`：YOLOX 人体检测（RTMPose 两阶段第一阶段）
- `rtmpose-s_simcc-body7_pt-body7_420e-256x192-acd4a1ef_20230504.onnx`：RTMPose 姿态估计
- `rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.onnx`：RTMO 一阶段姿态估计

本地权重文件不存在时 `rtmlib` 可能尝试在线下载到用户缓存目录。

## 注意事项

- 系统要求安装 **FFmpeg** 并加入 `PATH`（用于音频处理）；无 FFmpeg 时可传 `--audio false` 跳过。
- headless 服务器环境须传 `--template-path` 和 `--display false`，否则会尝试弹出 GUI 窗口。
- GPU 版本需先卸载 CPU 版 `onnxruntime` 再安装 `onnxruntime-gpu`，两者不能共存。
- `court_annotations.txt` 使用 `eval()` 解析，不应手动修改为非 Python 字面量格式。
