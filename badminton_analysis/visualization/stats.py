import cv2
import numpy as np
import os
from PIL import Image, ImageDraw, ImageFont

class StatsVisualizer:
    """
    统计信息可视化器，负责绘制文本和球员统计信息面板
    """
    
    # 颜色映射：单打/双打都支持
    REGION_COLORS = {
        "upper":   (0, 255, 255),
        "lower":   (255, 0, 255),
        "upper_1": (0, 255, 255),
        "upper_2": (0, 255, 128),
        "lower_1": (255, 0, 255),
        "lower_2": (0, 128, 255),
    }
    
    def __init__(self, frame_width, frame_height, language='zh', mode='singles'):
        """
        初始化统计信息可视化器
        
        参数:
            frame_width: 视频帧宽度
            frame_height: 视频帧高度
            language: 语言设置 ('zh' 或 'en')
            mode: '比赛模式' ('singles' 或 'doubles')
        """
        self.language = language
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.mode = mode
        
        # 计算缩放因子，基于1920x1080的参考分辨率
        self.scale_factor = 2 * min(self.frame_width / 1920.0, self.frame_height / 1080.0)
        # 缩放字体和尺寸
        self.font_scale = max(0.4, 0.5 * self.scale_factor)
        self.thickness = max(1, int(1 * self.scale_factor))
        self.line_height = max(15, int(20 * self.scale_factor))
        self.panel_width = max(180, int(180 * self.scale_factor))
        self.panel_height = max(150, int(200 * self.scale_factor))
        self.margin = max(5, int(10 * self.scale_factor))
        # 双打时面板更紧凑：缩小字体、两列布局
        if mode == 'doubles':
            # 字体缩小30%，行高缩小，留出4人空间
            self.font_scale *= 0.7
            self.thickness = max(1, int(self.thickness * 0.7))
            self.line_height = max(11, int(self.line_height * 0.7))
            # 面板宽度不再额外加宽，避免遮挡右侧球场走位图
            self.panel_width = int(self.panel_width * 1.0)
            # 根据实际内容行数精确计算面板高度
            # 紧凑格式：标题 + 速度 + 回合标题 + 3行 + 比赛标题 + 3行 + 间距
            content_lines = 1 + 1 + 1 + 3 + 1 + 3 + 2  # 12行
            required_panel_height = content_lines * self.line_height + 2 * self.margin
            self.panel_height = required_panel_height
        
        # 背景设置
        self.background_color = (0, 0, 0)
        self.background_alpha = 0.5
        self.font_path = self._find_chinese_font()
        self._font_cache = {}
        
        # 语言文本配置
        self.texts = {
            'zh': {
                'rally': '回合',
                'upper_player': '上场球员',
                'lower_player': '下场球员',
                'upper_player_1': '上场1',
                'upper_player_2': '上场2',
                'lower_player_1': '下场1',
                'lower_player_2': '下场2',
                'upper_court': '上半场',
                'lower_court': '下半场',
                'stats': '统计',
                'current_speed': '当前速度',
                'current_rally': '当前回合',
                'match_total': '比赛总计',
                'distance': '距离',
                'avg_speed': '均速',
                'max_speed': '极速',
                'total_distance': '总距离',
                'unit_speed': 'm/s',
                'unit_distance': 'm'
            },
            'en': {
                'rally': 'Rally',
                'upper_player': 'Upper Player',
                'lower_player': 'Lower Player',
                'upper_player_1': 'Upper 1',
                'upper_player_2': 'Upper 2',
                'lower_player_1': 'Lower 1',
                'lower_player_2': 'Lower 2',
                'upper_court': 'Upper Court',
                'lower_court': 'Lower Court',
                'stats': 'Stats',
                'current_speed': 'Speed',
                'current_rally': 'Rally',
                'match_total': 'Match',
                'distance': 'Dist',
                'avg_speed': 'Avg',
                'max_speed': 'Max',
                'total_distance': 'Total',
                'unit_speed': 'm/s',
                'unit_distance': 'm'
            }
        }

    def _find_chinese_font(self):
        # 优先使用项目根目录自带的 SimHei.ttf
        _here = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.join(_here, "..", "..")
        font_paths = [
            os.path.join(project_root, "SimHei.ttf"),
            # Windows
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/simsun.ttc",
            "C:/Windows/Fonts/simkai.ttf",
            "C:/Windows/Fonts/msyh.ttc",
            # macOS
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            "/Library/Fonts/Arial Unicode MS.ttf",
            "/System/Library/Fonts/Supplemental/Songti.ttc",
            # Linux
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        ]
        for path in font_paths:
            norm = os.path.normpath(path)
            if os.path.exists(norm):
                return norm
        return None

    def _get_font(self, font_scale):
        font_size = max(8, int(font_scale * 30))
        if font_size not in self._font_cache:
            self._font_cache[font_size] = ImageFont.truetype(self.font_path, font_size)
        return self._font_cache[font_size]

    def _draw_text_batch(self, frame, text_items):
        if not text_items:
            return
        if self.language == 'en' or self.font_path is None:
            for text, position, font_scale, color, thickness in text_items:
                cv2.putText(
                    frame,
                    text,
                    position,
                    cv2.FONT_HERSHEY_SIMPLEX,
                    font_scale,
                    color,
                    thickness,
                    cv2.LINE_AA,
                )
            return

        pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(pil_img)
        for text, position, font_scale, color, _thickness in text_items:
            draw.text(position, text, font=self._get_font(font_scale), fill=(color[2], color[1], color[0]))
        frame[:] = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    
    def add_text(self, frame, text, position, font_scale, color, thickness):
        """
        向图像添加文本（支持中英文）
        
        参数:
            frame: 视频帧
            text: 要添加的文本
            position: 文本位置 (x, y)
            font_scale: 字体大小缩放因子
            color: 文本颜色 (B, G, R)
            thickness: 文本粗细
        """
        if self.language == 'en':
            # 英文使用OpenCV默认字体
            font = cv2.FONT_HERSHEY_SIMPLEX
            cv2.putText(frame, text, position, font, font_scale, color, thickness, cv2.LINE_AA)
        else:
            if self.font_path is None:
                # 如果找不到中文字体，使用OpenCV英文显示作为后备
                font = cv2.FONT_HERSHEY_SIMPLEX
                cv2.putText(frame, text, position, font, font_scale, color, thickness, cv2.LINE_AA)
                return
            
            # 创建PIL图像以绘制文本
            pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            draw = ImageDraw.Draw(pil_img)
            font = self._get_font(font_scale)
            draw.text(position, text, font=font, fill=(color[2], color[1], color[0]))
            
            # 将PIL图像转回OpenCV格式并替换原始帧
            frame[:] = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    
    def draw_player_stats(self, frame, movement_stats, rally_count):
        """
        在画面上显示球员统计信息，包括当前回合和整场比赛数据
        支持单打（2人）和双打（4人）模式。
        双打采用两列布局：左侧上半场2人，右侧下半场2人。
        
        参数:
            frame: 视频帧
            movement_stats: 球员统计信息
            rally_count: 当前回合数
        """
        text_items = []
        t = self.texts[self.language]

        if self.mode == 'doubles':
            # 双打两列布局：左侧上半场，右侧下半场
            left_x = self.margin
            right_x = self.frame_width - self.panel_width - self.margin
            panel_spacing = self.panel_height + max(2, int(self.margin * 0.3))
            top_y = int(self.frame_height * 0.03)

            panel_positions = [
                ('upper_1', 'upper_player_1', left_x, top_y),
                ('upper_2', 'upper_player_2', left_x, top_y + panel_spacing),
                ('lower_1', 'lower_player_1', right_x, top_y),
                ('lower_2', 'lower_player_2', right_x, top_y + panel_spacing),
            ]

            # 上半场分隔标签（左侧两面板之间）
            upper_sep_y = top_y + 2 * panel_spacing + self.margin
            self._draw_section_separator(frame, left_x, upper_sep_y, t['upper_court'], text_items)
            # 下半场分隔标签（右侧两面板之间）
            lower_sep_y = top_y + 2 * panel_spacing + self.margin
            self._draw_section_separator(frame, right_x, lower_sep_y, t['lower_court'], text_items)

            # 回合数显示在左下角
            rally_pos_y = self.frame_height - max(20, int(self.frame_height * 0.04))
        else:
            # 单打：2个面板
            panel_positions = [
                ('upper', 'upper_player', self.margin, int(self.frame_height * 0.05)),
                ('lower', 'lower_player', self.margin, int(self.frame_height * 0.55)),
            ]
            rally_pos_y = int(self.panel_height + self.frame_height * 0.1)

        rally_text = f"{t['rally']}: {rally_count}"
        text_items.append((rally_text, (self.margin, rally_pos_y), self.font_scale * 1.5, (0, 165, 255), self.thickness + 2))

        for region_key, label_key, x_pos, y_pos in panel_positions:
            color = self.REGION_COLORS.get(region_key, (255, 255, 255))
            if self.mode == 'doubles':
                self._draw_player_panel_compact(
                    frame, t[label_key], movement_stats.get(region_key, {}),
                    x_pos, y_pos,
                    self.panel_width, self.panel_height,
                    color, self.font_scale, self.thickness, self.line_height,
                    self.background_color, self.background_alpha, text_items
                )
            else:
                self._draw_player_panel(
                    frame, t[label_key], movement_stats.get(region_key, {}),
                    x_pos, y_pos,
                    self.panel_width, self.panel_height,
                    color, self.font_scale, self.thickness, self.line_height,
                    self.background_color, self.background_alpha, text_items
                )

        self._draw_text_batch(frame, text_items)

    def _draw_section_separator(self, frame, x_start, y_pos, label, text_items):
        """绘制半场分隔线和标签"""
        x_end = x_start + self.panel_width
        # 分隔线
        cv2.line(frame, (x_start, y_pos), (x_end, y_pos), (100, 100, 100), 1)
        # 分隔标签
        label_x = x_start + 5
        label_y = y_pos - self.line_height // 2
        text_items.append((label, (label_x, label_y), self.font_scale * 0.7, (150, 150, 150), self.thickness))
    
    def _draw_player_panel(self, frame, player_name, stats, x_pos, y_pos, panel_width, panel_height, 
                          color, font_scale, thickness, line_height, bg_color, bg_alpha, text_items=None):
        """
        绘制单个球员信息面板
        
        参数:
            frame: 视频帧
            player_name: 球员名称
            stats: 球员统计信息
            x_pos, y_pos: 面板位置
            panel_width, panel_height: 面板尺寸
            color: 球员颜色
            font_scale, thickness, line_height: 字体参数
            bg_color, bg_alpha: 背景颜色和透明度
        """
        margin = max(5, int(panel_width * 0.05))
        
        # 绘制面板背景
        overlay = frame.copy()
        cv2.rectangle(overlay, (x_pos-margin, y_pos-margin), 
                     (x_pos+panel_width+margin, y_pos+panel_height+margin), 
                     bg_color, -1)
        cv2.addWeighted(overlay, bg_alpha, frame, 1 - bg_alpha, 0, frame)
        
        # 球员标题
        title_text = f"{player_name} {self.texts[self.language]['stats']}:"
        self._queue_or_draw_text(frame, text_items, title_text, (x_pos, y_pos), font_scale*1.1, color, thickness+1)
        
        # 当前速度
        current_speed_text = f"{self.texts[self.language]['current_speed']}: {stats.get('current_speed', 0):.2f} {self.texts[self.language]['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, current_speed_text, (x_pos, y_pos + line_height), font_scale, (255, 255, 255), thickness)
        
        # 当前回合统计
        y_rally = y_pos + 2*line_height
        rally_title = f"{self.texts[self.language]['current_rally']}:"
        self._queue_or_draw_text(frame, text_items, rally_title, (x_pos, y_rally), font_scale, (255, 255, 255), thickness)
        
        distance_text = f" {self.texts[self.language]['distance']}: {stats.get('rally_distance', 0):.2f} {self.texts[self.language]['unit_distance']}"
        self._queue_or_draw_text(frame, text_items, distance_text, (x_pos, y_rally + line_height), font_scale, (255, 255, 255), thickness)
        
        avg_speed_text = f" {self.texts[self.language]['avg_speed']}: {stats.get('rally_avg_speed', 0):.2f} {self.texts[self.language]['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, avg_speed_text, (x_pos, y_rally + 2*line_height), font_scale, (255, 255, 255), thickness)
        
        max_speed_text = f" {self.texts[self.language]['max_speed']}: {stats.get('rally_max_speed', 0):.2f} {self.texts[self.language]['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, max_speed_text, (x_pos, y_rally + 3*line_height), font_scale, (255, 255, 255), thickness)
        
        # 整场比赛统计
        y_match = y_rally + 4*line_height
        match_title = f"{self.texts[self.language]['match_total']}:"
        self._queue_or_draw_text(frame, text_items, match_title, (x_pos, y_match), font_scale, (255, 255, 255), thickness)
        
        total_distance_text = f" {self.texts[self.language]['total_distance']}: {stats.get('match_distance', 0):.2f} {self.texts[self.language]['unit_distance']}"
        self._queue_or_draw_text(frame, text_items, total_distance_text, (x_pos, y_match + line_height), font_scale, (255, 255, 255), thickness)
        
        match_avg_speed_text = f" {self.texts[self.language]['avg_speed']}: {stats.get('match_avg_speed', 0):.2f} {self.texts[self.language]['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, match_avg_speed_text, (x_pos, y_match + 2*line_height), font_scale, (255, 255, 255), thickness)
        
        match_max_speed_text = f" {self.texts[self.language]['max_speed']}: {stats.get('match_max_speed', 0):.2f} {self.texts[self.language]['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, match_max_speed_text, (x_pos, y_match + 3*line_height), font_scale, (255, 255, 255), thickness)

    def _draw_player_panel_compact(self, frame, player_name, stats, x_pos, y_pos, panel_width, panel_height,
                                    color, font_scale, thickness, line_height, bg_color, bg_alpha, text_items=None):
        """
        双打紧凑面板：字体更小、行距更紧凑，避免4人面板重叠。
        布局：标题 | 当前速度 | 回合(距离/均速/极速) | 比赛(总距/均速/极速)
        """
        t = self.texts[self.language]
        margin = max(3, int(panel_width * 0.04))

        # 绘制面板背景
        overlay = frame.copy()
        cv2.rectangle(overlay, (x_pos - margin, y_pos - margin),
                     (x_pos + panel_width + margin, y_pos + panel_height + margin),
                     bg_color, -1)
        cv2.addWeighted(overlay, bg_alpha, frame, 1 - bg_alpha, 0, frame)

        # 简化标题：使用短标签
        title_font = font_scale * 1.05
        self._queue_or_draw_text(frame, text_items, player_name,
                                 (x_pos, y_pos), title_font, color, thickness + 1)

        # 当前速度（单行）
        y = y_pos + line_height
        speed_text = f"{t['current_speed']}: {stats.get('current_speed', 0):.2f} {t['unit_speed']}"
        self._queue_or_draw_text(frame, text_items, speed_text,
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)

        # 回合统计标题
        y += line_height
        self._queue_or_draw_text(frame, text_items, f"{t['current_rally']}:",
                                 (x_pos, y), font_scale, (200, 200, 200), thickness)

        # 回合数据三行（紧凑）
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['distance']}: {stats.get('rally_distance', 0):.1f}{t['unit_distance']}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['avg_speed']}: {stats.get('rally_avg_speed', 0):.2f}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['max_speed']}: {stats.get('rally_max_speed', 0):.2f}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)

        # 比赛统计标题
        y += line_height
        self._queue_or_draw_text(frame, text_items, f"{t['match_total']}:",
                                 (x_pos, y), font_scale, (200, 200, 200), thickness)

        # 比赛数据三行
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['total_distance']}: {stats.get('match_distance', 0):.1f}{t['unit_distance']}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['avg_speed']}: {stats.get('match_avg_speed', 0):.2f}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)
        y += line_height
        self._queue_or_draw_text(frame, text_items,
                                 f" {t['max_speed']}: {stats.get('match_max_speed', 0):.2f}",
                                 (x_pos, y), font_scale, (255, 255, 255), thickness)

    def _queue_or_draw_text(self, frame, text_items, text, position, font_scale, color, thickness):
        if text_items is None:
            self.add_text(frame, text, position, font_scale, color, thickness)
        else:
            text_items.append((text, position, font_scale, color, thickness))
