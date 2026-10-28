import { Outlet } from "react-router-dom"
import Footer from "../components/Footer"
import LanguageSwitcher from "../components/LanguageSwitcher.tsx"

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
		<div className="flex justify-end p-4">
			<LanguageSwitcher />
		</div>
		<main className="flex-1 flex items-center justify-center">
      		<Outlet />
		</main>
		<Footer openInNewTab />
    </div>
  )
}
