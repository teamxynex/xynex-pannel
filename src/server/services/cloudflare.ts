const API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareCreds {
  apiToken: string;
  accountId: string;
  tunnelId: string;
}

async function cfFetch(url: string, apiToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const message = json?.errors?.[0]?.message || `Cloudflare API request failed (${res.status})`;
    throw new Error(message);
  }
  return json.result;
}

// Adds/updates a public hostname on the tunnel's ingress config, routing it
// to the panel (or any local service) with the given TLS behaviour. Keeps
// any other existing hostnames already configured for this tunnel.
export async function upsertTunnelHostname(
  creds: CloudflareCreds,
  hostname: string,
  service: string,
  noTLSVerify: boolean
) {
  const { apiToken, accountId, tunnelId } = creds;
  const configUrl = `${API_BASE}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`;

  let existing: any = { ingress: [] };
  try {
    existing = await cfFetch(configUrl, apiToken);
  } catch (e) {
    // No configuration saved yet for this tunnel — start from empty.
  }

  const currentIngress: any[] = Array.isArray(existing?.config?.ingress) ? existing.config.ingress : [];
  // Drop any prior rule for this exact hostname and the trailing catch-all —
  // we'll re-add a single catch-all at the end.
  const otherRules = currentIngress.filter((r: any) => r.hostname && r.hostname !== hostname);

  const newRule: any = { hostname, service };
  if (noTLSVerify) newRule.originRequest = { noTLSVerify: true };

  const ingress = [newRule, ...otherRules, { service: "http_status:404" }];

  await cfFetch(configUrl, apiToken, {
    method: "PUT",
    body: JSON.stringify({ config: { ingress } }),
  });
}

// Best-effort DNS setup: finds the Cloudflare zone that owns this hostname
// (walking up from the full hostname to its root domain) and creates/updates
// a proxied CNAME pointing at the tunnel. Returns false (without throwing) if
// no matching zone is found under this API token, so the caller can fall
// back to telling the admin to add the DNS record manually.
export async function upsertTunnelDns(creds: CloudflareCreds, hostname: string): Promise<boolean> {
  const { apiToken, tunnelId } = creds;
  const labels = hostname.split(".");

  for (let i = 0; i < labels.length - 1; i++) {
    const candidateZone = labels.slice(i).join(".");
    let zones: any[];
    try {
      zones = await cfFetch(`${API_BASE}/zones?name=${encodeURIComponent(candidateZone)}`, apiToken);
    } catch (e) {
      continue;
    }
    if (!zones || zones.length === 0) continue;

    const zoneId = zones[0].id;
    const target = `${tunnelId}.cfargotunnel.com`;

    let records: any[] = [];
    try {
      records = await cfFetch(`${API_BASE}/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`, apiToken);
    } catch (e) {
      records = [];
    }

    const body = JSON.stringify({ type: "CNAME", name: hostname, content: target, proxied: true, ttl: 1 });
    if (records && records.length > 0) {
      await cfFetch(`${API_BASE}/zones/${zoneId}/dns_records/${records[0].id}`, apiToken, { method: "PUT", body });
    } else {
      await cfFetch(`${API_BASE}/zones/${zoneId}/dns_records`, apiToken, { method: "POST", body });
    }
    return true;
  }

  return false;
}
