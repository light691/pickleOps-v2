import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

function argValue({ args, flag }) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing value for ${flag}.`);
  return args[index + 1];
}

const TOKEN = String(Date.now()).slice(-6);

function subToken({ value }) {
  return value.replaceAll("{ts}", TOKEN);
}

async function runStep({ page, base, out, step, timeout }) {
  const parts = subToken({ value: step }).split("|");
  const op = parts[0];
  if (op === "goto") {
    const url = new URL(parts[1], base.endsWith("/") ? base : `${base}/`).toString();
    await page.goto(url, { timeout });
    return `opened ${url}`;
  }
  if (op === "fill") {
    await page.getByLabel(parts[1]).and(page.locator("input, textarea")).first().fill(parts[2] ?? "", { timeout });
    return `filled ${parts[1]}`;
  }
  if (op === "select") {
    await page.getByLabel(parts[1]).and(page.locator("select")).first().selectOption({ label: parts[2] }, { timeout });
    return `selected ${parts[2]} in ${parts[1]}`;
  }
  if (op === "click") {
    await page.getByRole(parts[1], { name: parts[2] }).first().click({ timeout });
    return `clicked ${parts[1]} ${parts[2]}`;
  }
  if (op === "clickin") {
    await page.locator(`[aria-label="${parts[1]}"]`).getByRole(parts[2], { name: parts[3] }).first().click({ timeout });
    return `clicked ${parts[2]} ${parts[3]} within ${parts[1]}`;
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
    await page.getByText(parts[1]).first().waitFor({ state: "visible", timeout });
    return `saw ${parts[1]}`;
  }
  if (op === "expectnot") {
    await page.getByText(parts[1]).first().waitFor({ state: "detached", timeout });
    return `absent ${parts[1]}`;
  }
  if (op === "theme") {
    await page.evaluate((next) => {
      window.localStorage.setItem("pickleops.theme", next);
    }, parts[1]);
    await page.reload();
    return `theme ${parts[1]}`;
  }
  if (op === "wait") {
    await page.waitForTimeout(Number(parts[1]));
    return `waited ${parts[1]}ms`;
  }
  throw new Error(`Unknown step op ${op}.`);
}

const args = process.argv.slice(2);
const base = argValue({ args, flag: "--base" });
const flowsPath = argValue({ args, flag: "--flows" });
const out = argValue({ args, flag: "--out" });
const timeout = 8000;

const { flows } = await import(pathToFileURL(resolve(flowsPath)).href);
if (!Array.isArray(flows) || flows.length === 0) throw new Error("Flows file must export a non-empty flows array.");
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/results.tsv`, "id\tname\tstatus\tfailure\n");

const browser = await chromium.launch();
let passed = 0;
let failed = 0;

for (const flow of flows) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let status = "pass";
  let failure = "";
  mkdirSync(`${out}/${flow.id}`, { recursive: true });
  try {
    await page.goto(base.replace(/\/$/, "") + "/", { timeout });
    for (const [index, step] of flow.steps.entries()) {
      try {
        const note = await runStep({ page, base, out: `${out}/${flow.id}`, step, timeout });
        if (process.env.FLOW_VERBOSE) console.log(`${flow.id} step ${index + 1}: ${note}`);
      } catch (error) {
        throw new Error(`step ${index + 1} (${step}): ${error.message.split("\n")[0]}`);
      }
    }
    if (pageErrors.length > 0) {
      status = "fail";
      failure = `pageerror: ${pageErrors[0]}`;
    }
  } catch (error) {
    status = "fail";
    failure = error.message;
    mkdirSync(`${out}/${flow.id}`, { recursive: true });
    await page.screenshot({ path: `${out}/${flow.id}/failure.png` }).catch(() => {});
  }
  if (status === "pass") passed += 1;
  else failed += 1;
  writeFileSync(`${out}/results.tsv`, `${flow.id}\t${flow.name}\t${status}\t${failure}\n`, { flag: "a" });
  console.log(`${flow.id}\t${status}\t${flow.name}${status === "pass" ? "" : `\t${failure}`}`);
  await context.close();
}

await browser.close();
console.log(`SUMMARY: ${passed} passed, ${failed} failed of ${flows.length}`);
if (failed > 0) process.exitCode = 1;
