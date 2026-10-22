// frontend-react/src/pages/ForgotPassword.tsx

import { useState } from "react"
import { Link } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { validateEmail } from '../utils/validate'

export default function ForgotPassword() {
    const [email, setEmail] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const { t, ts } = useI18n()

	async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")

		const err = validateEmail(email)
        if (err) {
            setError(t(err))
            return
        }

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
                setError(ts(data.error, "common.error.generic"))
            }
        } catch {
            setError(t("common.error.network"))
        } finally {
            setLoading(false)
        }
    }

    if (submitted) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-white mb-4">{t("forgot.sent.title")}</h1>
                <p className="text-gray-400 mb-6">
                    {t("forgot.sent.body")}
                </p>
                <Link to="/login" className="text-blue-400 hover:underline">
                    {t("common.backToLogin")}
                </Link>
            </div>
        )
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-white text-center mb-6">{t("forgot.title")}</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}

                <input
                    type="email"
                    placeholder={t("forgot.placeholder")}
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
                    {loading ? t("forgot.submitting") : t("forgot.submit")}
                </button>
            </form>

            <p className="text-gray-400 text-center mt-4">
                <Link to="/login" className="text-blue-400 hover:underline">
                    {t("common.backToLogin")}
                </Link>
            </p>
        </div>
    )
}

