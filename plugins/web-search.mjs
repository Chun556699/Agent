/** AgentDesk plugin: web search via DuckDuckGo lite HTML endpoint (no API key). */

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'").trim();
}

export default {
  id: "web-search",
  name: "Web Search",
  version: "1.0.0",
  tools: [
    {
      name: "web_search",
      description: "Search the web (DuckDuckGo). Returns titles, URLs and snippets.",
      danger: "safe",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number", default: 5 },
        },
        required: ["query"],
      },
      handler: async ({ query, limit = 5 }) => {
        const res = await fetch("https://lite.duckduckgo.com/lite/", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "AgentDesk/0.1" },
          body: `q=${encodeURIComponent(query)}`,
        });
        const html = await res.text();
        const results = [];
        const re = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
        let m;
        while ((m = re.exec(html)) && results.length < Math.min(limit, 10)) {
          results.push({
            url: decodeURIComponent(m[1].replace(/^\/\/duckduckgo.com\/l\/\?uddg=/, "").split("&")[0]),
            title: stripTags(m[2]),
            snippet: stripTags(m[3]),
          });
        }
        return { query, results };
      },
    },
  ],
};
