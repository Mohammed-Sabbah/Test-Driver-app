'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Database,
  Globe,
  HardDrive,
  Info,
  Lock,
  MapPin,
  Navigation,
  Play,
  Radio,
  RefreshCw,
  Route,
  Server,
  Signal,
  Square,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  DiagnosticLog,
  DriverTelemetryPayload,
  NetworkDiagnostics,
  TelemetryServerResponse,
  TransmissionMetrics,
  TransportMode,
} from '@/lib/types';
import { calculateHaversineDistance } from '@/lib/haversine';
import {
  clearQueuedTelemetry,
  getQueueCount,
  getQueuedTelemetry,
  queueTelemetryPoint,
} from '@/lib/storage';
import { getNetworkDiagnostics, subscribeToNetworkChanges } from '@/lib/network';

export default function CellularDriverLabPage() {
  // ── الإعدادات وهوية السائق ──
  const [vehicleId, setVehicleId] = useState('VEH-CELL-01');
  const [plateNumber, setPlateNumber] = useState('أ ب ج 1234');
  const [driverId, setDriverId] = useState('DRV-TEST-99');
  const [transportMode, setTransportMode] = useState<TransportMode>('rest');
  const [socketUrl, setSocketUrl] = useState('');

  // ── حالات البث والاتصال ──
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [netDiag, setNetDiag] = useState<NetworkDiagnostics>({ online: true });
  const [offlineCount, setOfflineCount] = useState(0);

  // ── بيانات الـ GPS والرحلة ──
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    accuracy: number;
  } | null>(null);

  const [tripStats, setTripStats] = useState({
    distanceMeters: 0,
    maxSpeed: 0,
    startTime: null as number | null,
  });

  // ── مصفوفة القياسات المنهجية (Metrics) ──
  const [metrics, setMetrics] = useState<TransmissionMetrics>({
    totalGenerated: 0,
    totalSent: 0,
    totalAcknowledged: 0,
    totalFailed: 0,
    totalQueued: 0,
    totalSynced: 0,
    avgLatencyMs: 0,
    lastLatencyMs: 0,
    socketDisconnects: 0,
    sseDisconnects: 0,
  });

  // ── سجل الأحداث التقني (Raw Diagnostic Log) ──
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'net'>('all');
  const [copySuccess, setCopySuccess] = useState(false);

  // ── المراجع والتحكم التكيفي ──
  const [adaptiveMode, setAdaptiveMode] = useState(true);
  const [swReady, setSwReady] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const clientSeqRef = useRef<number>(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const sseEventSourceRef = useRef<EventSource | null>(null);
  const socketRef = useRef<any>(null);
  const latencySamplesRef = useRef<number[]>([]);
  const inFlightRef = useRef<boolean>(false);
  const previousNetTypeRef = useRef<string | undefined>(undefined);

  // ── وظيفة إضافة سجل تشخيص ──
  const addLog = useCallback(
    (
      category: DiagnosticLog['category'],
      level: DiagnosticLog['level'],
      message: string,
      details?: string
    ) => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const entry: DiagnosticLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        timeStr,
        level,
        category,
        message,
        details,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 199)]); // الاحتفاظ بآخر 200 سجل
    },
    []
  );

  // ── فحص وصول الشبكة المبدئي (Baseline Ping) ──
  const executeBaselinePing = useCallback(async () => {
    addLog('NET', 'info', 'جاري فحص مسار الشبكة الأساسي عبر /api/ping...');
    const t0 = performance.now();
    try {
      const res = await fetch('/api/ping', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const t1 = performance.now();
      const latency = Math.round(t1 - t0);

      if (res.ok) {
        const data = await res.json();
        addLog(
          'NET',
          'success',
          `✅ استجابة الخادم ناجحة (${latency}ms) - IP: ${data.clientIp || 'مجهول'}`,
          `Host: ${data.carrierHost} | Mode: ${data.headers?.secFetchMode || 'cors'}`
        );
      } else {
        addLog('NET', 'warn', `⚠️ الخادم أرجع كود غير متوقع: ${res.status}`);
      }
    } catch (err: any) {
      addLog(
        'NET',
        'error',
        `❌ فشل الاتصال بالخادم نهائياً: ${err.message || 'Network Error'}`,
        'تحقق من إعدادات الجوال أو حجب شبكة البيانات'
      );
    }
  }, [addLog]);

  // ── تسجيل الـ Service Worker لتشغيل التطبيق Offline فورياً ──
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          setSwReady(true);
          addLog('STORAGE', 'success', '🚀 تم تفعيل الـ Service Worker (التطبيق جاهز للعمل من الذاكرة فوراً)');
        })
        .catch((err) => {
          addLog('STORAGE', 'warn', `تعذر تسجيل Service Worker: ${err.message}`);
        });
    }
  }, [addLog]);

  // ── مراقبة حالة الشبكة وتحديث المؤشرات والتعامل مع الانتقال بين Wi-Fi والبيانات ──
  useEffect(() => {
    const initialDiag = getNetworkDiagnostics();
    setNetDiag(initialDiag);
    previousNetTypeRef.current = initialDiag.type || initialDiag.effectiveType;
    getQueueCount().then(setOfflineCount);

    const unsubscribe = subscribeToNetworkChanges((diag) => {
      setNetDiag(diag);

      // رصد لحظة الانتقال بين الواي فاي وبيانات الهاتف (Handover)
      const prevType = previousNetTypeRef.current;
      const currentType = diag.type || diag.effectiveType;
      if (prevType && prevType !== currentType) {
        addLog(
          'NET',
          'warn',
          `🔄 تبديل واجهة الشبكة: من [${prevType}] إلى [${currentType}] - تفعيل فترة امتصاص صدمة الإشعارات (10 ثوانٍ)`
        );
        previousNetTypeRef.current = currentType;
        // إعطاء مهلة 10 ثوانٍ لامتصاص هجوم إشعارات التطبيقات الأخرى ثم تفريغ الطابور دفعة واحدة
        setTimeout(() => {
          addLog('SYNC', 'info', '🏁 انتهت فترة امتصاص الصدمة - جاري بدء تفريغ ومزامنة الطابور');
          flushQueue();
        }, 10000);
      } else {
        previousNetTypeRef.current = currentType;
      }

      addLog(
        'NET',
        diag.online ? 'success' : 'error',
        diag.online
          ? `📶 عودة الشبكة: ${diag.effectiveType?.toUpperCase() || 'متصل'} (RTT ~${diag.rtt || 0}ms)`
          : '🚫 انقطعت الشبكة تماماً (Offline)'
      );
      if (diag.online) {
        flushQueue();
      }
    });

    executeBaselinePing();

    return () => {
      unsubscribe();
    };
  }, [addLog, executeBaselinePing]);

  // ── إدارة قفل الشاشة (WakeLock API) ──
  const toggleWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        if (!wakeLockActive) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          addLog('GPS', 'info', 'تم تفعيل قفل الشاشة الدائم (Screen WakeLock)');
          wakeLockRef.current.addEventListener('release', () => {
            setWakeLockActive(false);
            addLog('GPS', 'warn', 'تم تحرير قفل الشاشة (Screen Released)');
          });
        } else if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          setWakeLockActive(false);
        }
      } else {
        addLog('GPS', 'warn', 'خاصية WakeLock غير مدعومة في هذا المتصفح');
      }
    } catch (err: any) {
      addLog('GPS', 'error', `فشل تفعيل WakeLock: ${err.message}`);
    }
  };

  // ── تفريغ ومزامنة طابور الـ IndexedDB (Batch Replay) ──
  const flushQueue = async () => {
    try {
      const queued = await getQueuedTelemetry();
      if (queued.length === 0) return;

      addLog('SYNC', 'info', `جاري مزامنة ${queued.length} نقطة من الطابور المحلي...`);
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: queued }),
        keepalive: true,
      });

      if (res.ok) {
        const data = await res.json();
        await clearQueuedTelemetry();
        setOfflineCount(0);
        setMetrics((prev) => ({
          ...prev,
          totalSynced: prev.totalSynced + queued.length,
          totalQueued: 0,
        }));
        addLog('SYNC', 'success', `✅ تمت مزامنة ${queued.length} نقطة بنجاح مع الخادم.`);
      } else {
        addLog('SYNC', 'warn', `⚠️ تعذرت مزامنة الدفعة - رمز الاستجابة: ${res.status}`);
      }
    } catch (err: any) {
      addLog('SYNC', 'error', `فشل إرسال الدفعة: ${err.message}`);
    }
  };

  // ── إرسال النبضة حسب البروتوكول المختار (Transmission Engine) ──
  const dispatchTelemetry = async (payload: DriverTelemetryPayload) => {
    setMetrics((prev) => ({ ...prev, totalSent: prev.totalSent + 1 }));

    // 1. مسار REST HTTP POST (الأساسي والأكثر ثباتاً مع حماية منع التصادم)
    if (transportMode === 'rest') {
      // حماية ضد التصادم: إذا كانت هناك نبضة سابقة لا زالت معلقة على شبكة 2G البطيئة، لا نفتح ريكويست جديد يخنقه!
      if (inFlightRef.current) {
        addLog(
          'STORAGE',
          'warn',
          `⚠️ الخط الخلوي مشغول بنبضة جارية - تم تحويل النبضة #${payload.clientSeq} لـ IndexedDB لتفادي السقوط`
        );
        await queueTelemetryPoint(payload);
        const count = await getQueueCount();
        setOfflineCount(count);
        return;
      }

      inFlightRef.current = true;
      const t0 = performance.now();
      try {
        // تجهيز الـ Micro-Payload المضغوط (حجم ~65 بايت فقط بدلاً من 350 بايت)
        const microPayload = {
          v: payload.vehicleId,
          c: [payload.lat, payload.lng],
          s: payload.speed,
          h: payload.heading,
          a: payload.accuracy,
          t: payload.timestamp,
          q: payload.clientSeq,
        };

        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify(microPayload),
          keepalive: true,
          // @ts-ignore - priority hint for modern browsers
          priority: 'high',
        });

        const t1 = performance.now();
        const latency = Math.round(t1 - t0);
        latencySamplesRef.current.push(latency);
        if (latencySamplesRef.current.length > 50) latencySamplesRef.current.shift();
        const avg = Math.round(
          latencySamplesRef.current.reduce((a, b) => a + b, 0) / latencySamplesRef.current.length
        );

        if (res.ok) {
          const data: TelemetryServerResponse = await res.json();
          setMetrics((prev) => ({
            ...prev,
            totalAcknowledged: prev.totalAcknowledged + 1,
            lastLatencyMs: latency,
            avgLatencyMs: avg,
          }));
          addLog(
            'REST',
            'success',
            `#${payload.clientSeq} نبضة مؤكدة (${latency}ms) - تأخير السيرفر: ${data.transitDelayMs}ms`
          );
        } else {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
      } catch (err: any) {
        setMetrics((prev) => ({
          ...prev,
          totalFailed: prev.totalFailed + 1,
          totalQueued: prev.totalQueued + 1,
        }));
        await queueTelemetryPoint(payload);
        const count = await getQueueCount();
        setOfflineCount(count);
        addLog(
          'REST',
          'error',
          `❌ فشلت النبضة #${payload.clientSeq}: ${err.message}`,
          'تم التخزين فوراً في IndexedDB'
        );
      } finally {
        inFlightRef.current = false;
        // إذا تراكمت نقاط أثناء انشغال الخط، قم بمزامنتها دفعة واحدة بهدوء
        const pendingCount = await getQueueCount();
        if (pendingCount >= 3) {
          flushQueue();
        }
      }
    }

    // 2. مسار التخزين فقط (Batch Mode)
    else if (transportMode === 'batch') {
      await queueTelemetryPoint(payload);
      const count = await getQueueCount();
      setOfflineCount(count);
      setMetrics((prev) => ({
        ...prev,
        totalQueued: count,
        totalAcknowledged: prev.totalAcknowledged + 1,
      }));
      addLog('STORAGE', 'info', `تم حفظ النبضة #${payload.clientSeq} في الطابور المحلي (${count} نقطة)`);

      // إذا بلغ الطابور 5 نقاط، أرسلها دفعة واحدة
      if (count >= 5) {
        await flushQueue();
      }
    }

    // 3. مسار البث الحي SSE / WebSocket
    else if (transportMode === 'sse') {
      // في SSE، القناة مفتوحة للاستقبال، والنبضة تُرسل خفيفة مع فحص استمرار الاتصال
      try {
        const res = await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setMetrics((prev) => ({ ...prev, totalAcknowledged: prev.totalAcknowledged + 1 }));
          addLog('SSE', 'success', `نبضة عبر قناة متدفقة #${payload.clientSeq}`);
        }
      } catch (err: any) {
        addLog('SSE', 'error', `فشل الإرسال: ${err.message}`);
      }
    }
  };

  // ── تشغيل/إيقاف قناة الـ SSE المستمرة ──
  useEffect(() => {
    if (transportMode === 'sse' && isBroadcasting) {
      addLog('SSE', 'info', 'جاري فتح اتصال تدفق مستمر (EventSource)...');
      const es = new EventSource('/api/stream');
      sseEventSourceRef.current = es;

      es.onopen = () => {
        addLog('SSE', 'success', '🟢 تم فتح قناة الـ SSE بنجاح');
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'heartbeat') {
            // نبضة خادم مستمرة
          }
        } catch {}
      };

      es.onerror = (err) => {
        addLog('SSE', 'warn', '🔴 انقطع اتصال الـ SSE أو أغلقت شركة الاتصالات القناة');
        setMetrics((prev) => ({ ...prev, sseDisconnects: prev.sseDisconnects + 1 }));
      };

      return () => {
        es.close();
        sseEventSourceRef.current = null;
      };
    }
  }, [transportMode, isBroadcasting, addLog]);

  // ── معالجة نبضة الـ GPS الحقيقية (نفس خوارزميات زمام) ──
  const handlePositionSuccess = useCallback(
    async (pos: GeolocationPosition) => {
      const { latitude, longitude, speed, heading, accuracy } = pos.coords;
      const now = Date.now();

      // 1. فلتر الدقة (استبعاد القراءات المشوشة أكبر من 35م)
      if (accuracy > 35) {
        addLog('GPS', 'warn', `تم تجاهل قراءة ضعيفة الدقة (±${Math.round(accuracy)}م > 35م)`);
        return;
      }

      const speedKmH = speed !== null && speed >= 0 ? Math.round(speed * 3.6) : 0;
      const headingDeg = heading !== null && !isNaN(heading) ? Math.round(heading) : 0;

      const coords = {
        lat: latitude,
        lng: longitude,
        speed: speedKmH,
        heading: headingDeg,
        accuracy: Math.round(accuracy),
      };

      setCurrentCoords(coords);

      let deltaMeters = 0;
      if (lastCoordsRef.current) {
        const deltaKm = calculateHaversineDistance(
          lastCoordsRef.current.lat,
          lastCoordsRef.current.lng,
          latitude,
          longitude
        );
        deltaMeters = deltaKm * 1000;

        // 2. فحص القفزة المستحيلة (> 180 كم/ساعة)
        const elapsedSec = (now - lastSentTimeRef.current) / 1000;
        if (elapsedSec > 0 && deltaKm / (elapsedSec / 3600) > 180) {
          addLog('GPS', 'warn', 'تم استبعاد قفزة جغرافية مستحيلة ناتجة عن تبديل برج الجوال');
          return;
        }

        if (deltaKm > 0.001) {
          setTripStats((prev) => ({
            ...prev,
            distanceMeters: prev.distanceMeters + deltaMeters,
            maxSpeed: Math.max(prev.maxSpeed, speedKmH),
          }));
        }
      }

      // شرط الإرسال: تحرك >= 5 أمتار، أو سرعة >= 3 كم/س ومضت ثانية، أو Heartbeat كل 15 ثانية
      const timeElapsed = now - lastSentTimeRef.current;
      const isMoved = deltaMeters >= 5 || speedKmH >= 3;
      const isHeartbeat = timeElapsed >= 15000;

      if ((isMoved && timeElapsed >= 1000) || isHeartbeat) {
        clientSeqRef.current += 1;
        setMetrics((prev) => ({ ...prev, totalGenerated: prev.totalGenerated + 1 }));

        const payload: DriverTelemetryPayload = {
          vehicleId,
          taskId: 'DEMO-TASK-001',
          driverId,
          lat: latitude,
          lng: longitude,
          speed: speedKmH,
          heading: headingDeg,
          accuracy: Math.round(accuracy),
          timestamp: now,
          clientSeq: clientSeqRef.current,
          transportMode,
        };

        lastSentTimeRef.current = now;
        lastCoordsRef.current = { lat: latitude, lng: longitude };

        await dispatchTelemetry(payload);
      }
    },
    [vehicleId, driverId, transportMode, addLog]
  );

  const handlePositionError = useCallback(
    (err: GeolocationPositionError) => {
      let msg = 'خطأ غير معروف في الـ GPS';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          msg = 'المتصفح رفض إذن الموقع. تأكد من بروتوكول HTTPS أو السماح من إعدادات الهاتف.';
          break;
        case err.POSITION_UNAVAILABLE:
          msg = 'إشارة الـ GPS غير متوفرة حالياً على الهاتف.';
          break;
        case err.TIMEOUT:
          msg = 'انتهت مهلة قراءة إشارة الـ GPS.';
          break;
      }
      addLog('GPS', 'error', msg);
    },
    [addLog]
  );

  // ── بدء البث الميداني ──
  const startBroadcasting = () => {
    if (!navigator.geolocation) {
      addLog('GPS', 'error', 'هذا المتصفح لا يدعم Geolocation');
      return;
    }

    toggleWakeLock();
    addLog('GPS', 'info', 'بدء تشغيل مستشعر الـ GPS (High Accuracy)...');

    const id = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    watchIdRef.current = id;
    setIsBroadcasting(true);
    setTripStats((prev) => ({ ...prev, startTime: Date.now() }));
  };

  // ── إيقاف البث ──
  const stopBroadcasting = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
    if (sseEventSourceRef.current) {
      sseEventSourceRef.current.close();
      sseEventSourceRef.current = null;
    }
    setIsBroadcasting(false);
    addLog('GPS', 'info', 'تم إيقاف بث الـ GPS');
  };

  // ── تصدير تقرير التشخيص ──
  const copyDiagnosticReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      network: netDiag,
      transportMode,
      metrics,
      currentCoords,
      recentLogs: logs.slice(0, 30),
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // ── حساب نسبة نجاح الحزم ──
  const successRate =
    metrics.totalSent > 0
      ? Math.round((metrics.totalAcknowledged / metrics.totalSent) * 100)
      : 100;

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'error') return log.level === 'error' || log.level === 'warn';
    if (logFilter === 'net') return log.category === 'NET' || log.category === 'REST' || log.category === 'SSE';
    return true;
  });

  return (
    <div className="flex flex-col flex-1 pb-6 text-slate-100 select-none">
      {/* ── شريط الرأس الميداني ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600/20 text-teal-400 border border-teal-500/30">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-black tracking-wide text-white">زمام الخلوي</h1>
              <span className="rounded-full bg-teal-500/10 px-1.5 py-0.2 text-[9px] font-bold text-teal-400 border border-teal-500/20">
                LAB
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">{plateNumber} • {vehicleId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={executeBaselinePing}
            title="فحص سرعة استجابة السيرفر"
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-300 border border-slate-700 active:scale-95 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-[10px] font-bold">Ping</span>
          </button>
        </div>
      </header>

      {/* ── شريط معلومات الشبكة الحية ── */}
      <div className="bg-slate-950/70 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {netDiag.online ? (
            <span className="flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
              <Wifi className="h-3.5 w-3.5" />
              <span>
                {netDiag.type && netDiag.type !== 'unknown' ? `${netDiag.type.toUpperCase()} • ` : ''}
                {netDiag.effectiveType ? netDiag.effectiveType.toUpperCase() : 'متصل'}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400 font-bold text-[11px]">
              <WifiOff className="h-3.5 w-3.5" />
              <span>غير متصل (Offline)</span>
            </span>
          )}

          {swReady && (
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400 border border-emerald-500/20" title="التطبيق مخزن في ذاكرة الهاتف ويفتح فورياً بدون إنترنت">
              ⚡ كاش فوري
            </span>
          )}

          {netDiag.rtt !== undefined && (
            <span className="text-slate-400 text-[10px] font-mono">
              RTT: <span className="text-slate-200 font-bold">{netDiag.rtt}ms</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-slate-400">
            تأخير النقل:{' '}
            <span className="font-mono font-bold text-teal-300">
              {metrics.lastLatencyMs ? `${metrics.lastLatencyMs}ms` : '--'}
            </span>
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300 font-mono">
            طابور: {offlineCount}
          </span>
        </div>
      </div>

      <main className="flex-1 px-4 py-3 flex flex-col gap-3">
        {/* ── محدد بروتوكول الإرسال (المتغير المتحكم به) ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-teal-400" />
              <span>طريقة الإرسال المختبرة:</span>
            </span>
            <span className="text-[10px] text-teal-400/80 font-mono font-semibold">
              {transportMode === 'rest'
                ? 'HTTP POST نبضات فردية'
                : transportMode === 'batch'
                ? 'IndexedDB تجميع محلي'
                : 'SSE اتصال مستمر'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              onClick={() => setTransportMode('rest')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                transportMode === 'rest'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              REST (POST)
            </button>
            <button
              onClick={() => setTransportMode('batch')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                transportMode === 'batch'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Batch (دفعات)
            </button>
            <button
              onClick={() => setTransportMode('sse')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                transportMode === 'sse'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stream (SSE)
            </button>
          </div>
        </div>

        {/* ── عداد السرعة والمؤشرات الميدانية (HUD) ── */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-teal-500/10 border border-teal-500/20 p-2.5 min-w-[76px]">
              <span
                className={`text-3xl font-black font-mono tracking-tight leading-none ${
                  (currentCoords?.speed || 0) > 80
                    ? 'text-rose-400'
                    : (currentCoords?.speed || 0) > 50
                    ? 'text-amber-400'
                    : 'text-teal-400'
                }`}
              >
                {currentCoords?.speed ?? 0}
              </span>
              <span className="text-[9px] font-bold text-teal-300 mt-1">كم/ساعة</span>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-200 block">
                {isBroadcasting ? 'بث الـ GPS نشط 📡' : 'التتبع متوقف'}
              </span>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-medium">
                <span className="flex items-center gap-1">
                  <Compass className="h-3.5 w-3.5 text-teal-400" />
                  <span>{currentCoords?.heading || 0}°</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>±{currentCoords?.accuracy || 0}م</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-left pl-1">
            <div>
              <span className="text-[10px] text-slate-400 block">المسافة</span>
              <span className="text-sm font-black text-slate-200 font-mono">
                {(tripStats.distanceMeters / 1000).toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-slate-400">كم</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">النبضات</span>
              <span className="text-sm font-black text-teal-400 font-mono">
                {metrics.totalSent}
              </span>
            </div>
          </div>
        </div>

        {/* ── لوحة أداء النقل المنهجية (Transmission Matrix) ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-teal-400" />
              <span>مصفوفة فحص الحزم:</span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                successRate >= 95
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              نجاح: {successRate}%
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-slate-900 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[9px] text-slate-400 block">مرسلة</span>
              <span className="text-xs font-mono font-bold text-slate-100">
                {metrics.totalSent}
              </span>
            </div>
            <div className="bg-slate-900 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[9px] text-emerald-400 block">مؤكدة (ACK)</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {metrics.totalAcknowledged}
              </span>
            </div>
            <div className="bg-slate-900 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[9px] text-rose-400 block">فاشلة</span>
              <span className="text-xs font-mono font-bold text-rose-400">
                {metrics.totalFailed}
              </span>
            </div>
            <div className="bg-slate-900 rounded-xl p-2 border border-slate-800/80">
              <span className="text-[9px] text-teal-400 block">متوسط Latency</span>
              <span className="text-xs font-mono font-bold text-teal-300">
                {metrics.avgLatencyMs ? `${metrics.avgLatencyMs}ms` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* ── بطاقة المهمة الجارية (محاكاة زمام) ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <Route className="h-4 w-4 text-teal-400" />
              <span>مهمة التوصيل الميدانية</span>
            </div>
            <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-400 border border-teal-500/20">
              قيد التنفيذ 🟢
            </span>
          </div>

          <div className="rounded-xl bg-slate-950 p-2 text-xs space-y-1 border border-slate-800">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">الاستلام:</span>
              <span className="font-semibold truncate">مستودع زمام اللوجستي الرئيسي</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-teal-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">التسليم:</span>
              <span className="font-semibold truncate">نقطة توزيع حي النرجس</span>
            </div>
          </div>
        </div>

        {/* ── أزرار الإجراءات الرئيسية ── */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={isBroadcasting ? stopBroadcasting : startBroadcasting}
            className={`flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold shadow-lg transition-all active:scale-98 cursor-pointer ${
              isBroadcasting
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-teal-600 hover:bg-teal-700 text-white'
            }`}
          >
            {isBroadcasting ? (
              <>
                <Square className="h-4 w-4 fill-current" />
                <span>إيقاف البث ⏹</span>
              </>
            ) : (
              <>
                <Radio className="h-4 w-4 animate-pulse" />
                <span>بدء البث الميداني 📡</span>
              </>
            )}
          </button>

          <button
            onClick={toggleWakeLock}
            className={`flex items-center justify-center gap-1.5 rounded-2xl px-3.5 py-3 text-xs font-bold border transition-all ${
              wakeLockActive
                ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {wakeLockActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            <span className="text-[11px]">{wakeLockActive ? 'الشاشة مقفلة' : 'تلقائي'}</span>
          </button>

          {offlineCount > 0 && (
            <button
              onClick={flushQueue}
              className="flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-all"
              title="مزامنة الطابور الآن"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── شريط سجل الأحداث التقني المباشر (Diagnostic Terminal) ── */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <Clock className="h-3.5 w-3.5 text-teal-400" />
              <span>سجل الفحص المباشر ({logs.length})</span>
            </div>

            <div className="flex items-center gap-1">
              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[10px]">
                <button
                  onClick={() => setLogFilter('all')}
                  className={`px-1.5 py-0.5 rounded ${logFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400'}`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setLogFilter('error')}
                  className={`px-1.5 py-0.5 rounded ${logFilter === 'error' ? 'bg-rose-600 text-white' : 'text-slate-400'}`}
                >
                  الأخطاء
                </button>
                <button
                  onClick={() => setLogFilter('net')}
                  className={`px-1.5 py-0.5 rounded ${logFilter === 'net' ? 'bg-teal-600 text-white' : 'text-slate-400'}`}
                >
                  الشبكة
                </button>
              </div>

              <button
                onClick={copyDiagnosticReport}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="نسخ تقرير الفحص"
              >
                {copySuccess ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>

              <button
                onClick={() => setLogs([])}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                title="مسح السجل"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="h-44 overflow-y-auto space-y-1.5 font-mono text-[10px] bg-slate-900/90 rounded-xl p-2 border border-slate-800/80">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-center">
                لا توجد سجلات بعد. اضغط "بدء البث 📡" أو "Ping" للبدء.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded p-1 border-r-2 ${
                    log.level === 'error'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-300'
                      : log.level === 'warn'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                      : log.level === 'success'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-teal-500/60 bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] text-slate-400 mb-0.5">
                    <span className="font-bold text-teal-400">[{log.category}]</span>
                    <span>{log.timeStr}</span>
                  </div>
                  <div>{log.message}</div>
                  {log.details && (
                    <div className="text-[8.5px] text-slate-400 mt-0.5">{log.details}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
