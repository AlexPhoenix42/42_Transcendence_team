// frontend-react/src/components/WizardQuiz.tsx

import { useEffect, useState } from "react"

const ANSWER_SECONDS = 25

interface Props {
    question: string
    choices: string[]
    onAnswer: (choiceIndex: number) => void
    result: { correct: boolean; correctIndex: number } | null
}

export default function WizardQuiz({ question, choices, onAnswer, result }: Props) {
    const [selected, setSelected] = useState<number | null>(null)
    const [secondsLeft, setSecondsLeft] = useState(ANSWER_SECONDS)

    useEffect(() => {
        if (result || selected !== null) return
        const interval = setInterval(() => {
            setSecondsLeft((s) => Math.max(0, s - 1))
        }, 1000)
        return () => clearInterval(interval)
    }, [result, selected])

    function pick(index: number) {
        if (selected !== null || result) return
        setSelected(index)
        onAnswer(index)
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 max-w-md w-full shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        🧙 Le Magicien Gris t'interroge !
                    </h3>
                    {!result && selected === null && (
                        <span className="text-xs text-gray-400">{secondsLeft}s</span>
                    )}
                </div>

                <p className="text-gray-200 mb-4">{question}</p>

                <div className="space-y-2">
                    {choices.map((choice, i) => {
                        const isCorrect = result && i === result.correctIndex
                        const isWrongPick = result && selected === i && i !== result.correctIndex

                        return (
                            <button
                                key={i}
                                onClick={() => pick(i)}
                                disabled={selected !== null || !!result}
                                className={`w-full text-left px-4 py-2 rounded-lg border transition text-sm ${
                                    isCorrect
                                        ? "bg-green-700/50 border-green-500 text-white"
                                        : isWrongPick
                                            ? "bg-red-700/50 border-red-500 text-white"
                                            : selected === i
                                                ? "bg-gray-600 border-gray-400 text-white"
                                                : "bg-gray-700 border-gray-600 text-gray-200 hover:border-amber-500 disabled:opacity-60"
                                }`}
                            >
                                {choice}
                            </button>
                        )
                    })}
                </div>

                {result && (
                    <p className={`mt-4 text-center font-semibold ${result.correct ? "text-green-400" : "text-red-400"}`}>
                        {result.correct ? "👍 Bonne réponse !" : "👎 Mauvaise réponse..."}
                    </p>
                )}

                {!result && selected !== null && (
                    <p className="mt-4 text-center text-gray-400 text-sm">En attente du verdict du magicien...</p>
                )}
            </div>
        </div>
    )
}
