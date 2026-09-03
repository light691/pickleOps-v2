function argValue({ args, flag }) {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing value for ${flag}.`);
  return args[index + 1];
}

const args = process.argv.slice(2);
const base = argValue({ args, flag: "--base" }).replace(/\/$/, "");
let failed = false;

const root = await fetch(`${base}/`);
const rootBody = await root.text();
if (root.status === 200 && rootBody.includes("RallyPoint")) {
  console.log(`root 200 with app identity at ${base}`);
} else {
  console.error(`root check failed: status ${root.status}`);
  failed = true;
}

const today = await fetch(`${base}/api/today`);
if (today.status === 401) {
  console.log("auth guard live: /api/today without cookie is 401");
} else {
  console.error(`auth guard check failed: /api/today status ${today.status}, want 401`);
  failed = true;
}

if (failed) process.exit(1);
console.log("doctor: instance is worth driving");
