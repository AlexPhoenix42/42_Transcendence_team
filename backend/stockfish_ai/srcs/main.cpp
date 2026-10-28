// backend/stockfish_ai/srcs/main.cpp

#include <unistd.h>       // pipe, fork, dup2, close, write, read
#include <sys/wait.h>     // waitpid, wait
#include <poll.h>         // poll
#include <signal.h>       // kill, SIGKILL
#include <algorithm>      // std::find (for difficulty validation)
#include <vector>         // std::vector
#include <cstring>        // strchr (already in use, but safe)

#include <cpp-httplib.h>
#include <json.hpp>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>
#include <memory>
#include <stdexcept>

static const char* ENGINE_PORT_ENV = "ENGINE_PORT";
static const int   DEFAULT_PORT   = 4191;

// At the top of main.cpp (after includes)
static const std::vector<std::string> ALLOWED_DIFFICULTIES = {"easy", "medium", "hard"};

// ── Simple stdout logger ──────────────────────────────────────────────────
static void log_request(const std::string& method, const std::string& path,
                        int status) {
    std::cout << method << " " << path << " → " << status << std::endl;
}

// ── Convert difficulty string to UCI Skill Level ─────────────────────────
static int difficulty_to_skill(const std::string& diff) {
    if (diff == "easy")   return 5;
    if (diff == "medium") return 10;
    if (diff == "hard")   return 20;
    return 10;
}

// ── Run Stockfish and return the best move ─────────────────────────────────
static std::string get_best_move(const std::string& fen,
                                  const std::string& difficulty,
                                  int wtime, int btime, int winc, int binc) {
    // 1. Create pipes
    int stdin_pipe[2], stdout_pipe[2];
    if (pipe(stdin_pipe) == -1 || pipe(stdout_pipe) == -1)
        throw std::runtime_error("pipe creation failed");

    // 2. Fork
    pid_t pid = fork();
    if (pid == -1)
        throw std::runtime_error("fork failed");

    if (pid == 0) {
        // ---- CHILD ----
        close(stdin_pipe[1]);
        close(stdout_pipe[0]);
        dup2(stdin_pipe[0], STDIN_FILENO);
        dup2(stdout_pipe[1], STDOUT_FILENO);
        close(stdin_pipe[0]);
        close(stdout_pipe[1]);

        const char* argv[] = {"stockfish", nullptr};
        execvp("stockfish", (char* const*)argv);
        perror("execvp");
        exit(1);
    }

    // ---- PARENT ----
    close(stdin_pipe[0]);
    close(stdout_pipe[1]);

    // Helper to write a command
    auto write_cmd = [&](const std::string& cmd) {
        std::string with_nl = cmd + "\n";
        ssize_t n = write(stdin_pipe[1], with_nl.c_str(), with_nl.size());
        if (n == -1) {
            close(stdin_pipe[1]);
            close(stdout_pipe[0]);
            kill(pid, SIGKILL);
            wait(nullptr);
            throw std::runtime_error("write failed");
        }
    };

    // 3. Send UCI commands
    write_cmd("uci");
    write_cmd("setoption name Skill Level value " + std::to_string(difficulty_to_skill(difficulty)));
    write_cmd("ucinewgame");
    write_cmd("position fen " + fen);

    // Build the "go" command: use time controls if provided, else movetime
    std::string go_cmd;
    if (wtime > 0 || btime > 0) {
        go_cmd = "go wtime " + std::to_string(wtime) +
                 " btime " + std::to_string(btime) +
                 " winc " + std::to_string(winc) +
                 " binc " + std::to_string(binc);
    } else {
        go_cmd = "go movetime 1000";  // default 1 second
    }
    write_cmd(go_cmd);

    // 4. Read output until "bestmove"
    const int BUFFER_SIZE = 4096;
    char buffer[BUFFER_SIZE];
    std::string output;
    std::string bestmove_line;

    struct pollfd fds;
    fds.fd = stdout_pipe[0];
    fds.events = POLLIN;

    bool has_bestmove = false;
    int timeout_ms = 5000;  // 5 seconds

    while (!has_bestmove && timeout_ms > 0) {
        int ret = poll(&fds, 1, timeout_ms);
        if (ret == -1) break;
        if (ret == 0) break;  // timeout
        ssize_t n = read(stdout_pipe[0], buffer, BUFFER_SIZE - 1);
        if (n <= 0) break;
        buffer[n] = '\0';
        output += buffer;

        size_t pos = output.find("bestmove");
        if (pos != std::string::npos) {
            size_t end = output.find('\n', pos);
            if (end == std::string::npos) end = output.size();
            bestmove_line = output.substr(pos, end - pos);
            has_bestmove = true;
            break;
        }
    }

    // Clean up
    close(stdin_pipe[1]);
    close(stdout_pipe[0]);
    int status;
    waitpid(pid, &status, 0);

    if (!has_bestmove || bestmove_line.empty()) {
        kill(pid, SIGKILL);
        waitpid(pid, nullptr, 0);
        throw std::runtime_error("no bestmove received or timeout");
    }

    // Parse "bestmove e2e4" or "bestmove e2e4 ponder e7e5"
    std::string move;
    size_t first = bestmove_line.find(' ');
    if (first != std::string::npos) {
        size_t second = bestmove_line.find(' ', first + 1);
        if (second != std::string::npos)
            move = bestmove_line.substr(first + 1, second - first - 1);
        else
            move = bestmove_line.substr(first + 1);
    } else {
        move = bestmove_line;
    }
    // trim whitespace
    move.erase(0, move.find_first_not_of(" \t\n\r"));
    move.erase(move.find_last_not_of(" \t\n\r") + 1);

    if (move.empty() || move == "bestmove")
        throw std::runtime_error("invalid bestmove response");

    return move;
}

#include <string>
#include <sstream>
#include <vector>
#include <cctype>

bool isValidFen(const std::string& fen) {
    std::vector<std::string> parts;
    std::stringstream ss(fen);
    std::string part;
    while (std::getline(ss, part, ' ')) {
        if (!part.empty()) parts.push_back(part);
    }

    // FEN must have exactly 6 fields
    if (parts.size() != 6) return false;

    // 1. Board position (8 ranks separated by '/')
    const std::string& board = parts[0];
    std::vector<std::string> ranks;
    std::stringstream board_ss(board);
    std::string rank;
    while (std::getline(board_ss, rank, '/')) {
        if (rank.empty()) return false;
        ranks.push_back(rank);
    }
    if (ranks.size() != 8) return false;

    int whiteKings = 0, blackKings = 0;
    for (int i = 0; i < 8; ++i) {
        int square_count = 0;
        for (char c : ranks[i]) {
            if (std::isdigit(c)) {
                square_count += (c - '0');
                // digit must be 1-8
                if (c < '1' || c > '8') return false;
            } else if (strchr("pnbrqkPNBRQK", c)) {
                square_count += 1;
                if (c == 'K') whiteKings++;
                else if (c == 'k') blackKings++;
            } else {
                return false; // invalid piece char
            }
        }
        if (square_count != 8) return false; // rank must have 8 squares
    }
    // Exactly one king per side
    if (whiteKings != 1 || blackKings != 1) return false;

    // 2. Active colour: must be 'w' or 'b'
    if (parts[1].size() != 1 || (parts[1][0] != 'w' && parts[1][0] != 'b')) return false;

    // 3. Castling: must be '-' or any combination of KQkq (no duplicates)
    const std::string& castling = parts[2];
    if (castling != "-") {
        bool hasK=false, hasQ=false, hask=false, hasq=false;
        for (char c : castling) {
            if (c == 'K') { if (hasK) return false; hasK = true; }
            else if (c == 'Q') { if (hasQ) return false; hasQ = true; }
            else if (c == 'k') { if (hask) return false; hask = true; }
            else if (c == 'q') { if (hasq) return false; hasq = true; }
            else return false;
        }
    }

    // 4. En passant: '-' or a valid square (e.g. e3)
    const std::string& ep = parts[3];
    if (ep != "-") {
        if (ep.size() != 2) return false;
        char file = ep[0], rank = ep[1];
        if (file < 'a' || file > 'h' || rank < '1' || rank > '8') return false;
    }

    // 5. Halfmove clock: non-negative integer
    try {
        int halfmove = std::stoi(parts[4]);
        if (halfmove < 0) return false;
    } catch (...) { return false; }

    // 6. Fullmove number: positive integer
    try {
        int fullmove = std::stoi(parts[5]);
        if (fullmove < 1) return false;
    } catch (...) { return false; }

    return true;
}

// ── Main ──────────────────────────────────────────────────────────────────
int main() {
    const char* port_str = std::getenv(ENGINE_PORT_ENV);
    int port = port_str ? std::atoi(port_str) : DEFAULT_PORT;

    httplib::Server svr;

    svr.Post("/bestmove", [](const httplib::Request& req, httplib::Response& res) {
		if (req.body.size() > 1024) {
            res.status = 413;
            res.set_content("{\"error\":\"payload_too_large\"}", "application/json");
            return;
        }

        nlohmann::json body;
        try {
            body = nlohmann::json::parse(req.body);
        } catch (const nlohmann::json::parse_error&) {
            res.status = 400;
            res.set_content("{\"error\":\"parse_error\"}", "application/json");
            log_request("POST", "/bestmove", 400);
            return;
        }

        if (!body.contains("fen") || !body["fen"].is_string() ||
            !body.contains("difficulty") || !body["difficulty"].is_string()) {
            res.status = 400;
            res.set_content("{\"error\":\"missing_fields\"}", "application/json");
            log_request("POST", "/bestmove", 400);
            return;
        }

        std::string fen        = body["fen"].get<std::string>();
        std::string difficulty = body["difficulty"].get<std::string>();
        int wtime = body.value("wtime", 0);
        int btime = body.value("btime", 0);
        int winc  = body.value("winc",  0);
        int binc  = body.value("binc",  0);

		if (!isValidFen(fen)) {
			res.status = 400;
			res.set_content("{\"error\":\"invalid_fen\"}", "application/json");
			log_request("POST", "/bestmove", 400);
			return;
		}

		if (difficulty != "easy" && difficulty != "medium" && difficulty != "hard") {
			res.status = 400;
			res.set_content("{\"error\":\"invalid_difficulty\"}", "application/json");
			log_request("POST", "/bestmove", 400);
			return;
		}

        try {
            std::string move = get_best_move(fen, difficulty,
                                             wtime, btime, winc, binc);
            nlohmann::json resp;
            resp["move"] = move;
            res.set_content(resp.dump(), "application/json");
            log_request("POST", "/bestmove", 200);
        } catch (const std::exception& e) {
            res.status = 500;
            nlohmann::json err;
            err["error"] = std::string("engine error: ") + e.what();
            res.set_content(err.dump(), "application/json");
            log_request("POST", "/bestmove", 500);
        }
    });

    std::cout << "Stockfish AI listening on port " << port << std::endl;
    svr.listen("0.0.0.0", port);

    return 0;
}

