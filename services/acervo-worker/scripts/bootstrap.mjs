#!/usr/bin/env node
/**
 * Bootstrap idempotente do acervo-worker no Cloudflare.
 *
 * O que faz (nesta ordem):
 *   1. Lista Vectorize indexes. Se "triade-acervo" nao existe, cria.
 *   2. Lista D1 databases. Se "triade-acervo" nao existe, cria.
 *   3. Escreve o database_id no wrangler.toml no lugar do placeholder.
 *   4. Roda schema.sql no D1 remoto.
 *   5. Opcionalmente seta o secret INGEST_TOKEN se a env var estiver setada.
 *
 * Pode rodar quantas vezes quiser — nao duplica nada.
 *
 * Precisa das envs (o CI passa do secrets do GitHub):
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 * Opcional:
 *   INGEST_TOKEN
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(__dirname, "..");
const WRANGLER_TOML = resolve(WORKER_DIR, "wrangler.toml");
const SCHEMA_SQL = resolve(WORKER_DIR, "schema.sql");

const VECTORIZE_NAME = "triade-acervo";
const D1_NAME = "triade-acervo";
const PLACEHOLDER = "REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`\u274c faltou env ${name}`);
    process.exit(1);
  }
  return v;
}

requireEnv("CLOUDFLARE_API_TOKEN");
requireEnv("CLOUDFLARE_ACCOUNT_ID");

/**
 * Roda wrangler e devolve {code, stdout, stderr}.
 * Nao joga erro — quem chama decide o que fazer.
 */
function wrangler(args, opts = {}) {
  const result = spawnSync("npx", ["--yes", "wrangler", ...args], {
    cwd: WORKER_DIR,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    ...opts,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function log(msg) {
  console.log(`\u2022 ${msg}`);
}

function ok(msg) {
  console.log(`\u2705 ${msg}`);
}

// ---- Vectorize ---------------------------------------------------------

function ensureVectorize() {
  log(`checando Vectorize index "${VECTORIZE_NAME}"...`);
  const list = wrangler(["vectorize", "list"]);
  if (list.code !== 0) {
    console.error(list.stderr);
    throw new Error("wrangler vectorize list falhou");
  }
  if (list.stdout.includes(VECTORIZE_NAME)) {
    ok(`Vectorize index "${VECTORIZE_NAME}" ja existe`);
    return;
  }
  log(`criando Vectorize index "${VECTORIZE_NAME}" (1024d, cosine)...`);
  const create = wrangler([
    "vectorize",
    "create",
    VECTORIZE_NAME,
    "--dimensions=1024",
    "--metric=cosine",
  ]);
  if (create.code !== 0) {
    console.error(create.stdout);
    console.error(create.stderr);
    throw new Error("falha ao criar Vectorize");
  }
  ok(`Vectorize index "${VECTORIZE_NAME}" criado`);
}

// ---- D1 ----------------------------------------------------------------

function ensureD1() {
  log(`checando D1 database "${D1_NAME}"...`);
  const list = wrangler(["d1", "list", "--json"]);
  if (list.code !== 0) {
    console.error(list.stderr);
    throw new Error("wrangler d1 list falhou");
  }
  /** @type {Array<{name: string, uuid: string}>} */
  let dbs = [];
  try {
    // wrangler as vezes prefixa a saida JSON com linhas de log; extrai o array.
    const jsonMatch = list.stdout.match(/\[[\s\S]*\]/);
    dbs = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (e) {
    console.error("nao consegui parsear d1 list output:", list.stdout);
    throw e;
  }
  let db = dbs.find((d) => d.name === D1_NAME);
  if (db) {
    ok(`D1 "${D1_NAME}" ja existe (uuid: ${db.uuid})`);
    return db.uuid;
  }
  log(`criando D1 "${D1_NAME}"...`);
  const create = wrangler(["d1", "create", D1_NAME]);
  if (create.code !== 0) {
    console.error(create.stdout);
    console.error(create.stderr);
    throw new Error("falha ao criar D1");
  }
  // Extrai o uuid da saida "database_id = \"xxxx\"" ou "uuid: xxxx"
  const uuidMatch =
    create.stdout.match(/database_id\s*=\s*"([^"]+)"/) ??
    create.stdout.match(/"uuid"\s*:\s*"([^"]+)"/i) ??
    create.stdout.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/);
  if (!uuidMatch) {
    console.error(create.stdout);
    throw new Error("nao consegui extrair uuid do D1 recem-criado");
  }
  ok(`D1 "${D1_NAME}" criado (uuid: ${uuidMatch[1]})`);
  return uuidMatch[1];
}

// ---- wrangler.toml -----------------------------------------------------

function ensureWranglerToml(dbUuid) {
  log(`atualizando wrangler.toml com database_id...`);
  let toml = readFileSync(WRANGLER_TOML, "utf-8");
  if (toml.includes(PLACEHOLDER)) {
    toml = toml.replace(PLACEHOLDER, dbUuid);
    writeFileSync(WRANGLER_TOML, toml, "utf-8");
    ok(`wrangler.toml atualizado`);
  } else if (toml.includes(dbUuid)) {
    ok(`wrangler.toml ja aponta pro D1 correto`);
  } else {
    // ha um id diferente ali — nao mexe, deixa o deploy quebrar pra Miriam ver.
    console.warn(
      `\u26a0\ufe0f wrangler.toml tem database_id que nao bate com "${dbUuid}". ` +
        `Se o deploy falhar, edita manualmente.`
    );
  }
}

// ---- schema ------------------------------------------------------------

function applySchema() {
  log(`aplicando schema.sql no D1 remoto...`);
  const exec = wrangler([
    "d1",
    "execute",
    D1_NAME,
    "--remote",
    `--file=${SCHEMA_SQL}`,
  ]);
  if (exec.code !== 0) {
    console.error(exec.stdout);
    console.error(exec.stderr);
    // schema pode falhar se ja rodou antes com CREATE TABLE sem IF NOT EXISTS,
    // mas o nosso usa IF NOT EXISTS, entao 0 mesmo em re-run.
    throw new Error("falha ao aplicar schema.sql");
  }
  ok(`schema aplicado`);
}

// ---- secret ------------------------------------------------------------

function maybeSetSecret() {
  const token = process.env.INGEST_TOKEN;
  if (!token) {
    log(`INGEST_TOKEN nao setado no CI — /ingest ficara aberto (sem auth). ` +
        `Adicione um secret no GitHub chamado INGEST_TOKEN pra proteger.`);
    return;
  }
  log(`setando secret INGEST_TOKEN no worker...`);
  const setRes = spawnSync("npx", ["--yes", "wrangler", "secret", "put", "INGEST_TOKEN"], {
    cwd: WORKER_DIR,
    input: token + "\n",
    encoding: "utf-8",
    env: process.env,
  });
  if (setRes.status !== 0) {
    console.error(setRes.stdout);
    console.error(setRes.stderr);
    throw new Error("falha ao setar secret INGEST_TOKEN");
  }
  ok(`secret INGEST_TOKEN setado`);
}

// ---- main --------------------------------------------------------------

try {
  ensureVectorize();
  const dbUuid = ensureD1();
  ensureWranglerToml(dbUuid);
  applySchema();
  maybeSetSecret();
  console.log("\n\ud83c\udf89 bootstrap OK — pronto pra `wrangler deploy`");
} catch (e) {
  console.error(`\n\u274c bootstrap falhou:`, e instanceof Error ? e.message : e);
  process.exit(1);
}
