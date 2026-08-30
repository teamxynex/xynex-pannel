import "dotenv/config";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test123";

const { createServer } = await import("http");
// server.ts exports `io`, which nativeEngine imports — but importing full
// server.ts boots the whole app. Instead we stub what nativeEngine needs by
// monkey-patching via a minimal fake module using Node's module resolution
// is overkill here; simplest: just import server.ts is expensive but fine
// for a one-off smoke test.
process.chdir(new URL(".", import.meta.url).pathname);

const mod = await import("./src/server/services/nativeEngine.ts");

const testServer = {
  id: "test-native-1",
  ram: "1",
  port: 25599,
};

const egg = {
  isPterodactyl: true,
  name: "Echo Test Egg",
  startup: "echo hello-from-{{P_SERVER_UUID}}; i=0; while [ $i -lt 30 ]; do echo tick-$i; read -t 1 line && echo got:$line; i=$((i+1)); done",
  installScript: {
    script: "#!/bin/bash\necho 'installing...'\nmkdir -p /mnt/server\necho 'install-marker' > /mnt/server/installed.txt\necho 'install done'",
  },
  variables: [],
};

console.log("--- runInstall ---");
await mod.runInstall(testServer, egg);
console.log("installed flag:", testServer.installed);

console.log("--- startProcess ---");
await mod.startProcess(testServer, egg, testServer.id);
await new Promise((r) => setTimeout(r, 1500));

console.log("--- status ---");
console.log(mod.getStatus(testServer.id));

console.log("--- sendCommand ---");
mod.sendCommand(testServer.id, "hello-panel");
await new Promise((r) => setTimeout(r, 1500));

console.log("--- logs tail ---");
console.log(await mod.getLogs(testServer.id));

console.log("--- stats ---");
console.log(await mod.getStats(testServer.id));

console.log("--- stopProcess ---");
await mod.stopProcess(testServer.id);
console.log("status after stop:", mod.getStatus(testServer.id));

process.exit(0);
