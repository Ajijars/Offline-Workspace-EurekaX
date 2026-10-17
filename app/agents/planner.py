"""
Agent Planner Node.

Generates a step-by-step execution plan based on the user query and intent.
The planner sits between the supervisor and the specialized agents, breaking
down complex queries into actionable steps.
"""

import json
import logging
import re
from datetime import datetime, timezone

from app.agents.state import AgentState
from app.services.llm_service import ollama_service

logger = logging.getLogger(__name__)

_PLANNER_PROMPT = """\
You are an AI planner for a multi-agent system.
The user has asked a query, and the supervisor has classified it as intent: {intent}.

User query: {query}

Break down the exact steps the specialized agent should take to fulfill this request.
Keep the steps concise and actionable.

Respond with a JSON array of strings, nothing else:
["Step 1 description", "Step 2 description", ...]
"""

async def planner_node(state: AgentState) -> AgentState:
    """
    Planner node: decomposes query into a plan.
    """
    query = state["user_query"]
    intent = state.get("intent", "general")

    # If it's a very simple general query, skip planning to save time.
    if intent == "general" and len(query.split()) < 10:
        state["plan"] = ["Answer the user directly."]
        return state

    logger.info(f"[Planner] Generating plan for intent: {intent}")

    step = {
        "agent": "planner",
        "action": "generate_plan",
        "result": "planning...",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        prompt = _PLANNER_PROMPT.format(query=query, intent=intent)
        result = await ollama_service.generate(
            prompt=prompt,
            temperature=0.0,
        )
        raw = result["response"].strip()

        # Extract JSON array
        json_match = re.search(r'\[.*?\]', raw, re.DOTALL)
        if json_match:
            plan = json.loads(json_match.group())
            if isinstance(plan, list):
                state["plan"] = [str(p) for p in plan]
            else:
                state["plan"] = ["Execute the requested operation."]
        else:
            state["plan"] = ["Execute the requested operation."]

        step["result"] = f"Generated {len(state['plan'])} step plan."
        logger.info(f"[Planner] Plan generated: {state['plan']}")

    except Exception as e:
        logger.error(f"[Planner] Failed to generate plan: {e}")
        state["plan"] = ["Execute the requested operation."]
        step["result"] = "Failed to generate plan."

    # Append the planning step to the execution trace
    state.setdefault("agent_steps", []).append(step)

    return state
