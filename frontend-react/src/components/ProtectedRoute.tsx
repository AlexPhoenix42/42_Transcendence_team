// frontend-react/src/components/ProtectedRoute.tsx

import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"

export default function ProtectedRoute() {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <p className="text-gray-400 text-xl">Loading...</p>
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return <Outlet />
}

