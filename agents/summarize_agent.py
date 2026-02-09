from dotenv import load_dotenv

from langchain_core.prompts import prompt
import yaml

load_dotenv()

from langchain.agents import create_agent

def load_prompts():
    """Load all prompts from prompts.yaml file"""
    with open("agents/prompts.yaml", "r", encoding="utf-8") as f:
        prompts = yaml.safe_load(f)
    return prompts

prompts = load_prompts()
summary_prompt = prompts["SUMMARIZE_PROMPT"]

summary_agent = create_agent(
    model="openai:gpt-5-nano-2025-08-07",
    system_prompt=summary_prompt
)



# to test  python -m agents.summarize_agent
"""
message = input("Write your ticker here:\n")

response = summary_agent.invoke(
    {"messages" : {"role" : "user" , "content" : message}}
    )

for i , msg in enumerate(response["messages"]):
    msg.pretty_print()
"""