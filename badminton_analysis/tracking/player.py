from collections import deque

import numpy as np

from ..court.mapper import CourtMapper


SINGLES_REGIONS = ["upper", "lower"]
DOUBLES_REGIONS = ["upper_1", "upper_2", "lower_1", "lower_2"]


class SimpleKalmanFilter:
    """2D constant-velocity Kalman filter for player position prediction.

    State vector: [x, y, vx, vy]^T
    Measurement vector: [x, y]^T
    """

    def __init__(self, dt=1.0):
        self.dt = dt
        self.state = np.zeros((4, 1))
        self.covariance = np.eye(4) * 1000
        # Process noise covariance
        self.Q = np.eye(4) * 0.1
        # Measurement noise covariance
        self.R = np.eye(2) * 1.0
        # Measurement matrix
        self.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]])
        # State transition matrix
        self.F = np.array([
            [1, 0, dt, 0],
            [0, 1, 0, dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
        ])
        self.initialized = False

    def predict(self):
        """Predict next state and return predicted position [x, y]."""
        self.state = self.F @ self.state
        self.covariance = self.F @ self.covariance @ self.F.T + self.Q
        return self.state[:2].flatten()

    def update(self, measurement):
        """Update filter with measurement and return filtered position [x, y]."""
        if not self.initialized:
            self.state[:2] = measurement.reshape(2, 1)
            self.initialized = True
            return self.state[:2].flatten()
        z = measurement.reshape(2, 1)
        y = z - self.H @ self.state
        S = self.H @ self.covariance @ self.H.T + self.R
        K = self.covariance @ self.H.T @ np.linalg.inv(S)
        self.state = self.state + K @ y
        self.covariance = (np.eye(4) - K @ self.H) @ self.covariance
        return self.state[:2].flatten()


class PlayerTracker:
    """
    Player tracking system.

    Tracks player positions, court coordinates, movement statistics, and writes
    one structured detection record per processed court frame.

    mode='singles': tracks 2 players (upper / lower)
    mode='doubles': tracks 4 players (upper_1, upper_2, lower_1, lower_2)

    Features:
    - Kalman filter motion prediction for occlusion handling
    - Hysteresis threshold for stable half-court assignment
    - Identity swap detection to prevent player ID confusion
    """

    def __init__(self, corners, threshold=680, history_size=50, detection_writer=None, fps=30, mode='singles'):
        self.threshold = threshold
        self.fps = fps
        self.detection_writer = detection_writer
        self.max_frame_distance = 8.0 / self.fps
        self.mode = mode
        self.regions = DOUBLES_REGIONS if mode == 'doubles' else SINGLES_REGIONS

        self.players = {r: None for r in self.regions}
        self.history = {r: deque(maxlen=history_size) for r in self.regions}
        self.court_history = {r: deque(maxlen=history_size) for r in self.regions}

        self.match_stats = {r: {"total_distance": 0, "max_speed": 0, "total_frames": 0} for r in self.regions}
        self.rally_stats = {r: {"total_distance": 0, "max_speed": 0, "total_frames": 0} for r in self.regions}
        self.current_speed = {r: 0 for r in self.regions}

        # Kalman filters for motion prediction
        dt = 1.0 / max(self.fps, 1)
        self.kalman_filters = {r: SimpleKalmanFilter(dt=dt) for r in self.regions}
        self.missed_frames = {r: 0 for r in self.regions}
        self.max_missed_frames = max(5, int(self.fps * 2))  # Allow up to 2 seconds of missing

        # Hysteresis margin for half-court boundary (pixels)
        self.hysteresis_margin = 30

        self.court_mapper = CourtMapper(corners)

    def _empty_player_record(self):
        return {
            "image": None,
            "court": None,
            "speed": None,
            "hands": {
                "left": None,
                "right": None,
            },
        }

    def _initialize_player_record(self):
        return {r: self._empty_player_record() for r in self.regions}

    def _point_or_none(self, point, zero_is_none=False):
        if point is None:
            return None
        try:
            x, y = point[0], point[1]
        except (TypeError, IndexError):
            return None
        if x is None or y is None:
            return None
        if zero_is_none and float(x) == 0.0 and float(y) == 0.0:
            return None
        return [float(x), float(y)]

    def write_detection_record(self, frame_index, players_record, ball_image_position, detect_frame_count):
        if self.detection_writer is None:
            return

        record = {
            "schema_version": "2.0",
            "frame": int(frame_index),
            "time_sec": round(frame_index / self.fps, 6) if self.fps else None,
            "detect_frame": int(detect_frame_count),
            "players": players_record,
            "shuttlecock": {
                "image": self._point_or_none(ball_image_position, zero_is_none=True),
            },
        }
        self.detection_writer.write(record)

    def update(self, frame_index, centroids, ball_image_position, left_hand_positions, right_hand_positions, detect_frame_count):
        players_record = self._initialize_player_record()

        for region in self.regions:
            if self.players[region] is not None:
                self.match_stats[region]["total_frames"] += 1
                self.rally_stats[region]["total_frames"] += 1

        # Use hysteresis-based classification for half-court assignment
        upper_candidates, lower_candidates = self._classify_candidates(centroids)

        if self.mode == 'doubles':
            upper_keys = ["upper_1", "upper_2"]
            lower_keys = ["lower_1", "lower_2"]
            assignments = self._assign_candidates(upper_candidates, upper_keys)
            assignments.update(self._assign_candidates(lower_candidates, lower_keys))
        else:
            # Singles: upper half keeps at most 1 player (closest to threshold)
            if len(upper_candidates) > 1:
                upper_candidates.sort(key=lambda p: -p[1])
                upper_candidates = [upper_candidates[0]]
            assignments = {}
            if upper_candidates:
                assignments["upper"] = upper_candidates[0]
            if lower_candidates:
                assignments["lower"] = lower_candidates[0]

        for region, centroid in assignments.items():
            try:
                left_hand = left_hand_positions.get(centroid[1])
                right_hand = right_hand_positions.get(centroid[1])
                self._update_player_position(region, centroid, left_hand, right_hand, players_record)
            except Exception as exc:
                print(f"Error processing player position: {exc}")
                import traceback
                traceback.print_exc()

        self.write_detection_record(frame_index, players_record, ball_image_position, detect_frame_count)
        return self.players

    def _classify_candidates(self, centroids):
        """Classify centroids into upper/lower half using hysteresis to prevent boundary jitter.

        Uses a hysteresis margin: a player previously assigned to upper half needs
        to cross deeper into the lower half before being reclassified (and vice versa).
        """
        upper = []
        lower = []
        for c in centroids:
            y = c[1]
            # Check if this centroid likely belongs to an existing tracked player
            existing_region = self._find_player_region(c)
            if existing_region and existing_region.startswith('upper'):
                # Was upper-half player: need to cross deeper to become lower
                if y < self.threshold + self.hysteresis_margin:
                    upper.append(c)
                else:
                    lower.append(c)
            elif existing_region and existing_region.startswith('lower'):
                # Was lower-half player: need to cross deeper to become upper
                if y >= self.threshold - self.hysteresis_margin:
                    lower.append(c)
                else:
                    upper.append(c)
            else:
                # New player, use original threshold
                if y < self.threshold:
                    upper.append(c)
                else:
                    lower.append(c)
        return upper, lower

    def _find_player_region(self, centroid):
        """Find the nearest tracked player region for a given centroid.

        Returns the region key if within a reasonable distance (50 pixels), else None.
        """
        best_region = None
        best_dist = float('inf')
        for region, pos in self.players.items():
            if pos is not None:
                d = float(np.hypot(centroid[0] - pos[0], centroid[1] - pos[1]))
                if d < best_dist:
                    best_dist = d
                    best_region = region
        # Only match if within reasonable distance
        return best_region if best_dist < 50 else None

    def _get_effective_position(self, region_key):
        """Get the best available position for a region.

        Returns the last known position, or the Kalman-predicted position if
        the player was recently lost (within max_missed_frames).
        """
        if self.players[region_key] is not None:
            return self.players[region_key]
        # Use Kalman prediction if within allowed missed frames
        if self.missed_frames[region_key] < self.max_missed_frames:
            predicted = self.kalman_filters[region_key].predict()
            return (float(predicted[0]), float(predicted[1]))
        return None

    def _assign_candidates(self, candidates, region_keys):
        """Assign candidate centroids to region_keys using minimum-cost matching.

        Features:
        - Kalman-predicted positions for recently lost players
        - Identity swap detection when n_cands >= n_regions
        - Graceful handling of occlusion (n_cands < n_regions)

        Returns a dict mapping region_key -> centroid.
        Unmatched region_keys are not included.
        """
        if not candidates:
            return {}

        n_cands = len(candidates)
        n_regions = len(region_keys)

        # Collect effective positions (last known or Kalman-predicted)
        known = [self._get_effective_position(k) for k in region_keys]

        if n_cands == 1:
            # Assign to the region with closest effective position
            centroid = candidates[0]
            best_key = None
            best_dist = float('inf')
            for k, pos in zip(region_keys, known):
                if pos is None:
                    if best_key is None:
                        best_key = k
                        best_dist = 0
                else:
                    d = float(np.hypot(centroid[0] - pos[0], centroid[1] - pos[1]))
                    if d < best_dist:
                        best_dist = d
                        best_key = k
            return {best_key: centroid} if best_key else {}

        if n_cands >= n_regions:
            # More (or equal) candidates than regions -> permutation matching with swap detection
            from itertools import permutations
            best_cost = float('inf')
            best_assignment = None
            best_has_swap = False

            for perm in permutations(range(n_cands), n_regions):
                cost = 0
                has_swap = False
                for idx, k_idx in enumerate(range(n_regions)):
                    pos = known[k_idx]
                    c = candidates[perm[idx]]
                    if pos is not None:
                        cost += float(np.hypot(c[0] - pos[0], c[1] - pos[1]))
                    # Detect potential identity swap: if candidate i assigned to region j
                    # but is closer to another region k, this might be a swap
                    if n_regions == 2 and pos is not None:
                        other_idx = 1 - k_idx
                        other_pos = known[other_idx]
                        if other_pos is not None:
                            dist_to_own = float(np.hypot(c[0] - pos[0], c[1] - pos[1]))
                            dist_to_other = float(np.hypot(c[0] - other_pos[0], c[1] - other_pos[1]))
                            if dist_to_other < dist_to_own * 0.7:
                                has_swap = True

                # Penalize swaps slightly to prefer identity stability
                if has_swap:
                    cost *= 1.15  # 15% penalty for swap configurations

                if cost < best_cost:
                    best_cost = cost
                    best_assignment = perm
                    best_has_swap = has_swap

            # If the best assignment is a swap but cost difference is marginal,
            # prefer the no-swap assignment for identity stability
            if best_has_swap and n_regions == 2:
                # Compute no-swap cost (perm = [0, 1])
                no_swap_cost = 0
                for k_idx in range(n_regions):
                    pos = known[k_idx]
                    c = candidates[k_idx]
                    if pos is not None:
                        no_swap_cost += float(np.hypot(c[0] - pos[0], c[1] - pos[1]))
                # Only accept swap if it's significantly better (>30% improvement)
                if no_swap_cost > 0 and best_cost > no_swap_cost * 0.7:
                    best_assignment = (0, 1)

            result = {}
            for k_idx, cand_idx in enumerate(best_assignment):
                result[region_keys[k_idx]] = candidates[cand_idx]
            return result

        # Fewer candidates than regions -> assign each candidate to nearest unoccupied region
        assigned_regions = set()
        result = {}
        for c in candidates:
            best_key = None
            best_dist = float('inf')
            for k, pos in zip(region_keys, known):
                if k in assigned_regions:
                    continue
                if pos is None:
                    if best_key is None:
                        best_key = k
                        best_dist = 0
                else:
                    d = float(np.hypot(c[0] - pos[0], c[1] - pos[1]))
                    if d < best_dist:
                        best_dist = d
                        best_key = k
            if best_key:
                result[best_key] = c
                assigned_regions.add(best_key)
        return result

    def _update_player_position(self, region, centroid, left_hand_pos, right_hand_pos, players_record):
        # Update Kalman filter with measurement
        self.kalman_filters[region].update(np.array(centroid, dtype=np.float64))
        self.missed_frames[region] = 0  # Reset missed counter

        self.players[region] = centroid
        self.history[region].append(centroid)

        court_position = self.court_mapper.image_to_court(centroid)
        self.court_history[region].append(court_position)

        player_record = players_record[region]
        player_record["image"] = self._point_or_none(centroid)
        player_record["court"] = self._point_or_none(court_position)
        player_record["speed"] = float(self.current_speed[region])
        if left_hand_pos:
            player_record["hands"]["left"] = self._point_or_none(left_hand_pos)
        if right_hand_pos:
            player_record["hands"]["right"] = self._point_or_none(right_hand_pos)

        # Increment missed_frames for regions that were NOT updated in this frame
        for r in self.regions:
            if r != region:
                self.missed_frames[r] += 1

    def _update_rally_and_match_stats(self, region, distance, speed):
        capped_speed = round(min(speed, 8.0), 2)

        self.rally_stats[region]["total_distance"] += distance
        self.rally_stats[region]["max_speed"] = max(self.rally_stats[region]["max_speed"], capped_speed)
        self.current_speed[region] = capped_speed

        self.match_stats[region]["total_distance"] += distance
        self.match_stats[region]["max_speed"] = max(self.match_stats[region]["max_speed"], capped_speed)
        self.current_speed[region] = capped_speed

    def start_new_rally(self):
        for region in self.regions:
            self.rally_stats[region]["total_distance"] = 0
            self.rally_stats[region]["max_speed"] = 0
            self.rally_stats[region]["total_frames"] = 0
            # Reset Kalman filters and missed frame counters on new rally
            dt = 1.0 / max(self.fps, 1)
            self.kalman_filters[region] = SimpleKalmanFilter(dt=dt)
            self.missed_frames[region] = 0

    def get_player_movement_stats(self):
        stats = {}
        for region in self.regions:
            history = [pos for pos in list(self.court_history[region]) if pos is not None]
            region_stats = {
                "current_speed": 0,
                "rally_avg_speed": 0,
                "rally_max_speed": 0,
                "rally_distance": 0,
                "match_avg_speed": 0,
                "match_max_speed": 0,
                "match_distance": 0,
                "position_count": len(history),
            }

            if len(history) < 2:
                stats[region] = region_stats
                continue

            current_time = len(history) - 1
            window_start = max(0, current_time - int(self.fps / 2))
            half_second_total_distance = 0
            valid_frames = 0
            actual_time_span = 0
            sample_interval = 5

            if current_time - window_start < sample_interval:
                sample_points = [window_start, current_time]
            else:
                sample_points = list(range(window_start, current_time + 1, sample_interval))
                if current_time not in sample_points:
                    sample_points.append(current_time)

            for i in range(len(sample_points) - 1):
                idx1 = sample_points[i]
                idx2 = sample_points[i + 1]
                p1 = np.array(history[idx1])
                p2 = np.array(history[idx2])
                distance = np.linalg.norm(p2 - p1)
                time_span = (idx2 - idx1) / self.fps
                max_possible_distance = self.max_frame_distance * (idx2 - idx1)

                if distance > 0.05 and distance < max_possible_distance:
                    half_second_total_distance += distance
                    valid_frames += 1
                    actual_time_span += time_span

            current_speed = 0
            if valid_frames > 0 and actual_time_span > 0:
                current_speed = half_second_total_distance / actual_time_span
                self._update_rally_and_match_stats(region, half_second_total_distance, current_speed)

            current_speed = min(current_speed, 8.0)

            rally_distance = self.rally_stats[region]["total_distance"]
            rally_max_speed = self.rally_stats[region]["max_speed"]
            rally_frames = self.rally_stats[region]["total_frames"]
            if rally_frames > 1 and self.fps > 0:
                rally_time = rally_frames / self.fps
                rally_avg_speed = rally_distance / rally_time if rally_time > 0 else 0
            else:
                rally_avg_speed = 0

            match_distance = self.match_stats[region]["total_distance"]
            match_max_speed = self.match_stats[region]["max_speed"]
            match_frames = self.match_stats[region]["total_frames"]
            if match_frames > 1 and self.fps > 0:
                match_time = match_frames / self.fps
                match_avg_speed = match_distance / match_time if match_time > 0 else 0
            else:
                match_avg_speed = 0

            region_stats["current_speed"] = round(current_speed, 2)
            region_stats["rally_avg_speed"] = round(rally_avg_speed, 2)
            region_stats["rally_max_speed"] = round(rally_max_speed, 2)
            region_stats["rally_distance"] = round(rally_distance, 2)
            region_stats["match_avg_speed"] = round(match_avg_speed, 2)
            region_stats["match_max_speed"] = round(match_max_speed, 2)
            region_stats["match_distance"] = round(match_distance, 2)
            stats[region] = region_stats

        return stats

    def get_player_trajectories(self):
        return {region: list(history) for region, history in self.history.items()}
    def close(self):
        if self.detection_writer is not None:
            self.detection_writer.close()
