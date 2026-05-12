import os
import yaml
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import ChatOpenAI
from langfuse import observe, propagate_attributes
from langfuse.langchain import CallbackHandler


def load_prompts():
    """Load all prompts from prompts.yaml file"""
    with open("agents/prompts.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


prompts = load_prompts()
summary_prompt = prompts["SUMMARIZE_PROMPT"]

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


def _resolve_language_name(language: str) -> str:
    if language in LANG_ISO_TO_NAME:
        return LANG_ISO_TO_NAME[language]
    return LANG_ISO_TO_NAME.get(language.split("-")[0], language)


model = ChatOpenAI(
    model=os.getenv("OPENROUTER_SUMMARY_MODEL", "openai/gpt-oss-120b"),
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    extra_body={
        "usage": {"include": True},
        "provider": {
            "order": ["cerebras"],
            "allow_fallbacks": True,
        },
    },
)

langfuse_handler = CallbackHandler()


@observe(name="summarize")
async def summarize(text: str, language: str = "en") -> str:
    language_name = _resolve_language_name(language)
    with propagate_attributes(tags=[f"language:{language}"]):
        response = await model.ainvoke(
            [
                {"role": "system", "content": summary_prompt.format(language=language_name)},
                {"role": "user", "content": text},
            ],
            config={"callbacks": [langfuse_handler]},
        )
    return response.content
