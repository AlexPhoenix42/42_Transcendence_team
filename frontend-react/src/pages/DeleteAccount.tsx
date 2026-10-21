import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useI18n } from "../i18n/I18nProvider.tsx"

export default function DeleteAccount() {
    const { t } = useI18n()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [status, setStatus] = useState<"confirm" | "deleting" | "done" | "error">("confirm")
    const [error, setError] = useState("")

    const token = searchParams.get("token")
    const uid = searchParams.get("uid")

    useEffect(() => {
        if (!token || !uid) {
            setStatus("error")
            setError("Invalid link.")
        }
    }, [token, uid])

    async function handleConfirm() {
        setStatus("deleting")
        try {
            const resp = await fetch("/api/me/delete/confirm/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, uid }),
            })

            if (resp.ok) {
                setStatus("done")
                localStorage.removeItem("has_session")
                setTimeout(() => navigate("/login"), 3000)
            } else {
                const data = await resp.json()
                setError(data.error || "Failed to delete account.")
                setStatus("error")
            }
        } catch {
            setError("Network error.")
            setStatus("error")
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <div className="max-w-md w-full bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                {status === "confirm" && (
                    <>
                        <h1 className="text-2xl font-bold text-red-400 mb-4">Delete Account</h1>
						<p className="text-gray-300 mb-4">
							This action is permanent and cannot be undone. The following data will be permanently deleted:
						</p>
						<ul className="text-gray-400 text-left mb-6 space-y-1 list-disc list-inside">
							<li>Your profile and account information</li>
							<li>Your email address</li>
							<li>Your game history and statistics</li>
							<li>Your chat messages and friend list</li>
						</ul>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={handleConfirm}
                                className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
                            >
                                Yes, delete my account
                            </button>
                            <button
                                onClick={() => navigate("/")}
                                className="px-6 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                )}
                {status === "deleting" && (
                    <p className="text-gray-300">Deleting your account...</p>
                )}
                {status === "done" && (
                    <>
                        <p className="text-green-400 font-semibold mb-2">Account deleted.</p>
                        <p className="text-gray-400">Redirecting to login...</p>
                    </>
                )}
				{status === "done" && (
					<>
						<p className="text-green-400 font-semibold mb-2">Account successfully deleted.</p>
						<p className="text-gray-400 mb-2">All your personal data, including your email address, profile, game history, chat messages and friend list, has been permanently removed.</p>
						<p className="text-gray-400">Redirecting to login...</p>
					</>
				)}
                {status === "error" && (
                    <p className="text-red-400">{error}</p>
                )}
            </div>
        </div>
    )
}

