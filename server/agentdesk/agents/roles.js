import { q } from "../db.js";
import { newId } from "../crypto.js";

/**
 * Specialist agents. `tools` limits the exposed tool surface; `model` holds a
 * default { providerId, model } that runs may override.
 */
export const BUILTIN_AGENTS = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Default agent. Plans, uses every enabled tool, and delegates to specialist sub-agents.",
    systemPrompt: `You are the Orchestrator of AgentDesk, a local agent work platform.
You answer directly when you can, use tools when they help, and delegate substantial
subtasks to specialist sub-agents with the spawn_agent tool (researcher, coder,
writer, analyst). When you use several sub-agents, prefer spawning them in one turn
so they run in parallel. Always tell the user what you did and where outputs landed.`,
    tools: null, // all enabled tools
    builtin: true,
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Gathers and verifies information: web fetch, knowledge search, memory.",
    systemPrompt: `You are a research sub-agent. Gather accurate, sourced information.
Summarize findings clearly with sources when available. Keep answers focused on the task.`,
    tools: ["http_fetch", "knowledge_search", "memory_search", "get_current_datetime", "web_search"],
    builtin: true,
  },
  {
    id: "coder",
    name: "Coder",
    description: "Writes and runs code in the workspace: files, shell, calculator.",
    systemPrompt: `You are a coding sub-agent working in a sandboxed workspace directory.
Write clean, minimal code. Verify work by running it. Report files created and results.`,
    tools: ["read_file", "write_file", "list_directory", "run_shell_command", "calculator", "get_current_datetime"],
    builtin: true,
  },
  {
    id: "writer",
    name: "Writer",
    description: "Drafts and refines written content.",
    systemPrompt: `You are a writing sub-agent. Produce clear, well-structured prose
tailored to the task. Prefer concise, skimmable output.`,
    tools: ["read_file", "write_file", "list_directory", "memory_search"],
    builtin: true,
  },
  {
    id: "analyst",
    name: "Analyst",
    description: "Analyzes data: calculations, file inspection, summarization.",
    systemPrompt: `You are an analyst sub-agent. Be rigorous: inspect the data, compute
when needed, and state assumptions. Output findings with numbers.`,
    tools: ["calculator", "read_file", "list_directory", "knowledge_search"],
    builtin: true,
  },
];

export function listAgents() {
  const custom = q
    .all("SELECT * FROM agents ORDER BY created_at")
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      systemPrompt: r.system_prompt,
      tools: JSON.parse(r.tools_json),
      model: JSON.parse(r.model_json),
      builtin: false,
    }));
  return [...BUILTIN_AGENTS, ...custom];
}

export function getAgent(id) {
  return listAgents().find((a) => a.id === id);
}

export function createAgent({ name, description = "", systemPrompt, tools = [], model = {} }) {
  const id = newId("agent");
  q.run(
    `INSERT INTO agents (id, name, description, system_prompt, tools_json, model_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, name, description, systemPrompt, JSON.stringify(tools), JSON.stringify(model)
  );
  return getAgent(id);
}

export function deleteAgent(id) {
  const agent = getAgent(id);
  if (!agent) return;
  if (agent.builtin) throw Object.assign(new Error("Cannot delete a built-in agent"), { status: 400 });
  q.run("DELETE FROM agents WHERE id = ?", id);
}
