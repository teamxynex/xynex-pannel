import "dotenv/config";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs-extra";

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");

// A single hand-rolled prompt reader used for every field (both plain and
// hidden/password), instead of node's `readline` module.
//
// `readline.createInterface().question()` has a well-known race across
// several sequential question() calls: if input arrives faster than the
// prompts are asked (piped input, a fast typist, or a paste that includes
// several lines/newlines at once), more than one line can land in a
// single 'data' chunk. question() only looks at the *next* line event, so
// anything after the first newline in that chunk is silently dropped and
// the following prompt hangs forever waiting for input that already
// arrived.
//
// Fixed here with one persistent 'data' listener that feeds every
// incoming character into a shared queue exactly once — never per-prompt
// — so nothing is ever dropped regardless of how input is bunched up.
// Each prompt just pulls characters off that queue until it sees a
// newline. This also gives us proper masking for the password prompt
// (raw mode + manual echo) for free, using the exact same code path.
const stdin = process.stdin;
const isTTY = !!stdin.isTTY;
if (isTTY) stdin.setRawMode?.(true);
stdin.resume();
stdin.setEncoding("utf8");

const charQueue: string[] = [];
let onChar: ((ch: string) => void) | null = null;

stdin.on("data", (chunk: string) => {
  for (const ch of chunk) {
    if (onChar) {
      const fn = onChar;
      onChar = null;
      fn(ch);
    } else {
      charQueue.push(ch);
    }
  }
});

function nextChar(): Promise<string> {
  if (charQueue.length > 0) {
    return Promise.resolve(charQueue.shift()!);
  }
  return new Promise((resolve) => {
    onChar = resolve;
  });
}

function endInput() {
  if (isTTY) stdin.setRawMode?.(false);
  stdin.pause();
}

async function readLine(hide: boolean): Promise<string> {
  let value = "";
  while (true) {
    const ch = await nextChar();
    if (ch === "\n" || ch === "\r") {
      process.stdout.write("\n");
      return value;
    } else if (ch === "\u0003") {
      // Ctrl-C
      process.stdout.write("\n");
      endInput();
      process.exit(1);
    } else if (ch === "\u007f" || ch === "\b") {
      // Backspace
      if (value.length > 0) {
        value = value.slice(0, -1);
        if (isTTY && !hide) process.stdout.write("\b \b");
      }
    } else {
      value += ch;
      // Raw mode disables the terminal's own echo, so echo plain fields
      // back ourselves; hidden fields stay silent.
      if (isTTY && !hide) process.stdout.write(ch);
    }
  }
}

async function ask(promptText: string): Promise<string> {
  process.stdout.write(promptText);
  return (await readLine(false)).trim();
}

async function askHidden(promptText: string): Promise<string> {
  process.stdout.write(promptText);
  return (await readLine(true)).trim();
}

async function main() {
  console.log("=== XyneX Panel — Create User ===\n");

  let role = "user";
  const isAdminAnswer = (await ask("Administrator? (y/n): ")).toLowerCase();
  if (isAdminAnswer === "y" || isAdminAnswer === "yes") {
    role = "admin";
  }

  let username = "";
  while (!username) {
    username = await ask("Username: ");
    if (!username) console.log("  Username is required.");
  }

  const firstName = await ask("First Name: ");
  const lastName = await ask("Last Name: ");

  let password = "";
  while (!password) {
    password = await askHidden("Password: ");
    if (!password) console.log("  Password is required.");
  }

  endInput();

  const users = await fs.readJson(USERS_FILE);
  const existingIndex = users.findIndex((u: any) => u.username === username);
  const hashedPassword = await bcrypt.hash(password, 10);

  if (existingIndex !== -1) {
    users[existingIndex].password = hashedPassword;
    users[existingIndex].role = role;
    if (firstName) users[existingIndex].firstName = firstName;
    if (lastName) users[existingIndex].lastName = lastName;
    await fs.writeJson(USERS_FILE, users, { spaces: 2 });
    console.log(`\nUser "${username}" updated successfully (role: ${role}).`);
  } else {
    users.push({
      id: Date.now().toString(),
      username,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      password: hashedPassword,
      role,
      createdAt: new Date().toISOString(),
    });
    await fs.writeJson(USERS_FILE, users, { spaces: 2 });
    console.log(`\nUser "${username}" created successfully (role: ${role}).`);
  }

  process.exit(0);
}

main().catch((err) => {
  endInput();
  console.error("Failed to create user:", err);
  process.exit(1);
});
