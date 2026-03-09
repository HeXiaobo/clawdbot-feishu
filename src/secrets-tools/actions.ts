import * as fs from "node:fs";
import * as path from "node:path";
import type { FeishuSecretsParams } from "./schemas.js";

const SECRETS_FILE = path.join(process.env.HOME || "/root", ".openclaw/extensions/feishu/.secrets.json");

interface SecretEntry {
  key: string;
  value: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface SecretsStore {
  secrets: Record<string, SecretEntry>;
}

function ensureSecretsFile(): void {
  const dir = path.dirname(SECRETS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(SECRETS_FILE)) {
    const initialData: SecretsStore = { secrets: {} };
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(initialData, null, 2), { mode: 0o600 });
  } else {
    // Ensure correct permissions
    fs.chmodSync(SECRETS_FILE, 0o600);
  }
}

function readSecrets(): SecretsStore {
  ensureSecretsFile();
  const content = fs.readFileSync(SECRETS_FILE, "utf-8");
  return JSON.parse(content) as SecretsStore;
}

function writeSecrets(store: SecretsStore): void {
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export async function listSecrets() {
  const store = readSecrets();
  const secrets = Object.values(store.secrets).map((entry) => ({
    key: entry.key,
    description: entry.description,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    // DO NOT include value in list output
  }));

  return {
    count: secrets.length,
    secrets,
    note: "Values are hidden for security. Use SecretRef format: {\"source\": \"feishu\", \"id\": \"KEY_NAME\"}",
  };
}

export async function addSecret(key: string, value: string, description?: string) {
  if (!key || !value) {
    throw new Error("Both key and value are required for add action");
  }

  const store = readSecrets();
  
  if (store.secrets[key]) {
    throw new Error(`Secret with key "${key}" already exists. Use update action to modify it.`);
  }

  const now = new Date().toISOString();
  store.secrets[key] = {
    key,
    value,
    description,
    created_at: now,
    updated_at: now,
  };

  writeSecrets(store);

  return {
    success: true,
    key,
    description,
    created_at: now,
    secret_ref: { source: "feishu", id: key },
  };
}

export async function updateSecret(key: string, value: string, description?: string) {
  if (!key || !value) {
    throw new Error("Both key and value are required for update action");
  }

  const store = readSecrets();
  
  if (!store.secrets[key]) {
    throw new Error(`Secret with key "${key}" not found. Use add action to create it.`);
  }

  const now = new Date().toISOString();
  store.secrets[key] = {
    ...store.secrets[key],
    value,
    description: description ?? store.secrets[key].description,
    updated_at: now,
  };

  writeSecrets(store);

  return {
    success: true,
    key,
    description: store.secrets[key].description,
    updated_at: now,
    secret_ref: { source: "feishu", id: key },
  };
}

export async function deleteSecret(key: string) {
  if (!key) {
    throw new Error("Key is required for delete action");
  }

  const store = readSecrets();
  
  if (!store.secrets[key]) {
    throw new Error(`Secret with key "${key}" not found`);
  }

  delete store.secrets[key];
  writeSecrets(store);

  return {
    success: true,
    deleted_key: key,
  };
}

export async function runSecretsAction(params: FeishuSecretsParams) {
  switch (params.action) {
    case "list":
      return listSecrets();
    case "add":
      return addSecret(params.key!, params.value!, params.description);
    case "update":
      return updateSecret(params.key!, params.value!, params.description);
    case "delete":
      return deleteSecret(params.key!);
    default:
      throw new Error(`Unknown action: ${(params as any).action}`);
  }
}
