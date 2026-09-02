// frontend-react/src/pages/ForgotPassword.tsx

import { useState } from "react"
import { Link } from "react-router-dom"

export default function ForgotPassword() {
    const [email, setEmail] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

	async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const resp = await fetch("/api/password-reset/request/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            })

            if (resp.ok) {
                setSubmitted(true)
            } else {
                const data = await resp.json()
                setError(data.error || "Something went wrong")
            }
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (submitted) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-white mb-4">Check your email</h1>
                <p className="text-gray-400 mb-6">
                    If the email is registered, a reset link has been sent. Check your inbox (or Mailpit in dev).
                </p>
                <Link to="/login" className="text-blue-400 hover:underline">
                    Back to login
                </Link>
            </div>
        )
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-white text-center mb-6">Reset Password</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}

                <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? "Sending..." : "Send Reset Link"}
                </button>
            </form>

            <p className="text-gray-400 text-center mt-4">
                <Link to="/login" className="text-blue-400 hover:underline">
                    Back to login
                </Link>
            </p>
        </div>
    )
}

