// wgp.py falso para tests/wan2gp.test.ts (de Open-Generative-AI, MIT, tests/fixtures/fake-wan2gp).
// Lo corre node (la prueba usa process.execPath como «python»). El prompt elige qué hace: ok | fail | hang.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const ajustesRuta = args[args.indexOf("--process") + 1];
const out = args.includes("--output-dir") ? args[args.indexOf("--output-dir") + 1] : null;
const ajustes = JSON.parse(fs.readFileSync(ajustesRuta, "utf-8"));

console.log(`WanGP CLI Mode - Processing settings: ${ajustesRuta}`);
console.log(`PYTHONUNBUFFERED=${process.env.PYTHONUNBUFFERED}`);

if (args.includes("--dry-run")) {
  console.log(`  Task 1: model=${ajustes.model_type}, steps=30, frames=81`);
  console.log("[DRY-RUN] Validation complete. 1/1 task(s) valid.");
  process.exit(0);
}

if (ajustes.prompt === "fail") {
  console.log("Loading Model Fake...");
  console.error('Traceback (most recent call last):\n  File "wgp.py", line 1\ntorch.OutOfMemoryError: CUDA out of memory.');
  process.exit(1);
}

if (ajustes.prompt === "terco") {
  // Ignora SIGTERM: sólo se va con SIGKILL.
  process.on("SIGTERM", () => {});
  console.log("  [1/30] Denoising | 1.0s");
  setInterval(() => {}, 1000);
} else if (ajustes.prompt === "hang") {
  const hijo = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  fs.writeFileSync(path.join(out, "hijo.pid"), String(hijo.pid));
  console.log("  [1/30] Denoising | 1.0s");
  setInterval(() => {}, 1000);
} else {
  console.log("Loading Model Fake...");
  process.stdout.write("  [1/2] Denoising | 1.0s\r  [2/2] Denoising | 2.0s\n");
  console.log("  [1/1] VAE Decoding | 3.0s");
  const archivo = path.join(out, `seed${ajustes.seed}_${ajustes.prompt}.mp4`);
  fs.writeFileSync(archivo, "video falso");
  console.log(`  [0/1] Saving File x.mp4Video file saved to Path: ${archivo}`);
  console.log(`image_start=${ajustes.image_start || ""} tipo=${ajustes.image_prompt_type || ""}`);
  console.log("Queue completed: 1/1 tasks in 3s");
}
