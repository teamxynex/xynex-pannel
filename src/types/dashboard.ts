export type ServerStatus = "online" | "offline" | "starting" | "error" | (string & {});

export interface ServerSummary {
  id: string;
  name: string;
  status: ServerStatus;
  createdAt: string;
  software?: string;
  version?: string;
  port?: number;
  ipAlias?: string;
  suspended?: boolean;
  owner?: string;
  memory?: number;
  cpu?: number;
  disk?: number;
  eggName?: string;
  type?: string;
  node?: string;
}

export interface SystemStats {
  cpuUsage: number;
  ramUsage: number;
  diskUsage?: number;
  activeContainers?: number;
  totalContainers?: number;
  uptime?: string;
  cpuPercent?: number;
  cpuCores?: number;
  totalMemory?: number;
  freeMemory?: number;
  totalDisk?: number;
  usedDisk?: number;
  uptimeSeconds?: number;
}

export interface HistoryPoint {
  t: number;
  cpu: number;
  ram: number;
  disk: number;
}

