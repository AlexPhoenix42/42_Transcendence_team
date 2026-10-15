// frontend-react/src/pages/Friends.tsx

import { useState, useEffect } from "react"
import { api } from "../api/client.ts"
import { Link } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"

interface Friend {
    id: number
    username: string
	is_online: boolean
}

interface FriendRequest {
    id: number
    from_user: string
    to_user: string
    sent_by: string
    status: string
    created_at: string
}

export default function Friends() {
    const { t, ts } = useI18n()
    const [friends, setFriends] = useState<Friend[]>([])
    const [requests, setRequests] = useState<FriendRequest[]>([])
    const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
    const [username, setUsername] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
	const [tab, setTab] = useState<"friends" | "requests" | "sent" | "blocked">("friends")
	const [blocked, setBlocked] = useState<Friend[]>([])

	useEffect(() => {
        fetchFriends()
        fetchRequests()
        fetchSentRequests()
		fetchBlocked()

        const interval = setInterval(() => {
            fetchFriends()
            fetchRequests()
            fetchSentRequests()
			fetchBlocked()
        }, 10000)

        return () => clearInterval(interval)
    }, [])

	async function fetchFriends() {
        try {
            const resp = await api("/api/friends/")
            if (resp.ok) {
                const data = await resp.json()
                setFriends(data.results)
            }
        } catch {
            // Network error — leave list empty
        }
    }

    async function fetchRequests() {
        try {
            const resp = await api("/api/friends/requests/")
            if (resp.ok) {
                const data = await resp.json()
                setRequests(data.results)
            }
        } catch {
            // Network error
        }
    }

    async function fetchSentRequests() {
        try {
            const resp = await api("/api/friends/requests/sent/")
            if (resp.ok) {
                const data = await resp.json()
                setSentRequests(data.results)
            }
        } catch {
            // Network error
        }
    }

    async function sendRequest(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")

        try {
            const resp = await api("/api/friends/requests/send/", {
                method: "POST",
                body: JSON.stringify({ username }),
            })

            if (resp.ok) {
                setSuccess(t("friends.msg.sent"))
                setUsername("")
                fetchRequests()
                fetchSentRequests()
            } else {
                const data = await resp.json()
                setError(ts(data.error, "friends.error.send"))
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function respondRequest(requestId: number, action: "accept" | "decline") {
        try {
            const resp = await api(`/api/friends/requests/${requestId}/`, {
                method: "PATCH",
                body: JSON.stringify({ action }),
            })

            if (resp.ok) {
                fetchFriends()
                fetchRequests()
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function cancelRequest(requestId: number) {
        try {
            const resp = await api(`/api/friends/requests/${requestId}/cancel/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                fetchSentRequests()
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

    async function removeFriend(friendId: number) {
        try {
            const resp = await api(`/api/friends/${friendId}/`, {
                method: "DELETE",
            })

            if (resp.ok) {
                fetchFriends()
            }
        } catch {
            setError(t("common.error.network"))
        }
    }

	async function fetchBlocked() {
        try {
            const resp = await api("/api/chat/blocked/")
            if (resp.ok) setBlocked(await resp.json())
        } catch {}
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-6">{t("friends.title")}</h1>

            <form onSubmit={sendRequest} className="flex gap-2 mb-6">
                <input
                    type="text"
                    placeholder={t("friends.addPlaceholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    {t("common.send")}
                </button>
            </form>

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

            <div className="flex gap-4 mb-4">
                <button
                    onClick={() => setTab("friends")}
                    className={`px-4 py-2 rounded ${tab === "friends" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}
                >
                    {t("friends.tab.friends", { count: friends.length })}
                </button>
                <button
                    onClick={() => setTab("requests")}
                    className={`px-4 py-2 rounded ${tab === "requests" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}
                >
                    {t("friends.tab.requests", { count: requests.length })}
                </button>
                <button
                    onClick={() => setTab("sent")}
                    className={`px-4 py-2 rounded ${tab === "sent" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"}`}
                >
                    {t("friends.tab.sent", { count: sentRequests.length })}
                </button>
				<button
                    onClick={() => setTab("blocked")}
                    className={`px-4 py-2 rounded ${tab === "blocked" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"}`}
                >
                    {t("friends.tab.blocked", { count: blocked.length })}
                </button>
            </div>

            {tab === "friends" && (
                <div className="space-y-2">
                    {friends.length === 0 && (
                        <p className="text-gray-400">{t("friends.empty")}</p>
                    )}
                    {friends.map((friend) => (
                        <div key={friend.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white">
                                {friend.username[0].toUpperCase()}
                            </div>
                            <Link to={`/profile/${friend.username}`} className="text-white hover:text-blue-400 flex-1">
                                <bdi>{friend.username}</bdi>
                            </Link>
                            <button
                                onClick={() => removeFriend(friend.id)}
								className="px-3 py-1 bg-red-900/50 text-red-400 hover:bg-red-800 hover:text-white rounded text-sm"
                            >
                                {t("common.remove")}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === "requests" && (
                <div className="space-y-2">
                    {requests.length === 0 && (
                        <p className="text-gray-400">{t("friends.noRequests")}</p>
                    )}
                    {requests.map((req) => (
                        <div key={req.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                            <span className="text-white flex-1">
                                {req.sent_by} wants to be your friend
                            </span>
                            <button
                                onClick={() => respondRequest(req.id, "accept")}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            >
                                {t("common.accept")}
                            </button>
                            <button
                                onClick={() => respondRequest(req.id, "decline")}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            >
                                {t("common.decline")}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === "sent" && (
                <div className="space-y-2">
                    {sentRequests.length === 0 && (
                        <p className="text-gray-400">{t("friends.noSent")}</p>
                    )}
                    {sentRequests.map((req) => (
                        <div key={req.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center gap-3">
                            <span className="text-white flex-1">
                                Waiting for {req.from_user === req.sent_by ? req.to_user : req.from_user} to respond
                            </span>
                            <button
                                onClick={() => cancelRequest(req.id)}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    ))}
                </div>
            )}

			{tab === "blocked" && (
                <div className="space-y-2">
                    {blocked.length === 0 ? (
                        <p className="text-gray-500">{t("friends.noBlocked")}</p>
                    ) : blocked.map((user) => (
                        <div key={user.id} className="flex items-center justify-between bg-gray-800 p-3 rounded">
                            <Link to={`/profile/${user.username}`} className="text-white hover:underline">
                                {user.username}
                            </Link>
                            <button
                                onClick={async () => {
                                    try {
                                        const resp = await api(`/api/chat/unblock/${user.id}/`, { method: "DELETE" })
                                        if (resp.ok) {
                                            setSuccess(t("friends.unblocked", { user: user.username }))
                                            fetchBlocked()
                                        }
                                    } catch {}
                                }}
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                            >
                                {t("publicProfile.unblock")}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

