from typing import Any
import json


def load_config(path: str) -> dict[str, Any]:
    if not path.endswith(".json"):
        raise ValueError("Configuration file must be a .json file.")

    text: str = ""
    comment: bool = False
    try:
        with open(path, 'r', encoding="utf-8") as file:
            for line in file:
                stripped = line.strip()

                if stripped.startswith("/*"):
                    comment = True

                if comment:
                    if stripped.endswith("*/"):
                        comment = False
                    continue

                if stripped.startswith('#'):
                    continue

                if stripped.startswith("//"):
                    continue
                
                text += line
    except FileNotFoundError:
        raise ValueError(f"File '{path}' was not found.")

    except PermissionError:
        raise ValueError(f"Cannot read file '{path}'.")

    try:
        config: dict[str, Any] = json.loads(text)
        score = config.get("highscore_filename", "score.json")
        if not (
            isinstance(score, str)
            and len(score) > 5
            and score.endswith(".json")
        ):
            score = "highscores.json"
        try:
            with open(score, 'r', encoding='utf-8') as file:
                ...
        except Exception as e:
            with open(score, 'w', encoding="utf-8") as file:
                json.dump([], file, indent=4)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON: {error}")
    return config 
    





    
 
            




