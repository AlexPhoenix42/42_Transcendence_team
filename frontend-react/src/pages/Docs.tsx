//frontend-react/src/pages/Docs.tsx

import { useState, useEffect, useRef } from "react"
import { marked } from "marked"
import mermaid from "mermaid"

mermaid.initialize({ startOnLoad: false, theme: "dark" })

//const renderer = new marked.Renderer()
//const origCode = renderer.code.bind(renderer)
//
//renderer.code = function({ text, lang }: { text: string; lang?: string }) {
//    if (lang === "mermaid") {
//        return `<pre class="mermaid">${text}</pre>`
//    }
//    return origCode({ text, lang })
//}

function unescapeEntities(s: string): string {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

const renderer = new marked.Renderer()
const origCode = renderer.code.bind(renderer)
const origCodespan = renderer.codespan.bind(renderer)

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
    const clean = unescapeEntities(text)
    if (lang === "mermaid") {
        return `<pre class="mermaid">${clean}</pre>`
    }
    return origCode({ text: clean, lang })
}

renderer.codespan = function({ text }: { text: string }) {
    return origCodespan({ text: unescapeEntities(text) })
}

renderer.heading = function({ text, depth }: { text: string; depth: number }) {
    const id = text
        .replace(/<[^>]*>/g, "")
        .replace(/&lt;/g, "")
        .replace(/&gt;/g, "")
        .toLowerCase()
        .replace(/`/g, "")
        .replace(/[^\w\s-]/g, "")
        .replace(/_/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/-+$/, "")
    return `<h${depth} id="${id}">${text}</h${depth}>`
}

marked.setOptions({ renderer })

export default function Docs() {
    const [content, setContent] = useState("")
    const [activeDoc, setActiveDoc] = useState("README.md")
    const [loading, setLoading] = useState(true)
    const contentRef = useRef<HTMLDivElement>(null)
    const historyRef = useRef<HTMLElement[]>([])

    useEffect(() => {
        setLoading(true)
        fetch(`/docs/${activeDoc}`)
            .then((r) => {
                if (!r.ok) throw new Error("Not found")
                return r.text()
            })
            .then((md) => {
                const escaped = md.replace(/<([\w]+)>/g, '&lt;$1&gt;')
                setContent(marked.parse(escaped) as string)
                setLoading(false)
            })
            .catch(() => {
                setContent("<p>Failed to load document.</p>")
                setLoading(false)
            })
    }, [activeDoc])

    //useEffect(() => {
    //    if (!loading && contentRef.current) {
    //        mermaid.run({ querySelector: ".mermaid" }).catch(() => {})

    //        contentRef.current.querySelectorAll('a[href^="#"]').forEach((a) => {
    //            a.addEventListener("click", (e) => {
    //                e.preventDefault()
    //                historyRef.current.push(a as HTMLElement)
    //                const href = (a as HTMLAnchorElement).getAttribute("href")?.slice(1) || ""
    //                let target = document.getElementById(href)
    //                if (!target) {
    //                    const headings = contentRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6")
    //                    headings?.forEach((h) => {
    //                        if (!target && h.id && h.id === href) target = h as HTMLElement
    //                    })
    //                }
    //                if (target) target.scrollIntoView({ behavior: "smooth" })
    //            })
    //        })
    //    }
    //}, [content, loading])

	useEffect(() => {
        if (!loading && contentRef.current) {
            mermaid.run({ querySelector: ".mermaid" }).catch(() => {})

            contentRef.current.querySelectorAll("a").forEach((a) => {
                const href = (a as HTMLAnchorElement).getAttribute("href") || ""

                if (href.endsWith(".md")) {
                    a.addEventListener("click", (e) => {
                        e.preventDefault()
                        const name = href.split("/").pop() || ""
                        if (name) setActiveDoc(name)
                    })
                    return
                }

                if (href.startsWith("#")) {
                    a.addEventListener("click", (e) => {
                        e.preventDefault()
                        historyRef.current.push(a as HTMLElement)
                        const id = href.slice(1)
                        let target = document.getElementById(id)
                        if (!target) {
                            const headings = contentRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6")
                            headings?.forEach((h) => {
                                if (!target && h.id && h.id === id) target = h as HTMLElement
                            })
                        }
                        if (target) target.scrollIntoView({ behavior: "smooth" })
                    })
                }
            })
        }
    }, [content, loading])

    function goBack() {
        const last = historyRef.current.pop()
        if (last) last.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    return (
        <div className="min-h-screen bg-gray-900">
            <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex gap-3 items-center">
                <button
                    onClick={() => setActiveDoc("README.md")}
                    className={`px-3 py-1.5 rounded text-sm ${activeDoc === "README.md" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                    README
                </button>
                <button
                    onClick={() => setActiveDoc("API_DOC.md")}
                    className={`px-3 py-1.5 rounded text-sm ${activeDoc === "API_DOC.md" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                    API Documentation
                </button>
                <button
                    onClick={() => setActiveDoc("LICENSE.md")}
                    className={`px-3 py-1.5 rounded text-sm ${activeDoc === "LICENSE.md" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}
                >
                    LICENSE 
                </button>
                <a href="/" className="ml-auto text-gray-400 hover:text-white text-sm">← Back to App</a>
            </div>
            <div
                ref={contentRef}
                className="max-w-4xl mx-auto py-8 px-6 prose prose-invert prose-pre:bg-gray-800 prose-code:text-blue-300"
                dangerouslySetInnerHTML={{ __html: loading ? "Loading..." : content }}
            />
            <button
                onClick={goBack}
                className="fixed bottom-6 right-6 bg-gray-700 text-white px-3 py-2 rounded-full hover:bg-gray-600 text-sm shadow-lg"
            >
                ← Back
            </button>
        </div>
    )
}

