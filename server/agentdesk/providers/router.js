import { HttpError } from "../http.js";

/**
 * "Auto" smart routing: pick a provider+model for the task from what is
 * actually configured. Heuristic scoring only — deterministic and cheap.
 * `providers` is the listProviders() shape (enabled/configured/options/models).
 */
export function autoRoute(task, providers) {
  const ready = providers.filter((p) => p.enabled && p.configured);
  const real = ready.filter((p) => p.id !== "mock");
  const pool = real.length ? real : ready;
  if (!pool.length) throw new HttpError(400, "No configured provider for auto routing");

  const t = (task ?? "").toLowerCase();
  const model = (p) => p.options?.models?.[0] ?? p.models?.[0];
  const pick = (...ids) => {
    const p = pool.find((x) => ids.includes(x.id));
    return p && model(p) ? p : undefined;
  };

  const chosen =
    (/translat|翻译|译成|translate/i.test(t) && pick("qwen", "custom")) ||
    (/\bmath|calc|计算|算术|方程|\d+\s*[-+*/^]\s*\d+/.test(t) &&
      pick("deepseek", "custom", "openai", "anthropic")) ||
    (/code|代码|debug|报错|bug|修复|函数|编程|\.js|\.py|\.ts/.test(t) &&
      pick("anthropic", "deepseek", "custom", "openai")) ||
    pick("openrouter", "custom", "openai", "anthropic", "deepseek") ||
    pool.find((p) => model(p));

  if (!chosen) {
    throw new HttpError(400, "Auto routing: no configured provider has a model — set models in the Providers page");
  }
  return { providerId: chosen.id, model: model(chosen) };
}
