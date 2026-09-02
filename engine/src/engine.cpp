#include "chess.hpp"
#include <iostream>
#include <string>

// Entry point for testing the engine.
// In production, Django calls this via ctypes or subprocess.
int main() {
    chess::Board board;
    chess::Movelist moves;
    chess::movegen::legalmoves(moves, board);
    std::cout << "Legal moves from start: " << moves.size() << std::endl;
    return 0;
}
