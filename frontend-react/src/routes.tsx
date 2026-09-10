// frontend-react/src/routes.tsx

import { createBrowserRouter } from "react-router-dom"

import AuthLayout from "./layouts/AuthLayout.tsx"
import AppLayout from "./layouts/AppLayout.tsx"
import ProtectedRoute from "./components/ProtectedRoute.tsx"

import Login from "./pages/Login.tsx"
import Register from "./pages/Register.tsx"
import Dashboard from "./pages/Dashboard.tsx"
import Games from "./pages/Games.tsx"
import Profile from "./pages/Profile.tsx"
import PublicProfile from "./pages/PublicProfile.tsx"
import Friends from "./pages/Friends.tsx"
import ChessLobby from "./pages/ChessLobby.tsx"
import ChessGame from "./pages/ChessGame.tsx"
import PacmanLobby from "./pages/PacmanLobby.tsx"
import PacmanGame from "./pages/PacmanGame.tsx"
import Tournaments from "./pages/Tournaments.tsx"
import TournamentDetail from "./pages/TournamentDetail.tsx"
import Chat from "./pages/Chat.tsx"
import ChessCoach from "./pages/ChessCoach.tsx"

import ForgotPassword from "./pages/ForgotPassword.tsx"
import ResetPassword from "./pages/ResetPassword.tsx"

import Verify2FA from "./pages/Verify2FA.tsx"

export const router = createBrowserRouter([
    {
        element: <AuthLayout />,
        children: [
            { path: "/login", element: <Login /> },
            { path: "/register", element: <Register /> },
			{ path: "/forgot-password", element: <ForgotPassword /> },
			{ path: "/reset", element: <ResetPassword /> },
			{ path: "/2fa", element: <Verify2FA /> },
        ],
    },
    {
        element: <ProtectedRoute />,
        children: [
            {
                element: <AppLayout />,
                children: [
                    { path: "/", element: <Dashboard /> },
					{ path: "/games", element: <Games /> },
                    { path: "/profile", element: <Profile /> },
                    { path: "/profile/:username", element: <PublicProfile /> },
                    { path: "/friends", element: <Friends /> },
                    { path: "/chess", element: <ChessLobby /> },
                    { path: "/chess/:id", element: <ChessGame /> },
                    { path: "/pacman", element: <PacmanLobby /> },
                    { path: "/pacman/:roomName", element: <PacmanGame /> },
                    { path: "/tournaments", element: <Tournaments /> },
                    { path: "/tournaments/:id", element: <TournamentDetail /> },
                    { path: "/chat", element: <Chat /> },
					{ path: "/coach", element: <ChessCoach /> },
                ],
            },
        ],
    },
])

