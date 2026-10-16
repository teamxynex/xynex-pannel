import net from "net";
import crypto from "crypto";

// Sends a test vote using the NuVotifier V2 protocol (host/port/token —
// the modern, HMAC-based protocol most vote sites and NuVotifier use
// today). The older "classic" Votifier protocol (RSA-encrypted, no
// token) is NOT supported here — if the target only greets with
// "VOTIFIER 1" (no challenge), we report that clearly instead of
// silently failing.
export function sendTestVote(opts: {
  host: string;
  port: number;
  token: string;
  serviceName?: string;
  username?: string;
}): Promise<{ success: boolean; message: string }> {
  const { host, port, token, serviceName = "Test", username = "TestPlayer" } = opts;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let stage: "greeting" | "response" = "greeting";
    let settled = false;

    const finish = (result: { success: boolean; message: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish({ success: false, message: "Timed out waiting for a response from the server." });
    }, 6000);

    socket.on("error", (err) => {
      finish({ success: false, message: `Connection failed: ${err.message}` });
    });

    socket.connect(port, host, () => {
      // Wait for the greeting before sending anything.
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (stage === "greeting") {
        const newlineIndex = buffer.indexOf(0x0a); // \n
        if (newlineIndex === -1) return; // wait for more data
        const greeting = buffer.subarray(0, newlineIndex).toString("utf8").trim();
        buffer = buffer.subarray(newlineIndex + 1);

        // Greeting looks like: "VOTIFIER 2 <challenge>" (v2) or
        // "VOTIFIER 1" / "VOTIFIER <version>" with no challenge (v1/classic).
        const parts = greeting.split(" ");
        const challenge = parts.length >= 3 ? parts.slice(2).join(" ") : null;

        if (!challenge) {
          finish({
            success: false,
            message: `Server greeted with "${greeting}" — this looks like classic Votifier (v1), which uses RSA encryption and isn't supported by this tester. Ask the server to use NuVotifier with a token instead.`,
          });
          return;
        }

        try {
          const voteObj = {
            serviceName,
            username,
            address: `${host}:${port}`,
            timestamp: Date.now(),
            challenge,
          };
          const payloadStr = JSON.stringify(voteObj);
          const signature = crypto.createHmac("sha256", token).update(payloadStr).digest("base64");
          const envelope = JSON.stringify({ payload: payloadStr, signature });
          const envelopeBuf = Buffer.from(envelope, "utf8");

          const header = Buffer.alloc(4);
          header.writeUInt16BE(0x733a, 0);
          header.writeUInt16BE(envelopeBuf.length, 2);

          socket.write(Buffer.concat([header, envelopeBuf]));
          stage = "response";
        } catch (e: any) {
          finish({ success: false, message: `Failed to build/send vote: ${e.message}` });
        }
        return;
      }

      if (stage === "response") {
        const text = buffer.toString("utf8").trim();
        if (!text) return;
        try {
          const parsed = JSON.parse(text);
          if (parsed.status === "ok") {
            finish({ success: true, message: "Vote accepted — the server responded with status \"ok\"." });
          } else {
            finish({ success: false, message: `Server rejected the vote: ${parsed.error || parsed.cause || text}` });
          }
        } catch {
          finish({ success: false, message: `Unexpected response from server: ${text}` });
        }
      }
    });

    socket.on("close", () => {
      finish({ success: false, message: "Connection closed before a response was received." });
    });
  });
}
