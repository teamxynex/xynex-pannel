import { Request, Response } from "express";
import { readJSON, writeJSON } from "../services/db.js";
import crypto from "crypto";
import path from "path";
import fs from "fs-extra";

// Full official Minecraft: Java Edition release history, oldest first.
// Shared across every Minecraft software egg (Paper/Spigot/Forge/Vanilla)
// so the Versions tab lists every version from 1.0 up to the latest.
const ALL_MC_VERSIONS = [
  "1.0", "1.1",
  "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5",
  "1.3.1", "1.3.2",
  "1.4.2", "1.4.4", "1.4.5", "1.4.6", "1.4.7",
  "1.5", "1.5.1", "1.5.2",
  "1.6.1", "1.6.2", "1.6.4",
  "1.7.2", "1.7.4", "1.7.5", "1.7.6", "1.7.7", "1.7.8", "1.7.9", "1.7.10",
  "1.8", "1.8.1", "1.8.2", "1.8.3", "1.8.4", "1.8.5", "1.8.6", "1.8.7", "1.8.8", "1.8.9",
  "1.9", "1.9.1", "1.9.2", "1.9.3", "1.9.4",
  "1.10", "1.10.1", "1.10.2",
  "1.11", "1.11.1", "1.11.2",
  "1.12", "1.12.1", "1.12.2",
  "1.13", "1.13.1", "1.13.2",
  "1.14", "1.14.1", "1.14.2", "1.14.3", "1.14.4",
  "1.15", "1.15.1", "1.15.2",
  "1.16", "1.16.1", "1.16.2", "1.16.3", "1.16.4", "1.16.5",
  "1.17", "1.17.1",
  "1.18", "1.18.1", "1.18.2",
  "1.19", "1.19.1", "1.19.2", "1.19.3", "1.19.4",
  "1.20", "1.20.1", "1.20.2", "1.20.3", "1.20.4", "1.20.5", "1.20.6",
  "1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4", "1.21.5", "1.21.6", "1.21.7", "1.21.8", "1.21.9", "1.21.10", "1.21.11",
  "latest",
];

// Fabric's mod loader only exists from 1.14 onward, so it gets the same
// list trimmed to that starting point (still oldest -> latest).
const FABRIC_VERSIONS = ALL_MC_VERSIONS.slice(ALL_MC_VERSIONS.indexOf("1.14"));

// Bedrock Dedicated Server release history (recent releases, oldest
// first) plus LATEST, which itzg/minecraft-bedrock-server resolves to
// whatever Mojang currently publishes.
const BEDROCK_VERSIONS = [
  "1.20.0.1", "1.20.1.2", "1.20.10.1", "1.20.15.1", "1.20.30.1", "1.20.32.1",
  "1.20.40.1", "1.20.41.1", "1.20.50.3", "1.20.51.2", "1.20.60.2", "1.20.62.2",
  "1.20.70.2", "1.20.71.2", "1.20.72.1", "1.20.73.1", "1.20.80.5", "1.20.81.1",
  "1.21.0.3", "1.21.2.3", "1.21.3.1", "1.21.20.3", "1.21.21.1", "1.21.30.4",
  "1.21.31.4", "1.21.40.2", "1.21.42.1", "1.21.43.1", "1.21.44.1", "1.21.50.7",
  "1.21.51.2", "1.21.60.10", "1.21.62.3", "1.21.70.3", "1.21.71.1", "1.21.72.1",
  "1.21.80.3", "1.21.81.1", "1.21.90.4", "1.21.91.1", "1.21.92.1", "1.21.93.1",
  "LATEST",
];

// Velocity is versioned as its own piece of software (not per Minecraft
// version) — real release history, oldest first, ending with "latest".
const VELOCITY_VERSIONS = [
  "1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4", "1.0.5", "1.0.6", "1.0.7",
  "1.1.0", "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.1.5", "1.1.6", "1.1.7", "1.1.8", "1.1.9",
  "3.0.0", "3.1.0", "3.1.1", "3.2.0", "3.3.0-SNAPSHOT", "3.4.0-SNAPSHOT", "4.1.0-SNAPSHOT",
  "latest",
];

// Shared "Startup" tab config for the built-in eggs — the literal command
// the container's entrypoint runs, plus the variables that feed into it.
// {{VAR}} tokens in `startup` are rendered using each variable's current
// value (falling back to defaultValue) by the Startup tab / API.
const MINECRAFT_STARTUP = "java -Xms128M -Xmx{{MEMORY}} -jar server.jar nogui";
function minecraftVariables(typeDefault: string) {
  return [
    { name: "Server Jar Type", envVariable: "TYPE", defaultValue: typeDefault, description: "The Minecraft server software to run.", editable: false },
    { name: "Minecraft Version", envVariable: "VERSION", defaultValue: "latest", description: "Minecraft version to install/run.", editable: true },
    { name: "Memory", envVariable: "MEMORY", defaultValue: "1G", description: "Max JVM heap size handed to the server.", editable: true },
    { name: "Accept EULA", envVariable: "EULA", defaultValue: "TRUE", description: "Must be TRUE to let the server start.", editable: false },
    { name: "Enable RCON", envVariable: "ENABLE_RCON", defaultValue: "true", description: "Lets the panel send console commands.", editable: true },
    { name: "RCON Password", envVariable: "RCON_PASSWORD", defaultValue: "admin", description: "Password used by the panel's RCON connection.", editable: true },
  ];
}

const PROXY_STARTUP = "java -Xms128M -Xmx{{MEMORY}} -jar server.jar";
function proxyVariables(typeDefault: string) {
  return [
    { name: "Proxy Software", envVariable: "TYPE", defaultValue: typeDefault, description: "The proxy software to run.", editable: false },
    { name: "Proxy Version", envVariable: "VERSION", defaultValue: "latest", description: "Version of the proxy software to install/run.", editable: true },
    { name: "Memory", envVariable: "MEMORY", defaultValue: "1G", description: "Max JVM heap size handed to the proxy.", editable: true },
  ];
}

// Default eggs so upgrading panels aren't left with an empty list —
// these match the software types the panel originally shipped with.
// Hoisted above DEFAULT_EGGS on purpose: the array below calls
// steamCmdEggs() immediately at module-eval time, so this constant has to
// already be initialized by then (a `const` declared after this point
// would still be in its temporal dead zone when steamCmdEggs() runs,
// crashing the whole server on boot).
const STEAM_RUNTIME_IMAGE = "cm2network/steamcmd:root";

const DEFAULT_EGGS = [
  {
    id: "egg-paper",
    name: "Paper",
    category: "Minecraft",
    dockerImage: "itzg/minecraft-server:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/data",
    envVars: { TYPE: "PAPER", EULA: "TRUE", ENABLE_RCON: "true", RCON_PASSWORD: "admin" },
    versionEnvVar: "VERSION",
    versions: ALL_MC_VERSIONS,
    startup: MINECRAFT_STARTUP,
    variables: minecraftVariables("PAPER"),
  },
  {
    id: "egg-spigot",
    name: "Spigot",
    category: "Minecraft",
    dockerImage: "itzg/minecraft-server:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/data",
    envVars: { TYPE: "SPIGOT", EULA: "TRUE", ENABLE_RCON: "true", RCON_PASSWORD: "admin" },
    versionEnvVar: "VERSION",
    versions: ALL_MC_VERSIONS,
    startup: MINECRAFT_STARTUP,
    variables: minecraftVariables("SPIGOT"),
  },
  {
    id: "egg-forge",
    name: "Forge",
    category: "Minecraft",
    dockerImage: "itzg/minecraft-server:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/data",
    envVars: { TYPE: "FORGE", EULA: "TRUE", ENABLE_RCON: "true", RCON_PASSWORD: "admin" },
    versionEnvVar: "VERSION",
    versions: ALL_MC_VERSIONS,
    startup: MINECRAFT_STARTUP,
    variables: minecraftVariables("FORGE"),
  },
  {
    id: "egg-fabric",
    name: "Fabric",
    category: "Minecraft",
    dockerImage: "itzg/minecraft-server:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/data",
    envVars: { TYPE: "FABRIC", EULA: "TRUE", ENABLE_RCON: "true", RCON_PASSWORD: "admin" },
    versionEnvVar: "VERSION",
    versions: FABRIC_VERSIONS,
    startup: MINECRAFT_STARTUP,
    variables: minecraftVariables("FABRIC"),
  },
  {
    id: "egg-velocity",
    name: "Velocity",
    category: "Proxy",
    dockerImage: "itzg/bungeecord:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/server",
    envVars: { TYPE: "VELOCITY" },
    versionEnvVar: "VERSION",
    versions: VELOCITY_VERSIONS,
    startup: PROXY_STARTUP,
    variables: proxyVariables("VELOCITY"),
  },
  {
    id: "egg-bungeecord",
    name: "BungeeCord",
    category: "Proxy",
    dockerImage: "itzg/bungeecord:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/server",
    envVars: { TYPE: "BUNGEECORD" },
    versionEnvVar: "VERSION",
    versions: ALL_MC_VERSIONS,
    startup: PROXY_STARTUP,
    variables: proxyVariables("BUNGEECORD"),
  },
  {
    id: "egg-waterfall",
    name: "Waterfall",
    category: "Proxy",
    dockerImage: "itzg/bungeecord:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/server",
    envVars: { TYPE: "WATERFALL" },
    versionEnvVar: "VERSION",
    versions: ALL_MC_VERSIONS,
    startup: PROXY_STARTUP,
    variables: proxyVariables("WATERFALL"),
  },
  {
    id: "egg-bedrock",
    name: "Bedrock",
    category: "Minecraft",
    dockerImage: "itzg/minecraft-bedrock-server:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/data",
    envVars: { EULA: "TRUE" },
    versionEnvVar: "VERSION",
    versions: BEDROCK_VERSIONS,
    startup: "bedrock_server",
    variables: [
      { name: "Bedrock Version", envVariable: "VERSION", defaultValue: "LATEST", description: "Bedrock Dedicated Server version to install/run — LATEST always tracks Mojang's newest release.", editable: true },
      { name: "Accept EULA", envVariable: "EULA", defaultValue: "TRUE", description: "Must be TRUE to let the server start.", editable: false },
      { name: "Gamemode", envVariable: "GAMEMODE", defaultValue: "survival", description: "Default gamemode for new players.", editable: true },
      { name: "Difficulty", envVariable: "DIFFICULTY", defaultValue: "easy", description: "World difficulty.", editable: true },
    ],
  },
  ...steamCmdEggs(),
  factorioEgg(),
  terrariaEgg(),
  fivemEgg(),
  redmEgg(),
];

// Shared install-script template for SteamCMD-based dedicated servers
// (Rust, ARK, CS2, Garry's Mod, TF2, Valheim, 7 Days to Die, Project
// Zomboid...). SteamCMD itself is downloaded fresh in the script rather
// than assumed to already exist in the install image, so this works with
// any plain Debian-based install container.
function steamCmdInstallScript(appId: string, extraSteamArgs: string = "", postInstall: string = ""): string {
  return [
    "#!/bin/bash",
    "apt update -y",
    "apt install -y curl ca-certificates lib32gcc-s1 lib32stdc++6 unzip",
    "mkdir -p /mnt/server/steamcmd",
    "cd /mnt/server/steamcmd",
    'curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" | tar zxvf -',
    `./steamcmd.sh +force_install_dir /mnt/server +login anonymous +app_update ${appId}${extraSteamArgs} validate +quit`,
    postInstall,
    'echo "Install complete."',
  ].filter(Boolean).join("\n");
}

function steamCmdEggs() {
  return [
    {
      id: "egg-rust",
      name: "Rust",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("258550") },
      startup: "./RustDedicated -batchmode +server.port {{SERVER_PORT}} +server.identity \"rust\" +rcon.port {{RCON_PORT}} +rcon.password \"{{RCON_PASS}}\" +server.hostname \"{{HOSTNAME}}\" +server.level \"Procedural Map\" +server.worldsize {{WORLD_SIZE}} +server.maxplayers {{MAX_PLAYERS}} +server.seed {{SEED}}",
      variables: [
        { name: "Hostname", envVariable: "HOSTNAME", defaultValue: "A Rust Server", description: "The name of the server, shown in the server browser.", editable: true },
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "50", description: "Maximum concurrent players.", editable: true },
        { name: "World Size", envVariable: "WORLD_SIZE", defaultValue: "3000", description: "Procedural map size.", editable: true },
        { name: "Seed", envVariable: "SEED", defaultValue: "12345", description: "Map generation seed.", editable: true },
        { name: "RCON Port", envVariable: "RCON_PORT", defaultValue: "28016", description: "Port used for remote console access.", editable: true },
        { name: "RCON Password", envVariable: "RCON_PASS", defaultValue: "changeme", description: "Password for remote console access.", editable: true },
      ],
    },
    {
      id: "egg-ark-se",
      name: "ARK: Survival Evolved",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("376030") },
      startup: "./ShooterGame/Binaries/Linux/ShooterGameServer {{MAP_NAME}}?listen?Port={{SERVER_PORT}}?QueryPort={{QUERY_PORT}}?MaxPlayers={{MAX_PLAYERS}} -server -log",
      variables: [
        { name: "Map", envVariable: "MAP_NAME", defaultValue: "TheIsland", description: "Which map to load (TheIsland, ScorchedEarth_P, Aberration_P, etc).", editable: true },
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "70", description: "Maximum concurrent players.", editable: true },
        { name: "Query Port", envVariable: "QUERY_PORT", defaultValue: "27015", description: "Steam query port for the server browser.", editable: true },
      ],
    },
    {
      id: "egg-cs2",
      name: "Counter-Strike 2",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("730") },
      startup: "./game/bin/linuxsteamrt64/cs2 -dedicated -port {{SERVER_PORT}} +map {{MAP}} +game_type 0 +game_mode 1 -maxplayers {{MAX_PLAYERS}}",
      variables: [
        { name: "Map", envVariable: "MAP", defaultValue: "de_dust2", description: "Starting map.", editable: true },
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "10", description: "Maximum concurrent players.", editable: true },
      ],
    },
    {
      id: "egg-gmod",
      name: "Garry's Mod",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("4020") },
      startup: "./srcds_run -game garrysmod -console -port {{SERVER_PORT}} +map {{MAP}} +maxplayers {{MAX_PLAYERS}} +gamemode {{GAMEMODE}}",
      variables: [
        { name: "Map", envVariable: "MAP", defaultValue: "gm_construct", description: "Starting map.", editable: true },
        { name: "Gamemode", envVariable: "GAMEMODE", defaultValue: "sandbox", description: "Gamemode to load.", editable: true },
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "16", description: "Maximum concurrent players.", editable: true },
      ],
    },
    {
      id: "egg-tf2",
      name: "Team Fortress 2",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("232250") },
      startup: "./srcds_run -game tf -console -port {{SERVER_PORT}} +map {{MAP}} +maxplayers {{MAX_PLAYERS}}",
      variables: [
        { name: "Map", envVariable: "MAP", defaultValue: "ctf_2fort", description: "Starting map.", editable: true },
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "24", description: "Maximum concurrent players.", editable: true },
      ],
    },
    {
      id: "egg-valheim",
      name: "Valheim",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("896660") },
      startup: "./valheim_server.x86_64 -name \"{{SERVER_NAME}}\" -port {{SERVER_PORT}} -world \"{{WORLD_NAME}}\" -password \"{{SERVER_PASSWORD}}\"",
      variables: [
        { name: "Server Name", envVariable: "SERVER_NAME", defaultValue: "My Valheim Server", description: "Shown in the server browser.", editable: true },
        { name: "World Name", envVariable: "WORLD_NAME", defaultValue: "Dedicated", description: "Save file / world name.", editable: true },
        { name: "Server Password", envVariable: "SERVER_PASSWORD", defaultValue: "changeme", description: "Password required to join (min 5 characters).", editable: true },
      ],
    },
    {
      id: "egg-7dtd",
      name: "7 Days to Die",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("294420") },
      startup: "./7DaysToDieServer.x86_64 -logfile /home/container/output.log -quit -batchmode -nographics -configfile=serverconfig.xml -dedicated",
      variables: [
        { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "8", description: "Set inside serverconfig.xml — edit via the File Manager.", editable: false },
      ],
    },
    {
      id: "egg-projectzomboid",
      name: "Project Zomboid",
      category: "Games",
      dockerImage: STEAM_RUNTIME_IMAGE,
      portEnvVar: "SERVER_PORT",
      volumePath: "/home/container",
      envVars: {},
      versionEnvVar: "",
      versions: [],
      isPterodactyl: true,
      installScript: { container: "debian:bookworm-slim", entrypoint: "bash", script: steamCmdInstallScript("380870") },
      startup: "./start-server.sh -servername {{SERVER_NAME}} -adminpassword {{ADMIN_PASSWORD}} -port {{SERVER_PORT}}",
      variables: [
        { name: "Server Name", envVariable: "SERVER_NAME", defaultValue: "servertest", description: "Save/config name for this server instance.", editable: true },
        { name: "Admin Password", envVariable: "ADMIN_PASSWORD", defaultValue: "changeme", description: "In-game admin password.", editable: true },
      ],
    },
  ];
}

// Factorio doesn't need SteamCMD — it's a direct download from the
// official site, so it gets its own simpler install script.
function factorioEgg() {
  return {
    id: "egg-factorio",
    name: "Factorio",
    category: "Games",
    dockerImage: "factoriotools/factorio:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/factorio",
    envVars: {},
    versionEnvVar: "",
    versions: [],
    isPterodactyl: true,
    installScript: {
      container: "debian:bookworm-slim",
      entrypoint: "bash",
      script: [
        "#!/bin/bash",
        "apt update -y && apt install -y curl xz-utils",
        "cd /mnt/server",
        'curl -sSL "https://factorio.com/get-download/stable/headless/linux64" -o factorio.tar.xz',
        "tar -xJf factorio.tar.xz --strip-components=1",
        "rm factorio.tar.xz",
        'echo \'{"name": "{{SERVER_NAME}}", "description": "", "visibility": {"public": false, "lan": true}, "max_players": {{MAX_PLAYERS}}}\' > /mnt/server/server-settings.json',
        'echo "Install complete."',
      ].join("\n"),
    },
    startup: "./bin/x64/factorio --start-server-load-latest --server-settings server-settings.json --port {{SERVER_PORT}}",
    variables: [
      { name: "Server Name", envVariable: "SERVER_NAME", defaultValue: "My Factorio Server", description: "Shown in the multiplayer server list.", editable: true },
      { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "0", description: "0 means unlimited.", editable: true },
    ],
  };
}

// Terraria (TShock) — a Java-free download of the TShock server release
// from GitHub, no SteamCMD needed either.
function terrariaEgg() {
  return {
    id: "egg-terraria",
    name: "Terraria (TShock)",
    category: "Games",
    dockerImage: "mono:latest",
    portEnvVar: "SERVER_PORT",
    volumePath: "/home/container",
    envVars: {},
    versionEnvVar: "",
    versions: [],
    isPterodactyl: true,
    installScript: {
      container: "debian:bookworm-slim",
      entrypoint: "bash",
      script: [
        "#!/bin/bash",
        "apt update -y && apt install -y curl unzip jq",
        "cd /mnt/server",
        'LATEST_URL=$(curl -s https://api.github.com/repos/Pryaxis/TShock/releases/latest | jq -r \'.assets[] | select(.name | test("linux-x64.zip")) | .browser_download_url\')',
        'curl -sSL "$LATEST_URL" -o tshock.zip',
        "unzip -o tshock.zip -d /mnt/server",
        "rm tshock.zip",
        "chmod +x /mnt/server/TShock.Server",
        'echo "Install complete."',
      ].join("\n"),
    },
    startup: "./TShock.Server -port {{SERVER_PORT}} -maxplayers {{MAX_PLAYERS}} -world {{WORLD_NAME}}",
    variables: [
      { name: "World Name", envVariable: "WORLD_NAME", defaultValue: "world", description: "World save file name (created on first start if missing).", editable: true },
      { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "8", description: "Maximum concurrent players.", editable: true },
    ],
  };
}

// FiveM/RedM (Cfx.re) — the FXServer artifact is a plain tar.xz downloaded
// straight from Cfx.re's own runtime + changelog API (no SteamCMD), and
// the base server-data resources come from Cfx's official git repo. A
// license key from https://keymaster.fivem.net is mandatory for FiveM/RedM
// to run at all — there's no way around entering one, so it's a required
// editable variable rather than something the install script can fetch.
function cfxServerEgg(opts: { id: string; name: string; artifactChannel: string; dataRepo: string }) {
  return {
    id: opts.id,
    name: opts.name,
    category: "Games",
    dockerImage: "debian:bookworm-slim",
    portEnvVar: "SERVER_PORT",
    volumePath: "/home/container",
    envVars: {},
    versionEnvVar: "",
    versions: [],
    isPterodactyl: true,
    installScript: {
      container: "debian:bookworm-slim",
      entrypoint: "bash",
      script: [
        "#!/bin/bash",
        "apt update -y && apt install -y curl xz-utils ca-certificates git jq",
        "cd /mnt/server",
        `BUILD_URL=$(curl -s "https://changelogs-live.fivem.net/api/changelog/versions/linux/server" | jq -r '.${opts.artifactChannel}')`,
        'curl -sSL "$BUILD_URL" -o fx.tar.xz',
        "tar xf fx.tar.xz",
        "rm fx.tar.xz",
        `git clone --depth 1 ${opts.dataRepo} /tmp/server-data`,
        "cp -rn /tmp/server-data/* /mnt/server/ 2>/dev/null || true",
        "rm -rf /tmp/server-data",
        "mkdir -p /mnt/server/resources",
        'if [ ! -f /mnt/server/server.cfg ]; then',
        '  echo "endpoint_add_tcp \\"0.0.0.0:{{SERVER_PORT}}\\"" > /mnt/server/server.cfg',
        '  echo "endpoint_add_udp \\"0.0.0.0:{{SERVER_PORT}}\\"" >> /mnt/server/server.cfg',
        '  echo "sv_licenseKey \\"{{LICENSE_KEY}}\\"" >> /mnt/server/server.cfg',
        '  echo "sv_hostname \\"{{HOSTNAME}}\\"" >> /mnt/server/server.cfg',
        '  echo "sv_maxclients {{MAX_PLAYERS}}" >> /mnt/server/server.cfg',
        '  echo "sets sv_projectName \\"' + opts.name + ' Server\\"" >> /mnt/server/server.cfg',
        "fi",
        'echo "Install complete. Edit server.cfg (Config Editor / File Manager) to add resources with ensure <name>."',
      ].join("\n"),
    },
    startup: "./run.sh +exec server.cfg",
    variables: [
      { name: "License Key", envVariable: "LICENSE_KEY", defaultValue: "", description: `Required — get a free key from https://keymaster.fivem.net (Cfx.re account needed). The server will not start without one.`, editable: true },
      { name: "Hostname", envVariable: "HOSTNAME", defaultValue: `My ${opts.name} Server`, description: "Shown in the server browser.", editable: true },
      { name: "Max Players", envVariable: "MAX_PLAYERS", defaultValue: "48", description: "Maximum concurrent players.", editable: true },
    ],
  };
}

function fivemEgg() {
  return cfxServerEgg({
    id: "egg-fivem",
    name: "FiveM",
    artifactChannel: "recommended.download",
    dataRepo: "https://github.com/citizenfx/cfx-server-data.git",
  });
}

function redmEgg() {
  return cfxServerEgg({
    id: "egg-redm",
    name: "RedM",
    artifactChannel: "recommended.download",
    dataRepo: "https://github.com/citizenfx/cfx-server-data.git",
  });
}

// Real, working Pterodactyl egg exports bundled with the panel so
// non-Minecraft software shows up on Create Server out of the box, without
// requiring an admin to find and upload egg JSON files first. Each of these
// is a verbatim egg export (same format a "Export" from a real Pterodactyl
// panel produces) run through the same convertPterodactylEgg() conversion
// used for admin-uploaded eggs — so they exercise (and prove out) the exact
// same install-script + startup-variable pipeline that uploaded eggs use.
const BUNDLED_PTDL_EGG_FILES: { file: string; id: string; category: string }[] = [
  { file: "python-generic.json", id: "egg-python-generic", category: "Applications" },
  { file: "nodejs-generic.json", id: "egg-nodejs-generic", category: "Applications" },
  { file: "palworld.json", id: "egg-palworld", category: "Games" },
];

let bundledPterodactylEggsCache: any[] | null = null;
function loadBundledPterodactylEggs(): any[] {
  if (bundledPterodactylEggsCache) return bundledPterodactylEggsCache;
  const dir = path.join(process.cwd(), "src", "server", "data", "ptdl-eggs");
  const eggs: any[] = [];
  for (const entry of BUNDLED_PTDL_EGG_FILES) {
    try {
      const raw = fs.readJsonSync(path.join(dir, entry.file));
      const converted = convertPterodactylEgg(raw);
      eggs.push({ ...converted, id: entry.id, category: entry.category });
    } catch (e) {
      console.warn(`Could not load bundled egg ${entry.file}:`, e);
    }
  }
  bundledPterodactylEggsCache = eggs;
  return eggs;
}

async function ensureEggsSeeded() {
  const bundledPtdlEggs = loadBundledPterodactylEggs();
  const allDefaults = [...DEFAULT_EGGS, ...bundledPtdlEggs];

  const existing = await readJSON("eggs.json");
  if (!existing || existing.length === 0) {
    await writeJSON("eggs.json", allDefaults);
    return allDefaults;
  }

  // Panels installed before the Startup tab existed have eggs.json entries
  // (matched by id) that predate the `startup`/`variables` fields. Backfill
  // those in place so upgrading doesn't require wiping eggs.json by hand.
  let changed = false;
  const migrated = existing.map((egg: any) => {
    const defaults = DEFAULT_EGGS.find((d) => d.id === egg.id);
    if (defaults && (!egg.startup || !Array.isArray(egg.variables) || egg.variables.length === 0)) {
      changed = true;
      return { ...egg, startup: egg.startup || defaults.startup, variables: (Array.isArray(egg.variables) && egg.variables.length > 0) ? egg.variables : defaults.variables };
    }
    return egg;
  });

  // Panels that already existed before newer eggs (bundled Pterodactyl
  // JSON eggs, or new entries added to DEFAULT_EGGS like new games) were
  // added won't have them in eggs.json yet — backfill just these specific
  // ids (never re-adds a built-in egg an admin deliberately deleted,
  // since only ids that are still in the current default set are checked).
  const existingIds = new Set(migrated.map((e: any) => e.id));
  for (const def of allDefaults) {
    if (!existingIds.has(def.id)) {
      migrated.push(def);
      changed = true;
    }
  }

  if (changed) {
    await writeJSON("eggs.json", migrated);
    return migrated;
  }
  return existing;
}

export const getEggs = async (req: Request, res: Response) => {
  const eggs = await ensureEggsSeeded();
  res.json(eggs);
};

export const getEgg = async (req: Request, res: Response) => {
  const eggs = await readJSON("eggs.json") || [];
  const egg = eggs.find((e: any) => e.id === req.params.id);
  if (!egg) return res.status(404).json({ error: "Egg not found" });
  res.json(egg);
};

// Detects a genuine Pterodactyl egg export (the JSON produced by "Export"
// on a Pterodactyl panel — meta.version "PTDL_v1"/"PTDL_v2", or the
// docker_images/variables shape those exports always have).
function isPterodactylEgg(body: any): boolean {
  if (!body) return false;
  if (body.meta && typeof body.meta.version === "string" && body.meta.version.startsWith("PTDL")) return true;
  return !!(body.docker_images && body.variables);
}

// Converts a Pterodactyl egg export into our simpler internal egg shape.
// Pterodactyl offers one Docker image per selectable "version" (e.g.
// python_3.12, python_3.11...) instead of one image + a VERSION env var,
// so those become `versionImages` (version label -> image) here.
// The egg's installation script and startup/variable conventions are
// captured too (see isPterodactyl/installScript below) so the container
// creation logic can run real Pterodactyl eggs, not just simple ones.
function convertPterodactylEgg(ptdl: any) {
  const dockerImages: Record<string, string> = ptdl.docker_images || {};
  const imageEntries = Object.entries(dockerImages);

  const category = String(ptdl.name || "Custom")
    .replace(/custom startup/i, "")
    .replace(/\begg\b/i, "")
    .trim() || String(ptdl.name || "Custom");

  const versionImages: Record<string, string> = {};
  const versions: string[] = [];
  for (const [label, image] of imageEntries) {
    const match = label.match(/(\d+(?:\.\d+)*)(?!.*\d)/);
    const versionLabel = match ? match[1] : label;
    versionImages[versionLabel] = image as string;
    versions.push(versionLabel);
  }

  const envVars: Record<string, string> = {};
  // Full variable metadata (name/description/editable), kept separately from
  // the flat envVars map so the Startup tab can show more than just a key
  // and a value — this is what Pterodactyl calls the egg's "variables".
  const variables: any[] = [];
  if (Array.isArray(ptdl.variables)) {
    for (const v of ptdl.variables) {
      if (v && v.env_variable) {
        const value = v.default_value !== undefined && v.default_value !== null ? String(v.default_value) : "";
        envVars[String(v.env_variable).toUpperCase()] = value;
        variables.push({
          name: String(v.name || v.env_variable),
          envVariable: String(v.env_variable).toUpperCase(),
          defaultValue: value,
          description: String(v.description || ""),
          // Pterodactyl exports use "0|1" style rules for user_editable.
          editable: v.user_editable === true || v.user_editable === 1 || v.user_editable === "1",
        });
      }
    }
  }

  // Pterodactyl eggs almost always need their installation script to run
  // once (in a separate throwaway container) to actually download/build the
  // server software before the main container can start — without this,
  // most eggs would boot into an empty volume and immediately crash.
  // Scripts uploaded/edited on Windows often carry CRLF (\r\n) line
  // endings; bash treats the stray \r as its own bogus command ("$'\r':
  // command not found") and can even break multi-line constructs (if/fi,
  // here-docs) with a "syntax error: unexpected end of file". Normalizing
  // to \n here avoids that regardless of where the egg was authored.
  const installScript = ptdl.scripts?.installation?.script
    ? {
        script: String(ptdl.scripts.installation.script).replace(/\r\n/g, "\n").replace(/\r/g, "\n"),
        container: String(ptdl.scripts.installation.container || "alpine:3.4"),
        entrypoint: String(ptdl.scripts.installation.entrypoint || "ash"),
      }
    : null;

  return {
    name: String(ptdl.name || "Imported Egg"),
    category,
    dockerImage: (imageEntries[0]?.[1] as string) || "",
    portEnvVar: "SERVER_PORT",
    volumePath: "/home/container",
    envVars,
    versionEnvVar: "",
    versions,
    versionImages,
    // The real startup command template from the egg export (e.g.
    // "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"),
    // shown verbatim on the Startup tab instead of a synthesized one, AND
    // passed to the container as the STARTUP env var — Pterodactyl's own
    // (yolks) Docker images have a built-in entrypoint that substitutes
    // {{VARIABLE}} tokens using the container's env vars and execs it.
    startup: String(ptdl.startup || ""),
    variables,
    installScript,
    // Flags this as a real imported Pterodactyl egg so the container
    // creation logic uses Pterodactyl-standard env vars/working dir and
    // runs the installation script, instead of the itzg-style handling
    // used by the built-in Minecraft/proxy eggs.
    isPterodactyl: true,
  };
}

// Accepts an "egg" JSON definition — either our own simple format, or a
// real Pterodactyl egg export (auto-detected and converted above):
// {
//   name, category, dockerImage, portEnvVar, volumePath,
//   envVars: { KEY: "value", ... }, versionEnvVar, versions: ["1.0", ...]
// }
export const createEgg = async (req: Request, res: Response) => {
  const body = isPterodactylEgg(req.body) ? convertPterodactylEgg(req.body) : req.body;
  const { name, category, dockerImage, portEnvVar, volumePath, envVars, versionEnvVar, versions, versionImages, startup, variables, installScript, isPterodactyl } = body;

  if (!name || !dockerImage) {
    return res.status(400).json({ error: "Egg must include at least a name and dockerImage" });
  }

  const egg: any = {
    id: "egg-" + crypto.randomUUID(),
    name: String(name),
    category: category ? String(category) : "Other",
    dockerImage: String(dockerImage),
    portEnvVar: portEnvVar ? String(portEnvVar) : "SERVER_PORT",
    volumePath: volumePath ? String(volumePath) : "/data",
    envVars: envVars && typeof envVars === "object" ? envVars : {},
    versionEnvVar: versionEnvVar ? String(versionEnvVar) : "VERSION",
    versions: Array.isArray(versions) ? versions.map(String) : [],
    // Startup command template (supports {{VARIABLE}} tokens) and the
    // list of variables that feed it — powers the per-server Startup tab.
    startup: startup ? String(startup) : "",
    variables: Array.isArray(variables) ? variables : [],
    // Real Pterodactyl eggs carry an installation script that must run
    // once before the server can start (downloads/builds the actual
    // server software into the volume).
    installScript: installScript && installScript.script
      ? { ...installScript, script: String(installScript.script).replace(/\r\n/g, "\n").replace(/\r/g, "\n") }
      : null,
    isPterodactyl: !!isPterodactyl,
  };
  if (versionImages && typeof versionImages === "object" && Object.keys(versionImages).length > 0) {
    egg.versionImages = versionImages;
    egg.versionEnvVar = "";
  }

  const eggs = await ensureEggsSeeded();
  eggs.push(egg);
  await writeJSON("eggs.json", eggs);
  res.json({ success: true, egg });
};

// A lightweight stand-in for Pterodactyl's "Nests": eggs are already
// grouped by their free-text `category` field, so renaming a category
// just needs to update every egg that currently shares it.
export const renameCategory = async (req: Request, res: Response) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ error: "oldName and newName are required" });
    }
    const eggs = await readJSON("eggs.json") || [];
    let count = 0;
    for (const egg of eggs) {
      if (egg.category === oldName) {
        egg.category = String(newName);
        count++;
      }
    }
    await writeJSON("eggs.json", eggs);
    res.json({ success: true, updated: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to rename category" });
  }
};

export const deleteEgg = async (req: Request, res: Response) => {
  const eggs = await readJSON("eggs.json") || [];
  const filtered = eggs.filter((e: any) => e.id !== req.params.id);
  await writeJSON("eggs.json", filtered);
  res.json({ success: true });
};
