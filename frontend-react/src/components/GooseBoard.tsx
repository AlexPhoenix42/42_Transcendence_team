// frontend-react/src/components/GooseBoard.tsx

import { useEffect, useRef, useState } from "react"
import Wizard3D from "./Wizard3D.tsx"

interface PlayerData {
    username: string
    position: number
    turn_order: number
    skip_turns: number
    is_active: boolean
    color: string
}

interface Props {
    players: PlayerData[]
    lastMove?: { player: string; from: number; to: number } | null
    wizardPosition?: number
    wizardMove?: { from: number; step: number } | null
    wizardReaction?: "correct" | "wrong" | null
}

const PLAYER_TOKENS = ["🐸", "🦊", "🐻", "🐰", "🦉", "🐱"]
export const PLAYER_HOP_MS = 260 // per-square hop duration, slowed down so moves are easy to follow
export const WIZARD_HOP_MS = 420 // slower than player moves so each hop is clearly visible

const SPECIAL_SQUARES: Record<number, { icon: string; label: string; bg: string; border: string }> = {
    5:  { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    6:  { icon: "🌉", label: "Bridge", bg: "#1e3a5f", border: "#60a5fa" },
    9:  { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    14: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    18: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    19: { icon: "🏨", label: "Inn",    bg: "#78350f", border: "#f59e0b" },
    23: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    27: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    31: { icon: "🕳️", label: "Well",   bg: "#164e63", border: "#22d3ee" },
    32: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    36: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    41: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    42: { icon: "🌀", label: "Maze",   bg: "#4c1d95", border: "#a78bfa" },
    45: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    50: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    52: { icon: "⛓️", label: "Prison", bg: "#374151", border: "#9ca3af" },
    54: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    58: { icon: "💀", label: "Death",  bg: "#7f1d1d", border: "#f87171" },
    59: { icon: "🪿", label: "Goose",  bg: "#166534", border: "#22c55e" },
    63: { icon: "🏁", label: "Finish", bg: "#713f12", border: "#facc15" },
}

/**
 * Archimedean spiral: r = maxR - (maxR - minR) * (theta / maxAngle)
 * Constant gap between turns — looks like a classic board game.
 * Arc-length parameterization ensures equal spacing between squares.
 */
function calculateSpiralPositions(width: number, height: number): { x: number; y: number }[] {
    const centerX = width / 2
    const centerY = height / 2
    const totalSquares = 64

    const maxRadius = Math.min(width, height) * 0.46
    const minRadius = Math.min(width, height) * 0.04
    const totalTurns = 4

    const maxAngle = totalTurns * 2 * Math.PI

    function spiralPoint(theta: number): { x: number; y: number } {
        const r = maxRadius - (maxRadius - minRadius) * (theta / maxAngle)
        const angle = theta - Math.PI / 2
        return {
            x: centerX + r * Math.cos(angle),
            y: centerY + r * Math.sin(angle),
        }
    }

    // Sample many points and compute cumulative arc length
    const SAMPLES = 2000
    const sampled: { x: number; y: number; dist: number }[] = []
    let cumDist = 0

    for (let i = 0; i <= SAMPLES; i++) {
        const theta = (i / SAMPLES) * maxAngle
        const pt = spiralPoint(theta)

        if (i > 0) {
            const dx = pt.x - sampled[i - 1].x
            const dy = pt.y - sampled[i - 1].y
            cumDist += Math.sqrt(dx * dx + dy * dy)
        }

        sampled.push({ ...pt, dist: cumDist })
    }

    // Place squares at equal arc-length intervals
    const totalLength = cumDist
    const positions: { x: number; y: number }[] = []
    let sampleIdx = 0

    for (let sq = 0; sq < totalSquares; sq++) {
        const targetDist = (sq / (totalSquares - 1)) * totalLength

        while (sampleIdx < SAMPLES && sampled[sampleIdx + 1].dist < targetDist) {
            sampleIdx++
        }

        const s0 = sampled[sampleIdx]
        const s1 = sampled[Math.min(sampleIdx + 1, SAMPLES)]
        const segLen = s1.dist - s0.dist
        const t = segLen > 0 ? (targetDist - s0.dist) / segLen : 0

        positions.push({
            x: s0.x + t * (s1.x - s0.x),
            y: s0.y + t * (s1.y - s0.y),
        })
    }

    return positions
}

function getNeighborGap(positions: { x: number; y: number }[], index: number): number {
    let gap = Infinity
    if (index > 0) {
        const dx = positions[index].x - positions[index - 1].x
        const dy = positions[index].y - positions[index - 1].y
        gap = Math.min(gap, Math.sqrt(dx * dx + dy * dy))
    }
    if (index < positions.length - 1) {
        const dx = positions[index + 1].x - positions[index].x
        const dy = positions[index + 1].y - positions[index].y
        gap = Math.min(gap, Math.sqrt(dx * dx + dy * dy))
    }
    return gap
}

export default function GooseBoard({ players, lastMove, wizardPosition = 0, wizardMove, wizardReaction }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ width: 600, height: 600 })
    const [animatingPlayer, setAnimatingPlayer] = useState<string | null>(null)
    const [animPos, setAnimPos] = useState<{ x: number; y: number } | null>(null)
    const [wizardHopping, setWizardHopping] = useState(false)
    const [wizardAnimPos, setWizardAnimPos] = useState<{ x: number; y: number } | null>(null)

    useEffect(() => {
        function updateSize() {
            if (containerRef.current) {
                const w = containerRef.current.clientWidth
                setSize({ width: w, height: w })
            }
        }
        updateSize()
        window.addEventListener("resize", updateSize)
        return () => window.removeEventListener("resize", updateSize)
    }, [])

    useEffect(() => {
        if (!lastMove) return

        const positions = calculateSpiralPositions(size.width, size.height)
        const from = lastMove.from
        const to = lastMove.to
        const player = lastMove.player

        if (from === to) return

        setAnimatingPlayer(player)

        const steps: number[] = []
        if (to > from) {
            for (let i = from; i <= to; i++) steps.push(i)
        } else {
            for (let i = from; i >= to; i--) steps.push(i)
        }

        let stepIndex = 0
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval)
                setAnimatingPlayer(null)
                setAnimPos(null)
                return
            }
            const pos = positions[steps[stepIndex]]
            setAnimPos(pos)
            stepIndex++
        }, PLAYER_HOP_MS)

        return () => clearInterval(interval)
    }, [lastMove, size])

    // Grey Wizard: hops (leapfrog-style) square by square. He picks his own
    // direction each turn (forward or backward), wrapping around the board.
    useEffect(() => {
        if (!wizardMove || wizardMove.step === 0) return

        const positions = calculateSpiralPositions(size.width, size.height)
        const totalSquares = positions.length
        const { from, step } = wizardMove
        const dir = Math.sign(step)

        const steps: number[] = []
        let cur = from
        for (let i = 0; i < Math.abs(step); i++) {
            cur = (cur + dir + totalSquares) % totalSquares
            steps.push(cur)
        }

        setWizardHopping(true)

        let stepIndex = 0
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval)
                setWizardHopping(false)
                setWizardAnimPos(null)
                return
            }
            setWizardAnimPos(positions[steps[stepIndex]])
            stepIndex++
        }, WIZARD_HOP_MS)

        return () => clearInterval(interval)
    }, [wizardMove, size])

    const positions = calculateSpiralPositions(size.width, size.height)

    // Compute a uniform circle size from the median gap
    const gaps = positions.map((_, i) => getNeighborGap(positions, i)).sort((a, b) => a - b)
    const medianGap = gaps[Math.floor(gaps.length / 2)]
    const circleSize = Math.max(16, Math.min(medianGap * 0.75, size.width / 14))

    return (
        <div
            ref={containerRef}
            className="w-full aspect-square relative rounded-xl overflow-hidden"
            style={{
                background: "radial-gradient(ellipse at center, #2a1f14 0%, #1a1209 70%, #110c05 100%)",
                border: "1px solid #5c4a32",
            }}
        >
            {/* Spiral path */}
            <svg width={size.width} height={size.height} className="absolute inset-0">
                <path
                    d={positions.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                    fill="none"
                    stroke="#5c4a32"
                    strokeWidth="2"
                />
            </svg>

            {/* Squares */}
            {positions.map((pos, sq) => {
                const special = SPECIAL_SQUARES[sq]
                const isStart = sq === 0

                return (
                    <div
                        key={sq}
                        className="absolute flex items-center justify-center rounded-full"
                        style={{
                            left: pos.x - circleSize / 2,
                            top: pos.y - circleSize / 2,
                            width: circleSize,
                            height: circleSize,
                            backgroundColor: isStart
                                ? "#14532d"
                                : special
                                    ? special.bg
                                    : "#292018",
                            border: `2px solid ${
                                isStart
                                    ? "#4ade80"
                                    : special
                                        ? special.border
                                        : "#5c4a32"
                            }`,
                            boxShadow: special
                                ? `0 0 6px ${special.border}40`
                                : "none",
                        }}
                        title={`Square ${sq}${special ? ` — ${special.label}` : ""}`}
                    >
                        {special ? (
                            <span style={{ fontSize: circleSize * 0.48 }}>{special.icon}</span>
                        ) : (
                            <span
                                style={{
                                    fontSize: circleSize * 0.36,
                                    fontWeight: 600,
                                    color: "#c9b896",
                                }}
                            >
                                {sq}
                            </span>
                        )}
                    </div>
                )
            })}

            {/* Player tokens */}
            {players.filter(p => p.is_active).map((player) => {
                const isAnimating = animatingPlayer === player.username && animPos
                const pos = isAnimating ? animPos : positions[player.position]
                if (!pos) return null

                const sameSquarePlayers = players.filter(p => p.position === player.position && p.is_active)
                const sameIdx = sameSquarePlayers.indexOf(player)
                const offsetX = sameSquarePlayers.length > 1 ? (sameIdx - (sameSquarePlayers.length - 1) / 2) * 12 : 0

                return (
                    <div
                        key={player.username}
                        className="absolute transition-all duration-300 ease-in-out pointer-events-none"
                        style={{
                            left: pos.x + offsetX - 14,
                            top: pos.y - 28,
                            zIndex: isAnimating ? 50 : 10,
                        }}
                    >
                        <div className="flex flex-col items-center">
                            <span
                                className={`text-2xl ${isAnimating ? "animate-bounce" : ""}`}
                                style={{ filter: `drop-shadow(0 0 4px ${player.color})` }}
                            >
                                {PLAYER_TOKENS[player.turn_order % PLAYER_TOKENS.length]}
                            </span>
                            <span
                                className="text-[9px] font-bold px-1 rounded mt-0.5 whitespace-nowrap"
                                style={{ backgroundColor: player.color, color: "white" }}
                            >
                                {player.username.slice(0, 6)}
                            </span>
                        </div>
                    </div>
                )
            })}

            {/* Grey Wizard */}
            {(() => {
                const pos = wizardHopping && wizardAnimPos ? wizardAnimPos : positions[wizardPosition]
                if (!pos) return null

                const wizardSize = Math.max(30, circleSize * 1.8)

                return (
                    <div
                        className="absolute transition-all ease-out pointer-events-none"
                        style={{
                            left: pos.x - wizardSize / 2,
                            top: pos.y - wizardSize,
                            zIndex: 20,
                            transitionDuration: `${WIZARD_HOP_MS - 60}ms`,
                        }}
                    >
                        <div className="flex flex-col items-center">
                            <Wizard3D size={wizardSize} hopping={wizardHopping} reaction={wizardReaction ?? null} />
                            {wizardReaction && (
                                <span className="text-lg -mt-2">
                                    {wizardReaction === "correct" ? "👍" : "👎"}
                                </span>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* Center decoration */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center" style={{ opacity: 0.25 }}>
                    <span className="text-4xl">🪿</span>
                    <p className="text-xs font-bold mt-1" style={{ color: "#c9b896" }}>
                        Game of the Goose
                    </p>
                </div>
            </div>
        </div>
    )
}

