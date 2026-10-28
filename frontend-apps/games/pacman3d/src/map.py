from vector2i import Vector2i
from game_state import GameState
from pygame.math import Vector2
import math
import heapq


N = 1
E = 2
S = 4
W = 8
GUM = 16
SUPERGUM = 32
IS_OCCUPIED = 64
IS_VISIBLE = 128

directions = [(0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0)]
inv_dir = [S, W, N, E]

class Map:
    width: int
    height: int
    cells: list[list[int]]
    player_pos: Vector2i
    player_dir: Vector2i
    _gamestate: GameState

    def __init__(self, width: int, height: int, cells: list[list[int]], state: GameState) -> None:
        self.width = width
        self.height = height
        self.cells = cells
        self._gamestate = state
        self.player_pos = Vector2i(width // 2, height // 2)
        self.player_dir = Vector2i(0, 0)
        gum_count = 0
        for y in range(self.height):
            for x in range(self.width):
                if ((x == 0) or (x == (self.width - 1))) and ((y == 0) or (y == (self.height - 1))):
                    self.cells[y][x] |= SUPERGUM
                elif (self.cells[y][x] & 15) != 15:
                    self.cells[y][x] |= GUM
                    gum_count += 1
        state.reset(gum_count)

    def cast_ray(self, origin: Vector2, dir: Vector2, visible_cells: set[tuple[int, int]]) -> tuple[float, int, float]:
        cell = Vector2i(origin)

        out_of_bounds = cell.x < 0 or cell.y < 0 or cell.x >= self.width or cell.y >= self.height
        if out_of_bounds or ((self.cells[cell.y][cell.x] & 15) == 15):
            return None, 0, 0.0

        delta_dist = Vector2(abs(1 / dir.x) if dir.x != 0 else float('inf'),
                             abs(1 / dir.y) if dir.y != 0 else float('inf'))

        if dir.x < 0:
            step_x = -1
            side_dist_x = (origin.x - cell.x) * delta_dist.x
        else:
            step_x = 1
            side_dist_x = (cell.x + 1.0 - origin.x) * delta_dist.x
        if dir.y < 0:
            step_y = -1
            side_dist_y = (origin.y - cell.y) * delta_dist.y
        else:
            step_y = 1
            side_dist_y = (cell.y + 1.0 - origin.y) * delta_dist.y

        hit = False
        side = 0

        while True:
            if (visible_cells is not None):
                visible_cells.add((cell.x, cell.y))

            if side_dist_x < side_dist_y:
                side_dist_x += delta_dist.x
                side = 0
                next_x = cell.x + step_x

                if step_x < 0 and (self.cells[cell.y][cell.x] & W): break
                elif step_x > 0 and (self.cells[cell.y][cell.x] & E): break
                cell.x = next_x
            else:
                side_dist_y += delta_dist.y
                side = 1
                next_y = cell.y + step_y

                if step_y < 0 and (self.cells[cell.y][cell.x] & N): break
                elif step_y > 0 and (self.cells[cell.y][cell.x] & S): break
                cell.y = next_y
    
        if side == 0:
            perp_dist = (cell.x - origin.x + (1 + step_x) / 2) / dir.x
            wall_x = origin.y + perp_dist * dir.y
        else:
            perp_dist = (cell.y - origin.y + (1 + step_y) / 2) / dir.y
            wall_x = origin.x + perp_dist * dir.x

        wall_x -= math.floor(wall_x)

        return perp_dist, side, wall_x

    def find_path(self, start: Vector2i, end: Vector2i) -> list[Vector2i]:
        if start.x == end.x and start.y == end.y:
            return []
            
        width, height = self.width, self.height
        map_data = [[0, 0, 0, 0] for _ in range(width * height)]
        
        h0 = abs(end.x - start.x) + abs(end.y - start.y)
        pq = [(h0, 0, start.x, start.y, start.x, start.y)]
        
        found = False
        end_x, end_y = end.x, end.y
        
        while pq:
            f, cost, x, y, px, py = heapq.heappop(pq)
            idx = y * width + x
            
            if map_data[idx][1]:
                if map_data[idx][0] <= cost:
                    continue
            
            map_data[idx] = [cost, 1, px, py]
            
            if x == end_x and y == end_y:
                found = True
                break
                
            next_cost = cost + 1
            
            if not (self.cells[y][x] & 1) and not (self.cells[y - 1][x] & IS_OCCUPIED):
                n_idx = (y - 1) * width + x
                if not map_data[n_idx][1] or map_data[n_idx][0] > next_cost:
                    h = abs(end_x - x) + abs(end_y - (y - 1))
                    heapq.heappush(pq, (next_cost + h, next_cost, x, y - 1, x, y))
                    
            if not (self.cells[y][x] & 2) and not (self.cells[y][x + 1] & IS_OCCUPIED):
                n_idx = y * width + (x + 1)
                if not map_data[n_idx][1] or map_data[n_idx][0] > next_cost:
                    h = abs(end_x - (x + 1)) + abs(end_y - y)
                    heapq.heappush(pq, (next_cost + h, next_cost, x + 1, y, x, y))
                    
            if not (self.cells[y][x] & 4) and not (self.cells[y + 1][x] & IS_OCCUPIED):
                n_idx = (y + 1) * width + x
                if not map_data[n_idx][1] or map_data[n_idx][0] > next_cost:
                    h = abs(end_x - x) + abs(end_y - (y + 1))
                    heapq.heappush(pq, (next_cost + h, next_cost, x, y + 1, x, y))
                    
            if not (self.cells[y][x] & 8) and not (self.cells[y][x - 1] & IS_OCCUPIED):
                n_idx = y * width + (x - 1)
                if not map_data[n_idx][1] or map_data[n_idx][0] > next_cost:
                    h = abs(end_x - (x - 1)) + abs(end_y - y)
                    heapq.heappush(pq, (next_cost + h, next_cost, x - 1, y, x, y))

        if not found:
            return []
            
        path = []
        cx, cy = end_x, end_y
        while cx != start.x or cy != start.y:
            p_idx = cy * width + cx
            px, py = map_data[p_idx][2], map_data[p_idx][3]
            path.append(Vector2i(cx - px, cy - py))
            cx, cy = px, py
            
        return path

    def check_collision(self, start: Vector2, end: Vector2) -> bool:
        new_cx, new_cy = int(end.x), int(end.y)
    
        if not (0 <= new_cx < self.width and 0 <= new_cy < self.height):
            return False
            
        cur_cx, cur_cy = int(start.x), int(start.y)
        
        if cur_cx != new_cx or cur_cy != new_cy:
            current_cell = self.cells[cur_cy][cur_cx]
            target_cell = self.cells[new_cy][new_cx]
            
            if (current_cell & 15) == 15 or (target_cell & 15) == 15:
                return False
                
            if new_cx > cur_cx and (current_cell & E): return False
            if new_cx < cur_cx and (current_cell & W): return False
            if new_cy > cur_cy and (current_cell & S): return False
            if new_cy < cur_cy and (current_cell & N): return False
            
            if new_cx > cur_cx and (target_cell & W): return False
            if new_cx < cur_cx and (target_cell & E): return False
            if new_cy > cur_cy and (target_cell & N): return False
            if new_cy < cur_cy and (target_cell & S): return False
            
        return True

    def check_radius_collision(self, pos: Vector2, radius: float) -> bool:
        cx, cy = int(pos.x), int(pos.y)
        
        if not (0 <= cx < self.width and 0 <= cy < self.height):
            return False
            
        cell = self.cells[cy][cx]
        if (cell & 15) == 15:
            return False
            
        fx = pos.x - cx
        fy = pos.y - cy
        
        if (cell & 1) and (fy - radius < 0.0):
            return False
        if (cell & 2) and (fx + radius > 1.0):
            return False
        if (cell & 4) and (fy + radius > 1.0):
            return False
        if (cell & 8) and (fx - radius < 0.0):
            return False
            
        if fx < radius and cx > 0:
            left_cell = self.cells[cy][cx - 1]
            if (left_cell & 2) or ((left_cell & 15) == 15):
                return False
        if fx > 1.0 - radius and cx < self.width - 1:
            right_cell = self.cells[cy][cx + 1]
            if (right_cell & 8) or ((right_cell & 15) == 15):
                return False
        if fy < radius and cy > 0:
            top_cell = self.cells[cy - 1][cx]
            if (top_cell & 4) or ((top_cell & 15) == 15):
                return False
        if fy > 1.0 - radius and cy < self.height - 1:
            bottom_cell = self.cells[cy + 1][cx]
            if (bottom_cell & 1) or ((bottom_cell & 15) == 15):
                return False
                
        return True

    def update_player_pos(self, fpos: Vector2, frame: int) -> int:
        pos = Vector2i(int(fpos.x), int(fpos.y))
        result = 0
        self.player_dir.x = pos.x - self.player_pos.x
        self.player_dir.y = pos.y - self.player_pos.y
        self.player_pos = pos
        if (self.cells[pos.y][pos.x] & GUM):
            self.cells[pos.y][pos.x] &= ~GUM
            self._gamestate.eat_gum()
        elif (self.cells[pos.y][pos.x] & SUPERGUM):
            result = 1
            self.cells[pos.y][pos.x] &= ~SUPERGUM
            if not self._gamestate.has_superbonus(frame)[0]:
                result += 1
            self._gamestate.eat_supergum(frame)
        return result

