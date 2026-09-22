export type Provider = {
  id: string;
  label: string;
  format: string;
  baseUrl: string | null;
  keyRequired: boolean;
  models: string[];
  blurb?: string;
  enabled: boolean;
  hasKey: boolean;
  configured: boolean;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | null;
  model?: { providerId?: string; model?: string };
  builtin?: boolean;
};

export type Thread = {
  id: string;
  title: string;
  agentId: string;
  runCount: number;
  hasSummary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  threadId: string;
  runId: string | null;
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: { id: string; name: string; arguments: unknown }[] | null;
  toolCallId: string | null;
  name: string | null;
  createdAt: string;
};

export type Run = {
  id: string;
  thread_id?: string;
  parent_run_id: string | null;
  depth: number;
  agent_id: string;
  status: string;
  provider_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  ended_at: string | null;
};

export type ToolSpec = {
  name: string;
  description: string;
  parameters: unknown;
  danger: "safe" | "confirm" | "dangerous";
};

export type PluginEntry = {
  id: string;
  kind: "module" | "mcp";
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  tools?: string[];
  spec?: { command: string; args: string[]; env?: Record<string, string> };
};

export type InstalledPlugin = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  installedAt: string;
};

export type MemoryItem = {
  id: string;
  content: string;
  tags: string;
  created_at: string;
};

export type RunEvent = {
  seq?: number;
  type: string;
  runId?: string;
  delta?: string;
  content?: string;
  toolCallId?: string;
  name?: string;
  args?: unknown;
  ok?: boolean;
  result?: unknown;
  error?: string;
  approvalId?: string;
  tool?: string;
  danger?: string;
  approved?: boolean;
  childRunId?: string;
  agentId?: string;
  agentName?: string;
  task?: string;
  status?: string;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  providerId?: string;
  depth?: number;
  [k: string]: unknown;
};
