# django/chess_coach/services.py

from django.conf import settings
from ollama import AsyncClient

SYSTEM_PROMPT = """You are a chess coach for an online chess platform.
You ONLY answer questions related to chess, positions, strategy, openings,
tactics, rules, famous players, chess history, and game analysis.
If someone asks about anything else, politely redirect them:
"I'm a chess coach! I can only help you with chess related question."
Keep responses to 2-3 sentences unless the user asks for more detail."""

async def ask_coach(
        question    : str, 
        new_fen     : str | None = None, 
        old_fen     : str | None = None, 
        eval_info   : str | None = None) -> dict[str, str]:
    ctx = ""
    if  old_fen:
        ctx = f"\nPosition before move (FEN): {old_fen}"
    if  new_fen:
        ctx += f"\nPosition after move (FEN): {new_fen}"
    if  eval_info:
        ctx += f"\nEngine analysis: {eval_info}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{ctx}\n\nQUESTION: {question}"},
    ]

    try:
        client  = AsyncClient(host=settings.OLLAMA_URL, timeout=60.0)
        resp    = await client.chat(
            model=settings.OLLAMA_MODEL,
            messages=messages,
            stream=False,
        )

        return {"type": "coach", "message": resp["message"]["content"]}

    except (ConnectionError, TimeoutError, OSError):
        return {"type": "error", "message": "Chess coach is offline right now."}


async def ask_coach_stream(
        question    : str, 
        new_fen     : str | None = None, 
        old_fen     : str | None = None, 
        eval_info   : str | None = None):
    ctx = ""
    if  old_fen:
        ctx = f"\nPosition before move (FEN): {old_fen}"
    if  new_fen:
        ctx += f"\nPosition after move (FEN): {new_fen}"
    if  eval_info:
        ctx += f"\nEngine analysis: {eval_info}"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{ctx}\n\nQUESTION: {question}"},
    ]

    client = AsyncClient(host=settings.OLLAMA_URL, timeout=60.0)
    async for chunk in await client.chat(
        model=settings.OLLAMA_MODEL,
        messages=messages,
        stream=True,
    ):
        yield chunk["message"]["content"]

