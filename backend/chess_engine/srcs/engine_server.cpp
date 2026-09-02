#include <chess.hpp>
#include <cpp-httplib.h>
#include <json.hpp>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

static const char* ENGINE_PORT_ENV = "ENGINE_PORT";
static const int   DEFAULT_PORT   = 4190;

// ── Simple stdout logger ────────────────────────────────────────────────────
static void log_request(const std::string& method, const std::string& path,
                        int status) {
    std::cout << method << " " << path << " → " << status << std::endl;
}

// ── Minimal FEN format validation ───────────────────────────────────────────
static bool isValidFen(const std::string& fen) {
    int slashCount = 0;
    for (char c : fen) if (c == '/') slashCount++;
    if (slashCount != 7) return false;

    int rankIdx = 0;
    int squareCount = 0;
    for (char c : fen) {
        if (c == ' ') break;
        if (c == '/') {
            if (squareCount != 8) return false;
            squareCount = 0;
            rankIdx++;
            continue;
        }
        if (strchr("prnbqkPRNBQK", c)) {
            squareCount++;
        } else if (c >= '1' && c <= '8') {
            squareCount += (c - '0');
        } else {
            return false;
        }
    }
    return (rankIdx == 7 && squareCount == 8);
}

// ── Main ─────────────────────────────────────────────────────────────────────
int main() {
    const char* port_str = std::getenv(ENGINE_PORT_ENV);
    int port = port_str ? std::atoi(port_str) : DEFAULT_PORT;

    httplib::Server svr;

    svr.Post("/validate", [](const httplib::Request& req, httplib::Response& res) {
		try {
			// ── 1. Parse JSON body ──────────────────────────────────────────
			nlohmann::json body;
			try {
				body = nlohmann::json::parse(req.body);
			} catch (const nlohmann::json::parse_error&) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"parse_error\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}

			// ── 2. Validate required fields ──────────────────────────────────
			if (!body.contains("fen") || !body.contains("move") ||
				!body["fen"].is_string() || !body["move"].is_string()) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"missing_fields\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}

			std::string fen  = body["fen"].get<std::string>();
			std::string uci  = body["move"].get<std::string>();

			// ── 3. Validate FEN format ───────────────────────────────────────
			if (!isValidFen(fen)) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"invalid_fen\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}

			// ── 4. Set up the board ──────────────────────────────────────────
			chess::Board board;
			try {
				board.setFen(fen);
			} catch (const std::exception&) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"invalid_fen\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}

			// ── 5. Basic UCI format validation ──────────────────────────────
			if (uci.length() < 4 || uci.length() > 5) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"invalid_move_format\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}
			// Validate square characters
			if (uci[0] < 'a' || uci[0] > 'h' || uci[1] < '1' || uci[1] > '8' ||
				uci[2] < 'a' || uci[2] > 'h' || uci[3] < '1' || uci[3] > '8') {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"invalid_square\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}

			// ── 6. Convert UCI to move ───────────────────────────────────────
			chess::Move move = chess::uci::uciToMove(board, uci);
			if (move.move() == chess::Move::NO_MOVE) {
				res.status = 400;
				res.set_content("{\"legal\":false,\"error\":\"invalid_move_format\"}",
								"application/json");
				log_request("POST", "/validate", 400);
				return;
			}


			// ── 6. Legality check ────────────────────────────────────────────
			if (!board.isLegal(move)) {
				res.status = 200;
				res.set_content("{\"legal\":false,\"check\":false,\"checkmate\":false}",
								"application/json");
				log_request("POST", "/validate", 200);
				return;
			}

			// ── 7. Apply the move ────────────────────────────────────────────
			board.makeMove(move);

			// ── 8. Determine check/checkmate ─────────────────────────────────
			chess::Movelist moves;
			chess::movegen::legalmoves(moves, board);
			bool inCheck   = board.inCheck();
			bool checkmate = inCheck && moves.empty();

			std::string newFen = board.getFen();

			// ── 9. Build response ────────────────────────────────────────────
			nlohmann::json resp;
			resp["legal"]     = true;
			resp["check"]     = inCheck;
			resp["checkmate"] = checkmate;
			resp["new_fen"]   = newFen;

			res.status = 200;
			res.set_content(resp.dump(), "application/json");
			log_request("POST", "/validate", 200);
		}
		catch (...) {
			res.status = 500;
			res.set_content("{\"legal\":false,\"error\":\"internal_server_error\"}",
			"application/json");
			log_request("POST", "/validate", 500);
		}
    });

    std::cout << "Engine listening on port " << port << std::endl;
    svr.listen("0.0.0.0", port);

    return 0;
}

