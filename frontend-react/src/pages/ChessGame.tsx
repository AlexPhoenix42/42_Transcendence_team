// frontend-react/src/pages/ChessGame.tsx

import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Chessboard } from "react-chessboard"
import { Chess, Square } from "chess.js"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

interface GameInfo {
    id: number
    player1: string
    player2: string | null
    player1_color: boolean
    player2_is_ai: boolean
    ai_difficulty: string | null
    status: string
    timer: string | null
}

export default function ChessGame() {
    const { id } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [gameInfo, setGameInfo] = useState<GameInfo | null>(null)
    const [fen, setFen] = useState<string>("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    const [isMyTurn, setIsMyTurn] = useState(false)
    const [isSpectator, setIsSpectator] = useState(false)
    const [myColor, setMyColor] = useState<"white" | "black">("white")
    const [check, setCheck] = useState(false)
    const [gameOver, setGameOver] = useState(false)
    const [gameOverInfo, setGameOverInfo] = useState<{ winner: string; reason: string } | null>(null)
    const [error, setError] = useState("")
    const [connected, setConnected] = useState(false)
    const [infoLoaded, setInfoLoaded] = useState(false)

    // Clocks
    const [whiteTime, setWhiteTime] = useState<number | null>(null)
    const [blackTime, setBlackTime] = useState<number | null>(null)
    const [hasClock, setHasClock] = useState(false)

    // Move highlighting
    const [moveFrom, setMoveFrom] = useState<string | null>(null)
    const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({})

    const chessRef = useRef(new Chess())
    const wsRef = useRef<WebSocket | null>(null)
    const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const gameInfoRef = useRef<GameInfo | null>(null)
    const myColorRef = useRef<"white" | "black">("white")
    const isSpectatorRef = useRef(false)
    const pendingMessages = useRef<string[]>([])

    // Fetch game info
    useEffect(() => {
        async function fetchGame() {
            try {
                const resp = await api(`/api/chess/${id}/`)
                if (resp.ok) {
                    const game: GameInfo = await resp.json()
                    setGameInfo(game)
                    gameInfoRef.current = game

                    const isPlayer1 = game.player1 === user?.username
                    const isPlayer2 = game.player2 === user?.username

                    if (!isPlayer1 && !isPlayer2) {
                        setIsSpectator(true)
                        isSpectatorRef.current = true
                        setMyColor("white")
                        myColorRef.current = "white"
                    } else if (isPlayer1) {
                        const color = game.player1_color ? "white" : "black"
                        setMyColor(color)
                        myColorRef.current = color
                    } else {
                        const color = game.player1_color ? "black" : "white"
                        setMyColor(color)
                        myColorRef.current = color
                    }

                    setInfoLoaded(true)

                    for (const msg of pendingMessages.current) {
                        processMessage(msg)
                    }
                    pendingMessages.current = []
                } else {
                    setError("Game not found")
                }
            } catch {
                setError("Failed to load game info")
            }
        }
        fetchGame()
    }, [id, user])

    // WebSocket connection
    useEffect(() => {
        if (!id) return

        const wsHost = window.location.hostname + ":9000"
        const ws = new WebSocket(`ws://${wsHost}/ws/game/${id}/`)

        ws.onopen = () => {
            setConnected(true)
        }

        ws.onmessage = (event) => {
            if (!gameInfoRef.current) {
                pendingMessages.current.push(event.data)
                return
            }
            processMessage(event.data)
        }

        ws.onclose = (event) => {
            setConnected(false)
            if (event.code === 4003) {
                setError("Access denied")
            } else if (event.code === 4001) {
                setError("Authentication failed")
            }
        }

        ws.onerror = () => {}

        wsRef.current = ws

        return () => {
            ws.close()
            if (clockIntervalRef.current) {
                clearInterval(clockIntervalRef.current)
            }
        }
    }, [id])

    function processMessage(raw: string) {
        try {
            const data = JSON.parse(raw)

            if (data.type === "game_state") {
                handleGameState(data)
            } else if (data.type === "game_over") {
                handleGameOver(data)
            } else if (data.error) {
                if (data.error !== "SPECTATOR_READONLY" && data.error !== "ILLEGAL_MOVE") {
                    setError(data.error + (data.detail ? `: ${data.detail}` : ""))
                }
            }
        } catch {
            setError("Failed to parse server message")
        }
    }

    function handleGameState(data: {
        fen: string
        crnt_turn: number | null
        check: boolean
        checkmate: boolean
        status: string
        clocks?: Record<string, number>
    }) {
        setFen(data.fen)
        setCheck(data.check)

        try {
            chessRef.current.load(data.fen)
        } catch {
            // Invalid FEN
        }

        const turnColor = data.fen.split(" ")[1]
        const myColorChar = myColorRef.current === "white" ? "w" : "b"
        setIsMyTurn(turnColor === myColorChar && !isSpectatorRef.current)

        if (data.status === "FINISHED" || data.checkmate) {
            setGameOver(true)
        }

        if (data.clocks) {
            setHasClock(true)
            const info = gameInfoRef.current
            if (info) {
                const entries = Object.entries(data.clocks)
                if (entries.length === 2) {
                    const [, time1] = entries[0]
                    const [, time2] = entries[1]
                    setWhiteTime(info.player1_color ? Number(time1) : Number(time2))
                    setBlackTime(info.player1_color ? Number(time2) : Number(time1))
                }
            }
        }
    }

    function handleGameOver(data: { winner: number; reason: string }) {
        setGameOver(true)
        const info = gameInfoRef.current
        let winnerName = String(data.winner)
        if (info) {
            if (info.player1 === String(data.winner)) winnerName = info.player1
            else if (info.player2 === String(data.winner)) winnerName = info.player2 || "AI"
        }
        setGameOverInfo({ winner: winnerName, reason: data.reason })
    }

    // Clock tick
    useEffect(() => {
        if (!hasClock || gameOver) {
            if (clockIntervalRef.current) clearInterval(clockIntervalRef.current)
            return
        }

        clockIntervalRef.current = setInterval(() => {
            const turnColor = fen.split(" ")[1]
            if (turnColor === "w") {
                setWhiteTime((prev) => prev !== null ? Math.max(0, prev - 1) : null)
            } else {
                setBlackTime((prev) => prev !== null ? Math.max(0, prev - 1) : null)
            }
        }, 1000)

        return () => {
            if (clockIntervalRef.current) clearInterval(clockIntervalRef.current)
        }
    }, [hasClock, gameOver, fen])

    function getMoveOptions(square: Square) {
        const moves = chessRef.current.moves({ square, verbose: true })
        if (moves.length === 0) {
            setOptionSquares({})
            return false
        }

        const options: Record<string, React.CSSProperties> = {}
        moves.forEach((move) => {
            options[move.to] = {
                background: chessRef.current.get(move.to as Square)
                    ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
                    : "radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)",
                borderRadius: "50%",
            }
        })
        options[square] = {
            background: "rgba(255, 255, 0, 0.4)",
        }
        setOptionSquares(options)
        return true
    }

	{/*
    function handleSquareClick({ square }: { piece?: string; square: string }) {
        if (isSpectator || gameOver) return

        if (!moveFrom) {
            const piece = chessRef.current.get(square as Square)
            if (!piece) return
            const pieceColor = piece.color === "w" ? "white" : "black"
            if (pieceColor !== myColorRef.current) return
            if (!isMyTurn) return

            setMoveFrom(square)
            getMoveOptions(square as Square)
            return
        }

        sendMove(moveFrom, square)
        setMoveFrom(null)
        setOptionSquares({})
    }
	*/}

	//function handleSquareClick({ square }: { piece?: string; square: string }) {
    //    if (isSpectator || gameOver) return

    //    if (!moveFrom) {
    //        const piece = chessRef.current.get(square as Square)
    //        if (!piece) return
    //        const pieceColor = piece.color === "w" ? "white" : "black"
    //        if (pieceColor !== myColorRef.current) return
    //        if (!isMyTurn) return

    //        setMoveFrom(square)
    //        getMoveOptions(square as Square)
    //        return
    //    }

    //    // Try move locally first
    //    try {
    //        const move = chessRef.current.move({
    //            from: moveFrom,
    //            to: square,
    //            promotion: "q",
    //        })
    //        if (move) {
    //            setFen(chessRef.current.fen())
    //            setIsMyTurn(false)
    //            sendMove(moveFrom, square)
    //        }
    //    } catch {
    //        // Invalid move — ignore
    //    }

    //    setMoveFrom(null)
    //    setOptionSquares({})
    //}

    //function handleSquareClick({ square }: { piece?: string; square: string }) {
    //    if (isSpectator || gameOver) return

    //    if (!moveFrom) {
    //        const piece = chessRef.current.get(square as Square)
    //        if (!piece) return
    //        const pieceColor = piece.color === "w" ? "white" : "black"
    //        if (pieceColor !== myColorRef.current) return
    //        if (!isMyTurn) return

    //        setMoveFrom(square)
    //        getMoveOptions(square as Square)
    //        return
    //    }

    //    // Detect promotion BEFORE applying move
    //    const piece = chessRef.current.get(moveFrom as Square)
    //    let promotion: string | undefined
    //    if (piece && piece.type === "p") {
    //        const targetRank = square[1]
    //        if ((piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1")) {
    //            promotion = "q"
    //        }
    //    }

    //    try {
    //        const move = chessRef.current.move({
    //            from: moveFrom,
    //            to: square,
    //            promotion: "q",
    //        })
    //        if (move) {
    //            setFen(chessRef.current.fen())
    //            setIsMyTurn(false)
    //            sendMove(moveFrom, square, promotion)
    //        }
    //    } catch {
    //        // Invalid move
    //    }

    //    setMoveFrom(null)
    //    setOptionSquares({})
    //}

	function handleSquareClick({ square }: { piece?: string; square: string }) {
        if (isSpectator || gameOver) return
        if (pendingPromotion) return

        if (!moveFrom) {
            const piece = chessRef.current.get(square as Square)
            if (!piece) return
            const pieceColor = piece.color === "w" ? "white" : "black"
            if (pieceColor !== myColorRef.current) return
            if (!isMyTurn) return

            setMoveFrom(square)
            getMoveOptions(square as Square)
            return
        }

        const piece = chessRef.current.get(moveFrom as Square)
        if (piece && piece.type === "p") {
            const targetRank = square[1]
            if ((piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1")) {
                setPendingPromotion({ from: moveFrom, to: square })
                setMoveFrom(null)
                setOptionSquares({})
                return
            }
        }

        try {
            const move = chessRef.current.move({
                from: moveFrom,
                to: square,
            })
            if (move) {
                setFen(chessRef.current.fen())
                setIsMyTurn(false)
                sendMove(moveFrom, square)
            }
        } catch {}

        setMoveFrom(null)
        setOptionSquares({})
    }

    function handlePromotionChoice(piece: string) {
        if (!pendingPromotion) return

        try {
            const move = chessRef.current.move({
                from: pendingPromotion.from,
                to: pendingPromotion.to,
                promotion: piece,
            })
            if (move) {
                setFen(chessRef.current.fen())
                setIsMyTurn(false)
                sendMove(pendingPromotion.from, pendingPromotion.to, piece)
            }
        } catch {}

        setPendingPromotion(null)
    }

    //function handlePieceDrop({ sourceSquare, targetSquare }:
	//	{ piece: string; sourceSquare: string; targetSquare: string }): boolean
	//{
    //    if (isSpectator || gameOver || !isMyTurn) return false

	//	try {
	//		const move = chessRef.current.move({
	//			from		: sourceSquare,
	//			to			: targetSquare,
	//			promotion	: "q",
	//		})

	//		if	(move) {
	//			setFen(chessRef.current.fen())
	//			setIsMyTurn(false)
	//			sendMove(sourceSquare, targetSquare)
	//			return true
	//		}
	//	} catch {
	//		// Invalide move
	//	}
    //    return false
    //}

	//function handlePieceDrop({ sourceSquare, targetSquare }: { piece: string; sourceSquare: string; targetSquare: string }): boolean {
    //    if (isSpectator || gameOver || !isMyTurn) return false

    //    // Detect promotion BEFORE applying move
    //    const piece = chessRef.current.get(sourceSquare as Square)
    //    let promotion: string | undefined
    //    if (piece && piece.type === "p") {
    //        const targetRank = targetSquare[1]
    //        if ((piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1")) {
    //            promotion = "q"
    //        }
    //    }

    //    try {
    //        const move = chessRef.current.move({
    //            from: sourceSquare,
    //            to: targetSquare,
    //            promotion: "q",
    //        })
    //        if (move) {
    //            setFen(chessRef.current.fen())
    //            setIsMyTurn(false)
    //            sendMove(sourceSquare, targetSquare, promotion)
    //            return true
    //        }
    //    } catch {
    //        // Invalid move
    //    }
    //    return false
    //}

	const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)

	    function handlePieceDrop({ sourceSquare, targetSquare }: { piece: string; sourceSquare: string; targetSquare: string }): boolean {
        if (isSpectator || gameOver || !isMyTurn) return false

        const piece = chessRef.current.get(sourceSquare as Square)
        if (piece && piece.type === "p") {
            const targetRank = targetSquare[1]
            if ((piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1")) {
                setPendingPromotion({ from: sourceSquare, to: targetSquare })
                return true
            }
        }

        try {
            const move = chessRef.current.move({
                from: sourceSquare,
                to: targetSquare,
            })
            if (move) {
                setFen(chessRef.current.fen())
                setIsMyTurn(false)
                sendMove(sourceSquare, targetSquare)
                return true
            }
        } catch {}
        return false
    }

    //function sendMove(from: string, to: string) {
    //    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    //        setError("Not connected")
    //        return
    //    }

    //    const piece = chessRef.current.get(from as Square)
    //    let promotion: string | undefined
    //    if (piece && piece.type === "p") {
    //        const targetRank = to[1]
    //        if ((piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1")) {
    //            promotion = "q"
    //        }
    //    }

    //    const payload: Record<string, string> = { from, to }
    //    if (promotion) payload.promotion = promotion

    //    wsRef.current.send(JSON.stringify(payload))
    //    setError("")
    //}
	
	function sendMove(from: string, to: string, promotion?: string) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError("Not connected")
            return
        }

        const payload: Record<string, string> = { from, to }
        if (promotion) payload.promotion = promotion

        wsRef.current.send(JSON.stringify(payload))
        setError("")
    }

    async function handleResign() {
        if (isSpectator) return

        try {
            const resp = await api(`/api/chess/${id}/leave/`, {
                method: "POST",
            })

            if (!resp.ok) {
                const data = await resp.json()
                setError(data.error || "Failed to resign")
            }
        } catch {
            setError("Network error")
        }
    }

	function handleUndo() {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError("Not connected")
            return
        }
        wsRef.current.send(JSON.stringify({ type: "undo" }))
    }

    function formatTime(seconds: number | null): string {
        if (seconds === null) return "--:--"
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, "0")}`
    }

    let opponentName = "..."
    let myName = user?.username || "You"
    if (gameInfo) {
        if (isSpectator) {
            myName = gameInfo.player1_color ? gameInfo.player1 : (gameInfo.player2 || "...")
            opponentName = gameInfo.player1_color ? (gameInfo.player2 || "...") : gameInfo.player1
        } else {
            const isPlayer1 = gameInfo.player1 === user?.username
            if (isPlayer1) {
                opponentName = gameInfo.player2 || "..."
            } else {
                opponentName = gameInfo.player1
            }
        }
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-white">Game #{id}</h1>
                    <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></span>
                    {isSpectator && (
                        <span className="text-yellow-400 text-sm bg-yellow-900/50 px-2 py-1 rounded">Spectating</span>
                    )}
                </div>
                <div className="flex gap-2">
				    {!isSpectator && !gameOver && (
                        <>
                            <button
                                onClick={handleUndo}
                                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                            >
                                Undo
                            </button>
                            <button
                                onClick={handleResign}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Resign
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => navigate("/chess")}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Back to Lobby
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            {gameOver && gameOverInfo && (
                <div className="bg-blue-900/50 border border-blue-500 text-blue-300 px-4 py-4 rounded mb-4 text-center">
                    <p className="text-xl font-bold mb-1">Game Over</p>
                    <p>{gameOverInfo.reason}</p>
                </div>
            )}

            <div className="flex gap-6 justify-center">
                <div className="relative">
                    {/* Opponent info + clock (top) */}
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm">{opponentName}</span>
                            {gameInfo?.player2_is_ai && (
                                <span className="text-xs text-yellow-400 bg-yellow-900/50 px-1 rounded">
                                    AI {gameInfo.ai_difficulty}
                                </span>
                            )}
                        </div>
                        {hasClock && (
                            <span className={`font-mono text-lg px-3 py-1 rounded ${
                                (myColor === "white" ? blackTime : whiteTime) !== null &&
                                (myColor === "white" ? blackTime! : whiteTime!) < 30
                                    ? "bg-red-900 text-red-300"
                                    : "bg-gray-800 text-white"
                            }`}>
                                {formatTime(myColor === "white" ? blackTime : whiteTime)}
                            </span>
                        )}
                    </div>

                    <Chessboard
                        options={{
                            position: fen,
                            onPieceDrop: handlePieceDrop,
                            onSquareClick: handleSquareClick,
                            boardOrientation: isSpectator ? "white" : myColor,
                            squareStyles: optionSquares,
                            boardStyle: {
                                borderRadius: "4px",
                                boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
                            },
                            allowDragging: !isSpectator && !gameOver && isMyTurn,
                        }}
                    />

					{pendingPromotion && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                                <p className="text-white text-center mb-3">Promote to:</p>
                                <div className="flex gap-2">
                                    {[
                                        { piece: "q", label: "♛", name: "Queen" },
                                        { piece: "r", label: "♜", name: "Rook" },
                                        { piece: "b", label: "♝", name: "Bishop" },
                                        { piece: "n", label: "♞", name: "Knight" },
                                    ].map(({ piece, label, name }) => (
                                        <button
                                            key={piece}
                                            onClick={() => handlePromotionChoice(piece)}
                                            className="w-16 h-16 bg-gray-700 hover:bg-gray-600 rounded text-4xl flex items-center justify-center"
                                            title={name}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Your info + clock (bottom) */}
                    <div className="flex items-center justify-between mt-2 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-semibold">{myName}</span>
                            {!isSpectator && isMyTurn && !gameOver && (
                                <span className="text-xs text-green-400">Your turn</span>
                            )}
                            {check && isMyTurn && (
                                <span className="text-xs text-red-400 font-bold">CHECK!</span>
                            )}
                        </div>
                        {hasClock && (
                            <span className={`font-mono text-lg px-3 py-1 rounded ${
                                (myColor === "white" ? whiteTime : blackTime) !== null &&
                                (myColor === "white" ? whiteTime! : blackTime!) < 30
                                    ? "bg-red-900 text-red-300"
                                    : "bg-gray-800 text-white"
                            }`}>
                                {formatTime(myColor === "white" ? whiteTime : blackTime)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

