import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, SafeAreaView, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";

const DEMO_DEVICES = [
  { host: "demo-1", type: "Switch", name: "Olohuoneen valo", status: { output: true, apower: 42.3, voltage: 231, current: 0.18 } },
  { host: "demo-2", type: "Switch", name: "Pesukone", status: { output: false, apower: 0 } },
  { host: "demo-3", type: "Light", name: "Ruokailutilan dimmeri", status: { output: true, brightness: 70, apower: 18.5 } },
];

const DEVICE_NAMEKEY = "shelly-device-names";

const COLORS = {
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
  const system = useColorScheme();
  const [devices, setDevices] = useState([]);
  const [demoOn, setDemoOn] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [ip, setIp] = useState("");
  const [open, setOpen] = useState(null);
  const [dark, setDark] = useState(system === "dark");
  const [maxPower, setMaxPower] = useState(0);
  const [nameOverrides, setNameOverrides] = useState({});
  const [editingHost, setEditingHost] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const c = dark ? COLORS.dark : COLORS.light;

  const Txt = ({ sub, size, bold, color, children }) => (
    <Text style={{ color: color || (sub ? c.sub : c.text), fontSize: size || (sub ? 13 : 15), fontWeight: bold ? "600" : "400" }}>
      {children}
    </Text>
  );

  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const totalRef = useRef(0);
  const nameOverridesRef = useRef({});
  const nameTapRef = useRef({});
  const savingNameRef = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DEVICE_NAMEKEY)
      .then((savedNames) => {
        if (!savedNames) return;
        const parsed = JSON.parse(savedNames);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
          Object.values(parsed).some((name) => typeof name !== "string")) {
          throw new Error("Tallennettu nimilista on virheellinen");
        }
        if (active) {
          nameOverridesRef.current = parsed;
          setNameOverrides(parsed);
        }
      })
      .catch((error) => {
        if (active) Alert.alert("Virhe", `Tallennetut nimet eivät latautuneet: ${error.message}`);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      devicesRef.current.forEach(async (d) => {
        try {
          const status = await get(`http://${d.host}/rpc/${d.type}.GetStatus?id=0`);
          setDevices((cur) => cur.map((x) => (x.host === d.host ? { ...x, status } : x)));
        } catch {}
      });
      setMaxPower((m) => Math.max(m, totalRef.current));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  function onDeviceNamePress(event, device, index) {
    event.stopPropagation();
    const now = event.nativeEvent.timestamp;
    const previousTap = nameTapRef.current[device.host];
    if (previousTap && now - previousTap < 350) {
      delete nameTapRef.current[device.host];
      setNameDraft(nameOverridesRef.current[device.host] ?? device.name);
      setEditingHost(device.host);
      return;
    }

    nameTapRef.current[device.host] = now;
    setOpen((current) => current === index ? null : index);
  }

  async function saveName(host, originalName) {
    if (savingNameRef.current) return;
    const name = nameDraft.trim();
    if (!name) {
      Alert.alert("Virhe", "Nimi ei voi olla tyhjä");
      return;
    }

    const currentName = nameOverridesRef.current[host] ?? originalName;
    if (name === currentName) {
      setEditingHost(null);
      return;
    }

    const updatedNames = { ...nameOverridesRef.current, [host]: name };
    savingNameRef.current = true;
    try {
      await AsyncStorage.setItem(DEVICE_NAME, JSON.stringify(updatedNames));
      nameOverridesRef.current = updatedNames;
      setNameOverrides(updatedNames);
      setEditingHost(null);
    } catch (error) {
      Alert.alert("Virhe", `Nimen tallentaminen epäonnistui: ${error.message}`);
    } finally {
      savingNameRef.current = false;
    }
  }

  function onTitlePress() {
    if (clicks + 1 >= 3) {
      setDemoOn(!demoOn);
      setClicks(0);
    } else {
      setClicks(clicks + 1);
    }
  }

  function update(host, changes) {
    setDevices((prev) => prev.map((x) => (x.host === host ? { ...x, status: { ...x.status, ...changes } } : x)));
  }

  async function add() {
    const host = ip.trim();
    if (!host) return;
    try {
      const info = await get(`http://${host}/rpc/Shelly.GetDeviceInfo`);
      const type = info.app?.toLowerCase().includes("dimmer") ? "Light" : "Switch";
      const status = await get(`http://${host}/rpc/${type}.GetStatus?id=0`);
      setDevices((prev) => [...prev, { host, type, name: info.name || info.app, status }]);
      setIp("");
    } catch {
      Alert.alert("Virhe", `Laite ${host} ei vastaa`);
    }
  }

  async function toggle(d) {
    const on = !d.status.output;
    update(d.host, { output: on });
    if (d.host.startsWith("demo")) return;
    try {
      await get(`http://${d.host}/rpc/Switch.Set?id=0&on=${on}`);
    } catch {
      Alert.alert("Virhe", `${d.name} ei vastaa`);
    }
  }

  async function sendBrightness(d, value) {
    if (d.host.startsWith("demo")) return;
    try {
      await get(`http://${d.host}/rpc/Light.Set?id=0&brightness=${Math.round(value)}`);
    } catch {
      Alert.alert("Virhe", `${d.name} ei vastaa`);
    }
  }

  const shown = demoOn ? [...DEMO_DEVICES.filter((d) => !devices.some((x) => x.host === d.host)), ...devices] : devices;
  const total = shown.reduce((s, d) => s + (d.status.apower ?? 0), 0);
  const active = shown.filter((d) => (d.status.apower ?? 0) > 0).length;
  totalRef.current = total;

  const Stat = ({ label, value }) => (
    <View style={{ flex: 1 }}>
      <Txt sub>{label}</Txt>
      <Txt bold>{value}</Txt>
    </View>
  );

  const box = { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10 };
  const btn = (bg) => ({ backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, justifyContent: "center" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity activeOpacity={1} onPress={onTitlePress}>
            <Txt size={28} bold>Shelly</Txt>
          </TouchableOpacity>
          <TouchableOpacity style={[box, { paddingVertical: 6, paddingHorizontal: 12 }]} onPress={() => setDark(!dark)}>
            <Txt sub>{dark ? "Vaalea" : "Tumma"}</Txt>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <Stat label="Yhteensä" value={`${total.toFixed(1)} W`} />
          <Stat label="Keskiarvo" value={`${(shown.length ? total / shown.length : 0).toFixed(1)} W`} />
          <Stat label="Huippu" value={`${maxPower.toFixed(1)} W`} />
          <Stat label="Käytössä" value={`${active}/${shown.length}`} />
        </View>

        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <TextInput
            value={ip}
            onChangeText={setIp}
            onSubmitEditing={add}
            placeholder="Laitteen IP, esim. 192.168.33.1"
            placeholderTextColor={c.sub}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            style={[box, { flex: 1, padding: 10, color: c.text, marginRight: 8 }]}
          />
          <TouchableOpacity style={btn(c.accent)} onPress={add}>
            <Txt color="#FFF" bold>Lisää</Txt>
          </TouchableOpacity>
        </View>

        {shown.map((d, i) => {
          const on = !!d.status.output;
          const deviceName = nameOverrides[d.host] ?? d.name;
          return (
            <View key={d.host} style={[box, { padding: 16, marginBottom: 12 }]}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setOpen(open === i ? null : i)} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  {editingHost === d.host ? (
                    <TextInput
                      autoFocus
                      value={nameDraft}
                      maxLength={25}
                      onChangeText={setNameDraft}
                      onSubmitEditing={() => saveName(d.host, d.name)}
                      onBlur={() => saveName(d.host, d.name)}
                      returnKeyType="done"
                      selectTextOnFocus
                      style={{ color: c.text, fontSize: 16, fontWeight: "600", padding: 0, borderBottomWidth: 1, borderBottomColor: c.accent }}
                    />
                  ) : (
                    <Text
                      onPress={(event) => onDeviceNamePress(event, d, i)}
                      style={{ color: c.text, fontSize: 16, fontWeight: "600" }}
                    >
                      {deviceName}
                    </Text>
                  )}
                  <Txt sub>{(d.status.apower ?? 0).toFixed(1)} W · {on ? "Päällä" : "Pois"}</Txt>
                </View>
                {d.type === "Switch" && (
                  <TouchableOpacity style={btn(on ? c.accent : c.sub)} onPress={() => toggle(d)}>
                    <Txt color="#FFF" bold>{on ? "Sammuta" : "Käynnistä"}</Txt>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {d.type === "Light" && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Txt sub>Kirkkaus</Txt>
                    <Txt sub>{d.status.brightness ?? 0}%</Txt>
                  </View>
                  <Slider
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={d.status.brightness ?? 0}
                    onValueChange={(v) => update(d.host, { brightness: Math.round(v) })}
                    onSlidingComplete={(v) => sendBrightness(d, v)}
                    minimumTrackTintColor={c.accent}
                    maximumTrackTintColor={c.border}
                    thumbTintColor={c.accent}
                    style={{ height: 40 }}
                  />
                </View>
              )}

              {open === i && (
                <View style={{ flexDirection: "row", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
                  <Stat label="Teho" value={`${(d.status.apower ?? 0).toFixed(1)} W`} />
                  {d.status.voltage !== undefined && <Stat label="Jännite" value={`${d.status.voltage} V`} />}
                  {d.status.current !== undefined && <Stat label="Virta" value={`${d.status.current.toFixed(2)} A`} />}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}