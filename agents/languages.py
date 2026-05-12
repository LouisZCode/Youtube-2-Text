LANG_ISO_TO_NAME = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "pt": "Portuguese", "it": "Italian", "ja": "Japanese", "ko": "Korean",
    "zh": "Chinese", "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese",
    "ru": "Russian", "ar": "Arabic", "hi": "Hindi", "nl": "Dutch", "pl": "Polish",
    "tr": "Turkish", "sv": "Swedish", "vi": "Vietnamese", "th": "Thai",
    "id": "Indonesian", "uk": "Ukrainian", "cs": "Czech", "ro": "Romanian",
    "el": "Greek", "hu": "Hungarian", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian", "he": "Hebrew", "ms": "Malay", "fil": "Filipino",
}


def resolve_language_name(language: str) -> str:
    """Resolve an ISO language code to its English display name.

    Falls back to the input string when unknown — keeps the BE
    permissive enough to accept either ISO codes or display names,
    so FE/BE deploys don't need to land atomically.
    """
    if language in LANG_ISO_TO_NAME:
        return LANG_ISO_TO_NAME[language]
    return LANG_ISO_TO_NAME.get(language.split("-")[0], language)
