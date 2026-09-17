# goose_game/wizard_service.py
#
# Generates the Grey Wizard's trivia questions. Tries Ollama first (same
# pattern as chess_coach/services.py) and asks for strict JSON; falls back
# to a static local question bank on any network error, bad JSON, or a
# near-duplicate of a question already asked in this game. This keeps the
# wizard encounter working even if the Ollama host is unreachable, unlike
# chess_coach which just surfaces an error to the user.

import json
import random

from django.conf import settings
from ollama import AsyncClient

SYSTEM_PROMPT = """You are a trivia question generator for a board game.
Generate ONE multiple-choice question about human culture (history,
geography, art, science, literature, mythology). Respond with ONLY a JSON
object, no other text, in this exact shape:
{"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0}
"correct_index" is the 0-based index of the correct answer in "choices".
Keep the question under 150 characters and each choice under 40 characters."""

FALLBACK_QUESTIONS = [
    {"question": "Quelle civilisation a construit les pyramides de Gizeh ?", "choices": ["Les Égyptiens", "Les Romains", "Les Mayas", "Les Grecs"], "correct_index": 0},
    {"question": "Qui a peint la Joconde ?", "choices": ["Michel-Ange", "Léonard de Vinci", "Raphaël", "Botticelli"], "correct_index": 1},
    {"question": "Quel est le plus long fleuve du monde ?", "choices": ["Le Nil", "L'Amazone", "Le Yangtsé", "Le Mississippi"], "correct_index": 0},
    {"question": "En quelle année a eu lieu la Révolution française ?", "choices": ["1789", "1804", "1848", "1776"], "correct_index": 0},
    {"question": "Quel philosophe grec a écrit 'La République' ?", "choices": ["Aristote", "Socrate", "Platon", "Épicure"], "correct_index": 2},
    {"question": "Quelle est la capitale du Japon ?", "choices": ["Séoul", "Pékin", "Tokyo", "Bangkok"], "correct_index": 2},
    {"question": "Qui a composé la 9ᵉ symphonie ?", "choices": ["Mozart", "Bach", "Beethoven", "Chopin"], "correct_index": 2},
    {"question": "Quel océan est le plus grand ?", "choices": ["Atlantique", "Indien", "Arctique", "Pacifique"], "correct_index": 3},
    {"question": "Qui a écrit 'Roméo et Juliette' ?", "choices": ["Molière", "Shakespeare", "Victor Hugo", "Dante"], "correct_index": 1},
    {"question": "Quelle mythologie parle de Zeus et Poséidon ?", "choices": ["Nordique", "Égyptienne", "Grecque", "Romaine"], "correct_index": 2},
    {"question": "Quel pays a offert la statue de la Liberté aux USA ?", "choices": ["Le Royaume-Uni", "La France", "L'Espagne", "L'Italie"], "correct_index": 1},
    {"question": "Quelle est la plus grande chaîne de montagnes du monde ?", "choices": ["Les Alpes", "Les Andes", "L'Himalaya", "Les Rocheuses"], "correct_index": 2},
    {"question": "Qui a formulé la théorie de la relativité ?", "choices": ["Newton", "Einstein", "Galilée", "Bohr"], "correct_index": 1},
    {"question": "Quel empire a été dirigé par Gengis Khan ?", "choices": ["Ottoman", "Mongol", "Perse", "Byzantin"], "correct_index": 1},
    {"question": "Dans quel pays se trouve le Machu Picchu ?", "choices": ["Mexique", "Chili", "Pérou", "Bolivie"], "correct_index": 2},
    {"question": "Quel artiste a peint 'La Nuit étoilée' ?", "choices": ["Monet", "Van Gogh", "Degas", "Cézanne"], "correct_index": 1},
    {"question": "Quelle langue est la plus parlée au monde (locuteurs natifs) ?", "choices": ["Anglais", "Espagnol", "Mandarin", "Hindi"], "correct_index": 2},
    {"question": "Qui a écrit 'L'Odyssée' ?", "choices": ["Homère", "Virgile", "Sophocle", "Ovide"], "correct_index": 0},
    {"question": "Quel monument se trouve à Paris ?", "choices": ["Big Ben", "Le Colisée", "La Tour Eiffel", "Le Kremlin"], "correct_index": 2},
    {"question": "Quelle civilisation a inventé l'écriture cunéiforme ?", "choices": ["Les Sumériens", "Les Égyptiens", "Les Chinois", "Les Phéniciens"], "correct_index": 0},
    {"question": "Qui a peint le plafond de la chapelle Sixtine ?", "choices": ["Raphaël", "Donatello", "Michel-Ange", "Le Titien"], "correct_index": 2},
    {"question": "Quel désert est le plus grand du monde ?", "choices": ["Sahara", "Gobi", "Antarctique", "Kalahari"], "correct_index": 2},
    {"question": "Quel roi français est dit 'Roi Soleil' ?", "choices": ["Louis XIV", "Louis XVI", "François Ier", "Henri IV"], "correct_index": 0},
    {"question": "Quelle épopée raconte la guerre de Troie ?", "choices": ["L'Énéide", "L'Iliade", "La Divine Comédie", "Les Métamorphoses"], "correct_index": 1},
    {"question": "Quel pays a inventé le papier ?", "choices": ["L'Inde", "L'Égypte", "La Chine", "La Grèce"], "correct_index": 2},
    {"question": "Qui a sculpté 'Le Penseur' ?", "choices": ["Rodin", "Bernin", "Canova", "Brancusi"], "correct_index": 0},
    {"question": "Quelle est la plus ancienne université encore en activité ?", "choices": ["Oxford", "Bologne", "Sorbonne", "Al Quaraouiyine"], "correct_index": 3},
    {"question": "Quel peuple a construit Stonehenge ?", "choices": ["Les Celtes", "Les Vikings", "Les Néolithiques britanniques", "Les Romains"], "correct_index": 2},
    {"question": "Quelle danse traditionnelle vient d'Argentine ?", "choices": ["Le Flamenco", "Le Tango", "La Salsa", "La Samba"], "correct_index": 1},
    {"question": "Qui a écrit 'Don Quichotte' ?", "choices": ["Cervantès", "Lope de Vega", "Calderón", "Garcilaso"], "correct_index": 0},
]


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _pick_fallback(excluded_normalized: set[str]) -> dict:
    pool = [q for q in FALLBACK_QUESTIONS if _normalize(q["question"]) not in excluded_normalized]
    if not pool:
        pool = FALLBACK_QUESTIONS
    return dict(random.choice(pool))


def _parse_question(raw: str) -> dict | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            return None
        try:
            data = json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            return None

    question = data.get("question")
    choices = data.get("choices")
    correct_index = data.get("correct_index")

    if not isinstance(question, str) or not question.strip():
        return None
    if not isinstance(choices, list) or len(choices) != 4:
        return None
    if not all(isinstance(c, str) and c.strip() for c in choices):
        return None
    if not isinstance(correct_index, int) or not (0 <= correct_index <= 3):
        return None

    return {"question": question.strip(), "choices": [c.strip() for c in choices], "correct_index": correct_index}


async def generate_question(excluded: list[str]) -> dict:
    """Returns {"question", "choices" (4), "correct_index"}. Always succeeds —
    falls back to a local question bank if Ollama is unreachable or returns
    something unusable."""
    excluded_normalized = {_normalize(q) for q in excluded}

    try:
        client = AsyncClient(host=settings.OLLAMA_URL, timeout=4.0)
        for _ in range(2):
            avoid_list = "\n".join(f"- {q}" for q in excluded[-20:]) or "(none yet)"
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Questions already asked, do not repeat these:\n{avoid_list}"},
            ]
            resp = await client.chat(model=settings.OLLAMA_MODEL, messages=messages, stream=False)
            parsed = _parse_question(resp["message"]["content"])
            if parsed and _normalize(parsed["question"]) not in excluded_normalized:
                return parsed
    except Exception:
        # Ollama being unreachable/slow/misconfigured must never break the
        # wizard encounter — always fall back to the local question bank.
        pass

    return _pick_fallback(excluded_normalized)
