// frontend-react/src/components/WizardQuiz.tsx

import { useEffect, useState } from "react"
import { useI18n } from "../i18n/I18nProvider.tsx"

const ANSWER_SECONDS = 25

interface Props {
    target: string
    isTarget: boolean
    question: string
    choices: string[]
    onAnswer: (choiceIndex: number) => void
    result: { correct: boolean; correctIndex: number; answeredIndex: number | null } | null
}

export default function WizardQuiz({ target, isTarget, question, choices, onAnswer, result }: Props) {
    const { t } = useI18n()
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
        if (!isTarget || selected !== null || result) return
        setSelected(index)
        onAnswer(index)
    }

    // The server's answered_index is authoritative for everyone (including
    // the target, once the result comes back) — spectators never have a
    // local `selected`, since only the target can click a choice.
    const pickedIndex = result ? result.answeredIndex : (isTarget ? selected : null)

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 border border-gray-600 rounded-xl p-6 max-w-md w-full shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        {isTarget ? t("wizard.askingYou") : t("wizard.askingOther", { target })}
                    </h3>
                    {!result && pickedIndex === null && (
                        <span className="text-xs text-gray-400">{secondsLeft}s</span>
                    )}
                </div>

                <p className="text-gray-200 mb-4">{question}</p>

                <div className="space-y-2">
                    {choices.map((choice, i) => {
                        const isCorrect = result && i === result.correctIndex
                        const isWrongPick = result && pickedIndex === i && i !== result.correctIndex

                        return (
                            <button
                                key={i}
                                onClick={() => pick(i)}
                                disabled={!isTarget || selected !== null || !!result}
                                className={`w-full text-left px-4 py-2 rounded-lg border transition text-sm ${
                                    isCorrect
                                        ? "bg-green-700/50 border-green-500 text-white"
                                        : isWrongPick
                                            ? "bg-red-700/50 border-red-500 text-white"
                                            : pickedIndex === i
                                                ? "bg-gray-600 border-gray-400 text-white"
                                                : `bg-gray-700 border-gray-600 text-gray-200 disabled:opacity-60 ${
                                                    isTarget ? "hover:border-amber-500" : ""
                                                }`
                                }`}
                            >
                                {choice}
                            </button>
                        )
                    })}
                </div>

                {result && (
                    <p className={`mt-4 text-center font-semibold ${result.correct ? "text-green-400" : "text-red-400"}`}>
                        {isTarget
                            ? (result.correct ? t("wizard.correct") : t("wizard.wrong"))
                            : (result.correct ? t("wizard.otherCorrect", { target }) : t("wizard.otherWrong", { target }))}
                    </p>
                )}

                {!result && pickedIndex !== null && (
                    <p className="mt-4 text-center text-gray-400 text-sm">{t("wizard.waitingVerdict")}</p>
                )}

                {!result && pickedIndex === null && !isTarget && (
                    <p className="mt-4 text-center text-gray-400 text-sm">{t("wizard.waitingAnswer", { target })}</p>
                )}
            </div>
        </div>
    )
}
