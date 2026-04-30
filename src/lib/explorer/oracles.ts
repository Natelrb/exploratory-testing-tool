// Oracle runners — deterministic verification of acceptance criteria.
//
// Each oracle takes a Playwright Page (and a context with console/network
// observations gathered during the AC's "when" phase) and returns a verdict.
// The judge oracle is the escape hatch — uses the AI provider, only when no
// deterministic oracle fits.

import type { Page } from "playwright";
import type {
  Oracle,
  DOMOracle,
  URLOracle,
  ConsoleOracle,
  NetworkOracle,
  JudgeOracle,
  ConsoleMessage,
  NetworkResponse,
} from "./types";
import type { AIProvider } from "@/lib/ai/types";

export interface OracleContext {
  page: Page;
  // Messages/responses captured during the AC's "when" phase only.
  consoleMessages: ConsoleMessage[];
  networkResponses: NetworkResponse[];
  aiProvider?: AIProvider;
  judgeContext?: string; // last screenshot path / DOM snippet for judge
}

export interface OracleResult {
  passed: boolean;
  reason: string;
}

export async function runOracle(oracle: Oracle, ctx: OracleContext): Promise<OracleResult> {
  try {
    switch (oracle.kind) {
      case "dom":
        return await runDom(oracle, ctx);
      case "url":
        return runUrl(oracle, ctx);
      case "console":
        return runConsole(oracle, ctx);
      case "network":
        return runNetwork(oracle, ctx);
      case "judge":
        return await runJudge(oracle, ctx);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { passed: false, reason: `Oracle threw: ${msg}` };
  }
}

async function runDom(o: DOMOracle, { page }: OracleContext): Promise<OracleResult> {
  const locator = page.locator(o.selector);
  const count = await locator.count().catch(() => 0);

  switch (o.check) {
    case "exists": {
      return count > 0
        ? { passed: true, reason: `Found ${count} element(s) matching '${o.selector}'` }
        : { passed: false, reason: `No element matches '${o.selector}'` };
    }
    case "visible": {
      if (count === 0) return { passed: false, reason: `Selector '${o.selector}' not in DOM` };
      const visible = await locator.first().isVisible().catch(() => false);
      return visible
        ? { passed: true, reason: `'${o.selector}' is visible` }
        : { passed: false, reason: `'${o.selector}' exists but is not visible` };
    }
    case "hidden": {
      if (count === 0) return { passed: true, reason: `'${o.selector}' is not in DOM (hidden)` };
      const visible = await locator.first().isVisible().catch(() => false);
      return !visible
        ? { passed: true, reason: `'${o.selector}' is hidden` }
        : { passed: false, reason: `'${o.selector}' is visible (expected hidden)` };
    }
    case "text-equals": {
      if (count === 0) return { passed: false, reason: `No element matches '${o.selector}'` };
      const actual = (await locator.first().textContent().catch(() => "")) ?? "";
      const expected = String(o.value ?? "");
      return actual.trim() === expected.trim()
        ? { passed: true, reason: `text matches '${expected}'` }
        : { passed: false, reason: `text was '${actual.trim().slice(0, 200)}', expected '${expected}'` };
    }
    case "text-contains": {
      if (count === 0) return { passed: false, reason: `No element matches '${o.selector}'` };
      const actual = (await locator.first().textContent().catch(() => "")) ?? "";
      const expected = String(o.value ?? "");
      return actual.includes(expected)
        ? { passed: true, reason: `text contains '${expected}'` }
        : { passed: false, reason: `text '${actual.trim().slice(0, 200)}' does not contain '${expected}'` };
    }
    case "count-equals": {
      const expected = Number(o.value ?? 0);
      return count === expected
        ? { passed: true, reason: `count is ${expected}` }
        : { passed: false, reason: `count is ${count}, expected ${expected}` };
    }
    case "count-at-least": {
      const expected = Number(o.value ?? 1);
      return count >= expected
        ? { passed: true, reason: `count is ${count} (>= ${expected})` }
        : { passed: false, reason: `count is ${count}, expected at least ${expected}` };
    }
  }
}

function runUrl(o: URLOracle, { page }: OracleContext): OracleResult {
  const url = page.url();
  let re: RegExp;
  try {
    re = new RegExp(o.pattern, o.flags);
  } catch (err) {
    return { passed: false, reason: `Invalid URL pattern: ${o.pattern}` };
  }
  return re.test(url)
    ? { passed: true, reason: `URL '${url}' matches /${o.pattern}/${o.flags ?? ""}` }
    : { passed: false, reason: `URL '${url}' does not match /${o.pattern}/${o.flags ?? ""}` };
}

function runConsole(o: ConsoleOracle, { consoleMessages }: OracleContext): OracleResult {
  switch (o.check) {
    case "no-errors": {
      const errors = consoleMessages.filter((m) => m.type === "error");
      return errors.length === 0
        ? { passed: true, reason: "No console errors during action window" }
        : { passed: false, reason: `${errors.length} console error(s): ${errors.slice(0, 3).map((e) => e.text.slice(0, 120)).join(" | ")}` };
    }
    case "no-warnings": {
      const warns = consoleMessages.filter((m) => m.type === "warn");
      return warns.length === 0
        ? { passed: true, reason: "No console warnings during action window" }
        : { passed: false, reason: `${warns.length} console warning(s): ${warns.slice(0, 3).map((e) => e.text.slice(0, 120)).join(" | ")}` };
    }
    case "contains": {
      const needle = o.value ?? "";
      const found = consoleMessages.some((m) => m.text.includes(needle));
      return found
        ? { passed: true, reason: `Console output contains '${needle}'` }
        : { passed: false, reason: `Console output does not contain '${needle}'` };
    }
  }
}

function runNetwork(o: NetworkOracle, { networkResponses }: OracleContext): OracleResult {
  let re: RegExp;
  try {
    re = new RegExp(o.urlPattern);
  } catch {
    return { passed: false, reason: `Invalid network URL pattern: ${o.urlPattern}` };
  }
  const [lo, hi] = o.statusRange ?? [200, 299];

  const matching = networkResponses.filter((r) => re.test(r.url));
  if (matching.length === 0) {
    return { passed: false, reason: `No requests matched /${o.urlPattern}/ in window` };
  }
  const inRange = matching.filter((r) => r.status >= lo && r.status <= hi);
  if (inRange.length === 0) {
    const sample = matching.slice(0, 3).map((r) => `${r.status} ${r.url.slice(0, 80)}`).join(" | ");
    return { passed: false, reason: `${matching.length} request(s) matched but none had status in ${lo}-${hi}: ${sample}` };
  }
  return { passed: true, reason: `${inRange.length}/${matching.length} request(s) matched with status ${lo}-${hi}` };
}

async function runJudge(o: JudgeOracle, ctx: OracleContext): Promise<OracleResult> {
  if (!ctx.aiProvider) {
    return { passed: false, reason: "Judge oracle requires an AI provider (none available)" };
  }

  // Capture observable state for the judge.
  const url = ctx.page.url();
  const title = await ctx.page.title().catch(() => "");
  const bodyText = await ctx.page
    .evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "")
    .catch(() => "");

  const observations = [
    `URL: ${url}`,
    `Title: ${title}`,
    `Visible text (truncated): ${bodyText}`,
    `Console errors in window: ${ctx.consoleMessages.filter((m) => m.type === "error").length}`,
  ];

  const issues = await ctx.aiProvider.identifyIssues(observations, `Judge rubric: ${o.rubric}`);
  // The judge oracle uses identifyIssues as its underlying call — if any
  // critical/high issue surfaces, the AC fails. This is intentionally crude
  // and meant to be replaced with a dedicated judge prompt later.
  const blockers = issues.filter((i) => i.severity === "critical" || i.severity === "high");
  if (blockers.length === 0) {
    return { passed: true, reason: `Judge found no blocking issues against rubric` };
  }
  return {
    passed: false,
    reason: `Judge flagged: ${blockers.map((b) => b.title).slice(0, 2).join("; ")}`,
  };
}

export function describeOracle(o: Oracle): string {
  switch (o.kind) {
    case "dom":
      return `DOM ${o.check} '${o.selector}'${o.value !== undefined ? ` = ${JSON.stringify(o.value)}` : ""}`;
    case "url":
      return `URL matches /${o.pattern}/${o.flags ?? ""}`;
    case "console":
      return `Console ${o.check}${o.value ? ` '${o.value}'` : ""}`;
    case "network":
      return `Network ${o.method ?? "*"} /${o.urlPattern}/ → ${o.statusRange?.join("-") ?? "200-299"}`;
    case "judge":
      return `LLM judge: ${o.rubric.slice(0, 80)}${o.rubric.length > 80 ? "..." : ""}`;
  }
}
