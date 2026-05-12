import os
import yaml
from dotenv import load_dotenv

load_dotenv()

from langchain_openai import ChatOpenAI
from langfuse import observe, propagate_attributes
from langfuse.langchain import CallbackHandler

from agents.languages import resolve_language_name


def load_prompts():
    """Load all prompts from prompts.yaml file"""
    with open("agents/prompts.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


prompts = load_prompts()
summary_prompt = prompts["SUMMARIZE_PROMPT"]

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
    language_name = resolve_language_name(language)
    with propagate_attributes(tags=[f"language:{language}"]):
        response = await model.ainvoke(
            [
                {"role": "system", "content": summary_prompt.format(language=language_name)},
                {"role": "user", "content": text},
            ],
            config={"callbacks": [langfuse_handler]},
        )
    return response.content
