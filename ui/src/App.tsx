import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save, confirm } from "@tauri-apps/plugin-dialog";
import {
  Keyboard as KeyboardIcon,
  Plus,
  Copy,
  Trash2,
  Upload,
  Usb,
  RefreshCw,
  Play,
  Pause,
  Undo2,
  Redo2,
  Check,
  Lightbulb,
  Command,
  Film,
  HardDrive,
  FolderClock,
  X,
  ArrowRight,
  RotateCcw,
  Wand2,
  ArrowLeft,
  MoreHorizontal,
  LockKeyhole,
} from "lucide-react";
import Keyboard from "./Keyboard";
import ProfileLibrary from "./ProfileLibrary";
import WriteDialog from "./WriteDialog";
import { isStaticProfile, extractUserProfiles, profileEditor } from "./library";
import {
  needsProfileScan,
  targetProfile,
  destinationAfterDetection,
} from "./device";
import MacroEditor from "./MacroEditor";
import FirmwareEditor from "./FirmwareEditor";
import ProfileBuilder from "./ProfileBuilder";
import AnimationEditor from "./AnimationEditor";
import {
  layout,
  editKeys,
  setBinding,
  frameAt,
  hex,
  rgb,
  gradient,
  gradientDirections,
  groups,
  effectNames,
  actionNames,
  actionLabel,
} from "./model";
import type {
  Profile,
  Color,
  Effect,
  Layer,
  Hardware,
  Device,
  HardwareSlot,
  HardwareScan,
  GradientDirection,
} from "./model";
const native = isTauri();
const offline: Device = {
  connected: false,
  supported: false,
  revision: null,
  active: null,
  message: "Предпросмотр интерфейса · USB доступен в приложении Tauri",
};
const blank = (): Profile => ({
  version: 1,
  id: crypto.randomUUID(),
  name: "Новый профиль",
  description: "",
  brightness: 100,
  keys: layout.map(() => ({
    color: [116, 217, 188],
    effect: "static",
    speed: 1,
    pause: 32,
  })),
  frames: [{ keys: layout.map((_, i) => i), duration: 1 }],
  bindings: [],
});
const swatches = [
  "#00ffdc",
  "#4ea8ff",
  "#a477ff",
  "#ff5194",
  "#ff9d42",
  "#f4e7cf",
  "#ffffff",
  "#000000",
];
const all = layout.map((_, i) => i);
const standardActions = layout.filter(
  (key, index) =>
    key.name !== "fn" && layout.findIndex((k) => k.code === key.code) === index,
);

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [templates, setTemplates] = useState<Profile[]>([]),
    [active, setActive] = useState("");
  const [device, setDevice] = useState<Device>(offline),
    [destination, setDestination] = useState<number | null>(null),
    [onboardProfiles, setOnboardProfiles] = useState<HardwareSlot[]>([]);
  const slot = targetProfile(destination, device);
  const hardware =
    onboardProfiles.find((entry) => entry.slot === slot)?.data ?? null;
  const scanIdentity = useRef<string | null>(null),
    scanning = useRef(false),
    lastScanAttempt = useRef(0);
  const [selected, setSelected] = useState<number[]>([35, 51, 52, 53]),
    [tab, setTab] = useState("library"),
    [layer, setLayer] = useState<Layer>("base");
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(true),
    [painting, setPainting] = useState(false),
    [time, setTime] = useState(0),
    [gradientFrom, setGradientFrom] = useState("#00ffff"),
    [gradientDirection, setGradientDirection] = useState<GradientDirection>("right"),
    [gradientTo, setGradientTo] = useState("#ff5194");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState(""),
    [loaded, setLoaded] = useState(false),
    [backups, setBackups] = useState<string[] | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [undo, setUndo] = useState<Profile[]>([]),
    [redo, setRedo] = useState<Profile[]>([]);
  const [newProfile] = useState(blank);
  const backupDialog = useRef<HTMLDialogElement>(null);
  const fileMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (backups !== null && !backupDialog.current?.open)
      backupDialog.current?.showModal();
  }, [backups]);
  const library = useMemo(()=>[...templates,...profiles],[templates,profiles]);
  const presetIds = useMemo(()=>new Set(templates.map(profile=>profile.id)),[templates]);
  const current = library.find((p) => p.id === active);
  const isPreset = presetIds.has(active);
  const animates = !!current && !current.firmware && !isStaticProfile(current);
  const latest = useRef(profiles),
    queue = useRef(Promise.resolve()),
    ready = useRef(false),
    busyRef = useRef("");
  latest.current = profiles;
  busyRef.current = busy;
  const persist = (value: Profile[]) => {
    if (!native) return Promise.resolve();
    const task = queue.current
      .catch(() => {})
      .then(() => invoke<void>("save_library", { profiles: value }));
    queue.current = task;
    return task;
  };
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const result = native
          ? await invoke<{
              profiles: Profile[];
              templates: Profile[];
              device: Device;
            }>("bootstrap")
          : {
              profiles: (await fetch("/presets.json").then((r) =>
                r.json(),
              )) as Profile[],
              templates: [],
              device: offline,
            };
        if (cancelled) return;
        const originals = result.templates.length ? result.templates : result.profiles;
        const users = extractUserProfiles(result.profiles,originals);
        setTemplates(originals);
        setProfiles(users);
        setActive(originals[0]?.id ?? users[0]?.id ?? "");
        setTab("library");
        setDevice(result.device);
        ready.current = true;
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!native || !loaded) return;
    let stopped = false;
    async function poll() {
      if (
        stopped ||
        busyRef.current ||
        scanning.current ||
        document.querySelector(".record-zone.recording")
      )
        return;
      scanning.current = true;
      try {
        const presence = await invoke<Device>("probe_device");
        if (stopped || busyRef.current) return;
        const previousIdentity = scanIdentity.current;
        setDestination((previous) =>
          destinationAfterDetection(previous, previousIdentity, presence),
        );
        if (!presence.connected || !presence.supported) {
          scanIdentity.current = null;
          lastScanAttempt.current = 0;
          setDevice(presence);
          setOnboardProfiles([]);
          setDestination(null);
          return;
        }
        if (needsProfileScan(scanIdentity.current, presence)) {
          setOnboardProfiles([]);
          if (Date.now() - lastScanAttempt.current < 10000) return;
          lastScanAttempt.current = Date.now();
          busyRef.current = "Чтение профилей клавиатуры";
          setBusy(busyRef.current);
          try {
            const result = await invoke<HardwareScan>("scan_hardware");
            if (stopped) return;
            setDevice(result.device);
            setOnboardProfiles(result.profiles);
            scanIdentity.current =
              result.device.supported && result.profiles.some((p) => p.data)
                ? (result.device.identity ?? null)
                : null;
          } finally {
            busyRef.current = "";
            if (!stopped) setBusy("");
          }
        } else {
          const next = await invoke<Device>("refresh_device");
          if (stopped) return;
          if (next.identity !== presence.identity) {
            scanIdentity.current = null;
            setOnboardProfiles([]);
            setDestination(null);
          }
          setDevice(next);
        }
      } catch (e) {
        if (!stopped) {
          scanIdentity.current = null;
          setOnboardProfiles([]);
          setDestination(null);
          setDevice((previous) => ({
            ...previous,
            supported: false,
            active: null,
            message: String(e),
          }));
        }
      } finally {
        scanning.current = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [loaded]);
  useEffect(() => {
    if (!ready.current) return;
    setSaved(
      native ? "Сохранение…" : "Предпросмотр · изменения в этой вкладке",
    );
    const timer = setTimeout(() => {
      void persist(profiles)
        .then(() =>
          setSaved(
            native
              ? "Сохранено на компьютере"
              : "Предпросмотр · изменения в этой вкладке",
          ),
        )
        .catch((e) => {
          setSaved("Не сохранено");
          setError(String(e));
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [profiles]);
  useEffect(() => {
    if (!native) return;
    const subscription = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (busyRef.current) {
        setError("Дождитесь завершения операции с клавиатурой");
        return;
      }
      try {
        if (ready.current) await persist(latest.current);
        await getCurrentWindow().destroy();
      } catch (e) {
        setError(`Не удалось сохранить библиотеку: ${e}`);
      }
    });
    return () => {
      void subscription.then((stop) => stop());
    };
  }, []);
  useEffect(() => {
    if (
      !playing ||
      !current ||
      writeOpen ||
      !animates ||
      !["overview","lighting","frames"].includes(tab)
    )
      return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const timer = setInterval(() => setTime(performance.now() - start), 60);
    return () => clearInterval(timer);
  }, [playing, active, tab, animates, writeOpen]);
  useEffect(() => {
    if (current && playing && animates && ["overview","lighting","frames"].includes(tab)) setFrame(frameAt(current, time));
  }, [time, playing, current, tab, animates]);
  useEffect(() => {
    setFrame(0);
    setGradientFrom(hex(current?.keys[0]?.color ?? [0,255,255]));
    setUndo([]);
    setRedo([]);
  }, [active]);

  async function run(label: string, operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = label;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = "";
      setBusy("");
    }
  }
  function update(next: Profile) {
    if (!current || isPreset) return;
    setUndo((history) => [...history.slice(-29), current]);
    setRedo([]);
    setProfiles((items) => items.map((p) => (p.id === active ? next : p)));
  }
  function add(profile: Profile) {
    if(profiles.length >= 256) {setError("Можно сохранить не больше 256 своих профилей.");return;}
    const copy = { ...structuredClone(profile), id: crypto.randomUUID() };
    setProfiles((items) => [...items, copy]);
    setActive(copy.id);
    if(tab !== "macros" && tab !== "bindings") setTab(profileEditor(copy));
  }
  function selectKey(index: number, multiple: boolean) {
    if (current && tab === "frames" && painting) {
      setPlaying(false);
      update({
        ...current,
        frames: current.frames.map((f, i) =>
          i === frame
            ? {
                ...f,
                keys: f.keys.includes(index)
                  ? f.keys.filter((k) => k !== index)
                  : [...f.keys, index],
              }
            : f,
        ),
      });
      return;
    }
    if(current) setGradientFrom(hex(current.keys[index].color));
    setSelected((items) =>
      multiple
        ? items.includes(index)
          ? items.filter((i) => i !== index)
          : [...items, index]
        : [index],
    );
  }
  function history(back: boolean) {
    if (!current || isPreset) return;
    const list = back ? undo : redo;
    const next = list.at(-1);
    if (!next) return;
    if (back) {
      setUndo(undo.slice(0, -1));
      setRedo([...redo, current]);
    } else {
      setRedo(redo.slice(0, -1));
      setUndo([...undo, current]);
    }
    setProfiles((items) => items.map((p) => (p.id === active ? next : p)));
  }
  async function refresh() {
    await run("Чтение профилей клавиатуры", async () => {
      const result = await invoke<HardwareScan>("scan_hardware");
      setDevice(result.device);
      setOnboardProfiles(result.profiles);
      setDestination(null);
      scanIdentity.current = result.device.supported
        ? (result.device.identity ?? null)
        : null;
    });
  }
  async function chooseWriteTarget() {
    setWriteOpen(true);
    if (!native || !device.supported) return;
    await run("Чтение активного профиля", async () => {
      const next = await invoke<Device>("refresh_device");
      if (!next.supported || next.identity !== scanIdentity.current) {
        scanIdentity.current = null;
        setOnboardProfiles([]);
        setDestination(null);
      }
      setDevice(next);
    });
  }
  async function refreshAssignments() {
    if (slot === null) return;
    await run("Обновление назначений", async () => {
      const result = await invoke<Hardware>("read_hardware", { slot });
      setOnboardProfiles((entries) =>
        entries.map((entry) =>
          entry.slot === slot ? { ...entry, data: result, error: null } : entry,
        ),
      );
      setNotice("Назначения обновлены.");
    });
  }
  async function openHardware(target: number) {
    await run("Открытие профиля", async () => {
      const result = await invoke<Hardware>("read_hardware", {slot: target});
      setOnboardProfiles(entries=>entries.map(entry=>entry.slot === target ? {...entry,data:result,error:null} : entry));
      if(result.config) {
        add({...result.config,name:`Профиль ${target}`});
        setDestination(target);
        setTab(profileEditor(result.config));
      }
    });
  }
  async function activateHardware(target: number) {
    await run("Переключение профиля", async () => {
      await invoke("select_slot", {slot: target});
      setDevice(await invoke<Device>("refresh_device"));
    });
  }
  async function publish(target = slot) {
    if (!current || target === null) return;
    await run("Запись и проверка профиля", async () => {
      await persist(latest.current);
      const result = await invoke<Hardware>("apply_profile", { slot: target, profile: current });
      setOnboardProfiles((entries) =>
        entries.map((entry) =>
          entry.slot === target ? { ...entry, data: result, error: null } : entry,
        ),
      );
      setDestination(target);
      setDevice((previous) => ({ ...previous, active: target }));
      setNotice(
        `«${current.name}» записан в слот ${target} и активирован.`,
      );
    });
  }
  async function exportFile() {
    if (!current) return;
    await run("Экспорт профиля", async () => {
      const path = await save({
        defaultPath: `${current.name}.json`,
        filters: [{ name: "Dark Project profile", extensions: ["json"] }],
      });
      if (path) {
        await invoke("export_profile", { path, profile: current });
        setNotice("Профиль экспортирован");
      }
    });
  }
  async function remove() {
    if (!current || isPreset) return;
    const ok = native
      ? await confirm(
          `Удалить «${current.name}» из библиотеки? Память клавиатуры останется без изменений.`,
          { title: "Удалить профиль", kind: "warning" },
        )
      : window.confirm(`Удалить «${current.name}»?`);
    if (ok) {
      const next = profiles.filter((p) => p.id !== active);
      setProfiles(next);
      setActive(next[0]?.id ?? templates[0]?.id ?? "");
    }
  }
  const style = current?.keys[selected[0] ?? 0];
  const binding = current?.bindings.find(
    (b) => b.key === selected[0] && b.layer === layer,
  );
  const selectedMacro = current?.macros?.find(
    (m) => m.key === selected[0] && m.layer === layer,
  );
  const baseCode =
    layer === "base"
      ? hardware?.base[selected[0]]
      : hardware?.function[selected[0]];
  const patch = (value: Parameters<typeof editKeys>[2]) => {
    if (current && selected.length) update(editKeys(current, selected, value));
  };
  const gradientDisabled = !current || isPreset || selected.length < 2 ||
    selected.some(index=>current.keys[index].effect === "cycle");
  function changeGradient(from: string, to: string, direction: GradientDirection) {
    setGradientFrom(from);
    setGradientTo(to);
    setGradientDirection(direction);
    if (current && !gradientDisabled)
      update(gradient(current,selected,rgb(from),rgb(to),direction));
  }
  const hasDevice = native && device.supported;
  const changeFrame = (index: number) => {
    setPlaying(false);
    setFrame(index);
  };

  const page = tab === "macros" ? "macros" : tab === "bindings" ? "bindings" : "lighting";
  const detail = !["library", "create"].includes(tab);
  const openProfile = useCallback((profile: Profile) => {
    setActive(profile.id);
    setTab(profileEditor(profile));
  }, []);
  const createProfile = useCallback(() => setTab("create"), []);

  return (
    <div className={`app-shell page-${page}`}>
      <aside className="library">
        <nav className="page-nav" aria-label="Страницы">
          {[
            {id:"lighting", label:"Подсветка", icon:Lightbulb, target:"library"},
            {id:"macros", label:"Макросы", icon:Command, target:"macros"},
            {id:"bindings", label:"Переназначение", icon:KeyboardIcon, target:"bindings"},
          ].map(({id,label,icon:Icon,target}) => <button key={id} className={page === id ? "active" : ""} aria-current={page === id ? "page" : undefined} disabled={!!busy} onClick={() => {setTab(target); setSelected([selected[0] ?? 12]);}}><Icon size={17}/>{label}</button>)}
        </nav>
        <div className="sidebar-actions">
          <button className="quiet full" disabled={!loaded || !!busy} onClick={createProfile}><Plus size={15}/>Создать профиль</button>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-toolbar">
          <div className={`connection ${hasDevice ? "connected" : ""}`} title={device.message}>
            <Usb size={15} aria-hidden="true" />
            <span role="status">
              {hasDevice ? "KD3B · USB" : native ? (device.connected ? (device.inputMonitoringRequired ? "Нужен доступ к клавиатуре" : device.revision === "3131" ? "Ошибка подключения USB" : "Не поддерживается") : "USB не подключён") : "Предпросмотр"}
            </span>
            <button className="icon-button" title="Проверить подключение" aria-label="Проверить подключение" disabled={!native || !!busy} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true"/></button>
            <button className="icon-button" title="Резервные копии" aria-label="Резервные копии" disabled={!native || !!busy} onClick={() => void run("Чтение резервных копий",async () => setBackups(await invoke<string[]>("list_backups")))}><FolderClock size={15} aria-hidden="true"/></button>
          </div>
          <div className="write-controls">
            {detail && current && tab !== "builder" && <button className="quiet small" aria-label="Записать профиль в клавиатуру" title="Выбрать слот для записи" disabled={!!busy} onClick={()=>void chooseWriteTarget()}><HardDrive size={14}/>Записать…</button>}
          </div>
        </div>
        <div className="message-region" aria-live="polite">
          {detail && current?.firmware && <div className="message"><span>Заводские эффекты доступны на клавиатуре только после записи.</span></div>}
          {device.inputMonitoringRequired && (
            <div className="message error" role="alert">
              <span>{device.message}</span>
              <button className="quiet small" onClick={() => void invoke("open_input_monitoring_settings").catch(e => setError(String(e)))}>Открыть настройки</button>
            </div>
          )}
          {busy && (
            <div className="message">
              <span className="spinner" />
              {busy}…
            </div>
          )}
          {error && (
            <div className="message error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Скрыть ошибку"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="message success">
              <Check size={16} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Скрыть сообщение"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="profile-library-page" hidden={tab !== "library"}>
          <ProfileLibrary profiles={library} presetIds={presetIds} disabled={!!busy || !loaded} active={tab === "library"} onSelect={openProfile} onCreate={createProfile}/>
        </div>
        {tab === "library" ? null : tab === "create" ? (
          <fieldset className="editor editor-wide" disabled={!!busy}><div className="editor-main">
            <button className="back-link" onClick={()=>setTab("library")}><ArrowLeft size={15}/>Все профили</button>
            <div className="profile-title"><h1 className="builder-title">Создать профиль</h1></div>
            <ProfileBuilder profile={newProfile} creating onCreate={p=>{add(p);setTab("overview");}} onApply={()=>{}}/>
          </div></fieldset>
        ) : current ? (
          <fieldset className={`editor ${isPreset || !["lighting","frames","bindings"].includes(tab) ? "editor-wide" : ""}`} disabled={!!busy}>
            <div className="editor-main">
              {page === "lighting" && <button className="back-link" onClick={()=>setTab(["overview","firmware"].includes(tab) ? "library" : current.firmware ? "firmware" : "overview")}><ArrowLeft size={15}/>{["overview","firmware"].includes(tab) ? "Все профили" : "Вернуться к профилю"}</button>}
              <div className="profile-title">
                <div>
                  {page === "macros" || page === "bindings" ? <h1 className="builder-title">{page === "macros" ? "Макросы" : "Переназначение"}</h1> : isPreset ? <h1 className="builder-title">{current.name}</h1> : (
                    <input
                      className="name-input"
                      aria-label="Название профиля"
                      maxLength={64}
                      value={current.name}
                      onChange={(e) => {
                        if (e.target.value.trim())
                          update({ ...current, name: e.target.value });
                      }}
                    />
                  )}
                  {isPreset && <span className="preset-label"><LockKeyhole size={12}/>Готовый профиль · только просмотр</span>}
                  {page === "lighting" && tab === "overview" && current.description && (
                    <p>{current.description}</p>
                  )}
                </div>
                <div className="profile-actions">
                  <button className={isPreset ? "primary" : "quiet small"} onClick={()=>add({...current,name:`${current.name} — копия`.slice(0,64)})}><Copy size={14}/>{isPreset ? "Создать копию" : "Дублировать"}</button>
                  <button className="icon-button" aria-label="Файл профиля" onClick={event=>{const box=event.currentTarget.getBoundingClientRect();if(fileMenu.current){fileMenu.current.style.top=`${box.bottom+6}px`;fileMenu.current.style.right=`${window.innerWidth-box.right}px`;fileMenu.current.togglePopover();}}}><MoreHorizontal size={17}/></button>
                </div>
                {!isPreset && <div className="history">
                  <button
                    className="icon-button"
                    disabled={!undo.length}
                    aria-label="Отменить"
                    title="Отменить изменение"
                    onClick={() => history(true)}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={!redo.length}
                    aria-label="Повторить"
                    title="Повторить изменение"
                    onClick={() => history(false)}
                  >
                    <Redo2 size={17} />
                  </button>
                </div>}
              </div>
              {!isPreset && (page === "macros" || page === "bindings") && <p className="page-intro">{page === "macros" ? "Выберите клавишу на схеме, затем запишите последовательность." : "Выберите клавишу на схеме и задайте новое действие справа."} Изменения относятся к «{current.name}».</p>}
              {page === "lighting" && ["lighting","frames"].includes(tab) && <nav className="tabs" aria-label="Ручное редактирование">
                <button className={tab === "lighting" ? "active" : ""} onClick={()=>setTab("lighting")}>Цвета клавиш</button>
                <button className={tab === "frames" ? "active" : ""} onClick={()=>setTab("frames")}>Кадры анимации</button>
              </nav>}
              {isPreset && page !== "lighting" ? <section className="preset-editing-lock"><p>Чтобы настроить {page === "macros" ? "макросы" : "назначения клавиш"} для «{current.name}», создайте копию профиля.</p><Keyboard profile={current} selected={[]} interactive={false} onSelect={()=>{}} frame={0} playing={false} mode={page} layer={layer} hardware={null} time={0}/></section> : tab === "firmware" ? <FirmwareEditor profile={current} onChange={update} readOnly={isPreset} onReplace={()=>setTab("builder")}/> : tab === "overview" || isPreset ? <section className="profile-overview">
                {!isPreset && <div className="overview-actions"><button className="quiet" onClick={()=>setTab("builder")}><Wand2 size={16}/>Заменить анимацию</button><button className="quiet" onClick={()=>{update({...current,firmware:{mode:0}});setTab("firmware");}}><HardDrive size={16}/>Встроенные эффекты</button><button className="quiet" onClick={()=>{setSelected(all);setGradientFrom(hex(current.keys[0].color));setTab("lighting");}}><Lightbulb size={16}/>Изменить цвета клавиш</button></div>}
                <div className="overview-caption"><span>{animates ? "Предпросмотр подсветки" : "Статическая подсветка"}</span>{animates && <button className="quiet small" aria-pressed={playing} onClick={()=>setPlaying(!playing)}>{playing ? <Pause size={14}/> : <Play size={14}/>} {playing ? "Пауза" : "Воспроизвести"}</button>}</div>
                <Keyboard profile={current} selected={[]} interactive={false} onSelect={()=>{}} frame={frame} playing={playing} mode="lighting" layer="base" hardware={null} time={time}/>
                <div className="overview-controls">
                  <label htmlFor="overview-brightness">Яркость <output>{current.brightness}%</output><input id="overview-brightness" type="range" disabled={isPreset} min={0} max={100} value={current.brightness} onChange={e=>update({...current,brightness:Number(e.target.value)})}/></label>
                  <div><HardDrive size={16}/><span>Работает без приложения<small>После записи в память клавиатуры</small></span></div>
                </div>

                {!isPreset && <details className="manual-tools"><summary>Дополнительные настройки</summary><button onClick={()=>setTab("frames")}><Film size={15}/>Редактировать кадры</button></details>}
              </section> : tab === "builder" ? (
                <ProfileBuilder
                  profile={current}
                  onCreate={(p) => {
                    add(p);
                    setTab("overview");
                  }}
                  onApply={(p) => {
                    update(p);
                    setTab("overview");
                  }}
                />
              ) : tab === "macros" ? (
                <MacroEditor
                  profile={current}
                  selected={selected}
                  layer={layer}
                  onLayer={setLayer}
                  onSelect={selectKey}
                  onChange={update}
                />
              ) : (
                <>
                  <div className="canvas-toolbar">
                    <span>
                      {tab === "bindings"
                        ? layer === "base"
                          ? "Основной слой"
                          : "Слой Fn"
                        : "Схема клавиатуры"}
                    </span>
                    <div>
                      {tab === "bindings" ? (
                        <div className="segmented">
                          <button
                            className={layer === "base" ? "active" : ""}
                            onClick={() => setLayer("base")}
                          >
                            Основной
                          </button>
                          <button
                            className={layer === "fn" ? "active" : ""}
                            onClick={() => setLayer("fn")}
                          >
                            Fn-слой
                          </button>
                        </div>
                      ) : (
                        <button
                          className="quiet small"
                          onClick={() => setPlaying(!playing)}
                        >
                          {playing ? <Pause size={14} /> : <Play size={14} />}
                          Предпросмотр
                        </button>
                      )}
                    </div>
                  </div>
                  <Keyboard
                    profile={current}
                    selected={
                      tab === "frames" && painting
                        ? (current.frames[frame]?.keys ?? [])
                        : selected
                    }
                    onSelect={selectKey}
                    frame={frame}
                    playing={playing}
                    mode={tab}
                    layer={layer}
                    hardware={hardware}
                    time={time}
                  />
                  <div className="selection-bar">
                    <span>
                      <b>{selected.length}</b>{" "}
                      {selected.length === 1
                        ? "клавиша выбрана"
                        : "клавиш выбрано"}
                    </span>
                    {tab !== "bindings" && <div>
                      <button onClick={() => setSelected(all)}>Все</button>
                      {Object.entries(groups).map(([label, names]) => (
                        <button
                          key={label}
                          onClick={() =>
                            setSelected(
                              layout.flatMap((key, i) =>
                                names.includes(key.name) ? [i] : [],
                              ),
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                      <button onClick={() => setSelected([])}>Снять</button>
                    </div>}
                  </div>
                  <p className="canvas-hint">
                    {tab === "bindings" ? "Нажмите клавишу для выбора." : "Нажмите клавишу для выбора. Shift + клик — выбрать несколько."}
                  </p>
                  {tab === "bindings" ? (
                    <section className="binding-summary">
                      <div className="section-heading">
                        <h2>Назначения в профиле</h2>
                        <span>{current.bindings.length} изменений</span>
                      </div>
                      <p className="muted">
                        Изменятся только назначенные здесь клавиши.
                      </p>
                      {current.bindings.length ? (
                        <div className="binding-list">
                          {current.bindings.map((b) => (
                            <button
                              key={`${b.key}-${b.layer}`}
                              onClick={() => {
                                setSelected([b.key]);
                                setLayer(b.layer);
                              }}
                            >
                              <span className="key-label">
                                {b.layer === "fn" ? "Fn + " : ""}
                                {layout[b.key].label}
                              </span>
                              <ArrowRight size={14} />
                              <span>{actionLabel(b.action)}</span>
                              <span className="muted">
                                {b.layer === "fn" ? "Fn-слой" : "Основной"}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-row">
                          <Command size={20} />
                          <span>
                            Выберите клавишу на схеме и задайте действие справа.
                          </span>
                        </div>
                      )}
                    </section>
                  ) : tab === "frames" ? (
                    <AnimationEditor
                      profile={current}
                      frame={frame}
                      selected={selected}
                      painting={painting}
                      onPaint={(value) => {
                        setPainting(value);
                        if (value) setTab("frames");
                      }}
                      onFrame={changeFrame}
                      onSelect={setSelected}
                      onChange={update}
                    />
                  ) : null}
                </>
              )}

            </div>
            {!isPreset && ["lighting","frames","bindings"].includes(tab) && <aside className="inspector">
              <div className="inspector-heading">
                <h2>
                  {tab === "bindings" ? "Новое действие" : "Цвета выбранных клавиш"}
                </h2>
                <span>{selected.length === 1 ? layout[selected[0]].label : `Выбрано: ${selected.length}`}</span>
              </div>
              {tab === "bindings" ? (
                <>
                  <div className="field">
                    <label htmlFor="action">
                      Действие · {layer === "fn" ? "Fn-слой" : "основной слой"}
                    </label>
                    <select
                      id="action"
                      disabled={selected.length !== 1 || selected[0] === 81}
                      value={
                        selectedMacro ? "macro" : (binding?.action ?? "keep")
                      }
                      onChange={(e) =>
                        update(
                          setBinding(
                            current,
                            selected[0],
                            layer,
                            e.target.value === "keep"
                              ? null
                              : Number(e.target.value),
                          ),
                        )
                      }
                    >
                      <option value="keep">Не менять назначение</option>
                      {selectedMacro && (
                        <option value="macro" disabled>
                          Макрос: {selectedMacro.name}
                        </option>
                      )}
                      <optgroup label="Клавиши">
                        {standardActions.map((key) => (
                          <option key={key.code} value={key.code}>
                            {key.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Медиа и профили">
                        {Object.entries(actionNames)
                          .filter(
                            ([code]) => ![0xac, 0xb2].includes(Number(code)),
                          )
                          .map(([code, label]) => (
                            <option key={code} value={code}>
                              {label}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                  </div>
                  {selected[0] === 81 ? (
                    <p className="muted">
                      Клавиша Fn защищена, чтобы доступ ко второму слою
                      оставался доступен.
                    </p>
                  ) : selected.length !== 1 ? (
                    <p className="muted">
                      Выберите одну клавишу для переназначения.
                    </p>
                  ) : (
                    <div className="readout">
                      <span>
                        {slot === null
                          ? "Клавиатура не подключена"
                          : `Профиль ${slot}`}
                      </span>
                      <strong>{actionLabel(baseCode)}</strong>
                      <small>Слой: {layer === "fn" ? "Fn" : "основной"}</small>
                    </div>
                  )}
                  <button
                    className="quiet full"
                    disabled={!hasDevice}
                    onClick={() => void refreshAssignments()}
                  >
                    <RefreshCw size={14} />
                    Обновить назначения
                  </button>
                  <p className="muted">
                    Fn + F1–F4 — профили 1–4, если сочетания не переназначены.
                  </p>
                  {selectedMacro && (
                    <button
                      className="quiet full"
                      onClick={() => setTab("macros")}
                    >
                      Редактировать макрос
                    </button>
                  )}
                  {binding && (
                    <button
                      className="quiet full"
                      onClick={() =>
                        update(setBinding(current, selected[0], layer, null))
                      }
                    >
                      <RotateCcw size={14} />
                      Убрать изменение
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="key-color">
                      Цвет{" "}
                      <span>
                        {selected.length > 1 ? "для выбранных клавиш" : ""}
                      </span>
                    </label>
                    <div className="color-input">
                      <input
                        id="key-color"
                        type="color"
                        disabled={!selected.length || style?.effect === "cycle"}
                        value={hex(style?.color ?? [0, 0, 0])}
                        onChange={(e) => patch({ color: rgb(e.target.value) })}
                      />
                      <span>
                        {hex(style?.color ?? [0, 0, 0]).toUpperCase()}
                      </span>
                    </div>
                    <div className="swatches">
                      {swatches.map((color) => (
                        <button
                          key={color}
                          aria-label={`Цвет ${color}`}
                          disabled={
                            !selected.length || style?.effect === "cycle"
                          }
                          onClick={() => patch({ color: rgb(color) })}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="effect">Эффект</label>
                    <select
                      id="effect"
                      disabled={!selected.length}
                      value={style?.effect ?? "static"}
                      onChange={(e) =>
                        patch({
                          effect: e.target.value as Effect,
                          ...(e.target.value === "cycle"
                            ? { pause: 0, color: [255, 255, 255] as Color }
                            : {}),
                        })
                      }
                    >
                      {Object.entries(effectNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {style?.effect === "cycle" && (
                    <p className="muted">
                      Прошивка сама перебирает шесть цветов. Начальная фаза
                      выбирает первый цвет.
                    </p>
                  )}
                  {style && style.effect !== "static" && (
                    <>
                      <div className="field">
                        <label htmlFor="speed">
                          Замедление <output>{style.speed}×</output>
                        </label>
                        <input
                          id="speed"
                          type="range"
                          min={1}
                          max={32}
                          value={Math.min(style.speed, 32)}
                          onChange={(e) =>
                            patch({ speed: Number(e.target.value) })
                          }
                        />
                        <div className="range-labels">
                          <span>Быстро</span>
                          <span>Медленно</span>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="pause">
                          {style.effect === "cycle"
                            ? "Начальная фаза"
                            : "Пауза эффекта"}
                          <output>{style.pause}</output>
                        </label>
                        <input
                          id="pause"
                          type="range"
                          min={0}
                          max={style.effect === "cycle" ? 5 : 255}
                          value={style.pause}
                          onChange={(e) =>
                            patch({ pause: Number(e.target.value) })
                          }
                        />
                      </div>
                    </>
                  )}
                  <div className="field divider">
                    <label htmlFor="brightness">
                      Яркость профиля <output>{current.brightness}%</output>
                    </label>
                    <input
                      id="brightness"
                      type="range"
                      min={0}
                      max={100}
                      value={current.brightness}
                      onChange={(e) =>
                        update({
                          ...current,
                          brightness: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="gradient-direction">Направление градиента</label>
                    <select id="gradient-direction" value={gradientDirection} disabled={gradientDisabled} onChange={e=>changeGradient(gradientFrom,gradientTo,e.target.value as GradientDirection)}>{Object.entries(gradientDirections).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
                    <div className="gradient-control">
                      <input type="color" aria-label="Начальный цвет градиента" value={gradientFrom} disabled={gradientDisabled} onInput={e=>changeGradient(e.currentTarget.value,gradientTo,gradientDirection)}/>
                      <ArrowRight size={15} />
                      <input
                        id="gradient-end"
                        type="color"
                        aria-label="Конечный цвет градиента"
                        value={gradientTo}
                        disabled={gradientDisabled}
                        onInput={e=>changeGradient(gradientFrom,e.currentTarget.value,gradientDirection)}
                      />
                    </div>
                  </div>
                </>
              )}
            </aside>}
          </fieldset>
        ) : (
          <div className="empty-state">
            <KeyboardIcon size={48} />
            <h1>{loaded ? "Создайте профиль" : "Загрузка редактора…"}</h1>
            <p>Настройте цвета, анимацию и назначения клавиш.</p>
            <button
              className="primary"
              disabled={!loaded}
              onClick={() => setTab("create")}
            >
              <Plus size={16} />
              Новый профиль
            </button>
          </div>
        )}
        <footer className="statusbar">
          <span>
            <i className={saved === "Не сохранено" ? "error-dot" : ""} />
            {saved || "Загрузка библиотеки…"}
          </span>
          <span>
            {native ? "USB · прямое подключение" : "USB недоступен в браузере"}
            <span className="status-divider" />
            KD3B rev.2
          </span>
        </footer>
      </main>
      {writeOpen && current && <WriteDialog profile={current} profiles={library} device={device} slots={onboardProfiles} busy={!!busy} onClose={()=>setWriteOpen(false)} onWrite={target=>{setWriteOpen(false);void publish(target);}} onOpen={target=>{setWriteOpen(false);void openHardware(target);}} onActivate={target=>void activateHardware(target)}/>}
      <div ref={fileMenu} popover="auto" className="profile-file-menu">
        <button disabled={!native} onClick={()=>{fileMenu.current?.hidePopover();void exportFile();}}><Upload size={14}/>Экспорт в файл</button>
        {!isPreset && <button onClick={()=>{fileMenu.current?.hidePopover();void remove();}}><Trash2 size={14}/>Удалить профиль</button>}
      </div>
      {backups !== null && (
        <dialog
          ref={backupDialog}
          className="backup-dialog"
          aria-labelledby="backup-title"
          onCancel={() => setBackups(null)}
        >
          <div className="section-heading">
            <h2 id="backup-title">Резервные копии</h2>
            <button
              className="icon-button"
              autoFocus
              aria-label="Закрыть резервные копии"
              onClick={() => setBackups(null)}
            >
              <X size={19} />
            </button>
          </div>
          <p className="muted">
            Копия содержит подсветку, раскладку и сохранённые макросы профиля.
            Перед восстановлением текущее состояние тоже сохраняется.
          </p>
          <div className="backup-list">
            {backups.length ? (
              backups.map((name) => (
                <div key={name}>
                  <span>{name}</span>
                  <button
                    className="quiet small"
                    disabled={!hasDevice || !!busy}
                    onClick={() =>
                      void (async () => {
                        if (
                          await confirm(
                            `Восстановить ${name}? Будут заменены данные слота, указанного в копии.`,
                            { title: "Восстановить слот", kind: "warning" },
                          )
                        ) {
                          setBackups(null);
                          await run("Восстановление слота", async () => {
                            await invoke("restore_backup", { name });
                            setOnboardProfiles([]);
                            scanIdentity.current = null;
                            setNotice(
                              "Данные слота восстановлены и проверены. Активируйте нужный слот.",
                            );
                          });
                        }
                      })()
                    }
                  >
                    Восстановить
                  </button>
                </div>
              ))
            ) : (
              <p>Резервные копии появятся после первой записи в клавиатуру.</p>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}
