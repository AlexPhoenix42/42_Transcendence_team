// frontend-react/src/pages/Chat.tsx

import { useState, useEffect, useRef } from "react"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import { ChatSocket, ChatMessage } from "../ws/chat.ts"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"

import { debug } from '../utils/debug'

type Tab = "global" | "dm"

interface Friend {
    id: number
    username: string
	is_online: boolean
}

export default function Chat() {
    const { t, tn, d, ts, locale } = useI18n()
    const { user } = useAuth()
	const navigate = useNavigate()
    const [tab, setTab] = useState<Tab>("global")
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [typingUser, setTypingUser] = useState<string | null>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [error, setError] = useState("")
    const [connected, setConnected] = useState(false)
    const [roomId, setRoomId] = useState<number | null>(null)
	const [unreadByUser, setUnreadByUser] = useState<Record<number, number>>({})
	const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
	const [muteTarget, setMuteTarget] = useState<{ id: number; username: string } | null>(null)

    // DM state
    const [friends, setFriends] = useState<Friend[]>([])
    const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({})
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(null)
    const [dmTarget, setDmTarget] = useState<Friend | null>(null)
	const [gameInvite, setGameInvite] = useState<{ inviteId: string; fromUsername: string } | null>(null)
    const [dismissedInvites, setDismissedInvites] = useState<Set<string>>(new Set())
	const [declinedInvites, setDeclinedInvites] = useState<Set<string>>(new Set())

	// Translate
	const [translatedMessages, setTranslatedMessages] = useState<Record<number, string>>({})
    const [translatingId, setTranslatingId] = useState<number | null>(null)

    const socketRef = useRef<ChatSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

	async function fetchUnreadCounts() {
        try {
            const resp = await api("/api/chat/unread/")
            if (resp.ok) {
                const data = await resp.json()
                const counts: Record<number, number> = {}
                const byUser: Record<number, number> = {}
                for (const entry of data) {
                    counts[entry.room_id] = entry.unread
                    if (entry.user_id) {
                        byUser[entry.user_id] = entry.unread
                    }
                }
                setUnreadCounts(counts)
                setUnreadByUser(byUser)
            }
        } catch {}
    }

	async function markAsRead(roomId: number) {
        try {
            await api(`/api/chat/rooms/${roomId}/read/`, { method: "POST" })
            setUnreadCounts((prev) => {
                const next = { ...prev }
                delete next[roomId]
                return next
            })
            setUnreadByUser({})
            window.dispatchEvent(new Event("chat-read"))
            fetchUnreadCounts()
        } catch {}
    }

	// Fetch friends for DM tab
    useEffect(() => {
        async function fetchFriends() {
            try {
                const resp = await api("/api/friends/")
                if (resp.ok) {
                    const data = await resp.json()
                    setFriends(data.results)
                }
            } catch {
                // Silent fail
            }
        }
        fetchFriends()
        const interval = setInterval(fetchFriends, 10000)
        return () => clearInterval(interval)
    }, [])

    // Connect to global room on mount
    useEffect(() => {
        connectToGlobal()
        return () => {
            socketRef.current?.disconnect()
        }
    }, [])

	async function fetchReadStatus(roomId: number) {
        try {
            const resp = await api(`/api/chat/rooms/${roomId}/read-status/`)
            if (resp.ok) {
                const data = await resp.json()
                console.log("fetchReadStatus response:", data)
                debug("fetchReadStatus response:", data)
                if (data.length > 0) {
                    setOtherReadAt(data[0].last_read_at)
                }
            }
        } catch {}
    }

    async function connectToGlobal() {
        setError("")
        setMessages([])
        setTab("global")
        setDmTarget(null)

        // Disconnect previous
        socketRef.current?.disconnect()

        try {
            const resp = await api("/api/chat/rooms/global/")
            if (!resp.ok) {
                setError(t("chat.error.resolveRoom"))
                return
            }
            const data = await resp.json()
            const id = data.room_id
            setRoomId(id)
			setCurrentRoomId(id)
            await loadHistory(id)
            connectWebSocket(id)
        } catch {
            setError(t("chat.error.connect"))
			debug("global char error:", e)
            //setError("Failed to connect to global chat")	// why did you delete this?
        }
    }

	async function connectToDM(friend: Friend) {
        setError("")
        setMessages([])
        setTab("dm")
        setDmTarget(friend)

        // Disconnect previous
        socketRef.current?.disconnect()

        try {
            const resp = await api(`/api/chat/rooms/dm/${friend.id}/`, {
                method: "POST",
            })
            if (!resp.ok) {
                const data = await resp.json()
                setError(ts(data.error))
                //setError(data.error || "Failed to open DM")
                return
            }
            const data = await resp.json()
            const id = data.room_id
            setRoomId(id)
			setCurrentRoomId(id)
            await loadHistory(id)
            connectWebSocket(id)
			markAsRead(id)
			fetchReadStatus(id)
        } catch {
            setError(t("chat.error.connectDM"))
            //setError("Failed to connect to DM")
        }
    }

	    useEffect(() => {
        fetchUnreadCounts()
        const interval = setInterval(() => {
            fetchUnreadCounts()
            if (currentRoomId && tab === "dm") {
                fetchReadStatus(currentRoomId)
            }
        }, 30000)
        return () => clearInterval(interval)
    }, [currentRoomId, tab])

	async function loadHistory(id: number) {
        console.log("loadHistory called with room:", id)
        debug("loadHistory called with room:", id)
        try {
            const resp = await api(`/api/chat/rooms/${id}/messages/`)
            console.log("loadHistory response:", resp.status)
            debug("loadHistory response:", resp.status)
            if (resp.ok) {
                const data = await resp.json()
                console.log("loadHistory data:", data)
                debug("loadHistory data:", data)
				setMessages(Array.isArray(data) ? data : data.results || [])
            }
        } catch (e) {
            console.log("loadHistory error:", e)
            debug("loadHistory error:", e)
        }
    }

	function connectWebSocket(id: number) {
        const socket = new ChatSocket(
            id,
			(msg) => {
                setMessages((prev) => {
                    if (prev.some((m) => m.id === msg.id)) return prev
                    return [...prev, msg]
                })
                // If viewing this DM, mark as read immediately
                if (msg.sender !== user?.username) {
                    markAsRead(id)
                }
            },
            (err) => {
                setError(err.error)
            },
			(code) => {
                setConnected(false)
                if (code === 4001) {
                    setError(t("chat.error.auth"))
                    //setError("Authentication failed. Please log in again.")
                } else if (code === 4003) {
                    setError(t("chat.error.denied"))
                    //setError("Access denied to this room.")
                }
            },
            (sender) => {
                setTypingUser(sender)
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000)
            },
			(readAt) => {
				console.log("read_receipt received:", readAt)
				//debug("read_receipt received:", readAt)
				setOtherReadAt(readAt)
			},
			(inviteId, fromUsername) => {
                setGameInvite({ inviteId, fromUsername })
            },
			(gameId) => {
				setDismissedInvites((prev) => new Set(prev).add(id))
                navigate(`/chess/${gameId}`)
            },
			(messageId) => {
                setMessages((prev) => prev.filter((m) => m.id !== messageId))
            },
        )
        socket.connect()
        socketRef.current = socket
        setConnected(true)
    }

    function handleSend(e: React.FormEvent) {
        e.preventDefault()
        if (!input.trim()) return

        if (socketRef.current?.isConnected()) {
            socketRef.current.send(input.trim())
            setInput("")
        } else {
            setError(t("chat.error.notConnected"))
            //setError("Not connected. Please wait...")
        }
    }

	function sendGameInvite() {
        socketRef.current?.sendGameInvite()
    }

	async function acceptGameInvite(inviteId?: string) {
        const id = inviteId || gameInvite?.inviteId
        if (!id) return

        try {
            const resp = await api("/api/chess/invite/accept/", {
                method: "POST",
                body: JSON.stringify({ invite_id: id }),
            })

            if (resp.ok) {
                const data = await resp.json()
                setGameInvite(null)
                navigate(`/chess/${data.id}`)
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chat.error.invite"))
                //setError(data.error || "Failed to accept invite")
                setGameInvite(null)
            }
        } catch {
            setError(t("common.error.networkShort"))
            //setError("Network error")
        }
    }

	function declineGameInvite(inviteId: string) {
        setDismissedInvites((prev) => new Set(prev).add(inviteId))
        setGameInvite(null)
        // Send decline message
        socketRef.current?.send("⚔️ Game invite declined.")
    }

	async function deleteMessage(messageId: number) {
        try {
            const resp = await api(`/api/chat/messages/${messageId}/delete/`, { method: "DELETE" })
            if (resp.ok) {
                setMessages((prev) => prev.filter((m) => m.id !== messageId))
            }
        } catch {}
    }

	async function muteUser(username: string, duration: number) {
        try {
            // Get user ID from username
            const profileResp = await api(`/api/profile/${username}/`)
            if (!profileResp.ok) return
            const profile = await profileResp.json()

            const resp = await api("/api/chat/mute/", {
                method: "POST",
                body: JSON.stringify({
                    user_id: profile.id,
                    duration,
                    room_id: roomId,
                }),
            })
            if (resp.ok) {
                setMuteTarget(null)
            } else {
                const data = await resp.json()
                setError(ts(data.error, "chat.error.mute"))
                //setError(data.error || "Failed to mute user")
            }
        } catch {}
    }

	async function unmuteUser(userId: number) {
        try {
            // Try room-specific unmute
            await api("/api/chat/unmute/", {
                method: "POST",
                body: JSON.stringify({
                    user_id: userId,
                    room_id: roomId,
                }),
            })
            // Also try global unmute (auto-mute uses room=null)
            await api("/api/chat/unmute/", {
                method: "POST",
                body: JSON.stringify({
                    user_id: userId,
                    room_id: null,
                }),
            })
        } catch {}
    }

	async function translateMessage(msgId: number, text: string) {
        if (translatedMessages[msgId]) {
            // Toggle off if already translated
            setTranslatedMessages((prev) => {
                const next = { ...prev }
                delete next[msgId]
                return next
            })
            return
        }

        setTranslatingId(msgId)
        try {
            const resp = await api("/api/chat/translate/", {
                method: "POST",
                body: JSON.stringify({
                    text,
                    target_lang: locale,
                }),
            })
            if (resp.ok) {
                const data = await resp.json()
                setTranslatedMessages((prev) => ({ ...prev, [msgId]: data.translated_text }))
            }
        } catch {}
        setTranslatingId(null)
    }

    return (
		<div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
            {/* Sidebar */}
			<div className="w-full md:w-48 bg-gray-800 rounded-lg border border-gray-700 p-3 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto shrink-0">
                <button
                    onClick={connectToGlobal}
                    className={`text-start px-3 py-2 rounded ${tab === "global" && !dmTarget ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                >
                    {t("chat.global")}
                </button>

                <div className="border-t border-gray-700 mt-2 pt-2">
                    <p className="text-gray-500 text-xs uppercase mb-2">{t("chat.directMessages")}</p>
                    {friends.length === 0 && (
                        <p className="text-gray-500 text-xs">{t("chat.noFriends")}</p>
                    )}
					{friends.map((friend) => (
                        <button
                            key={friend.id}
                            onClick={() => connectToDM(friend)}
                            className={`w-full text-start px-3 py-2 rounded text-sm flex items-center gap-2 ${dmTarget?.id === friend.id ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${friend.is_online ? "bg-green-500" : "bg-gray-600"}`}></span>
                            <span className="flex-1"><bdi>{friend.username}</bdi></span>
                            {unreadByUser[friend.id] && (
                                <span className="bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                    {unreadByUser[friend.id]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat area */}
			<div className="flex-1 min-h-0 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                {/* Header */}
				<div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <h2 className="text-white font-semibold">
                        {dmTarget ? t("chat.dmWith", { name: dmTarget.username }) : t("chat.global")}
                    </h2>
                    <span className={`w-2 h-2 rounded-full ${dmTarget ? (dmTarget.is_online ? "bg-green-500" : "bg-gray-600") : (connected ? "bg-green-500" : "bg-red-500")}`}></span>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-900/50 border-b border-red-500 text-red-300 px-4 py-2 text-sm">
                        {error}
                    </div>
                )}

                {/* Messages */}
				<div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                        <p className="text-gray-500 text-center mt-10">{t("chat.noMessages")}</p>
                    )}
					{messages.map((msg) => {
                        // Handle game invite messages
						if (msg.sender === "system" && msg.content.startsWith("GAME_INVITE:")) {
                            const parts = msg.content.split(":")
                            const inviteId = parts[1]
                            const fromUser = parts[2]
                            const isOwnInvite = fromUser === user?.username

                            // Check if invite is expired (5 min)
                            const msgTime = new Date(msg.created_at).getTime()
                            const isExpired = Date.now() - msgTime > 5 * 60 * 1000

                            // Check if a game was already started after this invite
                            const gameStartedAfter = messages.some(
                                (m) =>
                                    m.sender === "system" &&
                                    m.content.startsWith("⚔️ Game started!") &&
                                    new Date(m.created_at).getTime() > msgTime
                            )

                            const showButtons = !isOwnInvite && !isExpired && !gameStartedAfter && !dismissedInvites.has(inviteId)

                            return (
                                <div key={msg.id} className="flex justify-center my-2">
                                    <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-center">
                                        <p className="text-yellow-300 text-sm">
                                            {isOwnInvite
                                                ? "⚔️ You sent a game invite"
                                                : `⚔️ ${fromUser} invited you to play chess!`
                                            }
                                            {isExpired && !gameStartedAfter && (
                                                <span className="ms-1 text-gray-500 text-xs">(expired)</span>
                                            )}
                                        </p>
                                        {showButtons && (
                                            <div className="flex gap-2 mt-2 justify-center">
                                                <button
                                                    onClick={() => acceptGameInvite(inviteId)}
                                                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                                                >
                                                    {t("common.accept")}
                                                </button>
                                                <button
                                                    onClick={() => declineGameInvite(inviteId)}
                                                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                                                >
                                                    {t("common.decline")}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        }
						

                        // Regular system messages
						if (msg.sender === "system") {
                            const isMuteMsg = msg.content.includes("auto-muted") || msg.content.includes("has been muted")
                            const mutedUsername = isMuteMsg ? msg.content.match(/🔇 (\S+)/)?.[1] : null

                            return (
                                <div key={msg.id} className="flex justify-center my-1 gap-2 items-center">
                                    <span className="text-yellow-400 text-xs italic" dir="auto">{msg.content}</span>
                                    {mutedUsername && (user?.role === "admin" || user?.role === "moderator") && (
                                        <button
                                            onClick={async () => {
                                                const resp = await api(`/api/profile/${mutedUsername}/`)
                                                if (resp.ok) {
                                                    const profile = await resp.json()
                                                    await unmuteUser(profile.id)
                                                }
                                            }}
                                            className="text-[10px] px-2 py-0.5 bg-green-800 text-green-300 rounded hover:bg-green-700"
                                        >
                                            {t("chat.unmute")}
                                        </button>
                                    )}
                                </div>
                            )
                        }

                        // Normal messages
						return (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${msg.sender === user?.username ? "items-end" : "items-start"}`}
                            >
								<div className={`max-w-[70%] md:max-w-xs px-3 py-1.5 md:px-4 md:py-2 rounded-lg break-words ${msg.sender === user?.username ? "bg-blue-600 text-white" : "bg-gray-700 text-white"}`}>
                                    {msg.sender !== user?.username && (
                                        <p className="text-xs mb-1">
                                            <span
                                                className="text-blue-400 cursor-pointer hover:underline"
                                                onClick={() => navigate(`/profile/${msg.sender}`)}
                                            >
                                                <bdi>{msg.sender}</bdi>
                                            </span>
                                            {msg.sender_role === "admin" && (
                                                <span className="ms-1 px-1 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-400">{t("role.admin")}</span>
                                            )}
                                            {msg.sender_role === "moderator" && (
                                                <span className="ms-1 px-1 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-400">{t("role.mod")}</span>
                                            )}
                                        </p>
                                    )}
                                    <p dir="auto">{msg.content}</p>
                                    {translatedMessages[msg.id] && (
                                        <p dir="auto" className="mt-1 pt-1 border-t border-gray-600 text-sm italic opacity-80">
                                            {translatedMessages[msg.id]}
                                        </p>
                                    )}
                                    {(user?.role === "admin" || user?.role === "moderator") && msg.sender !== "system" && (
                                        <div className="flex gap-1 mt-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id) }}
                                                className="text-[10px] text-red-400 hover:text-red-300"
                                            >
                                                🗑️ Delete
                                            </button>
                                            {msg.sender !== user?.username && (
												<button
                                                    onClick={(e) => { e.stopPropagation(); setMuteTarget({ id: 0, username: msg.sender }) }}
                                                    className="text-[10px] text-yellow-400 hover:text-yellow-300"
                                                >
                                                    🔇 Mute
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
								<div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-gray-500">
                                        {d(msg.created_at)}
                                        {tab === "dm" && msg.sender === user?.username && otherReadAt && new Date(otherReadAt) >= new Date(msg.created_at) && (
                                            <span className="ms-2 text-blue-400">✓ Seen</span>
                                        )}
                                    </p>
                                    <button
                                        onClick={() => translateMessage(msg.id, msg.content)}
                                        className="text-xs text-gray-500 hover:text-blue-400"
                                        title={translatedMessages[msg.id] ? t("chat.hideTranslation") : t("chat.translate")}
                                    >
                                        {translatingId === msg.id ? "⏳" : "🌐"}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                    <div ref={messagesEndRef} />
                </div>

				{/* Mute dialog */}
                {muteTarget && (
                    <div className="px-4 py-3 border-t border-gray-700 bg-yellow-900/20">
                        <p className="text-yellow-300 text-sm mb-2">{t("chat.mutePrompt", { name: muteTarget.username })}</p>
                        <div className="flex gap-2">
							{[5, 10, 30, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => muteUser(muteTarget.username, mins)}
                                    className="px-2 py-1 bg-yellow-800 text-yellow-200 rounded text-xs hover:bg-yellow-700"
                                >
                                    {tn("common.minutes", mins)}
                                </button>
                            ))}
                            <button
                                onClick={() => setMuteTarget(null)}
                                className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600"
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    </div>
                )}

                {/* Typing indicator */}

				{/* Typing indicator */}
                {typingUser && (
                    <div className="px-4 py-1 text-gray-500 text-xs italic">
                        {typingUser} is typing...
                    </div>
                )}

				{/* Game invite notification */}
                {gameInvite && gameInvite.fromUsername !== user?.username && (
                    <div className="px-4 py-3 border-t border-gray-700 bg-yellow-900/20 flex items-center justify-between">
                        <span className="text-yellow-300 text-sm">
                            ⚔️ {gameInvite.fromUsername} invited you to play chess!
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={acceptGameInvite}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                            >
                                {t("common.accept")}
                            </button>
                            <button
                                onClick={() => setGameInvite(null)}
                                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                            >
                                {t("common.decline")}
                            </button>
                        </div>
                    </div>
                )}

                {/* Sent invite confirmation */}
                {gameInvite && gameInvite.fromUsername === user?.username && (
                    <div className="px-4 py-2 border-t border-gray-700 bg-blue-900/20">
                        <span className="text-blue-300 text-sm">⚔️ Game invite sent! Waiting for response...</span>
                    </div>
                )}

                {/* Input */}
				<form onSubmit={handleSend} className="p-2 md:p-4 border-t border-gray-700 flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => {
							setInput(e.target.value)
							socketRef.current?.sendTyping()
						}}
                        placeholder={t("chat.placeholder")}
                        className="flex-1 px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                        maxLength={2000}
                    />
                    {tab === "dm" && (
                        <button
                            type="button"
                            onClick={sendGameInvite}
                            className="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
                            title={t("chat.inviteToChess")}
                        >
                            ⚔️
                        </button>
                    )}
					<button
                        type="submit"
                        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm shrink-0"
                    >
                        ➤
                    </button>
                </form>
            </div>
        </div>
    )
}

