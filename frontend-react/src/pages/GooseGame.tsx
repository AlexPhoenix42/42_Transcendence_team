// frontend-react/src/pages/GooseGame.tsx

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { api, getAccessToken } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import GooseBoard, { PLAYER_HOP_MS, WIZARD_HOP_MS } from "../components/GooseBoard.tsx"
import WizardQuiz from "../components/WizardQuiz.tsx"

interface PlayerData {
    username: string
    position: number
    turn_order: number
    skip_turns: number
    is_active: boolean
    wizard_strikes?: number
    color: string
}

interface WizardEncounter {
    target: string
    question: string
    choices: string[]
    paused: boolean
}

const PLAYER_TOKENS = ["🐸", "🦊", "🐻", "🐰", "🦉", "🐱"]
const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"]

const POLL_INTERVAL = 3000

export default function GooseGame() {
    const { id } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [players, setPlayers] = useState<PlayerData[]>([])
    const [currentTurn, setCurrentTurn] = useState<string | null>(null)
    const [gameStatus, setGameStatus] = useState("WAITING")
    const [winner, setWinner] = useState<string | null>(null)
    const [wizardWon, setWizardWon] = useState(false)
    const [logs, setLogs] = useState<string[]>([])
    const [dice, setDice] = useState<[number, number] | null>(null)
    const [rolling, setRolling] = useState(false)
    const [diceAnim, setDiceAnim] = useState(false)
    const [error, setError] = useState("")
    const [gameInfo, setGameInfo] = useState<{ name: string; created_by: string } | null>(null)
    const [lastMove, setLastMove] = useState<{ player: string; from: number; to: number } | null>(null)
    const [showRules, setShowRules] = useState(false)

    const [wizardPosition, setWizardPosition] = useState(0)
    const [wizardMove, setWizardMove] = useState<{ from: number; step: number } | null>(null)
    const [wizardReaction, setWizardReaction] = useState<"correct" | "wrong" | null>(null)
    const [wizardEncounter, setWizardEncounter] = useState<WizardEncounter | null>(null)
    const [wizardResult, setWizardResult] = useState<{ correct: boolean; correctIndex: number; answeredIndex: number | null } | null>(null)
    const [wizardPaused, setWizardPaused] = useState(false)

    const wsRef = useRef<WebSocket | null>(null)
    const logsEndRef = useRef<HTMLDivElement>(null)
    const wizardPositionRef = useRef(0)

    const isMyTurn = currentTurn === user?.username
    const isPlayer = players.some((p) => p.username === user?.username)

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [logs])

    function syncWizardPosition(pos: number) {
        wizardPositionRef.current = pos
        setWizardPosition(pos)
    }

    const applyGameState = useCallback((data: any) => {
        setPlayers(data.players || [])
        setCurrentTurn(data.current_turn)
        setGameStatus(data.status)
        if (data.winner) setWinner(data.winner)
        if (typeof data.wizard_position === "number") syncWizardPosition(data.wizard_position)
        if (typeof data.wizard_paused === "boolean") setWizardPaused(data.wizard_paused)
    }, [])

    // Fetch game info
    useEffect(() => {
        async function fetchGame() {
            try {
                const resp = await api(`/api/goose/${id}/`)
                if (resp.ok) {
                    const data = await resp.json()
                    setGameInfo({ name: data.name, created_by: data.created_by })
                    setGameStatus(data.status)

                    if (data.players) {
                        const playerData: PlayerData[] = data.players.map((p: PlayerData, i: number) => ({
                            ...p,
                            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                        }))
                        setPlayers(playerData)
                    }
                    if (typeof data.wizard_position === "number") syncWizardPosition(data.wizard_position)
                }
            } catch {}
        }
        fetchGame()
    }, [id])

    // WebSocket connection
    useEffect(() => {
        if (!id) return

        const wsHost = window.location.hostname + ":9000"
        const token = getAccessToken()
        const ws = new WebSocket(`ws://${wsHost}/ws/goose/${id}/${token ? `?token=${encodeURIComponent(token)}` : ""}`)

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data)

            if (data.type === "game_state") {
                applyGameState(data)
            }

            if (data.type === "turn_result") {
                setDiceAnim(true)
                setTimeout(() => {
                    setDice([data.die1, data.die2])
                    setDiceAnim(false)
                    setRolling(false)

                    setLastMove({
                        player: data.player,
                        from: data.old_position,
                        to: data.new_position,
                    })

                    setTimeout(() => {
                        setPlayers(data.players || [])
                    }, Math.abs(data.new_position - data.old_position) * PLAYER_HOP_MS + 200)

                    setLogs((prev) => [...prev, data.message])

                    if (data.next_turn) setCurrentTurn(data.next_turn)
                    if (data.game_over && data.winner) {
                        setWinner(data.winner)
                        setGameStatus("FINISHED")
                    }

                    if (data.wizard_step) {
                        const from = wizardPositionRef.current
                        const step = data.wizard_step
                        setWizardMove({ from, step })
                        setTimeout(() => {
                            syncWizardPosition(typeof data.wizard_position === "number" ? data.wizard_position : ((from + step) % 64 + 64) % 64)
                        }, Math.abs(step) * WIZARD_HOP_MS + 200)
                    }
                }, 600)
            }

            if (data.type === "game_over") {
                setWinner(data.winner)
                setWizardWon(!!data.wizard_wins)
                setGameStatus("FINISHED")
                setLogs((prev) => [
                    ...prev,
                    data.wizard_wins
                        ? "🧙 Tous les joueurs sont en prison — le Magicien Gris gagne !"
                        : `🏆 ${data.winner} wins!`,
                ])
            }

            if (data.type === "wizard_encounter") {
                setLogs((prev) => [...prev, `🧙 Le Magicien Gris interroge ${data.target} !`])
                // Active-player encounters (paused=true) pause the table and
                // are shown to everyone; prison/revival ones (paused=false)
                // stay private to the target and never block anyone.
                if (data.paused || data.target === user?.username) {
                    setWizardResult(null)
                    setWizardEncounter({
                        target: data.target,
                        question: data.question,
                        choices: data.choices,
                        paused: data.paused,
                    })
                }
                if (data.paused) setWizardPaused(true)
            }

            if (data.type === "wizard_result") {
                setPlayers(data.players || [])
                setLogs((prev) => [...prev, data.message])
                setWizardReaction(data.correct ? "correct" : "wrong")
                setTimeout(() => setWizardReaction(null), 1800)

                if (data.paused) setWizardPaused(false)

                if (data.paused || data.target === user?.username) {
                    setWizardResult({
                        correct: data.correct,
                        correctIndex: data.correct_index,
                        answeredIndex: data.answered_index,
                    })
                    setTimeout(() => {
                        setWizardEncounter(null)
                        setWizardResult(null)
                    }, 2000)
                }
            }

            if (data.error) {
                setError(data.error)
                setRolling(false)
            }
        }

        ws.onerror = () => setError("WebSocket error")
        wsRef.current = ws

        return () => { ws.close() }
    }, [id, applyGameState])

    // Polling fallback
    useEffect(() => {
        if (!id || gameStatus === "FINISHED") return

        const interval = setInterval(() => {
            const ws = wsRef.current
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "get_state" }))
            }
        }, POLL_INTERVAL)

        return () => clearInterval(interval)
    }, [id, gameStatus])

    function rollDice() {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        setRolling(true)
        setError("")
        wsRef.current.send(JSON.stringify({ action: "roll_dice" }))
    }

    function answerWizard(choiceIndex: number) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ action: "wizard_answer", choice_index: choiceIndex }))
    }

    async function startGame() {
        try {
            const resp = await api(`/api/goose/${id}/start/`, { method: "POST" })
            if (resp.ok) {
                setGameStatus("IN_PROGRESS")
                wsRef.current?.send(JSON.stringify({ action: "get_state" }))
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to start")
            }
        } catch {}
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 lg:mb-4">
                <div>
                    <h1 className="text-lg lg:text-2xl font-bold text-white">
                        {gameInfo?.name || "Game of the Goose"}
                    </h1>
                    <p className="text-gray-400 text-xs lg:text-sm">
                        {gameStatus === "WAITING" && "Waiting for players..."}
                        {gameStatus === "IN_PROGRESS" && currentTurn && (
                            <>
                                {PLAYER_TOKENS[players.find(p => p.username === currentTurn)?.turn_order ?? 0]}{" "}
                                <span className="font-semibold text-white">{currentTurn}</span>'s turn
                            </>
                        )}
                        {gameStatus === "FINISHED" && wizardWon && "🧙 Le Magicien Gris gagne !"}
                        {gameStatus === "FINISHED" && !wizardWon && winner && `🏆 ${winner} wins!`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowRules(!showRules)}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-amber-700 text-white rounded hover:bg-amber-600 text-sm"
                    >
                        {showRules ? "Hide Rules" : "How to Play"}
                    </button>
                    {gameStatus === "IN_PROGRESS" && isMyTurn && isPlayer && (
                        <button
                            onClick={rollDice}
                            disabled={rolling || wizardPaused}
                            className="lg:hidden px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
                        >
                            {wizardPaused ? "🧙 En attente..." : rolling ? "Rolling..." : "🎲 Roll"}
                        </button>
                    )}
                    <button
                        onClick={() => navigate("/goose")}
                        className="px-3 py-1.5 md:px-4 md:py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                    >
                        Back
                    </button>
                </div>
            </div>

            {/* How to Play */}
            {showRules && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-4 mb-4 text-sm text-gray-300 space-y-2">
                    <h2 className="text-amber-400 font-bold text-base">🪿 How to Play — Game of the Goose</h2>
                    <p>
                        Race from square <strong className="text-white">0</strong> to square <strong className="text-white">63</strong>! On your turn, two dice are rolled automatically.
                        Move forward by the total. The first player to land <em>exactly</em> on 63 wins.
                        If you overshoot, you bounce back by the excess.
                    </p>
                    <h3 className="text-amber-400 font-semibold pt-1">Special Squares</h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        <li>🪿 <strong className="text-white">Goose</strong> (5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59) — Double your move and roll again!</li>
                        <li>🌉 <strong className="text-white">Bridge</strong> (6) — Jump ahead to square 12.</li>
                        <li>🏨 <strong className="text-white">Inn</strong> (19) — Too comfy! Skip your next turn.</li>
                        <li>🕳️ <strong className="text-white">Well</strong> (31) — Stuck! Skip your next turn.</li>
                        <li>🌀 <strong className="text-white">Maze</strong> (42) — Lost! Go back to square 30.</li>
                        <li>⛓️ <strong className="text-white">Prison</strong> (52) — Locked up! Skip your next 2 turns.</li>
                        <li>💀 <strong className="text-white">Death</strong> (58) — Back to the start!</li>
                        <li>🏁 <strong className="text-white">Finish</strong> (63) — Land here exactly to win!</li>
                    </ul>
                </div>
            )}

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4 text-sm">
                    {error}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
                {/* Board */}
                <div className="flex-1">
                    <GooseBoard
                        players={players}
                        lastMove={lastMove}
                        wizardPosition={wizardPosition}
                        wizardMove={wizardMove}
                        wizardReaction={wizardReaction}
                    />
                </div>

                {/* Sidebar */}
                <div className="w-full lg:w-72 space-y-4">
                    {/* Players */}
                    <div className="hidden lg:block bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-3 text-sm">Players</h3>
                        <div className="space-y-2">
                            {players.map((p) => (
                                <div
                                    key={p.username}
                                    className={`flex items-center gap-2 p-2 rounded ${
                                        p.username === currentTurn ? "bg-gray-700 ring-1 ring-blue-500" : ""
                                    }`}
                                >
                                    <span className="text-lg">
                                        {PLAYER_TOKENS[p.turn_order % PLAYER_TOKENS.length]}
                                    </span>
                                    <span
                                        className={`text-sm flex-1 cursor-pointer hover:text-blue-400 ${
                                            p.username === currentTurn ? "text-white font-semibold" : "text-gray-300"
                                        }`}
                                        onClick={() => navigate(`/profile/${p.username}`)}
                                    >
                                        {p.username}
                                    </span>
                                    {!p.is_active && (
                                        <span className="text-xs text-gray-300 bg-gray-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                                            ⛓️ Prison
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-500">sq {p.position}</span>
                                    {p.skip_turns > 0 && (
                                        <span className="text-xs text-red-400">⏸ {p.skip_turns}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Dice & Actions */}
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 lg:p-4">
                        {gameStatus === "WAITING" && gameInfo?.created_by === user?.username && (
                            <button
                                onClick={startGame}
                                className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold mb-3"
                            >
                                Start Game
                            </button>
                        )}

                        {gameStatus === "WAITING" && gameInfo?.created_by !== user?.username && (
                            <p className="text-gray-400 text-center text-sm">
                                Waiting for host to start...
                            </p>
                        )}

                        {gameStatus === "IN_PROGRESS" && (
                            <>
                                {/* Dice display */}
                                <div className="flex justify-center gap-2 lg:gap-4 mb-1 lg:mb-3">
                                    <div className={`w-9 h-9 lg:w-14 lg:h-14 bg-white rounded-xl flex items-center justify-center text-lg lg:text-3xl font-bold text-gray-900 shadow-lg ${
                                        diceAnim ? "animate-spin" : ""
                                    }`}>
                                        {diceAnim ? "?" : dice ? dice[0] : "·"}
                                    </div>
                                    <div className={`w-9 h-9 lg:w-14 lg:h-14 bg-white rounded-xl flex items-center justify-center text-lg lg:text-3xl font-bold text-gray-900 shadow-lg ${
                                        diceAnim ? "animate-spin" : ""
                                    }`}>
                                        {diceAnim ? "?" : dice ? dice[1] : "·"}
                                    </div>
                                </div>

                                {isMyTurn && isPlayer && (
                                    <button
                                        onClick={rollDice}
                                        disabled={rolling || wizardPaused}
                                        className="hidden lg:block w-full py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-bold text-lg disabled:opacity-50 active:scale-95 transition-transform"
                                    >
                                        {wizardPaused ? "🧙 En attente du magicien..." : rolling ? "Rolling..." : "🎲 Roll Dice"}
                                    </button>
                                )}

                                {!isMyTurn && isPlayer && (
                                    <p className="text-gray-400 text-center text-sm">
                                        {wizardPaused
                                            ? "🧙 Le Magicien Gris interroge quelqu'un, en attente de sa réponse..."
                                            : `Waiting for ${PLAYER_TOKENS[players.find(p => p.username === currentTurn)?.turn_order ?? 0]} ${currentTurn}...`}
                                    </p>
                                )}

                                {!isPlayer && (
                                    <p className="text-gray-500 text-center text-sm italic">
                                        👁 Spectating
                                    </p>
                                )}
                            </>
                        )}

                        {gameStatus === "FINISHED" && wizardWon && (
                            <div className="text-center">
                                <p className="text-purple-400 text-xl font-bold mb-1">🧙 Le Magicien Gris gagne !</p>
                                <p className="text-gray-300 text-sm">
                                    Tous les joueurs sont en prison, personne n'a pu finir la partie.
                                </p>
                                <button
                                    onClick={() => navigate("/goose")}
                                    className="mt-3 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                                >
                                    Back to Lobby
                                </button>
                            </div>
                        )}

                        {gameStatus === "FINISHED" && !wizardWon && winner && (
                            <div className="text-center">
                                <p className="text-yellow-400 text-xl font-bold mb-1">🏆 Winner!</p>
                                <p className="text-white text-lg">
                                    {PLAYER_TOKENS[players.find(p => p.username === winner)?.turn_order ?? 0]} {winner}
                                </p>
                                <button
                                    onClick={() => navigate("/goose")}
                                    className="mt-3 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                                >
                                    Back to Lobby
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Game Log */}
                    <div className="hidden lg:block bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-2 text-sm">Game Log</h3>
                        <div className="h-40 lg:h-48 overflow-y-auto space-y-1">
                            {logs.length === 0 && (
                                <p className="text-gray-500 text-xs">No moves yet</p>
                            )}
                            {logs.map((log, i) => (
                                <p key={i} className="text-xs text-gray-400">{log}</p>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="hidden lg:block bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-semibold mb-2 text-sm">Legend</h3>
                        <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
                            <span>🪿 Goose (double)</span>
                            <span>🌉 Bridge (→12)</span>
                            <span>🏨 Inn (skip 1)</span>
                            <span>🕳️ Well (skip 1)</span>
                            <span>🌀 Maze (→30)</span>
                            <span>⛓️ Prison (skip 2)</span>
                            <span>💀 Death (→start)</span>
                            <span>🏁 Finish (63)</span>
                        </div>
                    </div>
                </div>
            </div>

            {wizardEncounter && (
                <WizardQuiz
                    target={wizardEncounter.target}
                    isTarget={wizardEncounter.target === user?.username}
                    question={wizardEncounter.question}
                    choices={wizardEncounter.choices}
                    onAnswer={answerWizard}
                    result={wizardResult}
                />
            )}
        </div>
    )
}

