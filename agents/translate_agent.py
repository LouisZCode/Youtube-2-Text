import os
import yaml
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

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
        "provider": {
            "order": ["cerebras"],
            "allow_fallbacks": True,
        }
    },
)

async def translate(text: str, language: str) -> str:
    response = await model.ainvoke([
        {"role": "system", "content": translate_prompt},
        {"role": "user", "content": f"Translate the following to {language}:\n\n{text}"},
    ])
    return response.content
