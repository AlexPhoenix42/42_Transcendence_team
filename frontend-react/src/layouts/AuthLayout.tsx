import { Outlet } from "react-router-dom"
import Footer from "../components/Footer"

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
		<main className="flex-1 flex items-center justify-center">
      		<Outlet />
		</main>
		<Footer openInNewTab />
    </div>
  )
}
