// frontend-react/src/pages/Chat.tsx

import { useState, useEffect, useRef } from "react"
import { api } from "../api/client.ts"
import { useAuth } from "../context/AuthContext.tsx"
import { ChatSocket, ChatMessage } from "../ws/chat.ts"

type Tab = "global" | "dm"

interface Friend {
    id: number
    username: string
	is_online: boolean
}

export default function Chat() {
    const { user } = useAuth()
    const [tab, setTab] = useState<Tab>("global")
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState("")
    const [error, setError] = useState("")
    const [connected, setConnected] = useState(false)
    const [roomId, setRoomId] = useState<number | null>(null)

    // DM state
    const [friends, setFriends] = useState<Friend[]>([])
    const [dmTarget, setDmTarget] = useState<Friend | null>(null)

    const socketRef = useRef<ChatSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

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
    }, [])

    // Connect to global room on mount
    useEffect(() => {
        connectToGlobal()
        return () => {
            socketRef.current?.disconnect()
        }
    }, [])

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
                setError("Failed to resolve global chat room")
                return
            }
            const data = await resp.json()
            const id = data.room_id
            setRoomId(id)
            await loadHistory(id)
            connectWebSocket(id)
        } catch {
            setError("Failed to connect to global chat")
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
                setError(data.error || "Failed to open DM")
                return
            }
            const data = await resp.json()
            const id = data.room_id
            setRoomId(id)
            await loadHistory(id)
            connectWebSocket(id)
        } catch {
            setError("Failed to connect to DM")
        }
    }


    async function loadHistory(id: number) {
        try {
            const resp = await api(`/api/chat/rooms/${id}/messages/`)
            if (resp.ok) {
                const data = await resp.json()
                setMessages(data.results)
            }
        } catch {
            // Silent fail — WebSocket will deliver new messages
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
            },
            (err) => {
                setError(err.error)
            },
            (code) => {
                setConnected(false)
                if (code === 4001) {
                    setError("Authentication failed. Please log in again.")
                } else if (code === 4003) {
                    setError("Access denied to this room.")
                }
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
            setError("Not connected. Please wait...")
        }
    }

    return (
        <div className="max-w-4xl mx-auto flex gap-4 h-[calc(100vh-120px)]">
            {/* Sidebar */}
            <div className="w-48 bg-gray-800 rounded-lg border border-gray-700 p-3 flex flex-col gap-2 overflow-y-auto">
                <button
                    onClick={connectToGlobal}
                    className={`text-left px-3 py-2 rounded ${tab === "global" && !dmTarget ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                >
                    Global Chat
                </button>

                <div className="border-t border-gray-700 mt-2 pt-2">
                    <p className="text-gray-500 text-xs uppercase mb-2">Direct Messages</p>
                    {friends.length === 0 && (
                        <p className="text-gray-500 text-xs">No friends yet</p>
                    )}
					{friends.map((friend) => (
                        <button
                            key={friend.id}
                            onClick={() => connectToDM(friend)}
                            className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${dmTarget?.id === friend.id ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
                        >
                            <span className={`w-2 h-2 rounded-full ${friend.is_online ? "bg-green-500" : "bg-gray-600"}`}></span>
                            {friend.username}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 flex flex-col">
                {/* Header */}
				<div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <h2 className="text-white font-semibold">
                        {dmTarget ? `DM: ${dmTarget.username}` : "Global Chat"}
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
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && (
                        <p className="text-gray-500 text-center mt-10">No messages yet</p>
                    )}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex flex-col ${msg.sender === user?.username ? "items-end" : "items-start"}`}
                        >
                            <div className={`max-w-xs px-4 py-2 rounded-lg ${msg.sender === user?.username ? "bg-blue-600 text-white" : "bg-gray-700 text-white"}`}>
                                {msg.sender !== user?.username && (
                                    <p className="text-xs text-gray-400 mb-1">{msg.sender}</p>
                                )}
                                <p>{msg.content}</p>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(msg.created_at).toLocaleTimeString()}
                            </p>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={handleSend} className="p-4 border-t border-gray-700 flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                        maxLength={2000}
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    )
}

