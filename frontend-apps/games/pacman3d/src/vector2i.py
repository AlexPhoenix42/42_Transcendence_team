class Vector2i:
    __slots__ = ('x', 'y')
    
    def __init__(self, x_or_v, y=None):
        if y is None:
            self.x = int(x_or_v.x)
            self.y = int(x_or_v.y)
        else:
            self.x = int(x_or_v)
            self.y = int(y)
        
    def __add__(self, other):
        return Vector2i(self.x + other.x, self.y + other.y)

    def __eq__(self, other):
        if isinstance(other, Vector2i):
            return self.x == other.x and self.y == other.y
        return False
    
    def __iadd__(self, other):
        self.x += other.x
        self.y += other.y
        return self
        
    def __iter__(self):
        yield self.x
        yield self.y

    def __repr__(self):
        return f"Vector2i({self.x}, {self.y})"

