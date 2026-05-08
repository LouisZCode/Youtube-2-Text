"""Smoke test: verify OpenRouter responds via langchain ChatOpenAI.

Usage: uv run python scripts/smoke_openrouter.py

Reads OPENROUTER_API_KEY and OPENROUTER_TRANSLATE_MODEL from .env.
Temporary file — delete before merging to main.
"""
import asyncio
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

model_name = os.getenv("OPENROUTER_TRANSLATE_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")

model = ChatOpenAI(
    model=model_name,
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

async def main():
    response = await model.ainvoke([
        {"role": "system", "content": "You translate text. Output only the translation, no preamble."},
        {"role": "user", "content": "Translate to French:\n\nHello, how are you today?"},
    ])
    print(f"Model: {model_name}")
    print(f"Response: {response.content}")

if __name__ == "__main__":
    asyncio.run(main())
