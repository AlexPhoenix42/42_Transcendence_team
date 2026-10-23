import math

def v2_dot(ax, ay, bx, by):
    return (ax * bx) + (ay * by)

def v2_sqr_dist(fromx, fromy, tox, toy):
    tox -= fromx
    toy -= fromy
    return v2_dot(tox, toy, tox, toy)

def v2_dir(fromx, fromy, tox, toy):
    tox -= fromx
    toy -= fromy
    inv_len = 1.0 / math.sqrt(v2_dot(tox, toy, tox, toy))
    tox *= inv_len
    toy *= inv_len
    return (tox, toy)


def raycast_billboard(px, py, dx, dy, cx, cy, radius):
    rx, ry = -dy, dx
    lx, ly = v2_dir(px, py, cx, cy)
    dist = v2_dot(cx - px, cy - py, dx, dy)
    if dist < 0:
        return float("inf")
    px += dx * dist
    py += dy * dist
    dx = cx - px
    dy = cy - py
    if v2_dot(dx, dy, dx, dy) <= (radius * radius):
        return dist
    return float("inf")

