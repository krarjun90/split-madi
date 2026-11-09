import { randomBytes, scryptSync } from "node:crypto";

const MIN_LENGTH = 12;

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(130);
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPiped() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function readPassword() {
  if (!process.stdin.isTTY) return readPiped();
  const first = await readHidden("Admin password: ");
  const second = await readHidden("Type it again: ");
  if (first !== second) {
    process.stderr.write("The two passwords are different.\n");
    process.exit(1);
  }
  return first;
}

const password = await readPassword();
if (password.length < MIN_LENGTH) {
  process.stderr.write(`Use at least ${MIN_LENGTH} characters.\n`);
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64);
process.stdout.write(`scrypt:${salt.toString("hex")}:${key.toString("hex")}`);
