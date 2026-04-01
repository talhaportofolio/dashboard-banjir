import React, { useState, useEffect, useRef } from 'react';
import { Activity, Droplets, Power, PowerOff, Wifi, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Konfigurasi MQTT HiveMQ Public
const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const MQTT_TOPIC = 'banjir_pro/v2/panel_01/status';

export default function App() {
  const [client, setClient] = useState(null);
  const [connectStatus, setConnectStatus] = useState('Disconnected');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const isSimulatingRef = useRef(isSimulating);

  // State Utama
  const [sensorData, setSensorData] = useState({
    device_id: "OT-PUMP-MONITOR",
    status: { code: 255, text: "🟢 AMAN 🟢" },
    pumps: {
      total_on: 0,
      detail: { P1: false, P2: false, P3: false, P4: false, P5: false, P6: false, P7: false }
    },
    telemetry: { wifi_rssi: 0, uptime_sec: 0 }
  });

  // Sinkronisasi ref untuk callback MQTT
  useEffect(() => {
    isSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  // Fungsi Helper untuk menentukan Level berdasarkan jumlah Pompa
  const deriveLevelFromPumps = (pumpCount) => {
    if (pumpCount >= 7) return { code: 1, text: "🔴 SIAGA 1 🔴" };
    if (pumpCount >= 5) return { code: 2, text: "🟠 SIAGA 2 🟠" };
    if (pumpCount >= 3) return { code: 3, text: "🔵 SIAGA 3 🔵" };
    if (pumpCount >= 1) return { code: 0, text: "🟢 HARIAN 🟢" };
    return { code: 255, text: "🟢 AMAN 🟢" };
  };

  useEffect(() => {
    let mqttClient = null;
    let isMounted = true;

    const initMqtt = () => {
      if (!window.mqtt || !isMounted) return;

      mqttClient = window.mqtt.connect(MQTT_BROKER, {
        clientId: `web_client_ot_${Math.random().toString(16).slice(2, 10)}`,
        keepalive: 60,
        clean: true,
        reconnectPeriod: 5000,
      });

      setClient(mqttClient);

      mqttClient.on('connect', () => {
        setConnectStatus('Connected');
        mqttClient.subscribe(MQTT_TOPIC);
      });

      mqttClient.on('reconnect', () => setConnectStatus('Reconnecting...'));
      mqttClient.on('error', (err) => setConnectStatus(`Error: ${err.message}`));
      mqttClient.on('offline', () => setConnectStatus('Offline'));

      mqttClient.on('message', (topic, message) => {
        if (!isSimulatingRef.current) {
          try {
            const payload = JSON.parse(message.toString());
            
            // Ambil hanya P1-P7 dari detail untuk perhitungan dashboard
            const pumpEntries = Object.entries(payload.pumps.detail).filter(([name]) => 
               ["P1", "P2", "P3", "P4", "P5", "P6", "P7"].includes(name)
            );
            const activeCount = pumpEntries.filter(([_, on]) => on).length;
            
            // Hitung Level berdasarkan jumlah pompa aktif
            const newLevel = deriveLevelFromPumps(activeCount);
            
            setSensorData({
              ...payload,
              pumps: {
                total_on: activeCount,
                detail: Object.fromEntries(pumpEntries)
              },
              status: newLevel
            });
            setLastUpdate(new Date().toLocaleTimeString('en-US', { hour12: true }));
          } catch (error) {
            console.error("Invalid JSON:", error);
          }
        }
      });
    };

    if (!window.mqtt) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mqtt/5.3.5/mqtt.min.js';
      script.async = true;
      script.onload = initMqtt;
      document.body.appendChild(script);
    } else {
      initMqtt();
    }

    return () => {
      isMounted = false;
      if (mqttClient) mqttClient.end();
    };
  }, []); 

  // --- LOGIKA SIMULASI TEST (DIPERBAIKI) ---
  useEffect(() => {
    let interval;
    if (isSimulating) {
      let step = 0;
      const testSteps = [1, 3, 5, 7, 0];
      
      interval = setInterval(() => {
        const count = testSteps[step];
        const newLevel = deriveLevelFromPumps(count);
        
        const mockDetail = {
          P1: count >= 1,
          P2: count >= 2,
          P3: count >= 3,
          P4: count >= 4,
          P5: count >= 5,
          P6: count >= 6,
          P7: count >= 7,
        };

        setSensorData({
          device_id: "MODE_TEST_DASHBOARD",
          status: newLevel,
          pumps: { total_on: count, detail: mockDetail },
          telemetry: { wifi_rssi: -50, uptime_sec: 1234 }
        });
        setLastUpdate(new Date().toLocaleTimeString('en-US', { hour12: true }));
        
        step = (step + 1) % testSteps.length;
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isSimulating]);

  // --- HELPER WARNA UI (DIKONSISTENKAN DENGAN STATUS.CODE) ---
  const getLevelColor = (code) => {
    switch (code) {
      case 1: return 'bg-red-500 text-white border-red-600 shadow-lg';
      case 2: return 'bg-orange-500 text-white border-orange-600 shadow-lg';
      case 3: return 'bg-blue-600 text-white border-blue-700 shadow-lg';
      case 0: return 'bg-emerald-500 text-white border-emerald-600 shadow-lg';
      case 255: default: return 'bg-white text-[#112240] border-slate-200 shadow-sm';
    }
  };

  const getLevelIcon = (code) => {
    if (code === 255 || code === 0) return <CheckCircle2 size={64} className={`mb-2 ${code === 255 ? 'text-emerald-500' : 'text-white'}`} />;
    return <AlertTriangle size={64} className="mb-2 text-white" />;
  };

  const formatUptime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h} Jam ${m} Menit`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#112240] p-6 rounded-2xl border-b-4 border-[#F5A623] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#F5A623] opacity-5 rounded-full -mr-20 -mt-20"></div>
          
          <div className="z-10 flex items-center gap-5">
            <img 
              src="/ot.png" 
              alt="Logo OT" 
              className="h-14 md:h-20 w-auto bg-white rounded-xl p-2 shadow-inner"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="flex flex-col">
              <h1 className="text-xl md:text-3xl font-black text-white tracking-tight leading-none uppercase">
                Monitoring Pompa Banjir
              </h1>
              <h2 className="text-[#F5A623] text-base md:text-xl font-bold mt-1">
                PT. Ultra Prima Abadi - DM
              </h2>
            </div>
          </div>
          
          <div className="mt-6 md:mt-0 flex flex-col items-end gap-3 z-10 w-full md:w-auto">
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-full border border-white/20 text-white w-full md:w-auto justify-center">
              <div className={`w-3 h-3 rounded-full animate-pulse ${connectStatus === 'Connected' ? 'bg-emerald-400' : 'bg-red-500'}`}></div>
              <span className="text-xs font-bold uppercase tracking-wider">{connectStatus}</span>
            </div>
            
            <button 
              onClick={() => setIsSimulating(!isSimulating)}
              className={`w-full md:w-auto px-6 py-2.5 rounded-full font-black text-xs transition-all duration-300 shadow-xl ${
                isSimulating 
                ? 'bg-[#F5A623] text-[#112240] ring-4 ring-[#F5A623]/30 scale-105' 
                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
              }`}
            >
              {isSimulating ? '🛑 STOP TEST' : '🧪 MULAI TEST UI'}
            </button>
          </div>
        </div>

        {/* DASHBOARD CONTENT */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* SISI KIRI: STATUS POMPA */}
          <div className="md:col-span-8 bg-white rounded-3xl border-2 border-slate-100 p-8 shadow-xl flex flex-col relative overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <h3 className="text-2xl font-black text-[#112240] flex items-center gap-3 italic text-blue-900">
                <Droplets className="text-[#F5A623]" size={32} />
                STATUS POMPA
              </h3>
              <div className="bg-slate-50 px-6 py-2 rounded-2xl border-2 border-slate-100">
                <span className="text-slate-400 text-xs font-black uppercase mr-2">Power On:</span>
                <span className="text-[#112240] font-black text-2xl">{sensorData.pumps.total_on}</span>
                <span className="text-slate-300 font-bold text-xl mx-1">/</span>
                <span className="text-slate-400 font-bold text-lg">7</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(sensorData.pumps.detail).map(([pumpName, isOn]) => (
                <div 
                  key={pumpName} 
                  className={`relative overflow-hidden rounded-2xl border-2 p-5 flex flex-col items-center justify-center transition-all duration-500 ${
                    isOn 
                    ? 'bg-blue-50 border-[#112240]/40 shadow-md scale-105' 
                    : 'bg-slate-50 border-slate-100 opacity-40 grayscale'
                  }`}
                >
                  <div className={`mb-4 p-4 rounded-2xl transition-all duration-500 ${isOn ? 'bg-[#112240] text-[#F5A623] rotate-[360deg] shadow-lg' : 'bg-slate-200 text-slate-400'}`}>
                    {isOn ? <Power size={28} /> : <PowerOff size={28} />}
                  </div>
                  <span className={`font-black text-sm tracking-tighter ${isOn ? 'text-[#112240]' : 'text-slate-400'}`}>
                    {pumpName}
                  </span>
                  {isOn && (
                    <>
                      <div className="absolute top-2 right-2 w-2 h-2 bg-[#F5A623] rounded-full animate-ping"></div>
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-[#F5A623]"></div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SISI KANAN: LEVEL AIR TERDETEKSI */}
          <div className={`md:col-span-4 rounded-3xl border-2 p-10 flex flex-col items-center justify-center text-center transition-all duration-700 ${getLevelColor(sensorData.status.code)}`}>
            <div className="relative">
               {getLevelIcon(sensorData.status.code)}
               {sensorData.status.code !== 255 && sensorData.status.code !== 0 && (
                 <div className="absolute inset-0 bg-white/20 blur-3xl rounded-full"></div>
               )}
            </div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] opacity-70 mb-2">Level Air Terdeteksi</h3>
            <div className="text-3xl font-black tracking-tighter italic leading-tight">
              {sensorData.status.text}
            </div>
            <div className="mt-8 flex flex-col items-center gap-1 font-bold">
              <span className="text-[10px] uppercase tracking-widest opacity-60 italic text-white/80">Informasi Update</span>
              <div className="flex items-center gap-2 bg-black/10 px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider text-white">
                <Clock size={14} /> Terakhir: {lastUpdate || '--:--:--'}
              </div>
            </div>
          </div>

          {/* TELEMETRY */}
          <div className="md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border-2 border-slate-100 p-8 shadow-lg flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg text-[#112240]">
                    <Wifi size={24} />
                  </div>
                  <span className="font-black text-[#112240] text-sm uppercase italic">WiFi Signal</span>
                </div>
                <span className="font-mono font-black text-xl text-[#112240] tracking-tighter">{sensorData.telemetry.wifi_rssi} dBm</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 border-2 border-slate-50">
                <div 
                  className="bg-[#F5A623] h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(245,166,35,0.5)]" 
                  style={{ width: `${Math.max(0, 100 + sensorData.telemetry.wifi_rssi)}%` }}
                ></div>
              </div>
            </div>

            <div className="md:col-span-2 bg-[#112240] rounded-3xl p-1 shadow-2xl relative">
              <div className="bg-[#0A192F] m-1 rounded-[1.4rem] p-5 h-40 overflow-hidden relative group font-mono text-[10px] text-blue-300">
                 <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                    <span className="text-white/40 font-black uppercase tracking-widest flex items-center gap-2">
                       <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                       Live MQTT Stream
                    </span>
                    <span className="text-[#F5A623]/60 italic">HiveMQ_Broker_v2</span>
                 </div>
                 <div className="h-24 overflow-y-auto custom-scrollbar leading-relaxed">
                    <pre>{JSON.stringify(sensorData, null, 2)}</pre>
                 </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="mt-12 text-center flex flex-col items-center gap-2">
        <div className="w-16 h-1 bg-[#112240] rounded-full mb-2"></div>
        <div className="text-[10px] font-black text-[#112240]/40 uppercase tracking-[0.3em]">
          Industrial Monitoring System &copy; 2024
        </div>
        <div className="text-[9px] font-bold text-[#F5A623]">
          PT. ULTRA PRIMA ABADI - DIVISI MAINTENANCE
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(245, 166, 35, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(245, 166, 35, 0.5); }
      `}} />
    </div>
  );
}