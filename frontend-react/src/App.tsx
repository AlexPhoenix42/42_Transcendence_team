// frontend-react/src/App.tsx

import { RouterProvider } from "react-router-dom"
import { router } from "./routes.tsx"
import { AuthProvider } from "./context/AuthContext.tsx"

export default function App() {
    const params = new URLSearchParams(window.location.search)
    const loginToken = params.get("login_token")
    const status = params.get("status")
    const token = params.get("token")
    const uid = params.get("uid")

    if ((loginToken || status) && window.location.pathname !== "/login") {
        window.location.replace(`/login${window.location.search}`)
        return <div className="min-h-screen bg-gray-900"></div>
    }

    if (token && uid && window.location.pathname !== "/reset") {
        window.location.replace(`/reset${window.location.search}`)
        return <div className="min-h-screen bg-gray-900"></div>
    }

    return (
        <AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider>
    )
}

