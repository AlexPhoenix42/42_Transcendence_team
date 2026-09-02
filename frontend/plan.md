Here's the full frontend plan before we write anything:

**Tech stack:**
- React + Vite
- Tailwind CSS
- React Router v7
- React Context + hooks

**Folder structure:**
```
frontend-react/
├── src/
│   ├── api/            # REST API helper functions
│   ├── ws/             # WebSocket connection helpers
│   ├── context/        # AuthContext, ChatContext, GameContext
│   ├── hooks/          # useAuth, useWebSocket, etc.
│   ├── pages/          # One file per route (Login, Register, Dashboard, etc.)
│   ├── components/     # Reusable UI (Navbar, ChessBoard, ChatBox, etc.)
│   ├── layouts/        # Shared layouts (AuthLayout, AppLayout)
│   ├── routes.jsx      # All route definitions
│   ├── App.jsx         # Root component
│   └── main.jsx        # Entry point
├── tailwind.config.js
├── vite.config.js
└── package.json
```

**Auth flow:**
- JWT tokens stored in memory (not localStorage for security)
- Access token for API calls, refresh token for renewal
- AuthContext wraps the app, provides `user`, `login`, `logout`

**Build order** (one step at a time, I won't move forward without your OK):
1. Project setup (Vite + Tailwind + Router)
2. Auth context + Login/Register pages
3. Dashboard + Navbar
4. Profile pages
5. Friends page
6. Chess lobby + board
7. Tournaments
8. Chat
9. Chess coach

