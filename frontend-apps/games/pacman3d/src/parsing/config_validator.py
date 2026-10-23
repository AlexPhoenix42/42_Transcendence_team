from typing import Any



def config_validator(config: dict[str, Any]) -> dict[str, Any]:
    bases_keys: list[str] = [
        "lives",
        "width",
        "height",
        "points_per_pacgum",
        "points_per_super_pacgum",
        "points_per_ghost",
        "max_levels",
        "level_max_time"
    ]

    defaults: dict[str, Any] = { 
        "lives": 3,
        "width": 17, 
        "height": 17,
        "points_per_pacgum": 10,
        "points_per_super_pacgum": 50,
        "points_per_ghost": 200,
        "max_levels": 255,
        "level_max_time": 240,
        "highscore_filename": "highscores.json"
    }

    res: dict[str, Any] = {}

    for key, value in config.items():
        if key not in bases_keys:
            continue 
        if isinstance(value, int) and not isinstance(value, bool):
            res[key] = value

    for key, value in res.items():
        if key == "lives":
            if not(0 < value <= 999):
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]
        if key == "width":
            if not(17 <= value <= 50):
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]
        if key == "height":
            if not(17 <= value <= 50):
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]
        if key in ["points_per_pacgum", "points_per_super_pacgum", "points_per_ghost"]:
            if not (0 <= value <= 1000):
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]
        if key == "max_levels":
            if not(10 <= value <= 255):
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]
        if key == "level_max_time":
            if value <= 0:
                print(
                    f"Invalid value for '{key}': {value}. "
                    f"Using default: {defaults[key]}"
                )
                res[key] = defaults[key]

    if "highscore_filename" in config:
        filename = config["highscore_filename"]
        if (
            isinstance(filename, str)
            and len(filename) > 5
            and filename.endswith(".json")
        ):
            res["highscore_filename"] = filename
        else:
            print(
                "Invalid value for 'highscore_filename': "
                f"{filename}. "
                f"Using default: {defaults['highscore_filename']}"
            )
            res["highscore_filename"] = defaults["highscore_filename"]

    for key, value in defaults.items():
        if key not in res.keys():
            print(
                f"Missing key '{key}'. "
                f"Using default: {value}"
            )
            res[key] = value 

    return res
