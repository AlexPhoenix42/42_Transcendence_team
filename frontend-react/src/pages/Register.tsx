// frontend-react/src/pages/Register.tsx

import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useT } from "../i18n/I18nProvider.tsx"

export default function Register() {
    const navigate = useNavigate()

    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [password2, setPassword2] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const t = useT()

	async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")

        if (password !== password2) {
            setError(t("common.error.passwordMismatch"))
            return
        }

        setLoading(true)

        try {
            const resp = await fetch("/api/register/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
            })

            const data = await resp.json()

            if (resp.ok) {
                navigate("/login")
            } else {
                const msg = data.error
                    || data.username?.[0]
                    || data.email?.[0]
                    || data.password?.[0]
                    || t("register.error.failed")
                setError(msg)
            }
        } catch {
            setError(t("common.error.network"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-3xl font-bold text-white text-center mb-8">
                {t("register.title")}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}

                <input
                    type="text"
                    placeholder={t("field.username")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <input
                    type="email"
                    placeholder={t("field.email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <input
                    type="password"
                    placeholder={t("field.password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500"
                    required
                />

                <input
                    type="password"
                    placeholder={t("field.confirmPassword")}
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
                    {loading ? t("register.submitting") : t("register.submit")}
                </button>
            </form>

            <p className="text-gray-400 text-center mt-4">
                {t("register.haveAccount")}{" "}
                <Link to="/login" className="text-blue-400 hover:underline">
                    {t("register.loginLink")}
                </Link>
            </p>
        </div>
    )
}

