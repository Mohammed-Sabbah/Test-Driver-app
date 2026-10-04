export type TransportMode = 'rest' | 'batch' | 'sse' | 'socket';

export interface DriverTelemetryPayload {
  id?: number; // local IndexedDB autoincrement ID
  vehicleId: string;
  taskId?: string;
  driverId: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees
  accuracy: number; // meters
  timestamp: number; // ms
  clientSeq: number; // monotonic sequence counter
  transportMode: TransportMode;
}

export interface TelemetryServerResponse {
  success: boolean;
  message?: string;
  clientSeq: number;
  serverTime: number;
  transitDelayMs: number;
  processedCount?: number;
}

export interface NetworkDiagnostics {
  online: boolean;
  type?: string; // 'wifi' | 'cellular' | etc.
  effectiveType?: string; // '4g' | '3g' | '2g' | 'slow-2g'
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;
}

export interface DiagnosticLog {
  id: string;
  timestamp: number;
  timeStr: string;
  level: 'info' | 'success' | 'warn' | 'error';
  category: 'GPS' | 'NET' | 'REST' | 'SOCKET' | 'SSE' | 'STORAGE' | 'SYNC';
  message: string;
  details?: string;
}

export interface TransmissionMetrics {
  totalGenerated: number;
  totalSent: number;
  totalAcknowledged: number;
  totalFailed: number;
  totalQueued: number;
  totalSynced: number;
  avgLatencyMs: number;
  lastLatencyMs: number;
  socketDisconnects: number;
  sseDisconnects: number;
}
