# Good-Badminton: AI 羽毛球鹰眼系统 🏸

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/yo-WASSUP/Good-Badminton?style=social)](https://github.com/yo-WASSUP/Good-Badminton/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yo-WASSUP/Good-Badminton?style=social)](https://github.com/yo-WASSUP/Good-Badminton/network/members)
[![GitHub license](https://img.shields.io/github/license/yo-WASSUP/Good-Badminton)](https://github.com/yo-WASSUP/Good-Badminton/blob/main/LICENSE)

**基于计算机视觉的羽毛球比赛视频分析工具 — 支持 CLI 命令行 + Web 管理界面**

[中文](README.md) | [English](README_EN.md)

</div>

## 🎬 效果预览

![Good-Badminton 分析结果预览](assets/demo.gif)

视频预览文件在 `assets/demo.mp4`。

---

## 🆕 更新日志

- **2026-06-27**：新增 **AI 大模型球场标注** 功能 — 支持接入 OpenAI 兼容的视觉大模型（如 GPT-4o、Qwen-VL、DeepSeek 等）自动识别球场角点；提供模型管理面板，可配置多个 API 密钥和模型，一键切换；支持推理模型（reasoning model）；LLM 检测失败时自动回退到 CV 检测结果；LLM 视觉模型与 CV 算法协同标注，覆盖更多复杂球场场景。
- **2026-06-24**：新增 NVIDIA CUDA GPU 推理加速支持（YOLO + ONNX Runtime 全面 GPU 加速）；前端设备选择器新增 CUDA 按钮，与 MPS 互斥；新增 `requirements-cuda.txt` 和 GPU 检测脚本。修复可视化 Y 轴方向（上半场/下半场球员不再标反）；优化 Web 端标注流程（默认手动标注，自动检测仅预览）；修复快速标注坐标缩放问题；修复 Windows MSMF 后端输出 FMP4 编码导致浏览器无法播放视频的问题（引入 `imageio-ffmpeg` 自动转码为 H.264，系统 FFmpeg 缺失时仍可正常输出浏览器兼容视频）。
- **2026-06-23**：新增 Web 管理界面（React + Koa + MongoDB），支持用户注册/登录、视频上传、批量分析、历史记录管理、分析结果在线预览与下载。新增 MPS（Apple Silicon GPU）推理加速选项。
- **2026-06-20**：正式开源。
- **当前版本**：球员姿态检测、羽毛球检测追踪、球场坐标映射、回合自动检测、运动统计、热力图/散点图、带标注视频输出。

---

## ✨ 功能特性

### AI 视频分析

- **球员姿态检测** — 支持 RTMPose、RTMO 和 Ultralytics YOLO Pose 三种姿态模型，识别人体 17 个关键点
- **羽毛球检测与追踪** — YOLO 模型实时检测羽毛球位置，卡尔曼滤波轨迹追踪，支持轨迹可视化
- **球场坐标映射** — 手动或自动标注球场四角，将像素坐标转换为标准球场米制坐标（6.1m × 13.4m）
- **回合自动检测** — 基于模板匹配的状态机，连续 5 帧匹配到球场视图则判定回合开始，连续 5 帧未匹配则判定回合结束
- **球员追踪** — 区分上/下半场球员，支持单打/双打模式，逐球员追踪质心位置
- **运动统计** — 累计移动距离、瞬时速度、最大速度、回合数量
- **位置可视化** — 自动生成每场比赛和各回合的球员位置热力图与散点图
- **GPU 加速** — 支持 NVIDIA CUDA 和 Apple Silicon MPS（Metal Performance Shaders），前端可一键切换

### AI 大模型球场标注 🆕

- **视觉大模型角点检测** — 接入 OpenAI 兼容的视觉大模型（GPT-4o、Qwen-VL、DeepSeek 等）自动识别球场四角，精度远超纯 CV 算法
- **模型管理面板** — Web 端可视化配置多个 API 密钥和模型，一键切换当前使用的模型
- **推理模型支持** — 兼容 reasoning model（如 DeepSeek-R1），自动从推理轨迹中提取角点坐标
- **两阶段协同标注** — CV 算法先进行粗略检测作为提示，视觉大模型在提示基础上精修到像素级精度
- **智能回退** — LLM 重试 3 次仍失败时，自动回退到 CV 检测结果，保证标注流程不中断

### Web 管理平台

- **用户系统** — 邮箱注册/登录，JWT 认证
- **视频上传** — 支持单文件/批量上传，拖拽上传，自动提取视频首帧截图
- **球场标注** — Web 端交互式四点标注，支持自动角点检测预览（背景建模 + 边缘分析），可微调后确认
- **分析管理** — 一键启动分析，实时查看进度，支持最多 2 个并发任务
- **结果浏览** — 在线播放带标注视频，查看热力图/散点图，下载分析结果
- **历史记录** — 分页查看所有分析记录，按状态筛选，支持删除
- **模型管理** — 配置 OpenAI 兼容的视觉大模型 API，用于 AI 球场角点自动检测，支持多模型切换

### 可视化叠加层（全部可独立开关）

- 人体骨架与关键点
- 球员移动轨迹（像素坐标叠加）
- 球场俯视轨迹（球场坐标系叠加）
- 羽毛球轨迹
- 球员统计信息（距离、速度、回合）
- 中英文双语界面

---

## 📋 系统要求

| 组件 | 要求 |
|------|------|
| Python | 3.8+ |
| Node.js | 18+（Web 管理平台需要） |
| MongoDB | 4.0+（Web 管理平台需要） |
| FFmpeg | 推荐安装并加入系统 PATH（可选：`pip install imageio-ffmpeg` 提供自动回退） |
| GPU（可选） | NVIDIA CUDA 12.x / Apple Silicon MPS |

---

## 🚀 快速开始

### 方式一：命令行运行（轻量，无需 Web）

```bash
# 1. 创建虚拟环境
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .\.venv\Scripts\activate  # Windows

# 2. 安装依赖
pip install -r requirements.txt

# 3. 下载羽毛球检测模型（从 GitHub Release 下载 yolo11s-ball.pt 放到 weights/ 目录）

# 4. 运行分析
python main.py --video-path videos/demo.mp4
```

首次运行会弹出文件选择框让你选一张球场模板图，然后交互式标注球场四角。标注结果会缓存，后续运行同一视频无需重复标注。

### 方式二：Web 管理平台运行（完整功能）

#### 前提条件

- **MongoDB** 已安装并启动（默认连接 `mongodb://127.0.0.1:27017/badminton_analysis`）
  ```bash
  # macOS（Homebrew 安装）
  brew install mongodb-community
  brew services start mongodb-community

  # 验证
  mongosh --eval "db.version()"
  ```
- **Python 虚拟环境** 已创建并安装依赖（参考上方"方式一"）

#### 步骤一：配置

```bash
cd server
npm install

cd ../frontend
npm install
```

编辑 `server/config/dev.json`（开发环境）或 `server/config/default.json`（生产环境），确保路径正确：

```json
{
  "port": 9000,
  "mongodb": {
    "host": "mongodb://127.0.0.1:27017/badminton_analysis"
  },
  "pythonPath": ".venv/bin/python",
  "projectRoot": ".."
}
```

关键配置项：

| 字段 | 说明 | 示例 |
|------|------|------|
| `port` | 后端监听端口 | `9000` |
| `mongodb.host` | MongoDB 连接地址 | `mongodb://127.0.0.1:27017/badminton_analysis` |
| `pythonPath` | Python 解释器路径（相对于 server 目录或绝对路径） | `.venv/bin/python` 或 `/usr/bin/python3` |
| `projectRoot` | 项目根目录相对于 server 的路径 | `..` |
| `maxConcurrent` | 最大并发分析任务数（默认 `default.json`） | `2` |

#### 步骤二：启动服务

**手动启动**：

```bash
# 后端（端口 9000）
cd server
NODE_ENV=dev node index.js

# 前端（端口 3000），另开终端
cd frontend
npx vite --host 0.0.0.0 --port 3000
```

**PM2 一键启动（推荐）**：

项目已包含 `ecosystem.config.js`，可使用 PM2 同时管理前后端：

```bash
# 安装 PM2（如已安装可跳过）
npm install -g pm2

# 一键启动前后端
pm2 start ecosystem.config.js

# 查看日志
pm2 logs

# 其他常用命令
pm2 status          # 查看进程状态
pm2 restart all     # 重启所有服务
pm2 stop all        # 停止所有服务
pm2 delete all      # 删除所有进程
pm2 save            # 保存进程列表（配合 pm2 startup 实现开机自启）
```

看到以下输出表示启动成功：
```
Badminton Analysis Server running at http://localhost:9000
VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:3000/
```

验证后端是否正常：
```bash
curl http://localhost:9000/api/v1/health
# 返回 {"code":200,"success":true,"msg":"ok","data":{"status":"running"}}
```

#### 步骤三：打开浏览器

访问 `http://localhost:3000` → 注册账号 → 登录 → 上传视频 → 标注球场 → 启动分析 → 查看结果

> **后端启动 FAQ：**
> - Q: 启动报 `connect ECONNREFUSED 127.0.0.1:27017`？→ MongoDB 未启动，先执行 `brew services start mongodb-community`
> - Q: 分析任务报 `spawn python ENOENT`？→ `pythonPath` 配置路径不正确，检查 `config/dev.json`
> - Q: 端口 9000 被占用？→ 修改 `config/dev.json` 中的 `port`，同时更新 `frontend/vite.config.js` 中的 proxy 地址
> - Q: Windows 下 MongoDB 怎么装？→ 下载 [MongoDB Community Server](https://www.mongodb.com/try/download/community) 安装包，或使用 Docker

> **提示**：前端（3000 端口）通过 Vite 代理转发 API 请求到后端（9000 端口），开发时前端会自动热更新。

---

## 🧭 Web 平台工作流程

```
注册/登录 → 上传视频 → 标注球场（手动 / CV自动 / AI大模型自动）→ 启动分析 → 查看结果 → 下载
```

| 步骤 | 页面 | 说明 |
|------|------|------|
| 注册/登录 | `/login` | 邮箱 + 密码注册，JWT 30 天有效 |
| 上传视频 | `/upload` | 支持拖拽上传、选择单打/双打模式、CPU/MPS NVIDIA GPU 切换 |
| 球场标注 | `/annotate/:id` | 三种方式：①手动点击四角点标注 ②CV 自动检测（背景建模+线检测）生成预览后微调 ③AI 大模型视觉检测（需先配置模型），精度最高 |
| 启动分析 | `/analysis/:id` | 一键触发分析，实时轮询进度，完成后可跳转结果页 |
| 查看结果 | `/results/:id` | 在线播放标注视频，浏览热力图/散点图，下载 JSONL 数据 |
| 历史记录 | `/history` | 分页查看所有分析任务，按状态筛选，支持删除 |

---

## 📝 命令行使用详解

### 基础运行

```bash
python main.py --video-path videos/demo.mp4
```

### 完整参数列表

```text
--video-path                 输入视频路径（必填）
--output-dir                 输出目录，默认 results/<视频文件名>
--ball-model                 YOLO 羽毛球检测模型路径，默认 weights/yolo11s-ball.pt
--pose-family                姿态模型族：rtmpose（默认）、rtmo、yolo-pose
--pose-mode                  模型档位：lightweight / balanced（默认）/ performance
--yolo-pose-model            YOLO Pose 模型路径，默认 yolo11n-pose.pt
--template-path              球场模板图路径（不传则弹出文件选择框）
--mode                       比赛模式：singles（单打，默认）/ doubles（双打）
--device                     推理设备：cpu（默认）/ mps（Apple Silicon GPU）/ cuda（NVIDIA GPU）
--language                   界面语言：zh（中文，默认）/ en（英文）

--pose-roi true|false                显示姿态检测 ROI 框（默认 true）
--display true|false                 显示 OpenCV 预览窗口（默认 true）
--skeletons true|false               显示人体骨架（默认 true）
--player-trajectories true|false     显示球员轨迹（默认 true）
--court-trajectory true|false        显示球场俯视轨迹（默认 true）
--shuttlecock-trajectory true|false  显示羽毛球轨迹（默认 true）
--player-stats true|false            显示球员统计信息（默认 true）
--visualize-positions true|false     生成热力图和散点图（默认 true）
--audio true|false                   保留原视频音频（默认 true）

--save-images                        保存处理后的每帧图像
--performance-stats                  打印性能耗时统计
```

### 姿态模型选择示例

```bash
# 两阶段 RTMPose（默认，精度较高，速度适中）
python main.py --video-path videos/demo.mp4 --pose-family rtmpose --pose-mode balanced

# 一阶段 RTMO（轻量，速度更快）
python main.py --video-path videos/demo.mp4 --pose-family rtmo --pose-mode lightweight

# YOLO Pose（Ultralytics 生态，部署简单）
python main.py --video-path videos/demo.mp4 --pose-family yolo-pose --yolo-pose-model yolo11n-pose.pt

# 双打模式 + MPS GPU 加速（Apple Silicon Mac）
python main.py --video-path videos/demo.mp4 --mode doubles --device mps
```

### GPU 加速配置

#### Apple Silicon (M1/M2/M3/M4) — MPS

```bash
python main.py --video-path videos/demo.mp4 --device mps
```

MPS 模式下 YOLO 模型（羽毛球检测 + YOLO-Pose）使用 Apple GPU 加速，RTMPose/RTMO（ONNX Runtime）因 rtmlib 限制仍用 CPU，但已获得主要加速。

#### NVIDIA GPU — CUDA（Windows / Linux）

**前置要求**：
- 已安装 NVIDIA 显卡驱动，`nvidia-smi` 可以正常输出显卡信息
- 推荐使用 CUDA 12.1 对应的 PyTorch wheel

**安装步骤**：
```bash
# 1. 卸载 CPU 版依赖
pip uninstall -y torch torchvision onnxruntime onnxruntime-gpu

# 2. 安装 CUDA 版 PyTorch
pip install torch==2.5.1+cu121 torchvision==0.20.1+cu121 --index-url https://download.pytorch.org/whl/cu121

# 3. 安装其余依赖（含 onnxruntime-gpu）
pip install -r requirements-cuda.txt
```

**验证 GPU 是否生效**：
```bash
python -c "import torch; print('torch:', torch.__version__); print('cuda:', torch.cuda.is_available()); print('gpu:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'not available')"
python -c "import onnxruntime as ort; print(ort.__version__); print(ort.get_available_providers())"
```

期望看到：
```text
cuda: True
CUDAExecutionProvider
```

**注意事项**：
- 安装 GPU 版 ONNX Runtime 后，`pip check` 可能提示 `rtmlib requires onnxruntime, which is not installed`。只要 provider 验证能看到 `CUDAExecutionProvider`，就不要再安装 CPU 版 `onnxruntime`，否则会覆盖 GPU 包。
- CUDA 模式下所有推理模块（YOLO 羽毛球检测、YOLO Pose、RTMPose/RTMO ONNX）均使用 GPU，是全面加速模式。
- Web 管理平台会自动检测 GPU 类型，NVIDIA 和 Apple GPU 按钮互斥，不可同时选择。

**切回 CPU 版**：
```bash
pip install --force-reinstall -r requirements.txt
```

### 球场标注说明

第一次运行某个视频时，需要标注球场四角：

1. 程序会打开标注窗口，顶部提示操作步骤
2. 按顺序点击球场四个角点：**左上 → 右上 → 右下 → 左下**
3. 点击完成后窗口显示绿色球场框和蓝色姿态检测 ROI 框
4. 标注结果保存到 `results/<视频名>/court_annotations.txt`，后续运行自动复用

**为什么需要标注？**
- 四角点用于建立图像坐标到标准球场坐标的透视映射
- 球员过滤依赖球场坐标，可排除观众、裁判等场外人员
- 上下半场判断、距离/速度统计、热力图/散点图均依赖该映射
- 姿态检测 ROI 由球场范围自动扩展生成，仅用于缩小推理区域、提升速度
- 更换视频视角或模板图后，需删除 `court_annotations.txt` 重新标注

---

## 📊 输出结果

默认输出目录 `results/<视频文件名>/`：

```
results/<视频名>/
├── detect_<视频名>.mp4              # 带标注的输出视频
├── detections.jsonl                 # 逐帧检测记录（含回合编号、球场坐标、速度）
├── metadata.json                    # 视频/模型/球场标注元数据
├── court_annotations.txt            # 球场四点标注缓存
├── detect_images/                   # --save-images 时保存的逐帧图像
└── position_visualizations/
    ├── heatmaps/                    # 球员位置热力图（match + 各回合）
    └── scatter_plots/               # 球员位置散点图
```

### 位置可视化示例

| 热力图 | 散点图 |
|:---:|:---:|
| ![热力图示例](assets/match_heatmap.png) | ![散点图示例](assets/match_scatter.png) |

---

## 📦 模型准备

羽毛球检测模型 `yolo11s-ball.pt` 需从 [GitHub Release](https://github.com/yo-WASSUP/Good-Badminton/releases) 下载并放入 `weights/` 目录。

姿态模型可放入本地文件（`rtmlib` 会自动检测并使用）：

```
weights/
├── yolo11s-ball.pt                                          # 羽毛球检测（必下载）
├── yolox_nano_8xb8-300e_humanart-40f6f0d0.onnx              # YOLOX 人体检测（RTMPose 两阶段）
├── rtmpose-s_simcc-body7_pt-body7_420e-256x192-acd4a1ef_20230504.onnx  # RTMPose 姿态估计
└── rtmo-s_8xb32-600e_body7-640x640-dac2bf74_20231211.onnx   # RTMO 一阶段姿态
```

若本地文件不存在，`rtmlib` 会尝试在线下载到用户缓存目录。

---

## 🧩 项目结构

```
Good-Badminton/
├── main.py                          # CLI 入口（argparse 参数解析）
├── requirements.txt                 # Python 依赖（通用 / CPU）
├── requirements-cuda.txt            # NVIDIA CUDA GPU 依赖
├── requirements-intel-cpu.txt       # Intel CPU 优化版依赖
├── badminton_analysis/              # Python 核心分析包
│   ├── __init__.py                  # 包标识，__version__ = "0.1.0"
│   ├── system.py                    # 主流程编排（逐帧处理、回合检测状态机）
│   ├── court/
│   │   ├── mapper.py                # 球场映射（透视变换、标注 GUI、ROI 生成）
│   │   └── detector.py              # 球场角点自动检测（线检测 + 四边形拟合）
│   ├── data/
│   │   └── writer.py                # 检测结果写入（JSONL + JSON）
│   ├── detection/
│   │   ├── rtmpose.py               # RTMPose/RTMO 姿态检测器（ONNX Runtime + rtmlib）
│   │   ├── yolo_pose.py             # YOLO Pose 姿态检测器（Ultralytics）
│   │   └── shuttlecock.py           # 羽毛球检测追踪器（YOLO + 卡尔曼滤波）
│   ├── media/
│   │   └── video_audio.py           # 视频写入 & FFmpeg 音频合并
│   ├── tracking/
│   │   └── player.py                # 球员追踪器（质心追踪、上下半场分配、移动统计）
│   ├── visualization/
│   │   ├── court_trajectory.py      # 球场俯视轨迹叠加
│   │   ├── player_pose.py           # 骨架绘制 & 球员 ROI
│   │   ├── player_positions_zh.py   # 中文热力图/散点图生成
│   │   ├── player_positions_en.py   # 英文热力图/散点图生成
│   │   └── stats.py                 # 画面统计信息文字渲染
│   └── utils/
│       ├── auto_detect_corners.py   # 自动球场角点检测（CLI 入口）
│       ├── compute_annotation.py    # 从角点计算 ROI & 中线
│       ├── extract_frame.py         # 视频帧提取
│       └── resize_template.py       # 模板图尺寸适配
├── server/                          # Node.js 后端 (Koa + MongoDB)
│   ├── index.js                     # 服务入口（路由、JWT 认证、静态文件）
│   ├── package.json
│   ├── config/
│   │   ├── default.json             # 默认配置（端口、MongoDB、Python 路径）
│   │   └── dev.json                 # 开发环境配置
│   ├── api/
│   │   ├── auth.js                  # 注册/登录（bcrypt + JWT）
│   │   ├── health.js                # 健康检查
│   │   ├── video.js                 # 核心 API（上传、标注、分析、结果、下载）
│   │   └── modelConfig.js           # AI 模型配置 CRUD API
│   ├── models/                      # Mongoose 数据模型
│   │   ├── base/model.js            # 基础模型类
│   │   ├── user.js                  # 用户模型
│   │   ├── analysis.js              # 分析任务模型
│   │   └── modelConfig.js           # AI 大模型配置模型
│   ├── plugins/
│   │   └── mongoose.js              # MongoDB 连接插件（自动加载 models）
│   ├── services/
│   │   └── llmCornerService.js      # AI 大模型球场角点检测服务
│   └── utils/
│       ├── processPool.js           # 并发控制（最多 2 个分析任务同时运行）
│       └── pythonResolver.js        # 跨平台 Python 路径解析
├── frontend/                        # React 前端 (Vite + TailwindCSS)
│   ├── vite.config.js               # Vite 配置（代理到后端 9000）
│   ├── package.json
│   └── src/
│       ├── main.jsx                 # 前端入口
│       ├── App.jsx                  # 路由配置
│       ├── api.js                   # API 客户端（axios）
│       ├── components/
│       │   ├── UserMenu.jsx         # 用户菜单组件
│       │   └── ModelManagementModal.jsx  # AI 模型管理面板
│       └── pages/
│           ├── Login.jsx            # 登录页
│           ├── Upload.jsx           # 上传页（模式选择、设备切换、拖拽上传）
│           ├── Annotate.jsx         # 球场标注页（Web 交互式四点标注）
│           ├── Analysis.jsx         # 分析页（触发分析 + 实时进度轮询）
│           ├── Results.jsx          # 结果页（视频播放、热力图/散点图浏览）
│           ├── History.jsx          # 历史记录页（分页列表、状态筛选、删除）
│           └── BatchProgress.jsx    # 批量上传进度页
├── assets/                          # README 配图 & 示例
├── templates/                       # 球场模板图
├── weights/                         # 模型权重（需自行下载）
├── videos/                          # 输入视频目录
└── results/                         # 分析输出目录
```

---

## 📊 API 路由一览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|:---:|
| POST | `/api/v1/auth/register` | 用户注册 | ✗ |
| POST | `/api/v1/auth/login` | 用户登录 | ✗ |
| GET | `/api/v1/health` | 健康检查 | ✗ |
| POST | `/api/v1/video/upload` | 上传单视频 | ✓ |
| POST | `/api/v1/video/batch-upload` | 批量上传视频 | ✓ |
| GET | `/api/v1/video/list` | 获取分析列表 | ✓ |
| GET | `/api/v1/video/status/:id` | 获取分析状态 | ✓ |
| POST | `/api/v1/video/annotate/:id` | 保存球场标注 | ✓ |
| POST | `/api/v1/video/auto-annotate/:id` | 触发自动标注 | ✓ |
| POST | `/api/v1/video/auto-detect-preview/:id` | 自动角点检测预览 | ✓ |
| POST | `/api/v1/video/analyze/:id` | 启动分析 | ✓ |
| GET | `/api/v1/video/results/:id` | 获取分析结果 | ✓ |
| GET | `/api/v1/video/download/:type/:id` | 下载结果文件 | ✓ |
| DELETE | `/api/v1/video/:id` | 删除分析记录 | ✓ |
| GET | `/api/v1/video/screenshot/:id` | 获取视频截图 | ✗ |
| GET | `/api/v1/video/template/:id` | 获取球场模板图 | ✗ |
| POST | `/api/v1/video/llm-annotate/:id` | 触发 AI 大模型球场标注 | ✓ |
| GET | `/api/v1/models` | 获取已配置的 AI 模型列表 | ✓ |
| POST | `/api/v1/models` | 添加新的 AI 模型配置 | ✓ |
| PUT | `/api/v1/models/:id/set-default` | 切换当前使用的 AI 模型 | ✓ |
| DELETE | `/api/v1/models/:id` | 删除 AI 模型配置 | ✓ |

---

## 🧠 技术架构要点

### 坐标系统
- 原点在球场**左下角**，X 轴为宽度方向（0~6.1m），Y 轴为长度方向（0~13.4m）
- 中线在 Y=6.7m 处，据此区分上下半场球员
- 单打模式：分为上半场（upper）和下半场（lower）两个区域
- 双打模式：分为 upper_1、upper_2、lower_1、lower_2 四个区域
- 可视化中 Y=0（近端）在底部，Y=13.4（远端）在顶部，与真实球场方向一致

### 回合检测状态机
- 使用 `cv2.matchTemplate` 将当前帧与模板图比对（阈值 0.75）
- 连续 5 帧匹配到 → 回合开始（`rally_id += 1`）
- 连续 5 帧未匹配 → 回合结束
- 非球场视图帧不执行姿态/羽毛球检测，直接透传原帧

### 自动角点检测
- 基于背景建模 + Canny 边缘检测 + HoughLinesP 线段分析
- 通过线段聚类、四边形拟合筛选候选角点，选取与标准球场尺寸最匹配的四边
- Web 端标注流程：默认手动标注 → 可选"自动检测角点"预览 → 确认填入 → 微调 → 提交
- 提交时通过 `compute_annotation.py` 自动将模板图坐标缩放到视频坐标

### 并发控制
后端通过 `processPool.js` 限制最多 2 个 Python 分析进程同时运行，通过 Node.js `child_process.spawn` 调用 `main.py`，传入 `--device`、`--mode` 等参数。

### AI 大模型球场标注 🆕
- 支持 OpenAI 兼容的视觉大模型 API（GPT-4o、Qwen-VL、DeepSeek-VL 等）
- 两阶段策略：CV 算法（背景建模 + 边缘检测）先提供粗略角点提示，视觉大模型在此基础上精修到像素级精度
- 自动重试机制：最多 3 次调用，支持 reasoning model 的推理轨迹提取
- 智能回退：LLM 多次重试失败后，自动回退到 CV 检测结果，标注流程不中断
- 模型管理存储于 MongoDB，API Key 加密存储，每个用户最多支持配置多个模型

---

## 🙏 致谢

- [RTMPose](https://github.com/open-mmlab/mmpose) — 人体姿态估计算法
- [Ultralytics](https://github.com/ultralytics/ultralytics) — YOLO 目标检测框架
- [TrackNetV2](https://github.com/ChihChiYeh/TrackNetV2) — 羽毛球数据集

## 📄 许可证

本项目代码和 `weights/yolo11s-ball.pt` 使用 [Apache License 2.0](LICENSE)。RTMPose / RTMO / YOLOX ONNX 权重来自 OpenMMLab / RTMPose 生态，按其上游 Apache License 2.0 授权使用，并保留原始归属。
