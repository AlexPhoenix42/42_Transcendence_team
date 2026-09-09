// frontend-react/src/pages/AdminDashboard.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import Status from "./Status.tsx"

interface UserEntry {
    id: number
    username: string
    email: string
    dispname: string | null
    role: string
    is_active: boolean
    is_online: boolean
    rating: number
    wins: number
    loss: number
    draw: number
    date_joined: string
    avatar: string | null
}

export default function AdminDashboard() {
    const { user } = useAuth()
    const navigate = useNavigate()

    // Tournament creation
    const [name, setName] = useState("")
    const [maxPlayers, setMaxPlayers] = useState("4")
    const [aiCount, setAiCount] = useState("0")
    const [timer, setTimer] = useState("")
    const [description, setDescription] = useState("")

    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [loading, setLoading] = useState(false)

    // User management
	const [tab, setTab] = useState<"tournament" | "users" | "status">("tournament")
    const [users, setUsers] = useState<UserEntry[]>([])
    const [search, setSearch] = useState("")
    const [userError, setUserError] = useState("")
    const [userSuccess, setUserSuccess] = useState("")

	if (!user?.is_staff && user?.role !== "admin" && user?.role !== "moderator") {
        return (
            <div className="max-w-4xl mx-auto">
                <p className="text-red-400 text-center mt-10">Access denied. Admin only.</p>
            </div>
        )
    }

    useEffect(() => {
        if (tab === "users") fetchUsers()
    }, [tab, search])

    async function fetchUsers() {
        try {
            const url = search
                ? `/api/users/?search=${encodeURIComponent(search)}`
                : "/api/users/"
            const resp = await api(url)
            if (resp.ok) {
                setUsers(await resp.json())
            } else {
                setUserError("Failed to load users")
            }
        } catch {
            setUserError("Network error")
        }
    }

    async function updateUserRole(userId: number, role: string) {
        setUserError("")
        setUserSuccess("")
        try {
            const resp = await api(`/api/users/${userId}/`, {
                method: "PATCH",
                body: JSON.stringify({ role }),
            })
            if (resp.ok) {
                setUserSuccess("Role updated")
                fetchUsers()
            } else {
                const data = await resp.json()
                setUserError(data.error || "Failed to update role")
            }
        } catch {
            setUserError("Network error")
        }
    }

    async function toggleUserActive(userId: number, active: boolean) {
        setUserError("")
        setUserSuccess("")
        try {
            const resp = await api(`/api/users/${userId}/`, {
                method: "PATCH",
                body: JSON.stringify({ is_active: active }),
            })
            if (resp.ok) {
                setUserSuccess(active ? "User activated" : "User deactivated")
                fetchUsers()
            } else {
                const data = await resp.json()
                setUserError(data.error || "Failed to update user")
            }
        } catch {
            setUserError("Network error")
        }
    }

    async function deleteUser(userId: number, username: string) {
        if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) return

        setUserError("")
        setUserSuccess("")
        try {
            const resp = await api(`/api/users/${userId}/delete/`, {
                method: "DELETE",
            })
            if (resp.ok) {
                setUserSuccess(`User "${username}" deleted`)
                fetchUsers()
            } else {
                const data = await resp.json()
                setUserError(data.error || "Failed to delete user")
            }
        } catch {
            setUserError("Network error")
        }
    }

    async function createTournament(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")
        setLoading(true)

        const maxP = parseInt(maxPlayers)
        const aiC = parseInt(aiCount)

        if (isNaN(maxP) || maxP < 2 || maxP > 16) {
            setError("Max players must be between 2 and 16")
            setLoading(false)
            return
        }

        if (isNaN(aiC) || aiC < 0) {
            setError("AI count must be 0 or more")
            setLoading(false)
            return
        }

        if (aiC >= maxP) {
            setError("AI count must be less than max players")
            setLoading(false)
            return
        }

        try {
            const body: Record<string, string | number> = {
                name: name.trim(),
                max_players: maxP,
            }
            if (timer) body.timer = timer
            if (description.trim()) body.description = description.trim()

            const resp = await api("/api/tournaments/", {
                method: "POST",
                body: JSON.stringify(body),
            })

            if (!resp.ok) {
                const data = await resp.json()
                setError(data.error || data.detail || "Failed to create tournament")
                setLoading(false)
                return
            }

            const tournament = await resp.json()

            if (aiC > 0) {
                const aiResp = await api(`/api/tournaments/${tournament.id}/add-ai/`, {
                    method: "POST",
                    body: JSON.stringify({ count: aiC }),
                })

                if (!aiResp.ok) {
                    const data = await aiResp.json()
                    setError(data.error || "Tournament created but failed to add AI players")
                    setLoading(false)
                    return
                }
            }

            setSuccess(`Tournament "${name}" created`)
            setName("")
            setMaxPlayers("4")
            setAiCount("0")
            setTimer("")
            setDescription("")

            setTimeout(() => navigate(`/tournaments/${tournament.id}`), 1500)
        } catch {
            setError("Network error")
        } finally {
            setLoading(false)
        }
    }

    function roleBadge(role: string) {
        if (role === "admin") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">Admin</span>
        if (role === "moderator") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400">Mod</span>
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-400">User</span>
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">Admin Dashboard</h1>

            {/* Tab switcher */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setTab("tournament")}
                    className={`px-4 py-2 rounded ${tab === "tournament" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                    Create Tournament
                </button>
				{(user?.is_staff || user?.role === "admin") && (
                    <>
                        <button
                            onClick={() => setTab("users")}
                            className={`px-4 py-2 rounded ${tab === "users" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                        >
                            Manage Users
                        </button>
                        <button
                            onClick={() => setTab("status")}
                            className={`px-4 py-2 rounded ${tab === "status" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                        >
                            System Status
                        </button>
                    </>
                )}
            </div>

            {/* Tournament tab */}
            {tab === "tournament" && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Create Tournament</h2>

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

                    <form onSubmit={createTournament} className="space-y-4">
                        <div>
                            <label className="text-gray-400 text-sm block mb-1">Tournament Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Weekly Championship"
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-gray-400 text-sm block mb-1">Max Players</label>
                                <select
                                    value={maxPlayers}
                                    onChange={(e) => {
                                        setMaxPlayers(e.target.value)
                                        const newMax = parseInt(e.target.value)
                                        const currentAi = parseInt(aiCount)
                                        if (currentAi >= newMax) setAiCount(String(newMax - 1))
                                    }}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                >
                                    {[2, 3, 4, 5, 6, 7, 8, 16].map((n) => (
                                        <option key={n} value={n}>{n} players</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-gray-400 text-sm block mb-1">AI Players</label>
                                <select
                                    value={aiCount}
                                    onChange={(e) => setAiCount(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                >
                                    {Array.from({ length: parseInt(maxPlayers) }, (_, i) => (
                                        <option key={i} value={i}>{i === 0 ? "None" : `${i} AI`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm block mb-1">Time Control</label>
                            <select
                                value={timer}
                                onChange={(e) => setTimer(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            >
                                <option value="">Unlimited</option>
                                <option value="3+2">3 min + 2 sec</option>
                                <option value="5+0">5 min</option>
                                <option value="10+5">10 min + 5 sec</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm block mb-1">Description (optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Tournament description..."
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 h-20 resize-none"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold"
                        >
                            {loading ? "Creating..." : "Create Tournament"}
                        </button>
                    </form>
                </div>
            )}

            {/* Users tab */}
            {tab === "users" && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Manage Users</h2>

                    {userError && (
                        <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                            {userError}
                        </div>
                    )}
                    {userSuccess && (
                        <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded mb-4">
                            {userSuccess}
                        </div>
                    )}

                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search users..."
                        className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 mb-4"
                    />

                    <div className="space-y-2">
                        {users.length === 0 && (
                            <p className="text-gray-400 text-center py-4">No users found</p>
                        )}

                        {users.map((u) => (
                            <div
                                key={u.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    !u.is_active ? "border-red-800 bg-red-900/10" : "border-gray-700 bg-gray-900/50"
                                }`}
                            >
                                {/* Avatar */}
                                {u.avatar ? (
                                    <img src={u.avatar} alt={u.username} className="w-10 h-10 rounded-full object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">
                                        {u.username[0].toUpperCase()}
                                    </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-white font-semibold cursor-pointer hover:text-blue-400"
                                            onClick={() => navigate(`/profile/${u.username}`)}
                                        >
                                            {u.username}
                                        </span>
                                        {roleBadge(u.role)}
                                        <span className={`w-2 h-2 rounded-full ${u.is_online ? "bg-green-500" : "bg-gray-500"}`}></span>
                                        {!u.is_active && <span className="text-xs text-red-400">(disabled)</span>}
                                    </div>
                                    <p className="text-gray-500 text-xs truncate">{u.email}</p>
                                </div>

                                {/* Rating */}
                                <div className="text-center px-2">
                                    <p className="text-white font-bold">{u.rating}</p>
                                    <p className="text-gray-500 text-xs">Rating</p>
                                </div>

                                {/* Actions */}
                                {u.username !== user?.username && u.role !== "admin" && (
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={u.role}
                                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                                            className="px-2 py-1 bg-gray-800 text-white border border-gray-600 rounded text-sm"
                                        >
                                            <option value="user">User</option>
                                            <option value="moderator">Moderator</option>
                                            <option value="admin">Admin</option>
                                        </select>

                                        <button
                                            onClick={() => toggleUserActive(u.id, !u.is_active)}
                                            className={`px-2 py-1 rounded text-xs ${
                                                u.is_active
                                                    ? "bg-yellow-800 text-yellow-300 hover:bg-yellow-700"
                                                    : "bg-green-800 text-green-300 hover:bg-green-700"
                                            }`}
                                        >
                                            {u.is_active ? "Disable" : "Enable"}
                                        </button>

                                        <button
                                            onClick={() => deleteUser(u.id, u.username)}
                                            className="px-2 py-1 bg-red-800 text-red-300 rounded text-xs hover:bg-red-700"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

			{/* Status tab */}
            {tab === "status" && (
                <Status />
            )}
        </div>
    )
}

