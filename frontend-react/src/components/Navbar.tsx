// frontend-react/src/components/Navbar.tsx

import { useState, useEffect, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext.tsx"
import { api, mediaUrl } from "../api/client.ts"
import { useT } from "../i18n/I18nProvider.tsx"
import LanguageSwitcher from "./LanguageSwitcher.tsx"

export default function Navbar() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const t = useT()
    const [menuOpen, setMenuOpen] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)
    const [requestCount, setRequestCount] = useState(0)
    const [unreadChats, setUnreadChats] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)

    async function handleLogout() {
        await logout()
        navigate("/login")
    }

    useEffect(() => {
        async function fetchRequestCount() {
            try {
                const resp = await api("/api/friends/requests/")
                if (resp.ok) {
                    const data = await resp.json()
                    setRequestCount(data.results?.length || 0)
                }
            } catch {}
        }

        async function fetchUnreadChats() {
            try {
                const resp = await api("/api/chat/unread/")
                if (resp.ok) {
                    const data = await resp.json()
                    const total = data
                        .filter((entry: { room_type: string }) => entry.room_type === "DM")
                        .reduce((sum: number, entry: { unread: number }) => sum + entry.unread, 0)
                    setUnreadChats(total)
                }
            } catch {}
        }

        fetchRequestCount()
        fetchUnreadChats()
        const interval = setInterval(() => {
            fetchRequestCount()
            fetchUnreadChats()
        }, 5000)

        function handleChatRead() {
            fetchUnreadChats()
        }
        window.addEventListener("chat-read", handleChatRead)

        return () => {
            clearInterval(interval)
            window.removeEventListener("chat-read", handleChatRead)
        }
    }, [])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }

        if (menuOpen) {
            document.addEventListener("mousedown", handleClickOutside)
        }

        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [menuOpen])

    const navLinks = (
        <>
            <Link to="/games" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white">{t("nav.games")}</Link>
            <Link to="/tournaments" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white">{t("nav.tournaments")}</Link>
            <Link to="/leaderboard" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white">{t("nav.leaderboard")}</Link>
            <Link to="/friends" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white relative">
                {t("nav.friends")}
                {requestCount > 0 && (
                    <span className="absolute -top-2 -end-3 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                        {requestCount}
                    </span>
                )}
            </Link>
            <Link to="/chat" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white relative">
                {t("nav.chat")}
                {unreadChats > 0 && (
                    <span className="absolute -top-2 -end-3 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {unreadChats > 9 ? "9+" : unreadChats}
                    </span>
                )}
            </Link>
            <Link to="/profile" onClick={() => setMobileOpen(false)} className="text-gray-300 hover:text-white">{t("nav.profile")}</Link>
            {(user?.is_staff || user?.role === "admin" || user?.role === "moderator") && (
                <Link to="/admin" onClick={() => setMobileOpen(false)} className="text-yellow-400 hover:text-yellow-300">{t("nav.admin")}</Link>
            )}
        </>
    )

    return (
        <nav className="bg-gray-800">
            <div className="p-4 flex items-center justify-between">
                {/* Logo */}
                <Link to="/" className="text-white font-bold text-xl">♟ Transcendence</Link>

                {/* Desktop links */}
                <div className="hidden md:flex gap-6 items-center">
                    {navLinks}
                </div>

                {/* User menu (desktop) + hamburger (mobile) */}
                <div className="flex items-center gap-3">
                    {/* Language switcher */}
                    <LanguageSwitcher />

                    {/* User avatar & dropdown */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="flex items-center gap-2 text-gray-300 hover:text-white"
                        >
                            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm text-white overflow-hidden">
                                {user?.avatar
									? <img src={mediaUrl(user.avatar) || undefined} className="w-8 h-8 rounded-full object-cover" />
                                    : user?.username?.[0]?.toUpperCase() || "?"
                                }
                            </div>
                            <span className="font-semibold text-white hidden sm:inline"><bdi>{user?.username}</bdi></span>
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        </button>

                        {menuOpen && (
                            <div className="absolute end-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
                                <Link
                                    to="/profile"
                                    onClick={() => setMenuOpen(false)}
                                    className="block px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-t-lg"
                                >
                                    ⚙️ {t("nav.editProfile")}
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-start px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-red-400 rounded-b-lg"
                                >
                                    🚪 {t("nav.logout")}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Hamburger button (mobile only) */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="md:hidden text-gray-300 hover:text-white"
                    >
                        {mobileOpen ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="md:hidden border-t border-gray-700 px-4 py-3 flex flex-col gap-3">
                    {navLinks}
                </div>
            )}
        </nav>
    )
}

