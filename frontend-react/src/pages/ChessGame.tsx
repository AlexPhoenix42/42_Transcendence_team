// frontend-react/src/pages/ChessGame.tsx

import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Chessboard } from "react-chessboard"
import { Chess, Square } from "chess.js"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { ChatSocket, ChatMessage } from "../ws/chat.ts"

import { wsUrl } from '../ws/utils';
import { debug } from '../utils/debug'

interface GameInfo {
    id: number
    player1: string
    player2: string | null
	player1_id: number
	player2_id: number
    player1_color: boolean
    player2_is_ai: boolean
    ai_difficulty: string | null
    status: string
    timer: string | null
	board_state?: string
    winner?: string
    result_reason?: string
}

export default function ChessGame() {
    const { t, ts } = useI18n()
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

    const [isPractice, setIsPractice] = useState(false)
    const [fenInput, setFenInput] = useState("")

	// Chat room
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    const [chatTypingUser, setChatTypingUser] = useState<string | null>(null)
    const chatTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [chatConnected, setChatConnected] = useState(false)
    const [chatError, setChatError] = useState("")
    const [chatRoomId, setChatRoomId] = useState<number | null>(null)
    const chatSocketRef = useRef<ChatSocket | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)

    // Clocks
    const [whiteTime, setWhiteTime] = useState<number | null>(null)
    const [blackTime, setBlackTime] = useState<number | null>(null)
    const [hasClock, setHasClock] = useState(false)

    // Move highlighting
    const [moveFrom, setMoveFrom] = useState<string | null>(null)
    const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({})

	const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
    const [capturedWhite, setCapturedWhite] = useState<string[]>([])
    const [capturedBlack, setCapturedBlack] = useState<string[]>([])

    const chessRef = useRef(new Chess())
    const wsRef = useRef<WebSocket | null>(null)
    const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const gameInfoRef = useRef<GameInfo | null>(null)
    const myColorRef = useRef<"white" | "black">("white")
    const isSpectatorRef = useRef(false)
    const pendingMessages = useRef<string[]>([])
	const gameOverRef = useRef(false)
    const [reconnectCount, setReconnectCount] = useState(0)

    // Fetch game info
    useEffect(() => {
        async function fetchGame() {
            try {
                const resp = await api(`/api/chess/${id}/`)
                if (resp.ok) {
                    const game: GameInfo = await resp.json()
                    setGameInfo(game)
                    gameInfoRef.current = game

					// Set board position from DB (important for finished games)
                    if (game.board_state) {
                        setFen(game.board_state)
                        try { chessRef.current.load(game.board_state) } catch {}
                    }

					if (game.status === "FINISHED") {
                        setGameOver(true)
                        gameOverRef.current = true
                        setGameOverInfo({
                            winner: game.winner || "Unknown",
                            reason: game.result_reason || "UNKNOWN",
                        })
                    }

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
                    setError(t("chess.error.notFound"))
                }
            } catch {
                setError(t("chess.error.load"))
            }
        }
        fetchGame()
    }, [id, user])

    // WebSocket connection
    useEffect(() => {
        if (!id || !infoLoaded) return
		if (gameOver) return

        //const wsHost = window.location.hostname + ":9000"
        //const ws = new WebSocket(`ws://${wsHost}/ws/chess/${id}/`)
		const ws = new WebSocket(wsUrl(`/ws/chess/${id}/`))

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
                setError(t("chess.error.denied"))
            } else if (event.code === 4001) {
                setError(t("chess.error.auth"))
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
    }, [id, infoLoaded, gameOver])

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
            setError(t("chess.error.parse"))
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
		if (!data.fen || data.fen.split(" ").length < 2) {
			setError(t("chess.error.invalidPosition"))
            return
		}

        setFen(data.fen)
        setCheck(data.check)

		if (data.last_move) {
            setLastMove(data.last_move)
        }

        const { whiteCaptures, blackCaptures } = getCapturedPieces(data.fen)
        setCapturedWhite(whiteCaptures)
        setCapturedBlack(blackCaptures)

        try {
            chessRef.current.load(data.fen)
        } catch {
            // Invalid FEN
        }

        const turnColor = data.fen.split(" ")[1]
        const myColorChar = myColorRef.current === "white" ? "w" : "b"
        setIsMyTurn(turnColor === myColorChar && !isSpectatorRef.current)

		if (data.is_practice !== undefined) {
            setIsPractice(data.is_practice)
        }

        if (data.status === "FINISHED" || data.checkmate) {
            setGameOver(true)
			gameOverRef.current = true
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

	//function handleSetFen(e: React.FormEvent) {
    //    e.preventDefault()
    //    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    //        setError(t("chess.error.notConnected"))
    //        return
    //    }
    //    if (!fenInput.trim()) return
    //    wsRef.current.send(JSON.stringify({ type: "set_fen", fen: fenInput.trim() }))
    //    setFenInput("")
    //}

	function handleSetFen(e: React.FormEvent) {
        e.preventDefault()
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError(t("chess.error.notConnected"))
            return
        }
        if (!fenInput.trim()) return
        console.log("SENDING FEN:", fenInput.trim())
        debug("SENDING FEN:", fenInput.trim())
        wsRef.current.send(JSON.stringify({ type: "set_fen", fen: fenInput.trim() }))
        setFenInput("")
    }

	function getCapturedPieces(fenStr: string) {
        const starting: Record<string, number> = {
            P: 8, R: 2, N: 2, B: 2, Q: 1, K: 1,
            p: 8, r: 2, n: 2, b: 2, q: 1, k: 1,
        }
        const current: Record<string, number> = {}
        const board = fenStr.split(" ")[0]
        for (const ch of board) {
            if ("PRNBQKprnbqk".includes(ch)) {
                current[ch] = (current[ch] || 0) + 1
            }
        }

        const whiteCaptures: string[] = []
        const blackCaptures: string[] = []

        // Pieces captured BY white (black pieces missing)
        for (const piece of ["q", "r", "b", "n", "p"]) {
            const diff = starting[piece] - (current[piece] || 0)
            const code = "b" + piece.toUpperCase()
            for (let i = 0; i < diff; i++) whiteCaptures.push(code)
        }
        // Pieces captured BY black (white pieces missing)
        for (const piece of ["Q", "R", "B", "N", "P"]) {
            const diff = starting[piece] - (current[piece] || 0)
            const code = "w" + piece
            for (let i = 0; i < diff; i++) blackCaptures.push(code)
        }

        return { whiteCaptures, blackCaptures }
    }

    function handleGameOver(data: { winner: number; reason: string }) {
        setGameOver(true)
		gameOverRef.current = true
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

	// Chat
	useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [chatMessages])

	useEffect(() => {
        if (!id) return

        async function connectChat() {
            try {
                const resp = await api(`/api/chat/rooms/game/${id}/`)
                if (!resp.ok) return
                const data = await resp.json()
                const roomId = data.room_id
                setChatRoomId(roomId)

                // Load history
                try {
                    const histResp = await api(`/api/chat/rooms/${roomId}/messages/`)
                    if (histResp.ok) {
                        const histData = await histResp.json()
						setChatMessages(Array.isArray(histData) ? histData : histData.results || [])
                    }
                } catch {}

                // Connect WebSocket
				const socket = new ChatSocket(
                    roomId,
                    (msg) => {
                        setChatMessages((prev) => {
                            if (prev.some((m) => m.id === msg.id)) return prev
                            return [...prev, msg]
                        })
                    },
					(err) => {
                        setChatError(err.error)
                        setTimeout(() => setChatError(""), 3000)
                    },
                    () => { setChatConnected(false) },
                    (sender) => {
                        setChatTypingUser(sender)
                        if (chatTypingRef.current) clearTimeout(chatTypingRef.current)
                        chatTypingRef.current = setTimeout(() => setChatTypingUser(null), 3000)
                    },
                )
                socket.connect()
                chatSocketRef.current = socket
                setChatConnected(true)
            } catch {}
        }

        connectChat()

        return () => {
            chatSocketRef.current?.disconnect()
        }
    }, [id])

	function handleChatSend(e: React.FormEvent) {
        e.preventDefault()
        if (!chatInput.trim()) return
        if (chatSocketRef.current?.isConnected()) {
            chatSocketRef.current.send(chatInput.trim())
            setChatInput("")
        }
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
                const { whiteCaptures, blackCaptures } = getCapturedPieces(chessRef.current.fen())
                setCapturedWhite(whiteCaptures)
                setCapturedBlack(blackCaptures)
                setIsMyTurn(false)
                sendMove(moveFrom, square)
            }
        } catch {}

        setMoveFrom(null)
        setOptionSquares({})
    }

    //function handlePromotionChoice(piece: string) {
    //    if (!pendingPromotion) return

    //    try {
    //        const move = chessRef.current.move({
    //            from: pendingPromotion.from,
    //            to: pendingPromotion.to,
    //            promotion: piece,
    //        })
    //        if (move) {
    //            setFen(chessRef.current.fen())
    //            setIsMyTurn(false)
    //            sendMove(pendingPromotion.from, pendingPromotion.to, piece)
    //        }
    //    } catch {}

    //    setPendingPromotion(null)
    //}
	
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
                const { whiteCaptures, blackCaptures } = getCapturedPieces(chessRef.current.fen())
                setCapturedWhite(whiteCaptures)
                setCapturedBlack(blackCaptures)
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
                const { whiteCaptures, blackCaptures } = getCapturedPieces(chessRef.current.fen())
                setCapturedWhite(whiteCaptures)
                setCapturedBlack(blackCaptures)
                setIsMyTurn(false)
                sendMove(sourceSquare, targetSquare)
                return true
            }
        } catch {}
        return false
    }

    //function sendMove(from: string, to: string) {
    //    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    //        setError(t("chess.error.notConnected"))
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
            setError(t("chess.error.notConnected"))
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
                setError(ts(data.error, "chessLobby.error.resign"))
            }
        } catch {
            setError(t("common.error.networkShort"))
        }
    }

	function handleUndo() {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setError(t("chess.error.notConnected"))
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
                        <span className="text-yellow-400 text-sm bg-yellow-900/50 px-2 py-1 rounded">{t("chess.spectating")}</span>
                    )}
                </div>
                <div className="flex gap-2">
					{!isSpectator && !gameOver && (
                        <>
                            {isPractice && (
						    <button
                                onClick={handleUndo}
                                className="px-2 py-1 md:px-4 md:py-2 text-sm md:text-base bg-yellow-600 text-white rounded hover:bg-yellow-700"
                            >
                                {t("chess.undo")}
                            </button>
                            )}
                            <button
                                onClick={handleResign}
                                className="px-2 py-1 md:px-4 md:py-2 text-sm md:text-base bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                {t("chess.resign")}
                            </button>
                        </>
                    )}
					<div className="flex gap-2">
						<button
							onClick={() => navigate("/chess")}
							className="px-2 py-1 md:px-4 md:py-2 text-sm md:text-base bg-gray-700 text-white rounded hover:bg-gray-600"
						>
							{t("chess.backToLobby")}
						</button>
						<button
							onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/chess")}
							className="px-2 py-1 md:px-4 md:py-2 text-sm md:text-base bg-gray-700 text-white rounded hover:bg-gray-600"
						>
							Back
						</button>
					</div>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            {gameOver && gameOverInfo && (
                <div className="bg-blue-900/50 border border-blue-500 text-blue-300 px-4 py-4 rounded mb-4 text-center">
                    <p className="text-xl font-bold mb-1">{t("chess.gameOver")}</p>
					<p>
                        {gameOverInfo.winner} {t("chess.wins")} — {t(`chess.reason.${gameOverInfo.reason.toLowerCase()}`, gameOverInfo.reason)}
                    </p>
                </div>
            )}

			<div className="flex flex-col lg:flex-row gap-6 justify-center items-stretch">
                <div className="relative">
                    {/* Opponent info + clock (top) */}
                    <div className="flex items-center justify-between mb-2 px-1">
						{/*<div className="flex items-center gap-2">
                            <span className="text-gray-300 text-xl font-semibold">{opponentName}</span>
							{gameInfo?.player2_is_ai && (
								<span className="text-base text-yellow-400 bg-yellow-900/50 px-2 py-0.5 rounded">
                                    AI {gameInfo.ai_difficulty}
                                </span>
                            )}
							<span className="ms-2 flex gap-0.5 items-center bg-gray-600/50 rounded px-1 py-0.5">
                                {(myColor === "white" ? capturedBlack : capturedWhite).map((p, i) => (
									<img key={i} src={`/pieces/${p}.svg`} alt={p} className={`w-8 h-8 ${p.startsWith("b") ? "drop-shadow-[0_0_3px_rgba(255,255,255,0.9)]" : ""}`} />
                                ))}
                            </span>
                        </div>*/}
					    <div>
							<div className="flex items-center gap-2">
                                <span
                                    className="text-gray-300 text-xl font-semibold hover:text-blue-400 cursor-pointer"
                                    onClick={() => navigate(`/profile/${opponentName}`)}
                                >
                                    {opponentName}
                                </span>
                                {gameInfo?.player2_is_ai && (
                                    <span className="text-base text-yellow-400 bg-yellow-900/50 px-2 py-0.5 rounded">
                                        AI {gameInfo.ai_difficulty}
                                    </span>
                                )}
                            </div>
						
							<span className="flex flex-wrap gap-0.5 items-center mt-1 bg-gray-600/50 rounded px-1 py-0.5 empty:hidden w-fit">
                                {(myColor === "white" ? capturedBlack : capturedWhite).map((p, i) => (
                                    <img key={i} src={`/pieces/${p}.svg`} alt={p} className={`w-8 h-8 ${p.startsWith("b") ? "drop-shadow-[0_0_3px_rgba(255,255,255,0.9)]" : ""}`} />
                                ))}
                            </span>
                        </div>
                        {hasClock && (
                            <span className={`font-mono text-lg px-3 py-1 rounded ${
                                (myColor === "white" ? blackTime : whiteTime) !== null &&
                                (myColor === "white" ? blackTime! : whiteTime!) < 30
                                    ? "bg-red-900 text-red-300"
                                    : "bg-gray-800 text-white"
                            }`}>
                                <bdi dir="ltr">{formatTime(myColor === "white" ? blackTime : whiteTime)}</bdi>
                            </span>
                        )}
                    </div>

					{/* dir="ltr" is REQUIRED, not cosmetic. A chessboard has no reading
					    direction: a1 is bottom-left and h8 top-right in every language.
					    Without this pin, dir="rtl" on <html> mirrors the board and files
					    run h->a, so every coordinate shown to the player is wrong.
					    boardOrientation below is a different thing entirely — that is
					    whose turn it is, not which way the language reads. */}
					<div dir="ltr" className="chess-board-wrapper relative [&>div>div]:leading-none [&>div>div]:text-[0px]">
						<Chessboard
							options={{
								position: fen,
								onPieceDrop: handlePieceDrop,
								onSquareClick: handleSquareClick,
								boardOrientation: isSpectator ? "white" : myColor,
								squareStyles: {
									...optionSquares,
									...(lastMove ? {
										[lastMove.from]: { background: "rgba(255, 255, 0, 0.3)" },
										[lastMove.to]: { background: "rgba(255, 255, 0, 0.3)" },
									} : {}),
								},
								boardStyle: {
									borderRadius: "4px",
									boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
								},
								allowDragging: !isSpectator && !gameOver && isMyTurn,
							}}
						/>
					</div>

					{/*I am not sure if this is the correct place */}
					{isPractice && !isSpectator && !gameOver && (
                        <form onSubmit={handleSetFen} className="flex gap-2 mt-3">
                            <input
                                type="text"
                                value={fenInput}
                                onChange={(e) => setFenInput(e.target.value)}
                                placeholder={t("chess.fenPlaceholder")}
                                className="flex-1 px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-xs focus:outline-none focus:border-blue-500"
                            />
                            <button
                                type="submit"
                                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                            >
                                {t("chess.set")}
                            </button>
                        </form>
                    )}

					{pendingPromotion && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
                                <p className="text-white text-center mb-3">{t("chess.promoteTo")}</p>
                                <div className="flex gap-2">
									{[
                                        { piece: "q", name: t("piece.queen") },
                                        { piece: "r", name: t("piece.rook") },
                                        { piece: "b", name: t("piece.bishop") },
                                        { piece: "n", name: t("piece.knight") },
                                    ].map(({ piece, name }) => (
                                        <button
                                            key={piece}
                                            onClick={() => handlePromotionChoice(piece)}
                                            className="w-16 h-16 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center"
                                            title={name}
                                        >
                                            <img src={`/pieces/${myColor === "white" ? "w" : "b"}${piece.toUpperCase()}.svg`} alt={name} className="w-12 h-12" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Your info + clock (bottom) */}
                    <div className="flex items-center justify-between mt-2 px-1">
						{/*<div className="flex items-center gap-2">
                            <span className="text-white text-xl font-bold">{myName}</span>
                            {!isSpectator && isMyTurn && !gameOver && (
								<span className="text-base text-green-400 font-semibold">{t("chess.yourTurn")}</span>
                            )}
							{check && isMyTurn && (
                                <span className="text-base text-red-400 font-bold">CHECK!</span>
                            )}
							<span className="ms-2 flex gap-0.5 items-center bg-gray-600/50 rounded px-1 py-0.5">
                                {(myColor === "white" ? capturedWhite : capturedBlack).map((p, i) => (
                                    <img key={i} src={`/pieces/${p}.svg`} alt={p} className="w-8 h-8" />

                                ))}
                            </span>
                        </div>*/}
					    <div>
						    <div className="flex items-center gap-2">
                                <span
                                    className="text-white text-xl font-bold hover:text-blue-400 cursor-pointer"
                                    onClick={() => navigate(`/profile/${myName}`)}
                                >
                                    {myName}
                                </span>
                                {!isSpectator && isMyTurn && !gameOver && (
                                    <span className="text-base text-green-400 font-semibold">{t("chess.yourTurn")}</span>
                                )}
                                {check && isMyTurn && (
                                    <span className="text-base text-red-400 font-bold">CHECK!</span>
                                )}
                            </div>
							<span className="flex flex-wrap gap-0.5 items-center mt-1 bg-gray-600/50 rounded px-1 py-0.5 empty:hidden w-fit">
                                {(myColor === "white" ? capturedWhite : capturedBlack).map((p, i) => (
                                    <img key={i} src={`/pieces/${p}.svg`} alt={p} className={`w-8 h-8 ${p.startsWith("b") ? "drop-shadow-[0_0_3px_rgba(255,255,255,0.9)]" : ""}`} />
                                ))}
                            </span>
                        </div>
                        {hasClock && (
                            <span className={`font-mono text-lg px-3 py-1 rounded ${
                                (myColor === "white" ? whiteTime : blackTime) !== null &&
                                (myColor === "white" ? whiteTime! : blackTime!) < 30
                                    ? "bg-red-900 text-red-300"
                                    : "bg-gray-800 text-white"
                            }`}>
                                <bdi dir="ltr">{formatTime(myColor === "white" ? whiteTime : blackTime)}</bdi>
                            </span>
                        )}
                    </div>
				</div>

                {/* Game Chat */}
				<div className="w-full lg:w-72 bg-gray-800 rounded-lg border border-gray-700 flex flex-col self-stretch">
                    <div className="p-3 border-b border-gray-700 flex items-center gap-2">
                        <span className="text-white text-sm font-semibold">{t("chess.gameChat")}</span>
                        <span className={`w-2 h-2 rounded-full ${chatConnected ? "bg-green-500" : "bg-red-500"}`}></span>
                    </div>
					<div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 max-h-64 lg:max-h-96">
                        {chatMessages.length === 0 && (
                            <p className="text-gray-500 text-xs text-center">{t("chat.noMessages")}</p>
                        )}
						{chatMessages.map((msg) => (
                            <div key={msg.id} className={`text-sm ${
                                msg.sender === "system"
                                    ? "text-yellow-400 italic text-center"
                                    : msg.sender === user?.username
                                    ? "text-blue-400"
                                    : "text-gray-300"
                            }`}>
                                {msg.sender === "system" ? (
                                    <span>{msg.content}</span>
                                ) : (
                                    <>
										<span
                                            className="font-semibold cursor-pointer hover:text-blue-400"
                                            onClick={() => navigate(`/profile/${msg.sender}`)}
                                        >
                                            {msg.sender}:
                                        </span>{" "}
                                        <span>{msg.content}</span>
                                    </>
                                )}
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
					{chatTypingUser && (
                        <div className="px-3 py-1 text-gray-500 text-xs italic">
                            {chatTypingUser} is typing...
                        </div>
                    )}
					{chatError && (
                        <div className="px-3 py-1 text-red-400 text-xs text-center bg-red-900/20">
                            {chatError}
                        </div>
                    )}
                    <form onSubmit={handleChatSend} className="mt-auto p-3 border-t border-gray-700 flex gap-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => {
								setChatInput(e.target.value)
								chatSocketRef.current?.sendTyping()
							}}
                            placeholder={t("chat.short")}
                            className="flex-1 px-2 py-1 bg-gray-900 text-white border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
                            maxLength={2000}
                        />
                        <button
                            type="submit"
                            className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                            {t("chess.send")}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

