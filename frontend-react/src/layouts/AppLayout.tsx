import { Outlet } from "react-router-dom"
import Navbar from "../components/Navbar"

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}
