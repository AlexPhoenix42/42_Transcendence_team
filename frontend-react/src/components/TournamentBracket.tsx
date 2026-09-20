// frontend-react/src/components/TournamentBracket.tsx

import { useNavigate } from "react-router-dom"
import { useT } from "../i18n/I18nProvider.tsx"

interface MatchData {
    id: number
    tournament: number
    game: number | null
    player1: string | null
    player2: string | null
    winner: string | null
    round_nb: number
    status: string
}

interface Props {
    matches: MatchData[]
    currentUser?: string
    isStaff?: boolean
    onStartMatch?: (matchId: number) => void
}

const MATCH_H = 100  // match card height in px
const GAP = 16      // gap between matches in px
const CONN_W = 32   // connector width in px

export default function TournamentBracket({ matches, currentUser, isStaff, onStartMatch }: Props) {
    const t = useT()
    const navigate = useNavigate()

    if (matches.length === 0) return null

    const rounds: Record<number, MatchData[]> = {}
    for (const m of matches) {
        if (!rounds[m.round_nb]) rounds[m.round_nb] = []
        rounds[m.round_nb].push(m)
    }
    const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b)
    const totalRounds = roundNumbers.length

    function roundLabel(roundNb: number): string {
        const idx = roundNumbers.indexOf(roundNb)
        if (totalRounds === 1) return t("bracket.final")
        if (idx === totalRounds - 1) return t("bracket.final")
        if (idx === totalRounds - 2) return t("bracket.semiFinals")
        if (idx === totalRounds - 3) return t("bracket.quarterFinals")
        return t("bracket.round", { n: roundNb })
    }

    function playerClass(match: MatchData, player: string | null): string {
        if (!player) return "text-gray-600"
        if (match.status !== "FINISHED") {
            if (player === currentUser) return "text-blue-400 font-semibold"
            return "text-white"
        }
        if (player === match.winner) return "text-green-400 font-semibold"
        return "text-red-400/70"
    }

    function statusBadge(match: MatchData) {
        if (match.status === "FINISHED")
            return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">{t("bracket.done")}</span>
        if (match.status === "IN_PROGRESS")
            return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 animate-pulse">{t("bracket.live")}</span>
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{t("bracket.pending")}</span>
    }

    function matchActions(match: MatchData) {
        const isPlayer = match.player1 === currentUser || match.player2 === currentUser

        if (match.status === "PENDING" && match.player1 && match.player2 && isPlayer && onStartMatch)
            return (
                <button onClick={() => onStartMatch(match.id)}
                    className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                    {t("bracket.start")}
                </button>
            )

        if (match.game)
            return (
                <button onClick={() => navigate(`/chess/${match.game}`)}
                    className="text-[10px] px-2 py-0.5 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                    {match.status === "IN_PROGRESS" && isPlayer ? t("bracket.play") : match.status === "IN_PROGRESS" ? t("bracket.watch") : t("bracket.view")}
                </button>
            )

        return null
    }

    function renderMatchCard(match: MatchData) {
        return (
            <div
                className={`w-52 border rounded-lg overflow-hidden ${
                    match.status === "IN_PROGRESS"
                        ? "border-yellow-600 shadow-lg shadow-yellow-900/30"
                        : match.status === "FINISHED"
                        ? "border-gray-600"
                        : "border-gray-700"
                } bg-gray-800`}
				style={{ minHeight: `${MATCH_H}px` }}
            >
                <div className={`px-3 py-2 flex items-center ${match.winner === match.player1 ? "bg-green-900/20" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {match.winner === match.player1 && <span className="text-green-400 text-xs">▶</span>}
                        <span className={`text-sm truncate ${playerClass(match, match.player1)}`}>
                            <bdi>{match.player1 || t("bracket.tbd")}</bdi>
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between px-3 py-1 bg-gray-900/50 border-y border-gray-700/50">
                    {statusBadge(match)}
                    {matchActions(match)}
                </div>
                <div className={`px-3 py-2 flex items-center ${match.winner === match.player2 ? "bg-green-900/20" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {match.winner === match.player2 && <span className="text-green-400 text-xs">▶</span>}
                        <span className={`text-sm truncate ${playerClass(match, match.player2)}`}>
                            <bdi>{match.player2 || t("bracket.tbd")}</bdi>
                        </span>
                    </div>
                </div>
            </div>
        )
    }

    function renderConnector(topMatchCenter: number, bottomMatchCenter: number) {
        const svgHeight = bottomMatchCenter + MATCH_H / 2 + GAP
        const midY = (topMatchCenter + bottomMatchCenter) / 2

        return (
            <svg width={CONN_W} height={svgHeight} className="shrink-0">
                {/* Horizontal from top match */}
                <line x1="0" y1={topMatchCenter} x2={CONN_W / 2} y2={topMatchCenter}
                    stroke="#4b5563" strokeWidth="2" />
                {/* Horizontal from bottom match */}
                <line x1="0" y1={bottomMatchCenter} x2={CONN_W / 2} y2={bottomMatchCenter}
                    stroke="#4b5563" strokeWidth="2" />
                {/* Vertical connecting them */}
                <line x1={CONN_W / 2} y1={topMatchCenter} x2={CONN_W / 2} y2={bottomMatchCenter}
                    stroke="#4b5563" strokeWidth="2" />
                {/* Horizontal to next round */}
                <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY}
                    stroke="#4b5563" strokeWidth="2" />
            </svg>
        )
    }

    // Recursive rendering: each round is built from pairs
    function renderRound(roundIdx: number): React.ReactNode {
        const roundNb = roundNumbers[roundIdx]
        const roundMatches = rounds[roundNb]
        const isLast = roundIdx === totalRounds - 1
        const isFirst = roundIdx === 0

        if (isLast && roundMatches.length === 1) {
            // Final match — just the card, no connector
            return (
                <div className="flex flex-col justify-center">
                    <div className="text-center mb-4">
                        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                            {roundLabel(roundNb)}
                        </span>
                    </div>
                    {renderMatchCard(roundMatches[0])}
                </div>
            )
        }

        // Calculate gap between matches for this round
        // Each round doubles the spacing from the previous
        const baseUnit = MATCH_H + GAP
        const multiplier = Math.pow(2, roundIdx)
        const pairHeight = baseUnit * multiplier
        const innerGap = pairHeight - MATCH_H  // space between two cards in a pair

        // Centers of top and bottom match within a pair
        const topCenter = MATCH_H / 2
        const bottomCenter = MATCH_H + innerGap + MATCH_H / 2

        return (
            <div className="flex items-center">
                {/* This round's matches */}
                <div className="flex flex-col">
                    <div className="text-center mb-4">
                        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                            {roundLabel(roundNb)}
                        </span>
                    </div>

                    <div className="flex flex-col" style={{ gap: `${innerGap}px` }}>
                        {roundMatches.map((match, i) => {
                            // Add extra gap between pairs (not between matches within a pair)
                            const isNewPair = i > 0 && i % 2 === 0
                            return (
                                <div key={match.id} style={{ marginTop: isNewPair ? `${innerGap}px` : undefined }}>
                                    {renderMatchCard(match)}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Connectors to next round */}
                {!isLast && (
                    <div className="flex flex-col">
                        <div className="mb-4">
                            <span className="text-sm font-semibold text-transparent">.</span>
                        </div>
                        <div className="flex flex-col">
                            {Array.from({ length: Math.ceil(roundMatches.length / 2) }).map((_, pairIdx) => {
                                const hasPair = (pairIdx * 2 + 1) < roundMatches.length

                                if (!hasPair) {
                                    return (
                                        <div key={pairIdx} style={{ height: `${MATCH_H}px` }} className="flex items-center">
                                            <svg width={CONN_W} height={2}>
                                                <line x1="0" y1="1" x2={CONN_W} y2="1" stroke="#4b5563" strokeWidth="2" />
                                            </svg>
                                        </div>
                                    )
                                }

                                const totalPairH = MATCH_H * 2 + innerGap
                                const topY = MATCH_H / 2
                                const bottomY = MATCH_H + innerGap + MATCH_H / 2
                                const midY = (topY + bottomY) / 2

                                // Extra margin between pairs
                                const pairMarginTop = pairIdx > 0 ? innerGap + GAP : 0

                                return (
                                    <div key={pairIdx} style={{ height: `${totalPairH}px`, marginTop: pairIdx > 0 ? `${pairMarginTop}px` : undefined }}>
                                        <svg width={CONN_W} height={totalPairH}>
                                            <line x1="0" y1={topY} x2={CONN_W / 2} y2={topY}
                                                stroke="#4b5563" strokeWidth="2" />
                                            <line x1="0" y1={bottomY} x2={CONN_W / 2} y2={bottomY}
                                                stroke="#4b5563" strokeWidth="2" />
                                            <line x1={CONN_W / 2} y1={topY} x2={CONN_W / 2} y2={bottomY}
                                                stroke="#4b5563" strokeWidth="2" />
                                            <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY}
                                                stroke="#4b5563" strokeWidth="2" />
                                        </svg>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Next round */}
                {!isLast && renderRound(roundIdx + 1)}
            </div>
        )
    }

    return (
        // dir="ltr": brackets genuinely DO flow right-to-left in RTL
        // publications, so mirroring would arguably be more correct — but this
        // is 280 lines of nested flex and connector geometry, and a correct
        // LTR bracket beats a half-mirrored one. Revisit only with time to
        // spare. Until then this pin keeps the connectors attached to the
        // right matches.
        <div dir="ltr" className="overflow-x-auto">
            {renderRound(0)}

            {/* Champion banner */}
            {(() => {
                const finalMatch = rounds[roundNumbers[totalRounds - 1]]?.[0]
                if (finalMatch?.status === "FINISHED" && finalMatch.winner) {
                    return (
                        <div className="mt-6 text-center">
                            <div className="inline-block bg-yellow-900/30 border border-yellow-600 rounded-lg px-6 py-3">
                                <span className="text-yellow-400 text-lg">🏆</span>
                                <span className="text-yellow-300 font-bold text-lg ms-2">
                                    <bdi>{finalMatch.winner}</bdi>
                                </span>
                                <span className="text-yellow-400 text-lg ms-2">🏆</span>
                            </div>
                        </div>
                    )
                }
                return null
            })()}
        </div>
    )
}

