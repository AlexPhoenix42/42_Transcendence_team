CXX      = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra -Iinclude

SRC  = src/engine.cpp
OUT  = engine

all: $(OUT)

$(OUT): $(SRC) include/chess.hpp
	$(CXX) $(CXXFLAGS) $(SRC) -o $(OUT)

clean:
	rm -f $(OUT)

.PHONY: all clean
