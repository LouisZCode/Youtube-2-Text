from dotenv import load_dotenv
from cerebras.cloud.sdk import AsyncCerebras
import os
import yaml

load_dotenv()

def load_prompts():
    with open("agents/prompts.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

prompts = load_prompts()
translate_prompt = prompts["TRANSLATE_PROMPT"]

client = AsyncCerebras(api_key=os.environ.get("CEREBRAS_API_KEY"))

async def translate(text: str, language: str) -> str:
    response = await client.chat.completions.create(
        model="llama-3.3-70b",
        messages=[
            {"role": "system", "content": translate_prompt},
            {"role": "user", "content": f"Translate the following to {language}:\n\n{text}"},
        ],
    )
    return response.choices[0].message.content
