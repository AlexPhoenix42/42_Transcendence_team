"""
DeepL translation utility for chat messages.
Reads the API key from a mounted secrets file (never from env vars).
"""

# django/chat/translate.py

import json
import logging
import urllib.request
import urllib.parse
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the mounted secrets file containing the DeepL API key
DEEPL_KEY_FILE = Path("/run/secrets/deepl_api_key")

# DeepL Free API endpoint (use api.deepl.com for paid plans)
DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"

# Map our language codes to DeepL's expected codes
# DeepL doesn't support Klingon (tlh), so we skip translation for it
LANG_TO_DEEPL = {
    "en": "EN",
    "fr": "FR",
    "nl": "NL",
    "ar": "AR",
    "he": "HE",
    # "tlh" is not supported by DeepL — no translation possible
}


def _get_api_key() -> str | None:
    """Read the DeepL API key from the mounted secrets file."""
    try:
        return DEEPL_KEY_FILE.read_text().strip()
    except FileNotFoundError:
        logger.error("DeepL API key file not found at %s", DEEPL_KEY_FILE)
        return None


def translate(text: str, source_lang: str | None, target_lang: str) -> str | None:
    """
    Translate text to target_lang using DeepL.
    source_lang=None lets DeepL auto-detect.
    Returns translated text, or None if translation fails.
    """
    deepl_target = LANG_TO_DEEPL.get(target_lang)
    if not deepl_target:
        return None

    api_key = _get_api_key()
    if not api_key:
        return None

    try:
        params = {
            "text": text,
            "target_lang": deepl_target,
        }
        if source_lang:
            deepl_source = LANG_TO_DEEPL.get(source_lang)
            if deepl_source:
                params["source_lang"] = deepl_source

        data = urllib.parse.urlencode(params).encode("utf-8")

        req = urllib.request.Request(
            DEEPL_API_URL,
            data=data,
            headers={
                "Authorization": f"DeepL-Auth-Key {api_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["translations"][0]["text"]

    except Exception:
        logger.exception("DeepL translation failed")
        return None

