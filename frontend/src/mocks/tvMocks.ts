export interface TvDeviceItem {
  id: string;
  hostname: string;
  category: string;
  protocol: string;
  ip: string;
  status: "UP" | "DOWN" | "DEGRADADO" | "MANUTENÇÃO";
  rtt: string;
  rttUnit: string;
  heroSub: string;
  metricLabel: string;
  metricBadge: string;
  bottomLeft: string;
  bottomRight: string;
}

export interface TvIncidentItem {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  device: string;
  ip: string;
  client: string;
  title: string;
  startedAgo: string;
  slaRemaining: string;
  glpiTicket: string;
  assignee: string;
  status: "INVESTIGANDO" | "EM ATENDIMENTO" | "MITIGANDO";
}

export interface TvBackboneLink {
  id: string;
  name: string;
  type: string;
  capacity: string;
  utilization: string;
  utilizationPercent: number;
  rtt: string;
  packetLoss: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

export const TV_DEVICES: TvDeviceItem[] = [
  {
    id: "dev-1",
    hostname: "AUTH-KEYCLOAK-IAM",
    category: "Security",
    protocol: "OIDC / SAML",
    ip: "10.0.1.20",
    status: "UP",
    rtt: "14.2",
    rttUnit: "ms",
    heroSub: "14.8k Sessões",
    metricLabel: "TEMPO DE TOKEN OAUTH",
    metricBadge: "MFA Ativo",
    bottomLeft: "Ameaças: 0 | 100% Auth",
    bottomRight: "Realm: Banco-Sol",
  },
  {
    id: "dev-2",
    hostname: "BACKUP-MINIO-S3",
    category: "Disaster Recovery",
    protocol: "S3 API :9000",
    ip: "10.0.2.15",
    status: "UP",
    rtt: "3.2",
    rttUnit: "ms",
    heroSub: "WORM 30d",
    metricLabel: "LATÊNCIA S3 PUT/GET",
    metricBadge: "85 MB/s",
    bottomLeft: "Objetos: 4.8M",
    bottomRight: "Blast Radius Zero",
  },
  {
    id: "dev-3",
    hostname: "STORAGE-SAN-HUSKY",
    category: "Banco Sol",
    protocol: "Fiber Channel",
    ip: "10.0.3.50",
    status: "MANUTENÇÃO",
    rtt: "74",
    rttUnit: "%",
    heroSub: "ISENTO DE SLA",
    metricLabel: "UPGRADE FIRMWARE V5.2",
    metricBadge: "Aditivo #04",
    bottomLeft: "Janela: 01:00 → 04:00",
    bottomRight: "IO Drained Safe",
  },
  {
    id: "dev-4",
    hostname: "FIREWALL-PALOALTO-01",
    category: "Perimeter DMZ",
    protocol: "HA Active",
    ip: "10.200.1.1",
    status: "UP",
    rtt: "1.1",
    rttUnit: "ms",
    heroSub: "1.492 Bloqueios",
    metricLabel: "LATÊNCIA INSPEÇÃO L7",
    metricBadge: "CPU: 18%",
    bottomLeft: "Sessões: 84.1k",
    bottomRight: "Policies in Sync",
  },
  {
    id: "dev-5",
    hostname: "SW-CORE-LUANDA-01",
    category: "Unitel Backbone",
    protocol: "10.200.0.1",
    ip: "10.200.0.1",
    status: "DOWN",
    rtt: "100",
    rttUnit: "%",
    heroSub: "TIMEOUT TOTAL",
    metricLabel: "PERDA DE PACOTES",
    metricBadge: "RTT > 3.000ms",
    bottomLeft: "GLPI #8492 [Em Atendimento]",
    bottomRight: "SRE L3 Luanda",
  },
  {
    id: "dev-6",
    hostname: "API-GATEWAY-PROD",
    category: "Banco Sol",
    protocol: "10.100.4.12",
    ip: "10.100.4.12",
    status: "DEGRADADO",
    rtt: "342.8",
    rttUnit: "ms",
    heroSub: "▲ +180ms delta",
    metricLabel: "TEMPO DE RESPOSTA HTTP",
    metricBadge: "Limiar: 250ms",
    bottomLeft: "Pool: 12 Pods Ativos",
    bottomRight: "Auto-Throttle Ativo",
  },
  {
    id: "dev-7",
    hostname: "ROUTER-EDGE-BENGUELA",
    category: "Sonangol Logistics",
    protocol: "SD-WAN #04",
    ip: "10.150.8.1",
    status: "DEGRADADO",
    rtt: "188.4",
    rttUnit: "ms",
    heroSub: "▲ Meta: < 90ms",
    metricLabel: "LATÊNCIA ENLACE MPLS",
    metricBadge: "Perda: 2.1%",
    bottomLeft: "Circuito Secundário",
    bottomRight: "Rota Contingência",
  },
  {
    id: "dev-8",
    hostname: "DB-TIMESCALEDB-PRIMARY",
    category: "Core Telemetry",
    protocol: "10.0.1.5:5432",
    ip: "10.0.1.5",
    status: "UP",
    rtt: "1.4",
    rttUnit: "ms",
    heroSub: "▼ Zero Packet Drop",
    metricLabel: "LATÊNCIA TCP SYN/ACK",
    metricBadge: "Sync Lag: 0s",
    bottomLeft: "WAL Archiving: On",
    bottomRight: "90d Nominal",
  },
  {
    id: "dev-9",
    hostname: "K8S-INGRESS-01",
    category: "Unitel Borda",
    protocol: "10.50.2.1:443",
    ip: "10.50.2.1",
    status: "UP",
    rtt: "4.2",
    rttUnit: "ms",
    heroSub: "42.1k req/s",
    metricLabel: "LATÊNCIA MÉDIA DE BORDA",
    metricBadge: "Perda: 0.0%",
    bottomLeft: "Traefik v2.11 Proxy",
    bottomRight: "Baseline Normal",
  },
  {
    id: "dev-10",
    hostname: "CONTAINER-REDIS-LEADER",
    category: "Docker Core",
    protocol: "unix socket",
    ip: "127.0.0.1",
    status: "UP",
    rtt: "0.8",
    rttUnit: "ms",
    heroSub: "18.4k ops/s",
    metricLabel: "IPC SOCKET LATENCY",
    metricBadge: "Hit Rate: 99.4%",
    bottomLeft: "Uptime: 142 dias",
    bottomRight: "Socket Connected",
  },
  {
    id: "dev-11",
    hostname: "SW-ACCESS-TALATONA",
    category: "Sede Talatona",
    protocol: "10.220.12.1",
    ip: "10.220.12.1",
    status: "UP",
    rtt: "2.1",
    rttUnit: "ms",
    heroSub: "STP Root OK",
    metricLabel: "PING ICMP AGÊNCIA",
    metricBadge: "Portas: 48/48 UP",
    bottomLeft: "PoE Status: Nominal",
    bottomRight: "48 Enlaces",
  },
  {
    id: "dev-12",
    hostname: "DNS-RESOLVER-PUBLIC",
    category: "External IP",
    protocol: "Anycast #1",
    ip: "1.1.1.1",
    status: "UP",
    rtt: "8.5",
    rttUnit: "ms",
    heroSub: "DNSSEC OK",
    metricLabel: "RESOLUÇÃO UDP QUERY",
    metricBadge: "Sucesso: 99.99%",
    bottomLeft: "BIND9 Carrier Grade",
    bottomRight: "Zero Lag",
  },
];

export const TV_INCIDENTS: TvIncidentItem[] = [
  {
    id: "inc-1",
    severity: "CRITICAL",
    device: "SW-CORE-LUANDA-01",
    ip: "10.200.0.1",
    client: "Unitel Corporate Backbone",
    title: "Queda Total de Conectividade ICMP • Enlace Fibra Óptica Rompido",
    startedAgo: "3m 42s",
    slaRemaining: "00:41:18",
    glpiTicket: "#8492",
    assignee: "Daniel Ndonda (SRE L3)",
    status: "EM ATENDIMENTO",
  },
  {
    id: "inc-2",
    severity: "HIGH",
    device: "API-GATEWAY-PROD",
    ip: "10.100.4.12",
    client: "Banco Sol Core Banking",
    title: "Degradação HTTP P95 > 340ms • Limiar de SLA de 250ms Ultrapassado",
    startedAgo: "14m 20s",
    slaRemaining: "01:45:40",
    glpiTicket: "#8495",
    assignee: "Equipe Core App",
    status: "MITIGANDO",
  },
  {
    id: "inc-3",
    severity: "HIGH",
    device: "ROUTER-EDGE-BENGUELA",
    ip: "10.150.8.1",
    client: "Sonangol Logistics",
    title: "Jitter Elevado e Flap em Enlace Primário SD-WAN • Tráfego em Rota de Contingência",
    startedAgo: "28m 05s",
    slaRemaining: "01:01:55",
    glpiTicket: "#8497",
    assignee: "Telecom Angola NOC",
    status: "INVESTIGANDO",
  },
];

export const TV_BACKBONES: TvBackboneLink[] = [
  {
    id: "bb-1",
    name: "Luanda DC1 ↔ Talatona DC2",
    type: "Fibra Escura Dupla 100Gbps",
    capacity: "100 Gbps",
    utilization: "53.4 Gbps",
    utilizationPercent: 53.4,
    rtt: "2.1 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-2",
    name: "Angola Cables WACS Subsea",
    type: "Cabo Submarino Sangano ↔ Sesimbra",
    capacity: "40 Gbps",
    utilization: "24.1 Gbps",
    utilizationPercent: 60.2,
    rtt: "114.2 ms",
    packetLoss: "0.02%",
    status: "HEALTHY",
  },
  {
    id: "bb-3",
    name: "BNA Metro Ring Luanda",
    type: "Anel Metro DWDM 10Gbps",
    capacity: "10 Gbps",
    utilization: "2.3 Gbps",
    utilizationPercent: 23.0,
    rtt: "1.4 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-4",
    name: "Sonangol Logistics SD-WAN",
    type: "Enlace Micro-ondas Benguela",
    capacity: "5 Gbps",
    utilization: "4.2 Gbps",
    utilizationPercent: 84.0,
    rtt: "188.4 ms",
    packetLoss: "2.10%",
    status: "DEGRADED",
  },
  {
    id: "bb-5",
    name: "Unitel Peering IXP Luanda",
    type: "PNI Direto BGP Borda",
    capacity: "40 Gbps",
    utilization: "31.8 Gbps",
    utilizationPercent: 79.5,
    rtt: "0.9 ms",
    packetLoss: "0.00%",
    status: "HEALTHY",
  },
  {
    id: "bb-6",
    name: "Luanda Core ↔ SW-CORE-01",
    type: "Enlace Trunk L3 10Gbps",
    capacity: "10 Gbps",
    utilization: "0.0 Gbps",
    utilizationPercent: 0,
    rtt: "> 3000 ms",
    packetLoss: "100.0%",
    status: "DOWN",
  },
];
