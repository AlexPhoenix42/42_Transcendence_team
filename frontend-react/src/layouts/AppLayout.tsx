import { Outlet } from "react-router-dom"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-900">
      <Navbar />
      <main className="flex-1 p-4 pb-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
