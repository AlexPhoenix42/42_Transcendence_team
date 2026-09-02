// frontend-react/src/pages/ChessCoach.tsx

import { useState, useEffect, useRef } from "react"

interface CoachMessage {
    role: "user" | "coach" | "error"
    text: string
}

export default function ChessCoach() {
    const [messages, setMessages] = useState<CoachMessage[]>([])
    const [input, setInput] = useState("")
    const [oldFen, setOldFen] = useState("")
    const [newFen, setNewFen] = useState("")
    const [connected, setConnected] = useState(false)
    const [showFen, setShowFen] = useState(false)
    const [streaming, setStreaming] = useState(false)

    const wsRef = useRef<WebSocket | null>(null)
    const bufferRef = useRef<string>("")
    const streamingRef = useRef<boolean>(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    useEffect(() => {
        connect()
        return () => {
            wsRef.current?.close()
            wsRef.current = null
        }
    }, [])

    function connect() {
        // Close existing connection if any
        if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
        }

        try {
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/coach/`)

            ws.onopen = () => {
                setConnected(true)
                setMessages([{ role: "coach", text: "Chess coach connected! Ask me anything about chess." }])
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)

                    if (data.type === "stream") {
                        bufferRef.current += data.token
                        const currentBuffer = bufferRef.current
                        setMessages((prev) => {
                            const updated = [...prev]
                            const last = updated[updated.length - 1]
                            if (last && last.role === "coach" && streamingRef.current) {
                                updated[updated.length - 1] = { role: "coach", text: currentBuffer }
                            } else {
                                streamingRef.current = true
                                updated.push({ role: "coach", text: currentBuffer })
                            }
                            return updated
                        })
                    } else if (data.type === "done") {
                        bufferRef.current = ""
                        streamingRef.current = false
                        setStreaming(false)
                    } else if (data.type === "error") {
                        setMessages((prev) => [...prev, { role: "error", text: data.message }])
                        bufferRef.current = ""
                        streamingRef.current = false
                        setStreaming(false)
                    } else if (data.error) {
                        setMessages((prev) => [...prev, { role: "error", text: data.error }])
                        bufferRef.current = ""
                        streamingRef.current = false
                        setStreaming(false)
                    }
                } catch {
                    setMessages((prev) => [...prev, { role: "error", text: "Failed to parse response" }])
                    streamingRef.current = false
                    setStreaming(false)
                }
            }

            ws.onclose = () => {
                setConnected(false)
                streamingRef.current = false
                setStreaming(false)
            }

            ws.onerror = () => {
                // Don't show error — onclose will fire after this
            }

            wsRef.current = ws
        } catch {
            setMessages((prev) => [...prev, { role: "error", text: "Failed to connect to chess coach" }])
        }
    }

    function handleSend(e: React.FormEvent) {
        e.preventDefault()
        const question = input.trim()

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setMessages((prev) => [...prev, { role: "error", text: "Not connected. Reconnecting..." }])
            connect()
            return
        }

        const payload: Record<string, string> = {}
        if (question) payload.question = question
        if (oldFen.trim()) payload.old_fen = oldFen.trim()
        if (newFen.trim()) payload.new_fen = newFen.trim()

        wsRef.current.send(JSON.stringify(payload))
        setMessages((prev) => [...prev, { role: "user", text: question || "(auto-comment on position)" }])
        setInput("")
        bufferRef.current = ""
        streamingRef.current = false
        setStreaming(true)
    }

    return (
        <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-120px)]">
            <div className="flex items-center gap-2 mb-4">
                <h1 className="text-2xl font-bold text-white">Chess Coach</h1>
                <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></span>
                {!connected && (
                    <button
                        onClick={connect}
                        className="text-sm text-blue-400 hover:text-blue-300"
                    >
                        Reconnect
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-y-auto p-4 space-y-3 mb-4">
                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div className={`max-w-md px-4 py-2 rounded-lg ${
                            msg.role === "user"
                                ? "bg-blue-600 text-white"
                                : msg.role === "error"
                                ? "bg-red-900/50 text-red-300 border border-red-500"
                                : "bg-gray-700 text-white"
                        }`}>
                            {msg.role === "coach" && (
                                <p className="text-xs text-green-400 mb-1">Coach</p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                        </div>
                    </div>
                ))}
                {streaming && bufferRef.current === "" && (
                    <div className="flex justify-start">
                        <div className="bg-gray-700 text-gray-400 px-4 py-2 rounded-lg">
                            Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* FEN inputs toggle */}
            <button
                type="button"
                onClick={() => setShowFen(!showFen)}
                className="text-gray-400 text-sm hover:text-gray-300 mb-2 text-left"
            >
                {showFen ? "Hide FEN inputs" : "Add FEN position (optional)"}
            </button>

            {showFen && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                        type="text"
                        placeholder="Position before move (FEN)"
                        value={oldFen}
                        onChange={(e) => setOldFen(e.target.value)}
                        className="px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    <input
                        type="text"
                        placeholder="Position after move (FEN)"
                        value={newFen}
                        onChange={(e) => setNewFen(e.target.value)}
                        className="px-3 py-2 bg-gray-900 text-white border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSend} className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about chess..."
                    className="flex-1 px-4 py-2 bg-gray-900 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    maxLength={500}
                    disabled={streaming}
                />
                <button
                    type="submit"
                    disabled={streaming || !connected}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    Ask
                </button>
            </form>
        </div>
    )
}

