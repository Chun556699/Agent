/**
 * Tool registry. A tool definition:
 * {
 *   name, description, parameters (JSON Schema object),
 *   danger: "safe" | "confirm" | "dangerous",
 *   handler: async (args, ctx) => result
 * }
 * ctx: { runId, threadId, agentId, depth, emit, requestApproval, signal }
 */
const registry = new Map();

export function registerTool(def) {
  registry.set(def.name, def);
}

export function unregisterTools(prefix) {
  for (const name of [...registry.keys()]) if (name.startsWith(prefix)) registry.delete(name);
}

export function getTool(name) {
  return registry.get(name);
}

export function listTools(names) {
  const all = [...registry.values()];
  if (!names?.length) return all;
  return all.filter((t) => names.includes(t.name));
}

export function toolSpecs(names) {
  return listTools(names).map(({ name, description, parameters, danger }) => ({
    name, description, parameters, danger,
  }));
}
