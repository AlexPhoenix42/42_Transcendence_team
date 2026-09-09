// frontend-react/src/pages/TournamentDetail.tsx

import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import TournamentBracket from "../components/TournamentBracket.tsx"
import { ChatSocket, ChatMessage } from "../ws/chat.ts"

interface TournamentData {
    id: number
    name: string
    status: string
    max_players: number
    timer: string | null
    created_by: number
    created_at: string
    description: string
}

interface Participant {
    id: number
    player: string
    joined_at: string
}

interface MatchData {
    id: number
    tournament: number
    game: number | null
    player1: string | null
    player2: string | null
    winner: string | null
    round_nb: number
    status: string
}

export default function TournamentDetail() {
    const { id } = useParams()
    const { user } = useAuth()
    const navigate = useNavigate()

    const [tournament, setTournament] = useState<TournamentData | null>(null)
    const [participants, setParticipants] = useState<Participant[]>([])
    const [matches, setMatches] = useState<MatchData[]>([])
    const [isJoined, setIsJoined] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    const [chatConnected, setChatConnected] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const [chatTypingUser, setChatTypingUser] = useState<string | null>(null)
    const chatTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const chatSocketRef = useRef<ChatSocket | null>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [chatMessages])

    useEffect(() => {
        if (!id) return

        async function connectChat() {
            try {
                const resp = await api(`/api/chat/rooms/tournament/${id}/`)
                if (!resp.ok) return
                const data = await resp.json()
                const roomId = data.room_id

                // Load history
                try {
                    const histResp = await api(`/api/chat/rooms/${roomId}/messages/`)
                    if (histResp.ok) {
                        const histData = await histResp.json()
                        setChatMessages(histData.results || histData)
                    }
                } catch {}

				const socket = new ChatSocket(
                    roomId,
                    (msg) => {
                        setChatMessages((prev) => {
                            if (prev.some((m) => m.id === msg.id)) return prev
                            return [...prev, msg]
                        })
                    },
                    () => {},
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

	useEffect(() => {
        fetchTournament()
        fetchParticipants()
        fetchMatches()
    }, [id])

    async function fetchTournament() {
        try {
            const resp = await api(`/api/tournaments/${id}/`)
            if (resp.ok) {
                const data = await resp.json()
                setTournament(data)
            } else {
                setError("Tournament not found")
            }
        } catch {
            setError("Failed to load tournament")
        }
    }

    async function fetchParticipants() {
        try {
            const resp = await api(`/api/tournaments/${id}/participants/`)
            if (resp.ok) {
                const data = await resp.json()
                const list: Participant[] = data.results || data
                setParticipants(list)
                setIsJoined(list.some((p) => p.player === user?.username))
            }
        } catch {
            // Silent fail
        }
    }

    async function fetchMatches() {
        try {
            const resp = await api(`/api/tournaments/${id}/matches/`)
            if (resp.ok) {
                const data = await resp.json()
                setMatches(data.results || data)
            }
        } catch {
            // Silent fail
        }
    }

    async function joinTournament() {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${id}/join/`, {
                method: "POST",
            })

            if (resp.ok) {
                setSuccess("Joined tournament!")
                fetchParticipants()
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to join")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function leaveTournament() {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${id}/leave/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                setSuccess("Left tournament")
                fetchParticipants()
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to leave")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function forfeitTournament() {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${id}/forfeit/`, {
                method: "POST",
            })

            if (resp.ok) {
                setSuccess("Forfeited from tournament")
                fetchParticipants()
                fetchMatches()
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to forfeit")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

	async function cancelTournament() {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${id}/cancel/`, {
                method: "POST",
            })

            if (resp.ok) {
                setSuccess("Tournament cancelled")
                fetchTournament()
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to cancel")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

	async function deleteTournament() {
        setError("")

        try {
            const resp = await api(`/api/tournaments/${id}/delete/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                navigate("/tournaments")
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to delete")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

	async function startTournament() {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${id}/start/`, {
                method: "POST",
            })

            if (resp.ok) {
                setSuccess("Tournament started!")
                fetchTournament()
                fetchMatches()
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to start tournament")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function startMatch(matchId: number) {
        setError("")

        try {
            const resp = await api(`/api/tournaments/${id}/matches/${matchId}/start/`, {
                method: "POST",
            })

            if (resp.ok) {
                const data = await resp.json()
                navigate(`/chess/${data.id}`)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to start match")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    function formatTimer(timer: string | null): string {
        if (!timer) return "Unlimited"
        const parts = timer.split("+")
        return `${parts[0]} min + ${parts[1]} sec`
    }

    function statusColor(status: string): string {
        switch (status) {
            case "OPEN": return "text-green-400"
            case "ONGOING": return "text-yellow-400"
            case "FINISHED": return "text-gray-400"
            case "CANCELLED": return "text-red-400"
            default: return "text-gray-400"
        }
    }

    function matchStatusColor(status: string): string {
        switch (status) {
            case "PENDING": return "text-gray-400"
            case "IN_PROGRESS": return "text-yellow-400"
            case "FINISHED": return "text-green-400"
            default: return "text-gray-400"
        }
    }

    if (!tournament) {
        return <p className="text-gray-400 text-center mt-10">Loading...</p>
    }

    // Group matches by round
    const rounds: Record<number, MatchData[]> = {}
    for (const m of matches) {
        if (!rounds[m.round_nb]) rounds[m.round_nb] = []
        rounds[m.round_nb].push(m)
    }
    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b)

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className={`font-semibold ${statusColor(tournament.status)}`}>
                            {tournament.status}
                        </span>
                        <span className="text-gray-400 text-sm">
                            {participants.length}/{tournament.max_players} players
                        </span>
                        <span className="text-gray-400 text-sm">
                            {formatTimer(tournament.timer)}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {tournament.status === "OPEN" && (
                        isJoined ? (
                            <button
                                onClick={leaveTournament}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Leave
                            </button>
                        ) : (
                            <button
                                onClick={joinTournament}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                            >
                                Join
                            </button>
                        )
                    )}
					{tournament.status === "ONGOING" && isJoined && (
                        <button
                            onClick={forfeitTournament}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            Forfeit
                        </button>
                    )}
					{tournament.status === "OPEN" && user?.is_staff && (
                        <button
                            onClick={startTournament}
                            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                        >
                            Start Tournament
                        </button>
                    )}
					{(tournament.status === "OPEN" || tournament.status === "ONGOING") && user?.is_staff && (
                        <button
                            onClick={cancelTournament}
                            className="px-4 py-2 bg-red-800 text-white rounded hover:bg-red-900"
                        >
                            Cancel Tournament
                        </button>
                    )}
					{(tournament.status === "CANCELLED" || tournament.status === "FINISHED") && user?.is_staff && (
                        <button
                            onClick={deleteTournament}
                            className="px-4 py-2 bg-gray-800 text-red-400 border border-red-800 rounded hover:bg-red-900 hover:text-white"
                        >
                            Delete
                        </button>
                    )}
                    <button
                        onClick={() => navigate("/tournaments")}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Back
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}
            {success && (
                <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded mb-4">
                    {success}
                </div>
            )}

            {tournament.description && (
                <p className="text-gray-400 mb-6">{tournament.description}</p>
            )}

            {/* Participants */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-5 mb-6">
                <h2 className="text-xl font-semibold text-white mb-3">Participants</h2>
                {participants.length === 0 ? (
                    <p className="text-gray-400">No participants yet.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {participants.map((p) => (
                            <span
                                key={p.id}
                                className={`px-3 py-1 rounded text-sm ${
                                    p.player === user?.username
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-700 text-gray-300"
                                }`}
                            >
                                {p.player}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Bracket / Matches */}
			{/*
            {matches.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-xl font-semibold text-white mb-4">Bracket</h2>
                    {roundNumbers.map((roundNb) => (
                        <div key={roundNb} className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-300 mb-3">
                                {roundNb === roundNumbers[roundNumbers.length - 1] && roundNumbers.length > 1
                                    ? "Final"
                                    : roundNumbers.length > 2 && roundNb === roundNumbers[roundNumbers.length - 2]
                                    ? "Semi-Final"
                                    : `Round ${roundNb}`
                                }
                            </h3>
                            <div className="space-y-2">
                                {rounds[roundNb].map((match) => (
                                    <div
                                        key={match.id}
                                        className="bg-gray-900 p-4 rounded-lg flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-4">
                                            <span className={`font-semibold ${
                                                match.winner === match.player1
                                                    ? "text-green-400"
                                                    : match.winner && match.winner !== match.player1
                                                    ? "text-red-400"
                                                    : "text-white"
                                            }`}>
                                                {match.player1 || "TBD"}
                                            </span>
                                            <span className="text-gray-500">vs</span>
                                            <span className={`font-semibold ${
                                                match.winner === match.player2
                                                    ? "text-green-400"
                                                    : match.winner && match.winner !== match.player2
                                                    ? "text-red-400"
                                                    : "text-white"
                                            }`}>
                                                {match.player2 || "TBD"}
                                            </span>
                                            <span className={`text-sm ${matchStatusColor(match.status)}`}>
                                                {match.status}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {match.status === "PENDING" &&
                                                match.player1 && match.player2 &&
                                                (match.player1 === user?.username || match.player2 === user?.username) && (
                                                <button
                                                    onClick={() => startMatch(match.id)}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                                >
                                                    Start
                                                </button>
                                            )}
											{match.game && (
                                                <button
                                                    onClick={() => navigate(`/chess/${match.game}`)}
                                                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                                                >
                                                    {match.status === "IN_PROGRESS" && (match.player1 === user?.username || match.player2 === user?.username)
                                                        ? "Play"
                                                        : match.status === "IN_PROGRESS"
                                                        ? "Watch"
                                                        : "View"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}*/}
			{/* Bracket */}
            {matches.length > 0 && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
                    <h2 className="text-xl font-semibold text-white mb-4">Bracket</h2>
                    <TournamentBracket
                        matches={matches}
                        currentUser={user?.username}
                        isStaff={user?.is_staff}
                        onStartMatch={startMatch}
                    />
                </div>
            )}

                        {/* Tournament Chat */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 mt-6">
                <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => setChatOpen(!chatOpen)}
                >
                    <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">Tournament Chat</span>
                        <span className={`w-2 h-2 rounded-full ${chatConnected ? "bg-green-500" : "bg-red-500"}`}></span>
                        {chatMessages.filter(m => m.sender === "system").length > 0 && !chatOpen && (
                            <span className="text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">
                                {chatMessages.filter(m => m.sender === "system").length} notifications
                            </span>
                        )}
                    </div>
                    <span className="text-gray-400">{chatOpen ? "▲" : "▼"}</span>
                </div>

                {chatOpen && (
                    <>
						<div className="border-t border-gray-700 p-3 h-64 overflow-y-auto space-y-2">
                            {chatMessages.length === 0 && (
                                <p className="text-gray-500 text-xs text-center">No messages yet</p>
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
                        <form onSubmit={handleChatSend} className="border-t border-gray-700 p-3 flex gap-2">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => {
									setChatInput(e.target.value)
								}}
                                placeholder="Chat..."
                                className="flex-1 px-2 py-1 bg-gray-900 text-white border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
                                maxLength={2000}
                            />
                            <button
                                type="submit"
                                className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                            >
                                Send
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}

