/** AgentDesk plugin: read-only GitHub REST API. Uses GITHUB_TOKEN env when set. */

async function gh(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "AgentDesk/0.1",
    "x-github-api-version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export default {
  id: "github",
  name: "GitHub",
  version: "1.0.0",
  tools: [
    {
      name: "github_get_repo",
      description: "Get GitHub repository metadata (stars, description, default branch).",
      danger: "safe",
      parameters: {
        type: "object",
        properties: { repo: { type: "string", description: "owner/name" } },
        required: ["repo"],
      },
      handler: async ({ repo }) => {
        const r = await gh(`/repos/${encodeURIComponent(repo).replace("%2F", "/")}`);
        return {
          fullName: r.full_name, description: r.description, stars: r.stargazers_count,
          forks: r.forks_count, defaultBranch: r.default_branch, url: r.html_url,
        };
      },
    },
    {
      name: "github_list_issues",
      description: "List open issues/PRs for a repository (max 10).",
      danger: "safe",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string" },
          state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
          limit: { type: "number", default: 10 },
        },
        required: ["repo"],
      },
      handler: async ({ repo, state = "open", limit = 10 }) => {
        const items = await gh(
          `/repos/${encodeURIComponent(repo).replace("%2F", "/")}/issues?state=${state}&per_page=${Math.min(limit, 30)}`
        );
        return items.map((i) => ({
          number: i.number, title: i.title, isPr: !!i.pull_request, url: i.html_url,
        }));
      },
    },
    {
      name: "github_get_file",
      description: "Read a text file from a GitHub repository (max 50KB decoded).",
      danger: "safe",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["repo", "path"],
      },
      handler: async ({ repo, path, ref }) => {
        const f = await gh(
          `/repos/${encodeURIComponent(repo).replace("%2F", "/")}/contents/${encodeURIComponent(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`
        );
        if (f.type !== "file") throw new Error("Not a file");
        const content = Buffer.from(f.content, "base64").toString("utf8").slice(0, 50 * 1024);
        return { path: f.path, sha: f.sha, content };
      },
    },
  ],
};
