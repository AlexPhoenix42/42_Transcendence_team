// frontend-react/src/components/ProtectedRoute.tsx

import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"
import { useT } from "../i18n/I18nProvider.tsx"

export default function ProtectedRoute() {
    const { user, loading } = useAuth()
    const t = useT()

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <p className="text-gray-400 text-xl">{t("common.loading")}</p>
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return <Outlet />
}

