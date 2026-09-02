// frontend-react/src/pages/Login.tsx

import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"

export default function Login() {
    const { login, exchangeOAuthToken } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [loading, setLoading] = useState(false)
    const [showResend, setShowResend] = useState(false)
    const [resendEmail, setResendEmail] = useState("")

    // Account linking state
    const [pendingLinkToken, setPendingLinkToken] = useState<string | null>(null)
    const [showUsernameConflict, setShowUsernameConflict] = useState(false)
    const [conflictUsername, setConflictUsername] = useState("")
    const [resolveToken, setResolveToken] = useState<string | null>(null)
    const [newUsername, setNewUsername] = useState("")
    const [showNewUsernameInput, setShowNewUsernameInput] = useState(false)
    const [showLoginToLink, setShowLoginToLink] = useState(false)

    const pendingLinkRef = useRef<string | null>(null)

    useEffect(() => {
        const loginToken = searchParams.get("login_token")
        if (loginToken) {
            handleOAuth(loginToken)
            return
        }

        const status = searchParams.get("status")

        if (status === "verified") {
            setError("")
            setSuccess("Email verified! You can now log in.")
        } else if (status === "verify_error") {
            const reason = searchParams.get("reason")
            if (reason === "invalid_or_expired") {
                setError("Verification link is invalid or expired.")
            } else {
                setError("Email verification failed.")
            }
        } else if (status === "email_conflict") {
            const linkToken = searchParams.get("link_token")
            setError("This email is already registered. Please log in to link your account.")
            if (linkToken) {
                setPendingLinkToken(linkToken)
                pendingLinkRef.current = linkToken
            }
        } else if (status === "username_conflict") {
            const token = searchParams.get("token")
            const linkToken = searchParams.get("link_token")
            const uname = searchParams.get("username")
            setShowUsernameConflict(true)
            setConflictUsername(uname || "")
            setResolveToken(token || null)
            if (linkToken) {
                setPendingLinkToken(linkToken)
                pendingLinkRef.current = linkToken
            }
        }
    }, [searchParams])

    async function handleOAuth(token: string) {
        setLoading(true)
        try {
            const result = await exchangeOAuthToken(token)

            if (result.success) {
                navigate("/")
            } else if (result.requires2FA) {
                navigate(`/2fa?token=${result.tmpToken}`)
            } else {
                const errMsg = result.error || "OAuth login failed"
                setError(errMsg)
                if (errMsg.toLowerCase().includes("frozen") || errMsg.toLowerCase().includes("verify")) {
                    setShowResend(true)
                }
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")
        setShowResend(false)
        setLoading(true)

        try {
            const result = await login(username, password)

            if (result.success) {
                // If there's a pending link token, link the account after login
                const linkToken = pendingLinkRef.current
                if (linkToken) {
                    await handleAutoLink(linkToken)
                }
                navigate("/")
            } else if (result.requires2FA) {
                navigate(`/2fa?token=${result.tmpToken}`)
            } else {
                const errMsg = result.error || "Login failed"
                setError(errMsg)
                if (errMsg.toLowerCase().includes("frozen") || errMsg.toLowerCase().includes("verify")) {
                    setShowResend(true)
                }
            }
        } finally {
            setLoading(false)
        }
    }

    async function handleAutoLink(linkToken: string) {
        try {
            const resp = await fetch("/api/auth/link/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "include",
                body: JSON.stringify({ link_token: linkToken }),
            })

            if (resp.ok) {
                setSuccess("Account linked successfully!")
                setPendingLinkToken(null)
                pendingLinkRef.current = null
                window.history.replaceState({}, "", "/login")
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to link account")
            }
        } catch {
            setError("Failed to link account. You can try again from your profile.")
        }
    }

    async function handleResolveUsername(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const resp = await fetch("/api/auth/resolve-username/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: newUsername, token: resolveToken }),
            })

            const data = await resp.json()

            if (resp.ok && data.login_token) {
                // Exchange the login token
                const result = await exchangeOAuthToken(data.login_token)
                if (result.success) {
                    setShowUsernameConflict(false)
                    window.history.replaceState({}, "", "/login")
                    navigate("/")
                } else if (result.requires2FA) {
                    navigate(`/2fa?token=${result.tmpToken}`)
                } else {
                    setError(result.error || "Login failed after username resolve")
                }
            } else {
                setError(data.error || "Username is taken. Try another one.")
            }
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    async function handleResend(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setSuccess("")

        try {
            const resp = await fetch("/api/resend-verification/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: resendEmail }),
            })

            if (resp.ok) {
                setSuccess("Verification email sent. Check your inbox.")
                setShowResend(false)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to resend")
            }
        } catch {
            setError("Network error. Please try again.")
        }
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-3xl font-bold text-white text-center mb-8">
                ♟ Transcendence
            </h1>

            {/* Username Conflict Dialog */}
            {showUsernameConflict && (
                <div className="bg-yellow-900/30 border border-yellow-600 rounded p-4 mb-4 space-y-3">
                    <p className="text-yellow-300 font-semibold">Username Conflict</p>
                    <p className="text-gray-300 text-sm">
                        The username "{conflictUsername}" is already taken.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setShowNewUsernameInput(true); setShowLoginToLink(false) }}
                            className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                        >
                            Choose new username
                        </button>
                        <button
                            onClick={() => { setShowLoginToLink(true); setShowNewUsernameInput(false) }}
                            className="flex-1 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                        >
                            Log in to link
                        </button>
                    </div>

                    {showNewUsernameInput && (
                        <form onSubmit={handleResolveUsername} className="space-y-2">
                            <input
                                type="text"
                                placeholder="Choose a new username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? "Submitting..." : "Submit"}
                            </button>
                        </form>
                    )}

                    {showLoginToLink && (
                        <p className="text-gray-400 text-sm">
                            Log in with your existing account below. Your OAuth account will be linked automatically.
                        </p>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="bg-green-900/50 border border-green-500 text-green-300 px-4 py-2 rounded">
                        {success}
                    </div>
                )}

                {showResend && (
                    <div className="space-y-2 bg-yellow-900/30 border border-yellow-600 rounded p-3">
                        <p className="text-gray-300 text-sm">Enter your email to receive a new verification link:</p>
                        <input
                            type="email"
                            placeholder="Your email"
                            value={resendEmail}
                            onChange={(e) => setResendEmail(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                            required
                        />
                        <button
                            type="button"
                            onClick={handleResend}
                            className="w-full py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                        >
                            Resend Verification Email
                        </button>
                    </div>
                )}

                {pendingLinkToken && !showUsernameConflict && (
                    <div className="bg-blue-900/30 border border-blue-600 rounded p-3">
                        <p className="text-blue-300 text-sm">
                            Log in with your existing account to link your OAuth provider.
                        </p>
                    </div>
                )}

                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>

            <div className="my-6 flex items-center gap-4">
                <div className="flex-1 border-t border-gray-700"></div>
                <span className="text-gray-500 text-sm">or</span>
                <div className="flex-1 border-t border-gray-700"></div>
            </div>

            <div className="space-y-3">
                <a href="/api/auth/google/login/" className="w-full py-2 px-4 bg-white text-gray-800 rounded hover:bg-gray-200 flex items-center justify-center gap-2 font-medium">
                    Continue with Google
                </a>
                <a href="/api/auth/42/login/" className="w-full py-2 px-4 bg-gray-700 text-white rounded hover:bg-gray-600 flex items-center justify-center gap-2 font-medium">
                    Continue with 42
                </a>
            </div>

            <div className="text-center mt-4 space-y-2">
                <p className="text-gray-400">
                    Don't have an account?{" "}
                    <Link to="/register" className="text-blue-400 hover:underline">
                        Register
                    </Link>
                </p>
                <p>
                    <Link to="/forgot-password" className="text-gray-500 hover:text-gray-300 text-sm">
                        Forgot password?
                    </Link>
                </p>
            </div>
        </div>
    )
}

