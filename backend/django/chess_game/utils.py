# chess_game/utils.py


def validate_fen(fen: str) -> str | None:
    """Return None if valid, or an error message."""

    # FEN length limit
    if  len(fen) > 100:
        return "FEN too long"

    parts = fen.split(" ")
    if  len(parts) != 6:
        return "FEN must have 6 fields"

    # Field 1: piece placement, 8 ranks separated by /
    ranks = parts[0].split("/")
    if  len(ranks) != 8:
        return "FEN must have 8 ranks"

    # Each rank must sum to 8 (pieces count as 1, digits as their value)
    valid_pieces = set("rnbqkpRNBQKP")
    for rank in ranks:
        cnt = 0
        for ch in rank:
            if  ch in valid_pieces:
                cnt += 1
            elif ch.isdigit() and 1 <= int(ch) <= 8:
                cnt += int(ch)
            else:
                return f"Invalid character in FEN: {ch}"
        if  cnt != 8:
            return "Each rank must sum to 8"

    # Field 2: active color
    if  parts[1] not in ("w", "b"):
        return "Invalid active color"

    # Field 3: castling availability
    if  not all(ch in "KQkq-" for ch in parts[2]):
        return "Invalid castling field"

    # Field 4: en passant target
    if  parts[3] != "-" and (len(parts[3]) != 2 or
        parts[3][0] not in "abcdefgh" or
        parts[3][1] not in "36"):
        return "Invalid en passant field"

    # Fields 5-6: halfmove clock and fullmove number
    if  not parts[4].isdigit() or not parts[5].isdigit():
        return "Halfmove/fullmove must be numbers"

    return None

