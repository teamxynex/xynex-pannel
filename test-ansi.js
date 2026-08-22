const log = "\x1b[?1h\x1b=\x1b[?2004h>\x1b[K[06:05:11 INFO]: \x1b[97mServer Plugins (1):\x1b[0m";
const cleaned = log.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
console.log(cleaned);
