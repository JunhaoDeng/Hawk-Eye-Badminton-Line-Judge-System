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

# Set global plotting style to dark
plt.style.use('dark_background')

class PlayerPositionVisualizer:
    """
    Player Position Visualization Class
    Dynamically handles any number of player keys (upper/lower for singles,
    upper_1/upper_2/lower_1/lower_2 for doubles).
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
        
        # Movement statistics parameters
        self.fps = fps  # Video frame rate, used for speed calculation
        self.movement_stats = defaultdict(dict)
        self.MAX_SPEED = 8.0  # Human maximum speed limit (m/s)
        self.MIN_MOVEMENT = 0.05  # Minimum movement distance (m), below this value is considered noise
        self.MAX_FRAME_DISTANCE = 8.0 / self.fps  # Maximum frame-to-frame distance (m), based on max speed and fps
        
        # Heatmap grid parameters — MUST be defined BEFORE _load_data()
        # because _load_data() -> _calculate_movement_stats() -> _calculate_player_stats() accesses this attribute
        self.heatmap_grid_size = (30, 60)  # Grid size (width grid count, length grid count)

        # Load data
        self.df = self._load_data()
    
        # Court image parameters
        self.img_width = 610  # Image width (pixels)
        self.img_height = 1340  # Image height (pixels)
        
        # Color settings - supports both singles and doubles
        self.REGION_COLORS = {
            'upper':   '#ff6363',   # Singles upper (bright red)
            'lower':   '#63c6ff',   # Singles lower (bright blue)
            'upper_1': '#ff6363',   # Doubles upper 1 (bright red)
            'upper_2': '#ffa500',   # Doubles upper 2 (orange)
            'lower_1': '#63c6ff',   # Doubles lower 1 (bright blue)
            'lower_2': '#7dff63',   # Doubles lower 2 (bright green)
        }
        self.upper_color = self.REGION_COLORS['upper']
        self.lower_color = self.REGION_COLORS['lower']
        
        # Court line color - dark theme
        self.court_line_color = '#bbbbbb'  # Light gray, visible on dark background
        
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
        """Calculate movement statistics for a single player"""
        # Initialize statistics
        total_positions = len(positions)
        stats = {
            'total_distance': 0.0,
            'max_speed': 0.0,
            'avg_speed': 0.0,
            'total_frames': total_positions,  # Total frames
            'active_frames': 0,               # New: valid position frames count
            'coverage_percent': 0.0,          # New: coverage percentage of half-court
        }
        
        # Count valid frames (non-negative coordinates)
        valid_count = 0
        for pos in positions:
            if pos[0] >= 0 and pos[1] >= 0:
                valid_count += 1
        stats['active_frames'] = valid_count
        
        # If less than 2 data points, cannot calculate statistics
        if total_positions < 2:
            return stats
        
        # Calculate total distance and maximum speed
        total_valid_distance = 0.0
        max_speed = 0.0
        
        # Sampling interval, sample every 5 frames
        sample_interval = 5
        current_time = total_positions - 1
        
        # Ensure at least one sampling point
        if current_time < sample_interval:
            sample_points = [0, current_time]
        else:
            # Create list of sampling points
            sample_points = list(range(0, current_time + 1, sample_interval))
            # Ensure the last point is included
            if current_time not in sample_points:
                sample_points.append(current_time)
        
        # Calculate distance between sampling points
        for i in range(len(sample_points) - 1):
            idx1 = sample_points[i]
            idx2 = sample_points[i + 1]
            
            p1 = positions[idx1]
            p2 = positions[idx2]
            
            # Calculate Euclidean distance (meters)
            dist = np.sqrt(((p2 - p1)**2).sum())
            
            # Calculate time difference (seconds)
            time_diff = times[idx2] - times[idx1] if idx2 < len(times) else (idx2 - idx1) / self.fps
            
            # Adjust maximum allowed distance based on time interval
            max_possible_distance = self.MAX_FRAME_DISTANCE * (idx2 - idx1)
            
            # Filter small movements and anomalies
            if dist > self.MIN_MOVEMENT and dist < max_possible_distance:
                # Accumulate valid distance
                total_valid_distance += dist
                
                # Calculate speed and update maximum speed
                if time_diff > 0:
                    speed = dist / time_diff
                    speed = min(speed, self.MAX_SPEED)  # Limit maximum speed
                    max_speed = max(max_speed, speed)
        
        # Update statistics
        stats['total_distance'] = round(total_valid_distance, 2)
        stats['max_speed'] = round(max_speed, 2)
        
        # Calculate average speed - use total distance divided by total time, considering stationary time
        total_time = times[-1] - times[0] if len(times) > 1 else stats['total_frames'] / self.fps
        if total_time > 0:
            stats['avg_speed'] = round(total_valid_distance / total_time, 2)
        
        # Calculate coverage percentage based on heatmap grid
        if valid_count > 0:
            grid_w, grid_h = self.heatmap_grid_size
            valid_positions = np.array([p for p in positions if p[0] >= 0 and p[1] >= 0])
            if len(valid_positions) > 0:
                grid_x = np.clip((valid_positions[:, 0] / self.court_width * grid_w).astype(int), 0, grid_w - 1)
                grid_y = np.clip((valid_positions[:, 1] / self.court_length * grid_h).astype(int), 0, grid_h - 1)
                occupied_cells = len(set(zip(grid_x, grid_y)))
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
            return pd.DataFrame()  # Return empty DataFrame
            
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
        """Draw standard badminton court on matplotlib figure"""
        if ax is not None:
            plt.sca(ax)
        
        # Standard orientation: Y=0 is near court (bottom), Y=13.4 is far court (top)
        
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
        
        # Set display range (with margins)
        plt.xlim(-0.5, doubles_width + 0.5)
        plt.ylim(-0.5, court_length + 0.5)  # Y=0 near court at bottom, Y=13.4 far court at top
        
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
        plt.title('Player Position Heatmap', color='white', fontsize=14)
        plt.xlabel('Court Width (meters)', color='white')
        plt.ylabel('Court Length (meters)', color='white')
        plt.tick_params(colors='white')
        save_path = os.path.join(self.output_dir, 'heatmaps', filename)
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"Heatmap saved to: {save_path}")
            
    def _add_stats_to_plot(self, rally_id=None):
        """
        Add statistics information to the plot (supports any number of players)
        Args:
            rally_id: Rally ID, if None then display overall statistics for all rallies
        """
        if not self.movement_stats:
            return
        if rally_id is not None and rally_id not in self.movement_stats:
            return

        if rally_id is not None:
            stats = self.movement_stats[rally_id]
            info_text = f"Rally {rally_id} Statistics:\n"
            info_text += "---------------\n"
            for key, player_stats in stats.items():
                label = self._region_label(key)
                info_text += f"{label}:\n"
                info_text += f"  Average Speed: {player_stats['avg_speed']:.2f} m/s\n"
                info_text += f"  Maximum Speed: {player_stats['max_speed']:.2f} m/s\n"
                info_text += f"  Distance Moved: {player_stats['total_distance']:.2f} m\n"
                info_text += f"  Active Frames: {player_stats.get('active_frames', 0)}\n"
        else:
            info_text = "Match Statistics\n"
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
                    info_text += f"  Total Distance: {td:.2f} m\n"
                if totals['avg_speeds']:
                    info_text += f"  Average Speed: {sum(totals['avg_speeds'])/len(totals['avg_speeds']):.2f} m/s\n"
                if totals['max_speeds']:
                    info_text += f"  Maximum Speed: {max(totals['max_speeds']):.2f} m/s\n"
                if totals['active_frames']:
                    info_text += f"  Total Active Frames: {sum(totals['active_frames'])}\n"
                if totals['coverages']:
                    info_text += f"  Coverage: {sum(totals['coverages'])/len(totals['coverages']):.1f}%\n"

        plt.text(0.98, 0.5, info_text,
                horizontalalignment='right',
                verticalalignment='center',
                transform=plt.gca().transAxes,
                bbox=dict(facecolor='#333333', alpha=0.75, boxstyle='round,pad=0.7', edgecolor='#666666'),
                fontsize=12,
                family='monospace',
                weight='bold',
                color='#ffffff')

    def _region_label(self, key):
        """Return a human-readable English label for a region key."""
        labels = {
            'upper': 'Upper Player',
            'lower': 'Lower Player',
            'upper_1': 'Upper Player 1',
            'upper_2': 'Upper Player 2',
            'lower_1': 'Lower Player 1',
            'lower_2': 'Lower Player 2',
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
        plt.title('Player Position Scatter Plot', color='white', fontsize=14)
        plt.xlabel('Court Width (meters)', color='white')
        plt.ylabel('Court Length (meters)', color='white')
        plt.tick_params(colors='white')
        plt.legend(loc='upper right', facecolor='#333333', edgecolor='#666666', labelcolor='white')
        save_path = os.path.join(self.output_dir, 'scatter_plots', filename)
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        plt.close()
        print(f"Scatter plot saved to: {save_path}")
    
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
            print(f"Error during visualization: {e}")
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
    print(f"\nAnalyzing player position data: {detections_path}")
    
    # Create visualizer
    visualizer = PlayerPositionVisualizer(detections_path, output_dir, fps=fps)
    
    # Execute visualization
    success = visualizer.visualize()
    
    if success:
        print(f"Player position analysis complete, visualizations saved to: {visualizer.output_dir}")
    else:
        print("Player position analysis failed")
        
    return success


# 测试代码：允许直接运行该文件来测试可视化效果
if __name__ == "__main__":
    import sys
    from tkinter import Tk, filedialog
    
    # Use file dialog to select detection file
    print("Please select detections.jsonl file...")
    
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
            title="Select Player Position Detection File",
            filetypes=[("JSONL files", "*.jsonl"), ("All files", "*.*")],
            initialdir=default_dir
        )
        
        # 如果用户取消选择，则退出
        if not file_path:
            print("No file selected, exiting program")
            sys.exit(0)
            
        # 调用分析函数
        success = analyze_player_positions(file_path)
        
        if success:
            print("\nVisualization test completed successfully")
        else:
            print("\nVisualization test failed")
            
    except Exception as e:
        print(f"\nTest error: {e}")
        
    finally:
        try:
            # 关闭tkinter窗口
            root.destroy()
        except:
            pass
        
