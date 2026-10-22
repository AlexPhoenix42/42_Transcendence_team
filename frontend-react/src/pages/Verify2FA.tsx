// frontend-react/src/pages/Verify2FA.tsx

import { useState } from "react"
import { useNavigate, useSearchParams, Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"
import { useT } from "../i18n/I18nProvider.tsx"
import { validate2FACode } from '../utils/validate'

export default function Verify2FA() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const tmpToken = searchParams.get("token")
    const { verify2FA } = useAuth()

    const [code, setCode] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const t = useT()

    if (!tmpToken) {
        return (
            <div className="w-full max-w-sm text-center">
                <h1 className="text-2xl font-bold text-red-400 mb-4">{t("twofa.invalid.title")}</h1>
                <p className="text-gray-400 mb-6">{t("twofa.invalid.body")}</p>
                <Link to="/login" className="text-blue-400 hover:underline">{t("common.backToLogin")}</Link>
            </div>
        )
    }

	async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError("")

		const err = validate2FACode(code)
        if (err) {
            setError(t(err))
            return
        }

        setLoading(true)

        try {
            const result = await verify2FA(tmpToken!, code)

            if (result.success) {
                navigate("/")
            } else {
                setError(result.error || t("twofa.error.invalidCode"))
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-white text-center mb-2">{t("twofa.title")}</h1>
            <p className="text-gray-400 text-center mb-6">{t("twofa.prompt")}</p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {error && (
                    <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded">
                        {error}
                    </div>
                )}

                <input
                    type="text"
                    placeholder={t("twofa.placeholder")}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 text-white border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-center text-2xl tracking-widest"
					maxLength={9}
                    autoFocus
                    required
                />

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? t("twofa.submitting") : t("twofa.submit")}
                </button>
            </form>

            <p className="text-gray-500 text-center mt-4 text-sm">
                {t("twofa.recoveryHint")}
            </p>

            <p className="text-center mt-2">
                <Link to="/login" className="text-gray-500 hover:text-gray-300 text-sm">
                    {t("common.backToLogin")}
                </Link>
            </p>
        </div>
    )
}

