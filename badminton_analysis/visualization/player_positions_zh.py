import cv2
import json
import numpy as np
import pandas as pd
import os
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import LinearSegmentedColormap
import seaborn as sns
from collections import defaultdict
import matplotlib.font_manager as fm

# 设置全局绘图风格为深色
plt.style.use('dark_background')

# 设置中文字体 - 使用simhei.ttf
def _load_chinese_font():
    module_dir = os.path.dirname(os.path.abspath(__file__))
    package_root = os.path.abspath(os.path.join(module_dir, '..', '..', '..'))
    workspace_root = os.path.abspath(os.path.join(package_root, '..'))
    candidates = [
        os.path.join(module_dir, 'simhei.ttf'),
        os.path.join(package_root, 'simhei.ttf'),
        os.path.join(workspace_root, 'simhei.ttf'),
        os.path.join(os.getcwd(), 'simhei.ttf'),
    ]

    for font_path in candidates:
        if os.path.exists(font_path):
            plt.rcParams['font.family'] = ['sans-serif']
            plt.rcParams['font.sans-serif'] = ['SimHei']
            plt.rcParams['axes.unicode_minus'] = False
            return fm.FontProperties(fname=font_path)

    plt.rcParams['axes.unicode_minus'] = False
    return None


chinese_font = _load_chinese_font()

class PlayerPositionVisualizer:
    """
    Player Position Visualization Class
    """
    
    def __init__(self, detections_path, output_dir=None, court_width=6.1, court_length=13.4, fps=30):
        """
        Initialize the player position visualizer
        Args:
            detections_path: Path to detections.jsonl containing player position data
            output_dir: Output directory, defaults to visualizations subdirectory in the detection file's directory
            court_width: Badminton court width in meters (default: 6.1m)
            court_length: Badminton court length in meters (default: 13.4m)
        """
        self.detections_path = detections_path
        self.court_width = court_width
        self.court_length = court_length
        
        # Set output directory
        if output_dir is None:
            detections_dir = os.path.dirname(os.path.abspath(detections_path))
            self.output_dir = os.path.join(detections_dir, 'position_visualizations')
        else:
            self.output_dir = output_dir
            
        # Create output directory
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, 'heatmaps'), exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, 'scatter_plots'), exist_ok=True)
        
        # 运动统计参数
        self.fps = fps  # 视频帧率，用于计算速度
        self.movement_stats = defaultdict(dict)
        self.MAX_SPEED = 8.0  # 人类最大速度限制(m/s)
        self.MIN_MOVEMENT = 0.05  # 最小移动距离(m)，低于此值视为噪声
        self.MAX_FRAME_DISTANCE = 8.0 / self.fps  # 单帧最大移动距离(m)，基于最大速度和帧率计算
        
        # Heatmap grid parameters — MUST be defined BEFORE _load_data()
        # because _load_data() -> _calculate_movement_stats() -> _calculate_player_stats() accesses this attribute
        self.heatmap_grid_size = (30, 60)  # Grid size (width grid count, length grid count)

        # Load data
        self.df = self._load_data()
    
        # Court image parameters
        self.img_width = 610  # Image width (pixels)
        self.img_height = 1340  # Image height (pixels)
        
        # Color settings - 单打/双打都支持
        self.REGION_COLORS = {
            'upper':   '#ff6363',   # 单打上场（亮红色）
            'lower':   '#63c6ff',   # 单打下场（亮蓝色）
            'upper_1': '#ff6363',   # 双打上1（亮红色）
            'upper_2': '#ffa500',   # 双打上2（橙色）
            'lower_1': '#63c6ff',   # 双打下1（亮蓝色）
            'lower_2': '#7dff63',   # 双打下2（亮综色）
        }
        self.upper_color = self.REGION_COLORS['upper']
        self.lower_color = self.REGION_COLORS['lower']
        
        # 场地线条颜色 - 深色主题
        self.court_line_color = '#bbbbbb'  # 浅灰色，在深色背景中清晰可见
        
    def _calculate_movement_stats(self, region_dfs, rally_segments, frames):
        """Calculate movement statistics for each player region and rally.
        
        Args:
            region_dfs: dict of {region_key: DataFrame} with valid_coords column
            rally_segments: list of (start_idx, end_idx) tuples
            frames: Series of frame numbers
        """
        self.movement_stats = defaultdict(dict)
        frame_times = frames / self.fps

        for key, rdf in region_dfs.items():
            # Match-wide stats
            all_player = rdf[rdf['valid_coords']]
            if not all_player.empty:
                self.movement_stats['match'][key] = self._calculate_player_stats(
                    all_player[['court_x', 'court_y']].values,
                    frame_times[all_player.index].values
                )

            # Per-rally stats
            for rally_id, (start_idx, end_idx) in enumerate(rally_segments, 1):
                rally_times = frame_times[start_idx:end_idx].values
                rally_player = rdf[(rdf['rally_id'] == rally_id) & (rdf['valid_coords'])]
                positions = rally_player[['court_x', 'court_y']].values
                if len(positions) > 1:
                    self.movement_stats[rally_id][key] = self._calculate_player_stats(positions, rally_times)
    
    def _calculate_player_stats(self, positions, times):
        """计算单个球员的运动统计数据"""
        # 初始化统计数据
        total_positions = len(positions)
        stats = {
            'total_distance': 0.0,
            'max_speed': 0.0,
            'avg_speed': 0.0,
            'total_frames': total_positions,  # 总帧数
            'active_frames': 0,               # 新增：有效位置帧数
            'coverage_percent': 0.0,          # 新增：占该半场面积的覆盖率
        }
        
        # 统计有效帧数（坐标非负）
        valid_count = 0
        for pos in positions:
            if pos[0] >= 0 and pos[1] >= 0:
                valid_count += 1
        stats['active_frames'] = valid_count
        
        # 如果数据点少于2个，无法计算统计信息
        if total_positions < 2:
            return stats
        
        # 计算总距离和最大速度
        total_valid_distance = 0.0
        max_speed = 0.0
        
        # 采样间隔，每5帧采样一次
        sample_interval = 5
        current_time = total_positions - 1
        
        # 确保至少有一个采样点
        if current_time < sample_interval:
            sample_points = [0, current_time]
        else:
            # 创建采样点列表
            sample_points = list(range(0, current_time + 1, sample_interval))
            # 确保最后一个点被包含
            if current_time not in sample_points:
                sample_points.append(current_time)
        
        # 计算采样点之间的距离
        for i in range(len(sample_points) - 1):
            idx1 = sample_points[i]
            idx2 = sample_points[i + 1]
            
            p1 = positions[idx1]
            p2 = positions[idx2]
            
            # 计算欧几里得距离(米)
            dist = np.sqrt(((p2 - p1)**2).sum())
            
            # 计算时间差(秒)
            time_diff = times[idx2] - times[idx1] if idx2 < len(times) else (idx2 - idx1) / self.fps
            
            # 基于时间间隔调整最大允许距离
            max_possible_distance = self.MAX_FRAME_DISTANCE * (idx2 - idx1)
            
            # 过滤微小移动和异常值
            if dist > self.MIN_MOVEMENT and dist < max_possible_distance:
                # 累加有效距离
                total_valid_distance += dist
                
                # 计算速度并更新最大速度
                if time_diff > 0:
                    speed = dist / time_diff
                    speed = min(speed, self.MAX_SPEED)  # 限制最大速度
                    max_speed = max(max_speed, speed)
        
        # 更新统计数据
        stats['total_distance'] = round(total_valid_distance, 2)
        stats['max_speed'] = round(max_speed, 2)
        
        # 计算平均速度 - 使用总距离除以总时间，考虑球员静止的时间
        total_time = times[-1] - times[0] if len(times) > 1 else stats['total_frames'] / self.fps
        if total_time > 0:
            stats['avg_speed'] = round(total_valid_distance / total_time, 2)
        
        # 计算覆盖率：基于热力图网格
        if valid_count > 0:
            grid_w, grid_h = self.heatmap_grid_size
            # 将有效坐标映射到网格
            valid_positions = np.array([p for p in positions if p[0] >= 0 and p[1] >= 0])
            if len(valid_positions) > 0:
                grid_x = np.clip((valid_positions[:, 0] / self.court_width * grid_w).astype(int), 0, grid_w - 1)
                grid_y = np.clip((valid_positions[:, 1] / self.court_length * grid_h).astype(int), 0, grid_h - 1)
                occupied_cells = len(set(zip(grid_x, grid_y)))
                # 覆盖率 = 占据格子数 / 该半场格子数
                half_total_cells = (grid_w * grid_h) // 2
                stats['coverage_percent'] = round(occupied_cells / max(half_total_cells, 1) * 100, 1)
        
        return stats
    
    def _load_data(self):
        """Load detections.jsonl and convert to required format.
        
        Dynamically handles any number of player keys (upper/lower for singles,
        upper_1/upper_2/lower_1/lower_2 for doubles).
        """
        try:
            rows = []
            region_keys = None  # will be detected from first record
            with open(self.detections_path, "r", encoding="utf-8") as file:
                for line in file:
                    line = line.strip()
                    if not line:
                        continue
                    record = json.loads(line)
                    players = record.get("players", {})
                    if region_keys is None and players:
                        region_keys = list(players.keys())
                    row = {"Frame": record.get("frame")}
                    for key in (region_keys or []):
                        player_data = (players.get(key) or {})
                        court_pos = player_data.get("court") or [None, None]
                        row[f"{key}_Court_X"] = court_pos[0]
                        row[f"{key}_Court_Y"] = court_pos[1]
                    rows.append(row)

            if not rows or region_keys is None:
                print("Error: No data or player keys found in detections file.")
                return pd.DataFrame()

            df = pd.DataFrame(rows)
            print(f"\nData fields: {df.columns.tolist()}")
            print(f"Detected player regions: {region_keys}")

            # Detect rallies based on frame gaps
            print("Detecting rallies based on frame gaps...")
            frames = df['Frame'].astype(int).tolist()
            gaps = [frames[i+1] - frames[i] for i in range(len(frames)-1)]
            rally_breaks = [i+1 for i, gap in enumerate(gaps) if gap > 100]

            rally_segments = []
            start_idx = 0
            for break_idx in rally_breaks:
                rally_segments.append((start_idx, break_idx))
                start_idx = break_idx
            if start_idx < len(frames):
                rally_segments.append((start_idx, len(frames)))
            rally_segments = [(s, e) for s, e in rally_segments if e - s >= 150]
            print(f"Detected {len(rally_segments)} valid rallies")

            # Build per-region DataFrames
            region_dfs = {}
            for key in region_keys:
                x_col = f"{key}_Court_X"
                y_col = f"{key}_Court_Y"
                rdf = df[['Frame', x_col, y_col]].copy()
                rdf['normalized_x'] = rdf[x_col]
                rdf['normalized_y'] = rdf[y_col]
                rdf['valid_coords'] = (rdf['normalized_x'] >= 0) & (rdf['normalized_y'] >= 0)
                rdf.rename(columns={'Frame': 'frame', 'normalized_x': 'court_x', 'normalized_y': 'court_y'}, inplace=True)
                rdf['player_position'] = key
                rdf['rally_id'] = 0
                for rally_id, (start, end) in enumerate(rally_segments, 1):
                    mask = (rdf.index >= start) & (rdf.index < end)
                    rdf.loc[mask, 'rally_id'] = rally_id
                region_dfs[key] = rdf

            # Store region keys and region_dfs for later use
            self.region_keys = region_keys
            self.region_dfs_raw = region_dfs

            # Calculate movement stats
            self._calculate_movement_stats(region_dfs, rally_segments, df['Frame'])

            # Combine all region DataFrames
            combined_df = pd.concat(list(region_dfs.values()), ignore_index=True)
            combined_df = combined_df.dropna(subset=['court_x', 'court_y'])
            combined_df = combined_df[combined_df['rally_id'] > 0]
            combined_df = combined_df[combined_df['valid_coords'] == True]
            combined_df = combined_df.drop('valid_coords', axis=1)

            print(f"\nData conversion complete, {len(combined_df)} records total")
            return combined_df

        except Exception as e:
            print(f"Error loading data: {e}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()

            
    def _create_court_image(self):
        """Create court background image"""
        # Create blank white image
        self.court_img = np.ones((self.img_height, self.img_width, 3), dtype=np.uint8) * 255
        
        # Calculate court area dimensions
        padding = 50  # Border padding in pixels
        court_img_width = self.img_width - 2 * padding
        court_img_height = self.img_height - 2 * padding
        
        # Court corners (in image coordinates)
        top_left = (padding, padding)
        top_right = (padding + court_img_width, padding)
        bottom_right = (padding + court_img_width, padding + court_img_height)
        bottom_left = (padding, padding + court_img_height)
        
        # Draw court outline
        cv2.line(self.court_img, top_left, top_right, (0, 0, 0), 2)
        cv2.line(self.court_img, top_right, bottom_right, (0, 0, 0), 2)
        cv2.line(self.court_img, bottom_right, bottom_left, (0, 0, 0), 2)
        cv2.line(self.court_img, bottom_left, top_left, (0, 0, 0), 2)
        
        # Draw net
        net_y = padding + court_img_height // 2
        cv2.line(self.court_img, (padding, net_y), (padding + court_img_width, net_y), (0, 0, 0), 1)
        
        # Draw center line
        center_x = padding + court_img_width // 2
        cv2.line(self.court_img, (center_x, padding), (center_x, padding + court_img_height), (0, 0, 0), 1)
        
        # Draw service courts
        upper_service_line_y = padding + int(court_img_height * 0.25)
        lower_service_line_y = padding + int(court_img_height * 0.75)
        
        cv2.line(self.court_img, (padding, upper_service_line_y), 
                 (padding + court_img_width, upper_service_line_y), (0, 0, 0), 1)
        cv2.line(self.court_img, (padding, lower_service_line_y),
                 (padding + court_img_width, lower_service_line_y), (0, 0, 0), 1)
        
        # Draw service line edges
        cv2.line(self.court_img,
                 (int(padding + court_img_width * 0.25), padding),
                 (int(padding + court_img_width * 0.25), upper_service_line_y), 
                 (0, 0, 0), 1)
        cv2.line(self.court_img,
                 (int(padding + court_img_width * 0.75), padding),
                 (int(padding + court_img_width * 0.75), upper_service_line_y), 
                 (0, 0, 0), 1)
        cv2.line(self.court_img,
                 (int(padding + court_img_width * 0.25), lower_service_line_y),
                 (int(padding + court_img_width * 0.25), padding + court_img_height), 
                 (0, 0, 0), 1)
        cv2.line(self.court_img,
                 (int(padding + court_img_width * 0.75), lower_service_line_y),
                 (int(padding + court_img_width * 0.75), padding + court_img_height), 
                 (0, 0, 0), 1)
                
        return self.court_img
        
    def _draw_court(self, ax=None):
        """在matplotlib图形上绘制标准羽毛球场地"""
        if ax is not None:
            plt.sca(ax)
        
        # 标准方向：Y=0 为近端（底部），Y=13.4 为远端（顶部）
        
        # 标准羽毛球场地尺寸（米）
        doubles_width = self.court_width  # 双打场地宽度 (6.10米)
        court_length = self.court_length  # 场地长度 (13.40米)
        single_width = 0.46   # 单打线距离双打线的距离
        service_line = 1.98   # 发球线到网的距离
        back_service = 0.76   # 后发球线到底线的距离
        
        # 绘制场地外框（双打场地外框）
        court_rect = plt.Rectangle((0, 0), doubles_width, court_length, 
                                 fill=False, color=self.court_line_color, linewidth=4)
        plt.gca().add_patch(court_rect)
        
        # 绘制单打线
        plt.plot([single_width, single_width], [0, court_length], self.court_line_color, linewidth=4)
        plt.plot([doubles_width - single_width, doubles_width - single_width], 
                 [0, court_length], self.court_line_color, linewidth=4)
        
        # 绘制网线（中间在y=场地长度/2）
        plt.axhline(y=court_length/2, color=self.court_line_color, linestyle='--', linewidth=4)
        
        # 绘制中线（只画到发球线）
        plt.plot([doubles_width/2, doubles_width/2], [0, court_length/2-service_line], self.court_line_color, linewidth=4)  # 上半场
        plt.plot([doubles_width/2, doubles_width/2], [court_length/2+service_line, court_length], self.court_line_color, linewidth=4)  # 下半场
        
        # 绘制发球线
        # 前发球线（距网1.98米）
        plt.axhline(y=court_length/2-service_line, color=self.court_line_color, linestyle='-', linewidth=4)
        plt.axhline(y=court_length/2+service_line, color=self.court_line_color, linestyle='-', linewidth=4)
        
        # 后发球线（距底线0.76米）
        plt.axhline(y=back_service, color=self.court_line_color, linestyle='-', linewidth=4)
        plt.axhline(y=court_length-back_service, color=self.court_line_color, linestyle='-', linewidth=4)
        
        # 设置显示范围（带边距）
        plt.xlim(-0.5, doubles_width + 0.5)
        plt.ylim(-0.5, court_length + 0.5)  # Y=0 近端在底部，Y=13.4 远端在顶部
        
    def _court_to_image_coords(self, court_x, court_y):
        """Convert court coordinates to image coordinates"""
        img_x = int(court_x / self.court_width * self.img_width)
        img_y = int(court_y / self.court_length * self.img_height)
        return img_x, img_y
        
    def _generate_rally_visualizations(self):
        """Generate visualizations for each rally"""
        if self.df.empty:
            print("No data to visualize")
            return
            
        rally_ids = self.df['rally_id'].unique()
        for rally_id in rally_ids:
            if pd.isna(rally_id):
                continue
            print(f"Processing visualizations for rally {rally_id}...")
            rally_df = self.df[self.df['rally_id'] == rally_id]
            region_dfs = {key: rally_df[rally_df['player_position'] == key] for key in self.region_keys}
            self._generate_heatmap(region_dfs, f"rally_{int(rally_id)}_heatmap.png")
            self._generate_scatter_plot(region_dfs, f"rally_{int(rally_id)}_scatter.png")
        print("All rally visualizations generated")
            
    def _generate_match_visualizations(self):
        """Generate visualizations for the entire match"""
        if self.df.empty:
            print("No data to visualize")
            return
        print("Generating match-wide visualizations...")
        region_dfs = {key: self.df[self.df['player_position'] == key] for key in self.region_keys}
        self._generate_heatmap(region_dfs, "match_heatmap.png")
        self._generate_scatter_plot(region_dfs, "match_scatter.png")
        print("Match-wide visualizations generated successfully")
            
    def _generate_heatmap(self, region_dfs, filename):
        """Generate heatmap for all player regions."""
        plt.figure(figsize=(10, 16), facecolor='#1a1a1a')
        self._draw_court()
        for key, player_df in region_dfs.items():
            if player_df.empty:
                continue
            color = self.REGION_COLORS.get(key, '#ffffff')
            cmap = LinearSegmentedColormap.from_list(f"cmap_{key}", [(0, 0, 0, 0), color])
            sns.kdeplot(
                x=player_df['court_x'],
                y=player_df['court_y'],
                cmap=cmap,
                fill=True,
                alpha=1,
                levels=12,
                thresh=0.01,
                bw_adjust=1
            )
        rally_id = None
        first_df = next((d for d in region_dfs.values() if not d.empty), None)
        if first_df is not None and 'rally_id' in first_df.columns:
            rally_ids_arr = first_df['rally_id'].unique()
            if len(rally_ids_arr) == 1 and rally_ids_arr[0] != 0:
                rally_id = int(rally_ids_arr[0])
        if rally_id and rally_id in self.movement_stats:
            self._add_stats_to_plot(rally_id)
        else:
            self._add_stats_to_plot(None)
        plt.xlim(0, self.court_width)
        plt.ylim(0, self.court_length)
        plt.title('球员位置热力图', color='white', fontsize=14, fontproperties=chinese_font)
        plt.xlabel('场地宽度 (米)', color='white', fontproperties=chinese_font)
        plt.ylabel('场地长度 (米)', color='white', fontproperties=chinese_font)
        plt.tick_params(colors='white')
        save_path = os.path.join(self.output_dir, 'heatmaps', filename)
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"热力图已保存至: {save_path}")
            
    # 注意：这个方法被新的_calculate_player_stats(self, positions, times)方法替代
    # 保留此方法是为了兼容性，但不再使用
            

    # 注意：这个方法被新的_calculate_player_stats(self, positions, times)方法替代
    # 保留此方法是为了兼容性，但不再使用
            
    def _add_stats_to_plot(self, rally_id=None):
        """
        在图表上添加统计信息（支持任意数量球员）
        Args:
            rally_id: 回合ID，如果为None则显示所有回合的总统计信息
        """
        if not self.movement_stats:
            return
        if rally_id is not None and rally_id not in self.movement_stats:
            return

        if rally_id is not None:
            stats = self.movement_stats[rally_id]
            info_text = f"回合 {rally_id} 统计:\n"
            info_text += "---------------\n"
            for key, player_stats in stats.items():
                label = self._region_label(key)
                info_text += f"{label}:\n"
                info_text += f"  平均速度: {player_stats['avg_speed']:.2f} 米/秒\n"
                info_text += f"  最大速度: {player_stats['max_speed']:.2f} 米/秒\n"
                info_text += f"  移动距离: {player_stats['total_distance']:.2f} 米\n"
                info_text += f"  活跃帧数: {player_stats.get('active_frames', 0)}\n"
        else:
            info_text = "比赛统计\n"
            info_text += "=================\n"
            from collections import defaultdict as _dd
            region_totals = _dd(lambda: {'distances': [], 'max_speeds': [], 'avg_speeds': [],
                                           'active_frames': [], 'coverages': []})
            for rally_stats in self.movement_stats.values():
                for key, ps in rally_stats.items():
                    region_totals[key]['distances'].append(ps.get('total_distance', 0))
                    if ps.get('max_speed', 0) > 0:
                        region_totals[key]['max_speeds'].append(ps['max_speed'])
                    if ps.get('avg_speed', 0) > 0:
                        region_totals[key]['avg_speeds'].append(ps['avg_speed'])
                    if ps.get('active_frames', 0) > 0:
                        region_totals[key]['active_frames'].append(ps['active_frames'])
                    if ps.get('coverage_percent', 0) > 0:
                        region_totals[key]['coverages'].append(ps['coverage_percent'])
            for key, totals in region_totals.items():
                label = self._region_label(key)
                info_text += f"\n{label}:\n"
                if totals['distances']:
                    td = sum(totals['distances'])
                    info_text += f"  总移动距离: {td:.2f} 米\n"
                if totals['avg_speeds']:
                    info_text += f"  平均速度: {sum(totals['avg_speeds'])/len(totals['avg_speeds']):.2f} 米/秒\n"
                if totals['max_speeds']:
                    info_text += f"  最大速度: {max(totals['max_speeds']):.2f} 米/秒\n"
                if totals['active_frames']:
                    info_text += f"  总活跃帧: {sum(totals['active_frames'])}\n"
                if totals['coverages']:
                    info_text += f"  覆盖率: {sum(totals['coverages'])/len(totals['coverages']):.1f}%\n"

        plt.text(0.98, 0.5, info_text,
                horizontalalignment='right',
                verticalalignment='center',
                transform=plt.gca().transAxes,
                bbox=dict(facecolor='#333333', alpha=0.75, boxstyle='round,pad=0.7', edgecolor='#666666'),
                fontsize=12,
                family='SimHei',
                weight='bold',
                color='#ffffff',
                fontproperties=chinese_font)

    def _region_label(self, key):
        """Return a human-readable Chinese label for a region key."""
        labels = {
            'upper': '上场球员',
            'lower': '下场球员',
            'upper_1': '上场球员 1',
            'upper_2': '上场球员 2',
            'lower_1': '下场球员 1',
            'lower_2': '下场球员 2',
        }
        return labels.get(key, key)
    
    def _generate_scatter_plot(self, region_dfs, filename):
        """Generate scatter plot for all player regions."""
        plt.figure(figsize=(10, 16), facecolor='#1a1a1a')
        self._draw_court()

        markers = ['o', '^', 's', 'D']  # different markers per region
        for i, (key, player_df) in enumerate(region_dfs.items()):
            if player_df.empty:
                continue
            color = self.REGION_COLORS.get(key, '#ffffff')
            marker = markers[i % len(markers)]
            label_base = self._region_label(key)
            if 'rally_id' in player_df.columns:
                for rally_id, rally_data in player_df.groupby('rally_id'):
                    lbl = label_base if rally_id == player_df['rally_id'].iloc[0] else "_nolegend_"
                    plt.scatter(rally_data['court_x'], rally_data['court_y'],
                                alpha=0.7, s=30, marker=marker, color=color, label=lbl)
            else:
                plt.scatter(player_df['court_x'], player_df['court_y'],
                            alpha=0.7, s=30, marker=marker, color=color, label=label_base)

        rally_id = None
        first_df = next((d for d in region_dfs.values() if not d.empty), None)
        if first_df is not None and 'rally_id' in first_df.columns:
            rally_ids_arr = first_df['rally_id'].unique()
            if len(rally_ids_arr) == 1 and rally_ids_arr[0] != 0:
                rally_id = int(rally_ids_arr[0])
        if rally_id and rally_id in self.movement_stats:
            self._add_stats_to_plot(rally_id)
        else:
            self._add_stats_to_plot(None)

        plt.xlim(0, self.court_width)
        plt.ylim(0, self.court_length)
        plt.title('球员位置散点图', color='white', fontsize=14, fontproperties=chinese_font)
        plt.xlabel('场地宽度 (米)', color='white', fontproperties=chinese_font)
        plt.ylabel('场地长度 (米)', color='white', fontproperties=chinese_font)
        plt.tick_params(colors='white')
        plt.legend(loc='upper right', facecolor='#333333', edgecolor='#666666', labelcolor='white')
        save_path = os.path.join(self.output_dir, 'scatter_plots', filename)
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"散点图已保存至: {save_path}")


    def visualize(self):
        """Execute visualization processing"""
        if self.df.empty:
            print("No data to visualize")
            return False
            
        try:
            # Generate visualizations for each rally
            self._generate_rally_visualizations()
            
            # Generate visualizations for the entire match
            self._generate_match_visualizations()
            
            return True
        except Exception as e:
            print(f"可视化过程中出错: {e}")
            return False
            
            
def analyze_player_positions(detections_path, output_dir=None, fps=30):
    """
    Analyze player position data and generate visualizations
    
    Args:
        detections_path: Path to detections.jsonl containing player position data
        output_dir: Output directory, defaults to visualizations subdirectory in the detection file's directory
        
    Returns:
        bool: Whether processing was successful
    """
    print(f"\n分析球员位置数据: {detections_path}")
    
    # Create visualizer
    visualizer = PlayerPositionVisualizer(detections_path, output_dir, fps=fps)
    
    # Execute visualization
    success = visualizer.visualize()
    
    if success:
        print(f"球员位置分析完成，可视化结果已保存至: {visualizer.output_dir}")
    else:
        print("球员位置分析失败")
        
    return success


# 测试代码：允许直接运行该文件来测试可视化效果
if __name__ == "__main__":
    import sys
    from tkinter import Tk, filedialog
    
    # Use file dialog to select detection file
    print("请选择 detections.jsonl 文件...")
    
    try:
        # Create hidden tkinter root window (for file dialog only)
        root = Tk()
        root.withdraw()
        
        # Set default directory
        default_dir = "results"
        if not os.path.exists(default_dir):
            default_dir = os.getcwd()
        
        # Open file selection dialog
        file_path = filedialog.askopenfilename(
            title="选择球员位置检测文件",
            filetypes=[("JSONL文件", "*.jsonl"), ("所有文件", "*.*")],
            initialdir=default_dir
        )
        
        # 如果用户取消选择，则退出
        if not file_path:
            print("未选择文件，退出程序")
            sys.exit(0)
            
        # 调用分析函数
        success = analyze_player_positions(file_path)
        
        if success:
            print("\n可视化测试成功完成")
        else:
            print("\n可视化测试失败")
            
    except Exception as e:
        print(f"\n测试错误: {e}")
        
    finally:
        try:
            # 关闭tkinter窗口
            root.destroy()
        except:
            pass
        
