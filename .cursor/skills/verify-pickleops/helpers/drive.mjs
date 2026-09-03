import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

function argValue({ args, flag }) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing value for ${flag}.`);
  return args[index + 1];
}

function collectSteps({ args }) {
  const steps = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--do") {
      if (index + 1 >= args.length) throw new Error("Missing value for --do.");
      steps.push(args[index + 1]);
    }
  }
  return steps;
}

async function runStep({ page, base, out, step }) {
  const parts = step.split("|");
  const op = parts[0];
  if (op === "goto") {
    const url = new URL(parts[1], base.endsWith("/") ? base : `${base}/`).toString();
    await page.goto(url);
    return `opened ${url}`;
  }
  if (op === "fill") {
    await page.getByLabel(parts[1]).and(page.locator("input, textarea")).first().fill(parts[2] ?? "");
    return `filled ${parts[1]}`;
  }
  if (op === "select") {
    await page.getByLabel(parts[1]).and(page.locator("select")).first().selectOption({ label: parts[2] });
    return `selected ${parts[2]} in ${parts[1]}`;
  }
  if (op === "click") {
    await page.getByRole(parts[1], { name: parts[2] }).first().click();
    return `clicked ${parts[1]} ${parts[2]}`;
  }
  if (op === "shot") {
    await page.screenshot({ path: `${out}/${parts[1]}` });
    return `saved ${parts[1]}`;
  }
  if (op === "aria") {
    const snapshot = await page.locator("body").ariaSnapshot();
    writeFileSync(`${out}/${parts[1]}`, snapshot);
    return `saved ${parts[1]}`;
  }
  if (op === "expect") {
    await page.getByText(parts[1]).first().waitFor({ state: "visible", timeout: 10000 });
    return `saw ${parts[1]}`;
  }
  if (op === "wait") {
    await page.waitForTimeout(Number(parts[1]));
    return `waited ${parts[1]}ms`;
  }
  throw new Error(`Unknown step op ${op}.`);
}

const args = process.argv.slice(2);
const base = argValue({ args, flag: "--base" });
const out = argValue({ args, flag: "--out" });
const steps = collectSteps({ args });
if (steps.length === 0) throw new Error("Pass at least one --do step.");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => {
  console.error(`pageerror: ${error.message}`);
});
try {
  if (!base.startsWith("http://localhost:") && !base.startsWith("http://127.0.0.1:")) {
    throw new Error(`Refusing to drive non-local base ${base}.`);
  }
  await page.goto(base.replace(/\/$/, "") + "/");
  for (const [index, step] of steps.entries()) {
    try {
      const note = await runStep({ page, base, out, step });
      console.log(`step ${index + 1}: ${note}`);
    } catch (error) {
      const shot = `${out}/failure-step-${index + 1}.png`;
      if (existsSync(out)) await page.screenshot({ path: shot }).catch(() => {});
      throw new Error(`Step ${index + 1} (${step}) failed: ${error.message}. Screenshot: ${shot}.`);
    }
  }
} finally {
  await browser.close();
}
console.log(`done: ${steps.length} steps, evidence in ${out}`);
