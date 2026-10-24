// frontend-react/src/pages/AdminDashboard.tsx

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api, mediaUrl } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import { useI18n } from "../i18n/I18nProvider.tsx"
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

interface AuditEntry {
    id: number
    event_type: string
    username: string
    ip_address: string | null
    user_agent: string
    success: boolean
    metadata: Record<string, string>
    timestamp: string
}

export default function AdminDashboard() {
    const { t, n, ts } = useI18n()
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
	const [tab, setTab] = useState<"tournament" | "users" | "status" | "security">("tournament")
    const [users, setUsers] = useState<UserEntry[]>([])
    const [search, setSearch] = useState("")
    const [userError, setUserError] = useState("")
    const [userSuccess, setUserSuccess] = useState("")

	// Security audit log
    const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
    const [auditPage, setAuditPage] = useState(1)
    const [auditTotal, setAuditTotal] = useState(0)
    const [auditTotalPages, setAuditTotalPages] = useState(0)
    const [auditEventFilter, setAuditEventFilter] = useState("")
    const [auditUserFilter, setAuditUserFilter] = useState("")
    const [auditLoading, setAuditLoading] = useState(false)
    const [auditError, setAuditError] = useState("")
    const [unlockSuccess, setUnlockSuccess] = useState("")

	if (!user?.is_staff && user?.role !== "admin" && user?.role !== "moderator") {
        return (
            <div className="max-w-4xl mx-auto">
                <p className="text-red-400 text-center mt-10">{t("admin.denied")}</p>
            </div>
        )
    }

    useEffect(() => {
        if (tab === "users") fetchUsers()
    }, [tab, search])

	useEffect(() => {
        if (tab === "security") fetchAuditLogs()
    }, [tab, auditPage, auditEventFilter, auditUserFilter])

    async function fetchUsers() {
        try {
            const url = search
                ? `/api/users/?search=${encodeURIComponent(search)}`
                : "/api/users/"
            const resp = await api(url)
            if (resp.ok) {
                setUsers(await resp.json())
            } else {
                setUserError(t("admin.error.loadUsers"))
            }
        } catch {
            setUserError(t("common.error.networkShort"))
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
                setUserSuccess(t("admin.msg.roleUpdated"))
                fetchUsers()
            } else {
                const data = await resp.json()
                setUserError(ts(data.error, "admin.error.updateRole"))
            }
        } catch {
            setUserError(t("common.error.networkShort"))
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
                setUserSuccess(active ? t("admin.msg.userActivated") : t("admin.msg.userDeactivated"))
                fetchUsers()
            } else {
                const data = await resp.json()
                setUserError(ts(data.error, "admin.error.updateUser"))
            }
        } catch {
            setUserError(t("common.error.networkShort"))
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
                setUserError(ts(data.error, "admin.error.deleteUser"))
            }
        } catch {
            setUserError(t("common.error.networkShort"))
        }
    }

	async function fetchAuditLogs() {
        setAuditLoading(true)
        setAuditError("")
        try {
            const params = new URLSearchParams({ page: String(auditPage) })
            if (auditEventFilter) params.set("event_type", auditEventFilter)
            if (auditUserFilter) params.set("username", auditUserFilter)

            const resp = await api(`/api/audit/logs/?${params}`)
            if (resp.ok) {
                const data = await resp.json()
                setAuditLogs(data.results)
                setAuditTotal(data.total)
                setAuditTotalPages(data.total_pages)
            } else {
                setAuditError("Failed to load audit logs")
            }
        } catch {
            setAuditError("Network error")
        } finally {
            setAuditLoading(false)
        }
    }

    async function unlockAccount(username: string) {
        setAuditError("")
        setUnlockSuccess("")
        try {
            const resp = await api("/api/audit/unlock/", {
                method: "POST",
                body: JSON.stringify({ username }),
            })
            if (resp.ok) {
                setUnlockSuccess(`Account "${username}" unlocked`)
                fetchAuditLogs()
            } else {
                const data = await resp.json()
                setAuditError(data.error || "Failed to unlock account")
            }
        } catch {
            setAuditError("Network error")
        }
    }

    async function createTournament(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")
        setLoading(true)

		if (!name.trim()) {
            setError("Tournament name is required")
            setLoading(false)
            return
        }
        if (name.trim().length > 50) {
            setError("Tournament name must be under 50 characters")
            setLoading(false)
            return
        }

        const maxP = parseInt(maxPlayers)
        const aiC = parseInt(aiCount)

        if (isNaN(maxP) || maxP < 2 || maxP > 16) {
            setError(t("admin.error.maxPlayers"))
            setLoading(false)
            return
        }

        if (isNaN(aiC) || aiC < 0) {
            setError(t("admin.error.aiCount"))
            setLoading(false)
            return
        }

        if (aiC >= maxP) {
            setError(t("admin.error.aiTooMany"))
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
                setError(data.error || ts(data.detail, "admin.error.createTournament"))
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
                    setError(ts(data.error, "admin.error.addAI"))
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
            setError(t("common.error.networkShort"))
        } finally {
            setLoading(false)
        }
    }

    function roleBadge(role: string) {
        if (role === "admin") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/50 text-red-400">{t("role.admin")}</span>
        if (role === "moderator") return <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-900/50 text-yellow-400">{t("role.mod")}</span>
        return <span className="px-2 py-0.5 rounded text-xs font-bold bg-gray-700 text-gray-400">{t("admin.role.user")}</span>
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">{t("admin.title")}</h1>

            {/* Tab switcher */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setTab("tournament")}
                    className={`px-4 py-2 rounded ${tab === "tournament" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                    {t("admin.tab.createTournament")}
                </button>
				{(user?.is_staff || user?.role === "admin") && (
                    <>
                        <button
                            onClick={() => setTab("users")}
                            className={`px-4 py-2 rounded ${tab === "users" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                        >
                            {t("admin.tab.manageUsers")}
                        </button>
                        <button
                            onClick={() => setTab("status")}
                            className={`px-4 py-2 rounded ${tab === "status" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                        >
                            {t("admin.tab.systemStatus")}
                        </button>
						<button
                            onClick={() => setTab("security")}
                            className={`px-4 py-2 rounded ${tab === "security" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                        >
                            Security Audit
                        </button>
                    </>
                )}
            </div>

            {/* Tournament tab */}
            {tab === "tournament" && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">{t("admin.tab.createTournament")}</h2>

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
                            <label className="text-gray-400 text-sm block mb-1">{t("admin.form.name")}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t("admin.form.namePlaceholder")}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-gray-400 text-sm block mb-1">{t("admin.form.maxPlayers")}</label>
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
                                <label className="text-gray-400 text-sm block mb-1">{t("admin.form.aiPlayers")}</label>
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
                            <label className="text-gray-400 text-sm block mb-1">{t("admin.form.timeControl")}</label>
                            <select
                                value={timer}
                                onChange={(e) => setTimer(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            >
                                <option value="">{t("admin.form.unlimited")}</option>
                                <option value="3+2">3 min + 2 sec</option>
                                <option value="5+0">5 min</option>
                                <option value="10+5">10 min + 5 sec</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-gray-400 text-sm block mb-1">{t("admin.form.description")}</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={t("admin.form.descPlaceholder")}
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
                    <h2 className="text-xl font-semibold text-white mb-4">{t("admin.tab.manageUsers")}</h2>

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
                        placeholder={t("admin.users.search")}
                        className="w-full px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 mb-4"
                    />

                    <div className="space-y-2">
                        {users.length === 0 && (
                            <p className="text-gray-400 text-center py-4">{t("admin.users.empty")}</p>
                        )}

                        {users.map((u) => (
                            <div
                                key={u.id}
								className={`flex flex-col md:flex-row items-start md:items-center gap-3 p-3 rounded-lg border ${
                                    !u.is_active ? "border-red-800 bg-red-900/10" : "border-gray-700 bg-gray-900/50"
                                }`}
                            >
                                {/* Avatar */}
                                {u.avatar ? (
									<img src={mediaUrl(u.avatar) || undefined} alt={u.username} className="w-10 h-10 rounded-full object-cover" />
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
                                            <bdi>{u.username}</bdi>
                                        </span>
                                        {roleBadge(u.role)}
                                        <span className={`w-2 h-2 rounded-full ${u.is_online ? "bg-green-500" : "bg-gray-500"}`}></span>
                                        {!u.is_active && <span className="text-xs text-red-400">(disabled)</span>}
                                    </div>
                                    <p className="text-gray-500 text-xs truncate">{u.email}</p>
                                </div>

                                {/* Rating */}
                                <div className="text-center px-2">
                                    <p className="text-white font-bold">{n(u.rating, { useGrouping: false })}</p>
                                    <p className="text-gray-500 text-xs">{t("stats.rating")}</p>
                                </div>

                                {/* Actions */}
                                {u.username !== user?.username && u.role !== "admin" && (
									<div className="flex flex-wrap items-center gap-2">
                                        <select
                                            value={u.role}
                                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                                            className="px-2 py-1 bg-gray-800 text-white border border-gray-600 rounded text-sm"
                                        >
                                            <option value="user">{t("admin.role.user")}</option>
                                            <option value="moderator">{t("admin.role.moderator")}</option>
                                            <option value="admin">{t("role.admin")}</option>
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
                                            {t("admin.delete")}
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

			{/* Security audit tab */}
            {tab === "security" && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Security Audit Log</h2>

                    {auditError && (
                        <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                            {auditError}
                        </div>
                    )}
                    {unlockSuccess && (
                        <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded mb-4">
                            {unlockSuccess}
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-3 mb-4">
                        <select
                            value={auditEventFilter}
                            onChange={(e) => { setAuditEventFilter(e.target.value); setAuditPage(1) }}
                            className="px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-sm"
                        >
                            <option value="">All events</option>
                            <option value="login_success">Login Success</option>
                            <option value="login_failed">Login Failed</option>
                            <option value="password_reset">Password Reset</option>
                            <option value="2fa_enabled">2FA Enabled</option>
                            <option value="2fa_disabled">2FA Disabled</option>
                            <option value="account_locked">Account Locked</option>
                            <option value="account_unlocked">Account Unlocked</option>
                        </select>

                        <input
                            type="text"
                            value={auditUserFilter}
                            onChange={(e) => { setAuditUserFilter(e.target.value); setAuditPage(1) }}
                            placeholder="Filter by username"
                            className="px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-sm flex-1"
                        />

                        <button
                            onClick={() => { setAuditEventFilter(""); setAuditUserFilter(""); setAuditPage(1) }}
                            className="px-3 py-2 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
                        >
                            Clear
                        </button>
                    </div>

                    {/* Results count */}
                    <p className="text-gray-500 text-sm mb-3">{auditTotal} event{auditTotal !== 1 ? "s" : ""}</p>

                    {/* Log table */}
                    {auditLoading ? (
                        <p className="text-gray-400 text-center py-4">Loading...</p>
                    ) : auditLogs.length === 0 ? (
                        <p className="text-gray-400 text-center py-4">No audit events found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-gray-400 border-b border-gray-700">
                                        <th className="text-left py-2 pr-3">Time</th>
                                        <th className="text-left py-2 pr-3">Event</th>
                                        <th className="text-left py-2 pr-3">User</th>
                                        <th className="text-left py-2 pr-3">IP</th>
                                        <th className="text-left py-2 pr-3">Status</th>
                                        <th className="text-left py-2">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map((log) => (
                                        <tr
                                            key={log.id}
                                            className={`border-b border-gray-700/50 ${
                                                !log.success ? "bg-red-900/10" :
                                                log.event_type === "account_locked" ? "bg-yellow-900/10" : ""
                                            }`}
                                        >
                                            <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                    log.event_type === "login_failed" ? "bg-red-900/50 text-red-400" :
                                                    log.event_type === "account_locked" ? "bg-yellow-900/50 text-yellow-400" :
                                                    log.event_type === "login_success" ? "bg-green-900/50 text-green-400" :
                                                    "bg-blue-900/50 text-blue-400"
                                                }`}>
                                                    {log.event_type.replace(/_/g, " ")}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 text-white">{log.username}</td>
                                            <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{log.ip_address || "—"}</td>
                                            <td className="py-2 pr-3">
                                                {log.success
                                                    ? <span className="text-green-400 text-xs">OK</span>
                                                    : <span className="text-red-400 text-xs">FAIL</span>
                                                }
                                            </td>
                                            <td className="py-2">
                                                {log.event_type === "account_locked" && (
                                                    <button
                                                        onClick={() => unlockAccount(log.username)}
                                                        className="px-2 py-0.5 bg-green-800 text-green-300 rounded text-xs hover:bg-green-700"
                                                    >
                                                        Unlock
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {auditTotalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <button
                                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                                disabled={auditPage <= 1}
                                className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="text-gray-400 text-sm">
                                Page {auditPage} / {auditTotalPages}
                            </span>
                            <button
                                onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                                disabled={auditPage >= auditTotalPages}
                                className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600 disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

