#!/usr/bin/env bash
set -euo pipefail

# Run from frontend-react/
cd "$(dirname "$0")"

# Create directories
mkdir -p src/pages src/layouts src/components src/api src/ws src/context src/hooks

# Pages
for page in Login Register Dashboard Profile PublicProfile Friends ChessLobby ChessGame Tournaments TournamentDetail Chat; do
  cat > "src/pages/${page}.jsx" << EOF
export default function ${page}() {
  return <h1 className="text-white text-2xl">${page} Page</h1>
}
EOF
done

# Layouts
cat > src/layouts/AuthLayout.jsx << 'EOF'
import { Outlet } from "react-router-dom"

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Outlet />
    </div>
  )
}
EOF

cat > src/layouts/AppLayout.jsx << 'EOF'
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
EOF

# Navbar
cat > src/components/Navbar.jsx << 'EOF'
import { Link } from "react-router-dom"

export default function Navbar() {
  return (
    <nav className="bg-gray-800 p-4 flex gap-6 items-center">
      <Link to="/" className="text-white font-bold text-xl">♟ Transcendence</Link>
      <Link to="/chess" className="text-gray-300 hover:text-white">Chess</Link>
      <Link to="/tournaments" className="text-gray-300 hover:text-white">Tournaments</Link>
      <Link to="/friends" className="text-gray-300 hover:text-white">Friends</Link>
      <Link to="/chat" className="text-gray-300 hover:text-white">Chat</Link>
      <div className="ml-auto">
        <Link to="/profile" className="text-gray-300 hover:text-white">Profile</Link>
      </div>
    </nav>
  )
}
EOF

# Routes
cat > src/routes.jsx << 'EOF'
import { createBrowserRouter } from "react-router-dom"

import AuthLayout from "./layouts/AuthLayout"
import AppLayout from "./layouts/AppLayout"

import Login from "./pages/Login"
import Register from "./pages/Register"
import Dashboard from "./pages/Dashboard"
import Profile from "./pages/Profile"
import PublicProfile from "./pages/PublicProfile"
import Friends from "./pages/Friends"
import ChessLobby from "./pages/ChessLobby"
import ChessGame from "./pages/ChessGame"
import Tournaments from "./pages/Tournaments"
import TournamentDetail from "./pages/TournamentDetail"
import Chat from "./pages/Chat"

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/register", element: <Register /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/profile", element: <Profile /> },
      { path: "/profile/:username", element: <PublicProfile /> },
      { path: "/friends", element: <Friends /> },
      { path: "/chess", element: <ChessLobby /> },
      { path: "/chess/:id", element: <ChessGame /> },
      { path: "/tournaments", element: <Tournaments /> },
      { path: "/tournaments/:id", element: <TournamentDetail /> },
      { path: "/chat", element: <Chat /> },
    ],
  },
])
EOF

# App.jsx
cat > src/App.jsx << 'EOF'
import { RouterProvider } from "react-router-dom"
import { router } from "./routes"

export default function App() {
  return <RouterProvider router={router} />
}
EOF

echo "✅ Scaffold complete. Run 'npm run dev -- --host' to test."

