#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const keysDir = path.join(repoRoot, ".keys");
const privateKeyPath = path.join(keysDir, "jwt-private.pem");
const publicKeyPath = path.join(keysDir, "jwt-public.pem");
const force = process.argv.includes("--force");

mkdirSync(keysDir, { recursive: true });

if (!force && existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
  console.log(`JWT Ed25519 keys already exist in ${keysDir} (pass --force to overwrite).`);
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

writeFileSync(privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
writeFileSync(publicKeyPath, publicKey, { encoding: "utf8", mode: 0o644 });

if (process.platform !== "win32") {
  chmodSync(privateKeyPath, 0o600);
  chmodSync(publicKeyPath, 0o644);
}

console.log(`Generated Ed25519 asymmetric JWT keypair in ${keysDir}`);
console.log(`- Private key: ${privateKeyPath}`);
console.log(`- Public key:  ${publicKeyPath}`);
