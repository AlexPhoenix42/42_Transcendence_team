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

# Matches frontend-react/src/i18n/config.ts LOCALES. Any locale not listed
# here (e.g. "tlh") falls back to English, same fallback semantics as the
# frontend's own t() — never blank, never a language nobody asked for.
LANGUAGE_NAMES = {"en": "English", "nl": "Dutch", "ar": "Arabic", "he": "Hebrew"}


def _system_prompt(locale: str) -> str:
    language = LANGUAGE_NAMES.get(locale, "English")
    return f"""You are a trivia question generator for a board game.
Generate ONE multiple-choice question about human culture (history,
geography, art, science, literature, mythology). Respond with ONLY a JSON
object, no other text, in this exact shape:
{{"question": "...", "choices": ["...", "...", "...", "..."], "correct_index": 0}}
"correct_index" is the 0-based index of the correct answer in "choices".
Keep the question under 150 characters and each choice under 40 characters.
Write the question and all choices in {language}."""


# Only "en" is authored by hand. A locale with no bank here falls back to
# English in _pick_fallback — the same "never show the wrong language, show
# English instead" rule used everywhere else in this app's i18n.
FALLBACK_QUESTIONS = {
    "en": [
        {"question": "Which civilization built the pyramids of Giza?", "choices": ["The Egyptians", "The Romans", "The Mayans", "The Greeks"], "correct_index": 0},
        {"question": "Who painted the Mona Lisa?", "choices": ["Michelangelo", "Leonardo da Vinci", "Raphael", "Botticelli"], "correct_index": 1},
        {"question": "What is the longest river in the world?", "choices": ["The Nile", "The Amazon", "The Yangtze", "The Mississippi"], "correct_index": 0},
        {"question": "In what year did the French Revolution take place?", "choices": ["1789", "1804", "1848", "1776"], "correct_index": 0},
        {"question": "Which Greek philosopher wrote 'The Republic'?", "choices": ["Aristotle", "Socrates", "Plato", "Epicurus"], "correct_index": 2},
        {"question": "What is the capital of Japan?", "choices": ["Seoul", "Beijing", "Tokyo", "Bangkok"], "correct_index": 2},
        {"question": "Who composed the 9th Symphony?", "choices": ["Mozart", "Bach", "Beethoven", "Chopin"], "correct_index": 2},
        {"question": "Which ocean is the largest?", "choices": ["Atlantic", "Indian", "Arctic", "Pacific"], "correct_index": 3},
        {"question": "Who wrote 'Romeo and Juliet'?", "choices": ["Molière", "Shakespeare", "Victor Hugo", "Dante"], "correct_index": 1},
        {"question": "Which mythology features Zeus and Poseidon?", "choices": ["Norse", "Egyptian", "Greek", "Roman"], "correct_index": 2},
        {"question": "Which country gave the Statue of Liberty to the USA?", "choices": ["The United Kingdom", "France", "Spain", "Italy"], "correct_index": 1},
        {"question": "What is the largest mountain range in the world?", "choices": ["The Alps", "The Andes", "The Himalayas", "The Rockies"], "correct_index": 2},
        {"question": "Who formulated the theory of relativity?", "choices": ["Newton", "Einstein", "Galileo", "Bohr"], "correct_index": 1},
        {"question": "Which empire was led by Genghis Khan?", "choices": ["Ottoman", "Mongol", "Persian", "Byzantine"], "correct_index": 1},
        {"question": "In which country is Machu Picchu located?", "choices": ["Mexico", "Chile", "Peru", "Bolivia"], "correct_index": 2},
        {"question": "Which artist painted 'The Starry Night'?", "choices": ["Monet", "Van Gogh", "Degas", "Cézanne"], "correct_index": 1},
        {"question": "Which language has the most native speakers?", "choices": ["English", "Spanish", "Mandarin", "Hindi"], "correct_index": 2},
        {"question": "Who wrote 'The Odyssey'?", "choices": ["Homer", "Virgil", "Sophocles", "Ovid"], "correct_index": 0},
        {"question": "Which monument is located in Paris?", "choices": ["Big Ben", "The Colosseum", "The Eiffel Tower", "The Kremlin"], "correct_index": 2},
        {"question": "Which civilization invented cuneiform writing?", "choices": ["The Sumerians", "The Egyptians", "The Chinese", "The Phoenicians"], "correct_index": 0},
        {"question": "Who painted the ceiling of the Sistine Chapel?", "choices": ["Raphael", "Donatello", "Michelangelo", "Titian"], "correct_index": 2},
        {"question": "Which is the largest desert in the world?", "choices": ["Sahara", "Gobi", "Antarctic", "Kalahari"], "correct_index": 2},
        {"question": "Which French king was known as the 'Sun King'?", "choices": ["Louis XIV", "Louis XVI", "Francis I", "Henry IV"], "correct_index": 0},
        {"question": "Which epic tells the story of the Trojan War?", "choices": ["The Aeneid", "The Iliad", "The Divine Comedy", "The Metamorphoses"], "correct_index": 1},
        {"question": "Which country invented paper?", "choices": ["India", "Egypt", "China", "Greece"], "correct_index": 2},
        {"question": "Who sculpted 'The Thinker'?", "choices": ["Rodin", "Bernini", "Canova", "Brancusi"], "correct_index": 0},
        {"question": "Which is the oldest university still in operation?", "choices": ["Oxford", "Bologna", "Sorbonne", "Al Quaraouiyine"], "correct_index": 3},
        {"question": "Which people built Stonehenge?", "choices": ["The Celts", "The Vikings", "Neolithic Britons", "The Romans"], "correct_index": 2},
        {"question": "Which traditional dance comes from Argentina?", "choices": ["Flamenco", "Tango", "Salsa", "Samba"], "correct_index": 1},
        {"question": "Who wrote 'Don Quixote'?", "choices": ["Cervantes", "Lope de Vega", "Calderón", "Garcilaso"], "correct_index": 0},
    ],
}


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _pick_fallback(excluded_normalized: set[str], locale: str) -> dict:
    bank = FALLBACK_QUESTIONS.get(locale, FALLBACK_QUESTIONS["en"])
    pool = [q for q in bank if _normalize(q["question"]) not in excluded_normalized]
    if not pool:
        pool = bank
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


async def generate_question(excluded: list[str], locale: str = "en") -> dict:
    """Returns {"question", "choices" (4), "correct_index"}. Always succeeds —
    falls back to a local question bank if Ollama is unreachable or returns
    something unusable. `locale` is the asked player's UI language (one of
    LANGUAGE_NAMES); unrecognized locales are treated as English."""
    excluded_normalized = {_normalize(q) for q in excluded}

    try:
        client = AsyncClient(host=settings.OLLAMA_URL, timeout=4.0)
        for _ in range(2):
            avoid_list = "\n".join(f"- {q}" for q in excluded[-20:]) or "(none yet)"
            messages = [
                {"role": "system", "content": _system_prompt(locale)},
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

    return _pick_fallback(excluded_normalized, locale)
