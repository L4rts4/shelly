import { useState } from "react";

const DEMO_DEVICES = [
  { host: "demo-1", type: "Switch", name: "Olohuoneen valo", model: "Shelly Plus 1PM", status: { output: true, apower: 42.3, voltage: 231, current: 0.18 } },
  { host: "demo-2", type: "Switch", name: "Pesukone", model: "Shelly Plus 1", status: { output: false, apower: 0 } },
  { host: "demo-3", type: "Light", name: "Ruokailutilan dimmeri", model: "Shelly Plus Dimmer", status: { output: true, brightness: 70, apower: 18.5 } },
  { host: "demo-4", type: "Switch", name: "Lämminvesivaraaja", model: "Shelly Pro 1PM", status: { output: true, apower: 1850, voltage: 231, current: 8.0 } },
];

export default function App() {
  const [devices, setDevices] = useState([]);
  const [ip, setIp] = useState("");
  const [demo, setDemo] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [logs, setLogs] = useState([]);

  function log(msg) {
    const time = new Date().toLocaleTimeString("fi-FI");
    setLogs((prev) => [`${time}  ${msg}`, ...prev].slice(0, 50));
  }

  function onTitleClick() {
    if (clicks + 1 >= 3) {
      setDemo(!demo);
      setDevices(demo ? [] : DEMO_DEVICES);
      log(demo ? "Demo suljettu" : "Demo avattu");
      setClicks(0);
    } else {
      setClicks(clicks + 1);
    }
  }

  async function add() {
    const host = ip.trim();
    if (!host) return;
    try {
      const info = await (await fetch(`http://${host}/rpc/Shelly.GetDeviceInfo`)).json();
      const type = info.app?.toLowerCase().includes("dimmer") ? "Light" : "Switch";
      const status = await (await fetch(`http://${host}/rpc/${type}.GetStatus?id=0`)).json();
      setDevices([...devices, { host, type, name: info.name || info.model, model: info.model, status }]);
      log(`Lisättiin laite ${host}`);
      setIp("");
    } catch {
      log(`Virhe: ${host} ei vastaa`);
      alert("Laitetta ei löytynyt");
    }
  }

  async function update(i, params) {
    if (demo) return;
    const d = devices[i];
    await fetch(`http://${d.host}/rpc/${d.type}.Set?id=0&${params}`);
    const status = await (await fetch(`http://${d.host}/rpc/${d.type}.GetStatus?id=0`)).json();
    setDevices(devices.map((x, j) => (j === i ? { ...x, status } : x)));
    log(`${d.name}: ${status.output ? "päälle" : "pois"}`);
  }

  return (
    <div className="app">
      <h1 onClick={onTitleClick}>Shelly {demo && "(demo)"}</h1>

      {!demo && (
        <div>
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="esim. 192.168.1.50" />
          <button onClick={add}>Lisää</button>
        </div>
      )}

      {devices.map((d, i) => (
        <div key={i} className="device">
          <b>{d.name}</b> ({d.model})
          <div>Teho: {(d.status.apower ?? 0).toFixed(1)} W</div>
          {d.status.voltage && <div>Jännite: {d.status.voltage} V</div>}
          {d.status.current !== undefined && <div>Virta: {d.status.current.toFixed(2)} A</div>}
          <button onClick={() => update(i, `on=${!d.status.output}`)} disabled={demo}>
            {d.status.output ? "Sammuta" : "Käynnistä"}
          </button>
          {d.type === "Light" && (
            <input
              type="range"
              min="0"
              max="100"
              value={d.status.brightness ?? 0}
              disabled={demo}
              onChange={(e) => update(i, `brightness=${e.target.value}`)}
            />
          )}
        </div>
      ))}

      <div className="logs">
        <h3>Loki</h3>
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}