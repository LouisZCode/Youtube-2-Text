import os
import yaml
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import ChatOpenAI
from langfuse import observe, propagate_attributes
from langfuse.langchain import CallbackHandler

from agents.languages import resolve_language_name

def load_prompts():
    with open("agents/prompts.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

prompts = load_prompts()
translate_prompt = prompts["TRANSLATE_PROMPT"]

model = ChatOpenAI(
    model=os.getenv("OPENROUTER_TRANSLATE_MODEL", "nvidia/nemotron-3-super-120b-a12b:free"),
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

@observe(name="translate")
async def translate(text: str, language: str) -> str:
    language_name = resolve_language_name(language)
    with propagate_attributes(tags=[f"language:{language}"]):
        response = await model.ainvoke(
            [
                {"role": "system", "content": translate_prompt},
                {"role": "user", "content": f"Translate the following to {language_name}:\n\n{text}"},
            ],
            config={"callbacks": [langfuse_handler]},
        )
    return response.content
