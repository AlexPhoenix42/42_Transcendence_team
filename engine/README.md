# Chess Engine

C++ chess logic layer using chess.hpp (Disservin/chess-library).

## Setup

Download chess.hpp directly from GitHub (no npm, no package manager):

```bash
curl -o include/chess.hpp \
  https://raw.githubusercontent.com/Disservin/chess-library/master/src/chess.hpp
```

## Build

```bash
make
./engine
```

## Integration with Django

Django calls the engine via ctypes (shared library) or subprocess.
See backend/chess_app/game/ for the Python bridge.

