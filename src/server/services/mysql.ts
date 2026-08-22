import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { docker, isSandbox, pullImageGeneric } from "./docker.js";

const CONTAINER_NAME = "xynex-mysql";
const IMAGE = "mysql:8";
const HOST_PORT = 3306;
const CONTAINER_PORT = "3306/tcp";
const ROOT_PW_FILE = path.join(process.cwd(), ".data", "mysql-root.json");
const DATA_DIR = path.join(process.cwd(), ".data", "mysql-data");

// The root password is generated once and persisted so it survives panel
// restarts — every database/user we create uses this to authenticate.
function getRootPassword(): string {
  if (fs.existsSync(ROOT_PW_FILE)) {
    return fs.readJsonSync(ROOT_PW_FILE).rootPassword;
  }
  const rootPassword = crypto.randomBytes(16).toString("hex");
  fs.ensureDirSync(path.dirname(ROOT_PW_FILE));
  fs.writeJsonSync(ROOT_PW_FILE, { rootPassword });
  return rootPassword;
}

export async function getMysqlStatus(): Promise<{ running: boolean; host: string; port: number }> {
  if (isSandbox) return { running: false, host: "localhost", port: HOST_PORT };
  try {
    const container = docker.getContainer(CONTAINER_NAME);
    const info = await container.inspect();
    return { running: !!info.State?.Running, host: "localhost", port: HOST_PORT };
  } catch (e) {
    return { running: false, host: "localhost", port: HOST_PORT };
  }
}

// Starts the shared MySQL container, creating it (and pulling the image)
// the first time it's needed. Safe to call repeatedly.
export async function ensureMysqlContainer(): Promise<{ running: boolean; host: string; port: number }> {
  if (isSandbox) return { running: false, host: "localhost", port: HOST_PORT };
  const rootPassword = getRootPassword();

  try {
    const existing = docker.getContainer(CONTAINER_NAME);
    const info = await existing.inspect();
    if (!info.State?.Running) await existing.start();
    return { running: true, host: "localhost", port: HOST_PORT };
  } catch (e) {
    // Container doesn't exist yet — fall through and create it below.
  }

  try {
    await pullImageGeneric(IMAGE);
  } catch (e) {
    console.warn("MySQL image pull failed (continuing — image may already be present):", e);
  }

  fs.ensureDirSync(DATA_DIR);
  const container = await docker.createContainer({
    name: CONTAINER_NAME,
    Image: IMAGE,
    Env: [`MYSQL_ROOT_PASSWORD=${rootPassword}`],
    ExposedPorts: { [CONTAINER_PORT]: {} },
    HostConfig: {
      PortBindings: { [CONTAINER_PORT]: [{ HostPort: String(HOST_PORT) }] },
      Binds: [`${DATA_DIR}:/var/lib/mysql`],
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await container.start();
  return { running: true, host: "localhost", port: HOST_PORT };
}

// Runs a SQL statement inside the MySQL container via `docker exec`,
// authenticating as root. Throws if the mysql client exits non-zero.
async function execInMysql(sql: string): Promise<void> {
  const rootPassword = getRootPassword();
  const container = docker.getContainer(CONTAINER_NAME);
  const exec = await container.exec({
    Cmd: ["mysql", "-uroot", `-p${rootPassword}`, "-e", sql],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream: any = await exec.start({});
  await new Promise<void>((resolve, reject) => {
    let output = "";
    stream.on("data", (d: Buffer) => (output += d.toString()));
    stream.on("end", async () => {
      try {
        const info = await exec.inspect();
        if (info.ExitCode && info.ExitCode !== 0) {
          reject(new Error(output.trim() || "mysql command failed"));
        } else {
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    });
    stream.on("error", reject);
  });
}

// Names/passwords here come from server-generated values (createDatabase
// controller), never raw user input, so this escaping is a defense-in-depth
// measure rather than the only safeguard against SQL injection.
export async function createDatabaseAndUser(dbName: string, dbUser: string, dbPassword: string) {
  if (isSandbox) return;
  const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, "");
  const safeUser = dbUser.replace(/[^a-zA-Z0-9_]/g, "");
  const safePw = dbPassword.replace(/'/g, "''");
  await execInMysql(
    `CREATE DATABASE IF NOT EXISTS \`${safeDb}\`; ` +
      `CREATE USER IF NOT EXISTS '${safeUser}'@'%' IDENTIFIED BY '${safePw}'; ` +
      `GRANT ALL PRIVILEGES ON \`${safeDb}\`.* TO '${safeUser}'@'%'; FLUSH PRIVILEGES;`
  );
}

export async function dropDatabaseAndUser(dbName: string, dbUser: string) {
  if (isSandbox) return;
  const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, "");
  const safeUser = dbUser.replace(/[^a-zA-Z0-9_]/g, "");
  await execInMysql(`DROP DATABASE IF EXISTS \`${safeDb}\`; DROP USER IF EXISTS '${safeUser}'@'%';`);
}
