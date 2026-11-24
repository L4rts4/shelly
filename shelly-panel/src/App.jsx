import { useState, useEffect, useRef } from "react";

const DEMO_DEVICES = [
  { host: "demo-1", type: "Switch", name: "Olohuoneen valo", status: { output: true, apower: 42.3, voltage: 231, current: 0.18 } },
  { host: "demo-2", type: "Switch", name: "Pesukone", status: { output: false, apower: 0 } },
  { host: "demo-3", type: "Light", name: "Ruokailutilan dimmeri", status: { output: true, brightness: 70, apower: 18.5 } },
];

const themes = {
  light: { bg: "#F5F5F7", text: "#1D1D1F", sub: "#86868B", card: "#FFFFFF", border: "#E5E5EA", accent: "#0071E3" },
  dark: { bg: "#000000", text: "#F5F5F7", sub: "#86868B", card: "#1C1C1E", border: "#38383A", accent: "#0A84FF" },
};

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await (await fetch(url, { signal: controller.signal })).json();
  } finally {
    clearTimeout(timer);
  }
}

export default function App() {
  const [devices, setDevices] = useState([]);
  const [demoOn, setDemoOn] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [ip, setIp] = useState("");
  const [open, setOpen] = useState(null);
  const [dark, setDark] = useState(false);
  const [stats, setStats] = useState({ max: 0 });
  const t = dark ? themes.dark : themes.light;

  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const totalRef = useRef(0);

  useEffect(() => {
    document.body.style.background = t.bg;
  }, [t.bg]);

  useEffect(() => {
    const timer = setInterval(() => {
      devicesRef.current.forEach(async (d) => {
        if (d.host.startsWith("demo")) return;
        try {
          const status = await get(`/shelly/${d.host}/rpc/${d.type}.GetStatus?id=0`);
          setDevices((cur) => cur.map((x) => (x.host === d.host ? { ...x, status } : x)));
        } catch {}
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const INTERVAL = 5000;
    const timer = setInterval(() => {
      const p = totalRef.current;
      setStats((s) => ({ max: Math.max(s.max, p) }));
    }, INTERVAL);
    return () => clearInterval(timer);
  }, []);

  function onTitleClick() {
    if (clicks + 1 >= 3) {
      setDemoOn(!demoOn);
      setClicks(0);
    } else {
      setClicks(clicks + 1);
    }
  }

  async function add() {
    const host = ip.trim();
    if (!host) return;
    try {
      const info = await get(`/shelly/${host}/rpc/Shelly.GetDeviceInfo`);
      const type = info.app?.toLowerCase().includes("dimmer") ? "Light" : "Switch";
      const status = await get(`/shelly/${host}/rpc/${type}.GetStatus?id=0`);
      setDevices((prev) => [...prev, { host, type, name: info.name || info.app, status }]);
      setIp("");
    } catch {
      alert(`Laite ${host} ei vastaa`);
    }
  }

  async function toggle(d) {
    const on = !d.status.output;
    setDevices((prev) => prev.map((x) => (x.host === d.host ? { ...x, status: { ...x.status, output: on } } : x)));
    if (d.host.startsWith("demo")) return;
    try {
      await get(`/shelly/${d.host}/rpc/Switch.Set?id=0&on=${on}`);
    } catch {
      alert(`${d.name} ei vastaa`);
    }
  }

  async function setBrightness(d, value) {
    setDevices((prev) => prev.map((x) => (x.host === d.host ? { ...x, status: { ...x.status, brightness: value } } : x)));
    if (d.host.startsWith("demo")) return;
    try {
      await get(`/shelly/${d.host}/rpc/Light.Set?id=0&brightness=${value}`);
    } catch {
      alert(`${d.name} ei vastaa`);
    }
  }

  const shown = demoOn ? [...DEMO_DEVICES.filter((d) => !devices.some((x) => x.host === d.host)), ...devices] : devices;

  const totalPower = shown.reduce((s, d) => s + (d.status.apower ?? 0), 0);
  const activeCount = shown.filter((d) => (d.status.apower ?? 0) > 0).length;
  const avgPerDevice = shown.length ? totalPower / shown.length : 0;
  totalRef.current = totalPower;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "-apple-system, system-ui, sans-serif", padding: "32px 20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 onClick={onTitleClick} style={{ fontSize: 28, fontWeight: 600, margin: 0, cursor: "pointer", userSelect: "none" }}>Shelly</h1>
          <div style={{ display: "flex", gap: 16, flex: 1, margin: "0 16px" }}>
            <Stat label="Yhteensä" value={`${totalPower.toFixed(1)} W`} t={t} />
            <Stat label="Keskiarvo" value={`${avgPerDevice.toFixed(1)} W`} t={t} />
            <Stat label="Huippu" value={`${stats.max.toFixed(1)} W`} t={t} />
            <Stat label="Käytössä" value={`${activeCount} / ${shown.length}`} t={t} />
          </div>
          <button onClick={() => setDark(!dark)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: "pointer", fontSize: 13 }}>
            {dark ? "Vaalea" : "Tumma"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Laitteen IP, esim. 192.168.33.1"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: 15, outline: "none" }}
          />
          <button onClick={add} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: t.accent, color: "#FFF", fontWeight: 500, fontSize: 15, cursor: "pointer" }}>
            Lisää
          </button>
        </div>

        {shown.map((d, i) => {
          const on = !!d.status.output;
          return (
            <div key={d.host} style={{ background: t.card, borderRadius: 12, padding: 16, marginBottom: 12, border: `1px solid ${t.border}`, boxSizing: "border-box" }}>
              <div onClick={() => setOpen(open === i ? null : i)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: t.sub, marginTop: 2 }}>
                    {(d.status.apower ?? 0).toFixed(1)} W · {on ? "Päällä" : "Pois"}
                  </div>
                </div>
                {d.type === "Switch" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(d); }}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: on ? t.accent : t.sub, color: "#FFF", fontWeight: 500, cursor: "pointer" }}
                  >
                    {on ? "Sammuta" : "Käynnistä"}
                  </button>
                )}
              </div>

              {d.type === "Light" && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: t.sub }}>
                    <span>Kirkkaus</span>
                    <span style={{ color: t.text }}>{d.status.brightness ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={d.status.brightness ?? 0}
                    onChange={(e) => setBrightness(d, Number(e.target.value))}
                    style={{ display: "block", width: "100%", boxSizing: "border-box", accentColor: t.accent }}
                  />
                </div>
              )}

              {open === i && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                    <Stat label="Teho" value={`${(d.status.apower ?? 0).toFixed(1)} W`} t={t} />
                    {d.status.voltage !== undefined && <Stat label="Jännite" value={`${d.status.voltage} V`} t={t} />}
                    {d.status.current !== undefined && <Stat label="Virta" value={`${d.status.current.toFixed(2)} A`} t={t} />}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

function Stat({ label, value, t }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 13, color: t.sub }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{value}</div>
    </div>
  );
}