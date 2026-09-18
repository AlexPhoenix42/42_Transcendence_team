// frontend-react/src/pages/ResetPassword.tsx

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { validatePassword, validatePasswordMatch } from '../utils/validate'

export default function ResetPassword() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get("token")
    const uid = searchParams.get("uid")
    const type = searchParams.get("type")

    const [password, setPassword] = useState("")
    const [password2, setPassword2] = useState("")
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    if (!token || !uid) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-red-400 mb-4">Invalid Reset Link</h1>
                <p className="text-gray-400 mb-6">This reset link is invalid or has expired.</p>
                <Link to="/login" className="text-blue-400 hover:underline">Back to login</Link>
            </div>
        )
    }

    if (type === "2fa") {
        return <TwoFactorReset token={token} uid={uid} />
    }

	async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")

		const err = validatePassword(password)
            || validatePasswordMatch(password, password2)
        if (err) {
            setError(err)
            return
        }

        setLoading(true)

        try {
            const resp = await fetch("/api/password-reset/confirm/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, uid, new_password: password }),
            })

            if (resp.ok) {
                setSuccess(true)
            } else {
                const data = await resp.json()
                setError(data.error || data.details?.[0] || "Reset failed")
            }
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-green-400 mb-4">Password Reset!</h1>
                <p className="text-gray-400 mb-6">Your password has been changed. You can now log in.</p>
                <Link to="/login" className="text-blue-400 hover:underline">Go to login</Link>
            </div>
        )
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-white text-center mb-6">Set New Password</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}

                <input
                    type="password"
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <input
                    type="password"
                    placeholder="Confirm new password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? "Resetting..." : "Reset Password"}
                </button>
            </form>
        </div>
    )
}

function TwoFactorReset({ token, uid }: { token: string; uid: string }) {
    const [error, setError] = useState("")
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

	async function handleReset() {
        setLoading(true)
        setError("")

        try {
            const resp = await fetch("/api/2fa-reset/confirm/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, uid }),
            })

            if (resp.ok) {
                setSuccess(true)
            } else {
                const data = await resp.json()
                setError(data.error || "2FA reset failed")
            }
        } catch {
            setError("Network error. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-green-400 mb-4">2FA Reset!</h1>
                <p className="text-gray-400 mb-6">Two-factor authentication has been disabled. You can now log in normally.</p>
                <Link to="/login" className="text-blue-400 hover:underline">Go to login</Link>
            </div>
        )
    }

    return (
        <div className="w-full max-w-sm text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Reset 2FA</h1>
            <p className="text-gray-400 mb-6">Click below to disable two-factor authentication on your account.</p>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded mb-4">
                    {error}
                </div>
            )}

            <button
                onClick={handleReset}
                disabled={loading}
                className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
                {loading ? "Resetting..." : "Disable 2FA"}
            </button>
        </div>
    )
}

