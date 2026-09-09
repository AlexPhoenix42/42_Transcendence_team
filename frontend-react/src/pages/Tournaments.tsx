// frontend-react/src/pages/Tournaments.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"

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

export default function Tournaments() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const [tournaments, setTournaments] = useState<TournamentData[]>([])
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [joinedMap, setJoinedMap] = useState<Record<number, boolean>>({})
    const [participantCounts, setParticipantCounts] = useState<Record<number, number>>({})

    useEffect(() => {
        fetchTournaments()
    }, [])

    async function fetchTournaments() {
        try {
            const resp = await api("/api/tournaments/")
            if (resp.ok) {
                const data = await resp.json()
                const list: TournamentData[] = data.results || data
                setTournaments(list)

                // Check participation for each tournament
                for (const t of list) {
                    fetchParticipants(t.id)
                }
            }
        } catch {
            setError("Failed to load tournaments")
        }
    }

    async function fetchParticipants(tournamentId: number) {
        try {
            const resp = await api(`/api/tournaments/${tournamentId}/participants/`)
            if (resp.ok) {
                const data = await resp.json()
                const participants: Participant[] = data.results || data
                setParticipantCounts((prev) => ({ ...prev, [tournamentId]: participants.length }))
                const joined = participants.some((p) => p.player === user?.username)
                setJoinedMap((prev) => ({ ...prev, [tournamentId]: joined }))
            }
        } catch {
            // Silent fail
        }
    }

    async function joinTournament(tournamentId: number) {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${tournamentId}/join/`, {
                method: "POST",
            })

            if (resp.ok) {
                setSuccess("Joined tournament!")
                setJoinedMap((prev) => ({ ...prev, [tournamentId]: true }))
                fetchParticipants(tournamentId)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to join")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    async function leaveTournament(tournamentId: number) {
        setError("")
        setSuccess("")

        try {
            const resp = await api(`/api/tournaments/${tournamentId}/leave/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                setSuccess("Left tournament")
                setJoinedMap((prev) => ({ ...prev, [tournamentId]: false }))
                fetchParticipants(tournamentId)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to leave")
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

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Tournaments</h1>

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

            {tournaments.length === 0 && (
                <p className="text-gray-400">No tournaments available.</p>
            )}

            <div className="space-y-3">
                {tournaments.map((t) => (
                    <div key={t.id} className="bg-gray-800 p-5 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-semibold text-white">{t.name}</h2>
                                <span className={`text-sm font-semibold ${statusColor(t.status)}`}>
                                    {t.status}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {t.status === "OPEN" && (
                                    joinedMap[t.id] ? (
                                        <button
                                            onClick={() => leaveTournament(t.id)}
                                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                                        >
                                            Leave
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => joinTournament(t.id)}
                                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                        >
                                            Join
                                        </button>
                                    )
                                )}
                                <button
                                    onClick={() => navigate(`/tournaments/${t.id}`)}
                                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                >
                                    View
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-4 text-sm text-gray-400">
                            <span>Players: {participantCounts[t.id] || 0}/{t.max_players}</span>
                            <span>Time: {formatTimer(t.timer)}</span>
                        </div>
                        {t.description && (
                            <p className="text-gray-400 text-sm mt-2">{t.description}</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

