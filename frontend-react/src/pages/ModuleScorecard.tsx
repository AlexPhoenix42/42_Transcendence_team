const sections = [
  { name: "Web", id: "IV.1", pts: 11, modules: [
    ["Major", "Use a framework for frontend and backend", "React + Django", "alephoen", 2],
    ["Major", "Real-time features using WebSockets", "Django Channels, Redis pub/sub", "alephoen", 2],
    ["Major", "User interaction (chat, profiles, friends)", "DM, global chat, friend system", "alephoen", 2],
    ["Major", "Public API with secured key (5+ endpoints)", "REST API, rate limited, documented", "alephoen", 2],
    ["Minor", "Use an ORM for the database", "Django ORM + PostgreSQL", "alephoen", 1],
    ["Minor", "Complete notification system", "CRUD notifications, real-time", "alephoen", 1],
    ["Minor", "Real-time collaborative features", "Whiteboard (WBO)", "alephoen", 1],
  ]},
  { name: "Accessibility & Internationalization", id: "IV.2", pts: 3, modules: [
    ["Minor", "Support for multiple languages (6)", "EN, FR, NL, AR, HE, Klingon", "bvan-duy", 1],
    ["Minor", "RTL language support", "Arabic, Hebrew — full layout mirroring", "bvan-duy", 1],
    ["Minor", "Support for additional browsers", "Firefox, Brave, Chrome, Edge, iOS, Android", "alephoen", 1],
  ]},
  { name: "User Management", id: "IV.3", pts: 8, modules: [
    ["Major", "Standard user management and authentication", "Profiles, avatars, friends, online status", "mtice", 2],
    ["Major", "Advanced permissions system", "Admin, Moderator, User roles — CRUD", "alephoen", 2],
    ["Minor", "Game statistics and match history", "Stats, leaderboards, achievements", "mtice", 1],
    ["Minor", "Remote authentication with OAuth 2.0", "Google + 42 OAuth", "alephoen", 1],
    ["Minor", "Complete 2FA system", "TOTP via Authenticator App", "alephoen", 1],
    ["Minor", "User activity analytics dashboard", "Recharts, date filters, CSV+PDF export", "alephoen", 1],
  ]},
  { name: "Artificial Intelligence", id: "IV.4", pts: 4, modules: [
    ["Major", "AI Opponent for games", "Stockfish AI, multiple difficulty levels", "alephoen", 2],
    ["Major", "LLM system interface", "Ollama + Mistral AI chess coach", "alephoen", 2],
  ]},
  { name: "Cybersecurity", id: "IV.5", pts: 2, modules: [
    ["Major", "WAF/ModSecurity + HashiCorp Vault", "OWASP CRS, Vault AppRole, TLS", "alephoen", 2],
  ]},
  { name: "Gaming & User Experience", id: "IV.6", pts: 15, modules: [
    ["Major", "Web-based game (users vs each other)", "Chess — 1v1, live matches, rules engine", "alephoen", 2],
    ["Major", "Remote players in real-time", "WebSocket sync across devices", "isadbaib", 2],
    ["Major", "Multiplayer game (3+ players)", "Pacman + Goose Game, variable players", "isadbaib", 2],
    ["Major", "Another game + matchmaking", "Goose Game — history, matchmaking", "isadbaib", 2],
    ["Major", "Advanced 3D graphics", "3D Pacman via pygbag/WASM, Three.js", "isadbaib", 2],
    ["Minor", "Advanced chat features", "Block, invite from chat, notifications, history", "alephoen", 1],
    ["Minor", "Tournament system", "Brackets, matchmaking, AI fill-in", "alephoen", 1],
    ["Minor", "Game customization options", "Power-ups, maps, custom settings", "isadbaib", 1],
    ["Minor", "Gamification system", "Achievements, badges, XP/levels", "mtice", 1],
    ["Minor", "Spectator mode for games", "Watch ongoing games, real-time updates", "isadbaib", 1],
  ]},
  { name: "DevOps", id: "IV.7", pts: 5, modules: [
    ["Major", "Monitoring: Prometheus + Grafana", "Custom dashboards, exporters, alerting", "alephoen", 2],
    ["Major", "Backend as microservices", "Docker Compose, REST APIs, message queues", "alephoen", 2],
    ["Minor", "Health checks + automated backups", "Docker healthchecks, restic backups", "alephoen", 1],
  ]},
  { name: "Data & Analytics", id: "IV.8", pts: 4, modules: [
    ["Major", "Advanced analytics dashboard", "Recharts, real-time, export PDF/CSV", "alephoen", 2],
    ["Minor", "Data export and import", "JSON, CSV, XML + validation", "alephoen", 1],
    ["Minor", "GDPR compliance features", "Data request, deletion, export, email confirm", "alephoen", 1],
  ]},
  { name: "Custom Modules", id: "IV.10", pts: 5, modules: [
    ["Major", "Security audit log & intrusion detection", "Audit model, auto-lock after 5 fails, admin unlock, demo script", "alephoen", 2],
    ["Major", "fail2ban + privilege-separated firewall agent", "Unprivileged fail2ban → Unix socket → CAP_NET_ADMIN agent, DOCKER-USER iptables", "alephoen", 2],
    ["Minor", "Real-time chat translation (DeepL)", "On-demand per-message translate, REST API, secrets via file mount", "alephoen", 1],
  ]},
]

export default function ModuleScorecard() {
  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto bg-gray-800 rounded-xl shadow-lg p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">
            🐦‍🔥 Born2Transcend 🐦‍🔥
          </h1>
          <p className="text-gray-400 italic text-sm">Rise from the ashes &amp; code</p>
          <p className="text-gray-500 text-sm mb-6">ft_transcendence — 42 Project Module Scorecard</p>
          <div className="text-6xl font-bold text-blue-500">57</div>
          {/* i18n-exempt: internal — dev-facing module scorecard */}
          <div className="text-gray-400 text-sm mb-4">Total Points</div>
          <hr className="border-gray-600 mb-3" />
          <div className="flex justify-center gap-6 text-sm text-gray-400">
            <span>32 Modules</span>
            <span>18 Major · 14 Minor</span>
            <span>9 Categories</span>
          </div>
        </div>

        {/* Authors */}
        <div className="mb-6 text-center text-sm text-gray-400">
          <span className="text-white font-semibold">alephoen</span> · <span className="text-white font-semibold">mtice</span> · <span className="text-white font-semibold">bvan-duy</span> · <span className="text-white font-semibold">isadbaib</span>
        </div>

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.id} className="mt-8">
            <h2 className="text-lg font-bold text-blue-500 mb-2">
              {section.id} — {section.name}{" "}
              <span className="text-sm font-normal text-gray-500">({section.pts} pts)</span>
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {section.modules.map((mod, idx) => {
                  const [type, name, detail, dev, pts] = mod
                  const isMajor = type === "Major"
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-700 ${idx % 2 === 0 ? "bg-gray-750" : ""}`}
                      style={idx % 2 === 0 ? { backgroundColor: "rgba(255,255,255,0.02)" } : {}}
                    >
                      <td className="py-2 px-2 text-center text-green-500 font-bold w-8">✓</td>
                      <td className={`py-2 px-2 font-bold text-xs uppercase w-16 ${isMajor ? "text-purple-400" : "text-cyan-500"}`}>
                        {type as string}
                      </td>
                      <td className={`py-2 px-2 text-gray-200 ${isMajor ? "font-semibold" : ""}`}>
                        {name as string}
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-xs hidden md:table-cell">
                        {detail as string}
                      </td>
                      <td className="py-2 px-2 text-gray-500 text-xs w-14 hidden md:table-cell">
                        {dev as string}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold w-8 ${isMajor ? "text-purple-400" : "text-cyan-500"}`}>
                        {pts as number}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-600 text-center text-sm text-gray-400 leading-7">
          <p>
            Team: <strong className="text-white">alephoen</strong> (Product Owner) ·{" "}
            <strong className="text-white">mtice</strong> (Project Manager) ·{" "}
            <strong className="text-white">bvan-duy</strong> (Tech Lead) ·{" "}
            <strong className="text-white">isadbaib</strong> (DevOps)
          </p>
          <p>Born2Transcend — 42 Brussels — October 2026</p>
          <p>GNU GPL v3 License</p>
        </div>
      </div>
    </div>
  )
}

