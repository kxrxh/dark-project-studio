import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  Check,
  Command,
  FolderClock,
  HardDrive,
  Keyboard as KeyboardIcon,
  Lightbulb,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Usb,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  destinationAfterDetection,
  needsProfileScan,
  targetProfile,
} from "../features/device/device";
import WriteDialog from "../features/device/WriteDialog";
import {
  extractUserProfiles,
  profileEditor,
} from "../features/profiles/library";
import ProfileBuilder from "../features/profiles/ProfileBuilder";
import ProfileEditor from "../features/profiles/ProfileEditor";
import ProfileLibrary from "../features/profiles/ProfileLibrary";
import { useProfileEditor } from "../features/profiles/useProfileEditor";
import { layout } from "../model/keyboard";
import type {
  Device,
  Hardware,
  HardwareScan,
  HardwareSlot,
  Profile,
} from "../model/types";
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
    failedIdentity = useRef<string | null>(null),
    lastScanAttempt = useRef(0);
  const [tab, setTab] = useState("library");
  const [busy, setBusy] = useState(""),
    [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState(""),
    [loaded, setLoaded] = useState(false),
    [backups, setBackups] = useState<string[] | null>(null);
  const [writeOpen, setWriteOpen] = useState(false);
  const [newProfile] = useState(blank);
  const backupDialog = useRef<HTMLDialogElement>(null);
  const fileMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (backups !== null && !backupDialog.current?.open)
      backupDialog.current?.showModal();
  }, [backups]);
  const library = useMemo(
    () => [...templates, ...profiles],
    [templates, profiles],
  );
  const presetIds = useMemo(
    () => new Set(templates.map((profile) => profile.id)),
    [templates],
  );
  const current = library.find((p) => p.id === active);
  const isPreset = presetIds.has(active);
  const editing = useProfileEditor({
    current,
    isPreset,
    active,
    tab,
    writeOpen,
    setProfiles,
  });
  const latest = useRef(profiles),
    queue = useRef(Promise.resolve()),
    ready = useRef(false),
    writing = useRef(false),
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
            }>("bootstrap")
          : {
              profiles: (await fetch("/presets.json").then((r) =>
                r.json(),
              )) as Profile[],
              templates: [],
            };
        if (cancelled) return;
        const originals = result.templates.length
          ? result.templates
          : result.profiles;
        const users = extractUserProfiles(result.profiles, originals);
        setTemplates(originals);
        setProfiles(users);
        setActive(originals[0]?.id ?? users[0]?.id ?? "");
        setTab("library");
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
      let detectedIdentity: string | null = null;
      try {
        const presence = await invoke<Device>("probe_device");
        detectedIdentity = presence.identity ?? null;
        if (stopped || busyRef.current) return;
        const previousIdentity = scanIdentity.current;
        setDestination((previous) =>
          destinationAfterDetection(previous, previousIdentity, presence),
        );
        if (!presence.connected || !presence.supported) {
          scanIdentity.current = null;
          failedIdentity.current = null;
          lastScanAttempt.current = 0;
          setDevice(presence);
          setOnboardProfiles([]);
          setDestination(null);
          return;
        }
        // A failed scan waits for explicit retry or a different keyboard.
        if (failedIdentity.current === detectedIdentity) return;
        if (needsProfileScan(scanIdentity.current, presence)) {
          setOnboardProfiles([]);
          if (Date.now() - lastScanAttempt.current < 10000) return;
          lastScanAttempt.current = Date.now();
          setReading(true);
          try {
            const result = await invoke<HardwareScan>("scan_hardware");
            if (stopped) return;
            setDevice(result.device);
            setOnboardProfiles(result.profiles);
            failedIdentity.current = result.device.supported
              ? null
              : detectedIdentity;
            scanIdentity.current =
              result.device.supported && result.profiles.some((p) => p.data)
                ? (result.device.identity ?? null)
                : null;
          } finally {
            if (!stopped) setReading(false);
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
          failedIdentity.current = detectedIdentity;
          setError(`Не удалось прочитать клавиатуру: ${e}`);
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
      if (writing.current) {
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
  async function run(
    label: string,
    operation: () => Promise<void>,
    protectsKeyboard = false,
  ) {
    if (busyRef.current) return;
    if (scanning.current) {
      setError(
        "Сейчас идёт чтение клавиатуры. Дождитесь результата и повторите действие.",
      );
      return;
    }
    busyRef.current = label;
    writing.current = protectsKeyboard;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setError(String(e));
    } finally {
      writing.current = false;
      busyRef.current = "";
      setBusy("");
    }
  }
  function add(profile: Profile) {
    if (profiles.length >= 256) {
      setError("Можно сохранить не больше 256 своих профилей.");
      return;
    }
    const copy = { ...structuredClone(profile), id: crypto.randomUUID() };
    setProfiles((items) => [...items, copy]);
    setActive(copy.id);
    if (tab !== "macros" && tab !== "bindings") setTab(profileEditor(copy));
  }
  async function refresh() {
    await run("Чтение профилей клавиатуры", async () => {
      const result = await invoke<HardwareScan>("scan_hardware");
      failedIdentity.current = result.device.supported
        ? null
        : (result.device.identity ?? null);
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
      const result = await invoke<Hardware>("read_hardware", { slot: target });
      setOnboardProfiles((entries) =>
        entries.map((entry) =>
          entry.slot === target
            ? { ...entry, data: result, error: null }
            : entry,
        ),
      );
      if (result.config) {
        add({ ...result.config, name: `Профиль ${target}` });
        setDestination(target);
        setTab(profileEditor(result.config));
      }
    });
  }
  async function activateHardware(target: number) {
    await run(
      "Переключение профиля",
      async () => {
        await invoke("select_slot", { slot: target });
        setDevice(await invoke<Device>("refresh_device"));
      },
      true,
    );
  }
  async function publish(target = slot) {
    if (!current || target === null) return;
    await run(
      "Запись и проверка профиля",
      async () => {
        await persist(latest.current);
        const result = await invoke<Hardware>("apply_profile", {
          slot: target,
          profile: current,
        });
        setOnboardProfiles((entries) =>
          entries.map((entry) =>
            entry.slot === target
              ? { ...entry, data: result, error: null }
              : entry,
          ),
        );
        setDestination(target);
        setDevice((previous) => ({ ...previous, active: target }));
        setNotice(`«${current.name}» записан в слот ${target} и активирован.`);
      },
      true,
    );
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
  const hasDevice = native && device.supported;
  const page =
    tab === "macros" ? "macros" : tab === "bindings" ? "bindings" : "lighting";
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
            {
              id: "lighting",
              label: "Подсветка",
              icon: Lightbulb,
              target: "library",
            },
            { id: "macros", label: "Макросы", icon: Command, target: "macros" },
            {
              id: "bindings",
              label: "Переназначение",
              icon: KeyboardIcon,
              target: "bindings",
            },
          ].map(({ id, label, icon: Icon, target }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              disabled={!!busy}
              onClick={() => {
                setTab(target);
                editing.setSelected([editing.selected[0] ?? 12]);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-actions">
          <button
            className="quiet full"
            disabled={!loaded || !!busy}
            onClick={createProfile}
          >
            <Plus size={15} />
            Создать профиль
          </button>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-toolbar">
          <div
            className={`connection ${hasDevice ? "connected" : ""}`}
            title={device.message}
          >
            <Usb size={15} aria-hidden="true" />
            <span role="status">
              {hasDevice
                ? "KD3B · USB"
                : native
                  ? device.connected
                    ? device.inputMonitoringRequired
                      ? "Нужен доступ к клавиатуре"
                      : device.revision === "3131"
                        ? "Ошибка подключения USB"
                        : "Не поддерживается"
                    : "USB не подключён"
                  : "Предпросмотр"}
            </span>
            <button
              className="icon-button"
              title="Проверить подключение"
              aria-label="Проверить подключение"
              disabled={!native || !!busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              title="Резервные копии"
              aria-label="Резервные копии"
              disabled={!native || !!busy}
              onClick={() =>
                void run("Чтение резервных копий", async () =>
                  setBackups(await invoke<string[]>("list_backups")),
                )
              }
            >
              <FolderClock size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="write-controls">
            {detail && current && tab !== "builder" && (
              <button
                className="quiet small"
                aria-label="Записать профиль в клавиатуру"
                title="Выбрать слот для записи"
                disabled={!!busy}
                onClick={() => void chooseWriteTarget()}
              >
                <HardDrive size={14} />
                Записать…
              </button>
            )}
          </div>
        </div>
        <div className="message-region" aria-live="polite">
          {detail && current?.firmware && (
            <div className="message">
              <span>
                Заводские эффекты доступны на клавиатуре только после записи.
              </span>
            </div>
          )}
          {device.inputMonitoringRequired && (
            <div className="message error" role="alert">
              <span>{device.message}</span>
              <button
                className="quiet small"
                onClick={() =>
                  void invoke("open_input_monitoring_settings").catch((e) =>
                    setError(String(e)),
                  )
                }
              >
                Открыть настройки
              </button>
            </div>
          )}
          {busy && (
            <div className="message">
              <span className="spinner" />
              {busy}…
            </div>
          )}
          {reading && (
            <div className="message" role="status">
              <span className="spinner" />
              Чтение профилей клавиатуры… Библиотека доступна, окно можно
              закрыть.
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
          <ProfileLibrary
            profiles={library}
            presetIds={presetIds}
            disabled={!!busy || !loaded}
            active={tab === "library"}
            onSelect={openProfile}
            onCreate={createProfile}
          />
        </div>
        {tab === "library" ? null : tab === "create" ? (
          <fieldset className="editor editor-wide" disabled={!!busy}>
            <div className="editor-main">
              <button className="back-link" onClick={() => setTab("library")}>
                <ArrowLeft size={15} />
                Все профили
              </button>
              <div className="profile-title">
                <h1 className="builder-title">Создать профиль</h1>
              </div>
              <ProfileBuilder
                profile={newProfile}
                creating
                onCreate={(p) => {
                  add(p);
                  setTab("overview");
                }}
                onApply={() => {}}
              />
            </div>
          </fieldset>
        ) : current ? (
          <ProfileEditor
            current={current}
            isPreset={isPreset}
            tab={tab}
            setTab={setTab}
            busy={busy}
            add={add}
            hardware={hardware}
            hasDevice={hasDevice}
            slot={slot}
            refreshAssignments={refreshAssignments}
            fileMenu={fileMenu}
            editing={editing}
          />
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
      {writeOpen && current && (
        <WriteDialog
          profile={current}
          profiles={library}
          device={device}
          slots={onboardProfiles}
          busy={!!busy}
          onClose={() => setWriteOpen(false)}
          onWrite={(target) => {
            setWriteOpen(false);
            void publish(target);
          }}
          onOpen={(target) => {
            setWriteOpen(false);
            void openHardware(target);
          }}
          onActivate={(target) => void activateHardware(target)}
        />
      )}
      <div ref={fileMenu} popover="auto" className="profile-file-menu">
        <button
          disabled={!native}
          onClick={() => {
            fileMenu.current?.hidePopover();
            void exportFile();
          }}
        >
          <Upload size={14} />
          Экспорт в файл
        </button>
        {!isPreset && (
          <button
            onClick={() => {
              fileMenu.current?.hidePopover();
              void remove();
            }}
          >
            <Trash2 size={14} />
            Удалить профиль
          </button>
        )}
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
                          await run(
                            "Восстановление слота",
                            async () => {
                              await invoke("restore_backup", { name });
                              setOnboardProfiles([]);
                              scanIdentity.current = null;
                              setNotice(
                                "Данные слота восстановлены и проверены. Активируйте нужный слот.",
                              );
                            },
                            true,
                          );
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
