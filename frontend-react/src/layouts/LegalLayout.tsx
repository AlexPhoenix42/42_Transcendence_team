//frontend-react/src/layouts/LegalLayout.tsx

import { Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"

export default function LegalLayout() {
	const { user, loading } = useAuth()
	
	if (loading) {
		return (
				<div className="min-h-screen bg-gray-900 flex items-center justify-center">
					<p className="text-gray-400 text-xl">Loading...</p>
				</div>
				)
	}

	return (
			<div className="min-h-screen flex flex-col bg-gray-900">
				{user && <Navbar />}
				<main className="flex-1 p-4 pb-8">
					<Outlet />
				</main>
				<Footer openInNewTab={!user} />
			</div>
	)
}
