import { ArrowDown, ArrowUp, Mic, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Keyboard from "../../components/Keyboard";
import { actionLabel, layout } from "../../model/keyboard";
import { setBinding } from "../../model/profile";
import type {
  Layer,
  MacroBinding,
  MacroEvent,
  Profile,
} from "../../model/types";
import { appendMacroTap, chordMacro, eventCode } from "./model";

interface Props {
  profile: Profile;
  selected: number[];
  layer: Layer;
  onSelect: (key: number, multiple: boolean) => void;
  onLayer: (layer: Layer) => void;
  onChange: (profile: Profile) => void;
}
const shortcuts = [
  { name: "Копировать", codes: [224, 6] },
  { name: "Вставить", codes: [224, 25] },
  { name: "Отменить", codes: [224, 29] },
  { name: "Выделить всё", codes: [224, 4] },
];
export default function MacroEditor({
  profile,
  selected,
  layer,
  onSelect,
  onLayer,
  onChange,
}: Props) {
  const key = selected[0] ?? 12;
  const macro = (profile.macros ?? []).find(
    (m) => m.key === key && m.layer === layer,
  );
  const [recording, setRecording] = useState(false),
    [draft, setDraft] = useState<MacroEvent[]>([]),
    [message, setMessage] = useState(""),
    [shortcutModifier, setShortcutModifier] = useState(
      navigator.platform.includes("Mac") ? 227 : 224,
    );
  const zone = useRef<HTMLDivElement>(null),
    live = useRef(false),
    events = useRef<MacroEvent[]>([]),
    held = useRef(new Set<number>()),
    last = useRef(0),
    latest = useRef({ macro, profile, key, layer });
  latest.current = { macro, profile, key, layer };
  function replace(item: MacroBinding) {
    setMessage("");
    onChange({
      ...profile,
      bindings: profile.bindings.filter(
        (b) => b.key !== key || b.layer !== layer,
      ),
      macros: [
        ...(profile.macros ?? []).filter(
          (m) => m.key !== key || m.layer !== layer,
        ),
        item,
      ],
    });
  }
  function finish() {
    if (!live.current) return;
    live.current = false;
    setRecording(false);
    for (const code of [...held.current].reverse())
      events.current.push({ code, down: false, delayMs: 20 });
    held.current.clear();
    const current = latest.current;
    if (!events.current.length) {
      setMessage("Запись пуста. Исходный макрос сохранён.");
      return;
    }
    const item = {
      ...(current.macro ??
        chordMacro(current.key, current.layer, [4], "Мой макрос")),
      events: [...events.current],
    };
    onChange({
      ...current.profile,
      bindings: current.profile.bindings.filter(
        (b) => b.key !== current.key || b.layer !== current.layer,
      ),
      macros: [
        ...(current.profile.macros ?? []).filter(
          (m) => m.key !== current.key || m.layer !== current.layer,
        ),
        item,
      ],
    });
    setMessage("Запись завершена. Все нажатые клавиши отпущены.");
  }
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  useEffect(() => {
    if (recording) zone.current?.focus();
  }, [recording]);
  function startRecording() {
    events.current = [];
    held.current.clear();
    last.current = performance.now();
    live.current = true;
    setDraft([]);
    setRecording(true);
    setMessage("");
  }
  function record(code: string, down: boolean) {
    if (!live.current) return;
    const value = eventCode(code);
    if (value === undefined) {
      setMessage("Эта клавиша не поддерживается");
      return;
    }
    if (
      (down && held.current.has(value)) ||
      (!down && !held.current.has(value))
    )
      return;
    if (
      down &&
      (events.current.length + held.current.size + 2 > 80 ||
        (value < 224 &&
          [...held.current].filter((code) => code < 224).length >= 6))
    ) {
      setMessage("Достигнут лимит записи. Завершите макрос.");
      return;
    }
    const now = performance.now();
    const delayMs = Math.max(
      20,
      Math.min(5000, Math.round((now - last.current) / 20) * 20),
    );
    last.current = now;
    if (down) held.current.add(value);
    else held.current.delete(value);
    events.current.push({ code: value, down, delayMs });
    setDraft([...events.current]);
  }
  function removePair(index: number) {
    if (!macro) return;
    const event = macro.events[index];
    const start = event.down
      ? index
      : macro.events
          .slice(0, index)
          .map((e) => (e.down ? e.code : -1))
          .lastIndexOf(event.code);
    const end = macro.events.findIndex(
      (e, i) => i > start && e.code === event.code && !e.down,
    );
    const remaining = macro.events.filter((_, i) => i !== start && i !== end);
    if (!remaining.length) {
      setMessage(
        "Последнюю пару можно заменить записью или удалить весь макрос.",
      );
      return;
    }
    replace({ ...macro, events: remaining });
  }
  const shown = recording ? draft : (macro?.events ?? []);
  return (
    <section className="macro-editor">
      <div className="macro-target">
        <div className="macro-key">
          <h2>Клавиша запуска</h2>
          <kbd>
            {layer === "fn" ? "Fn + " : ""}
            {layout[key].label}
          </kbd>
        </div>
        <label>
          <span className="sr-only">Слой</span>
          <select
            aria-label="Слой макроса"
            value={layer}
            disabled={recording}
            onChange={(e) => onLayer(e.target.value as Layer)}
          >
            <option value="base">Основной слой</option>
            <option value="fn">Fn-слой</option>
          </select>
        </label>
        <button
          className="quiet macro-record"
          disabled={key === 81}
          onMouseDown={(event) => {
            if (recording) event.preventDefault();
          }}
          onClick={() => (recording ? finish() : startRecording())}
        >
          {recording ? <Square size={14} /> : <Mic size={15} />}{" "}
          {recording
            ? "Завершить запись"
            : macro
              ? "Перезаписать макрос"
              : "Записать макрос"}
        </button>
      </div>
      <div
        ref={zone}
        tabIndex={0}
        role="group"
        aria-label="Область записи макроса"
        className={`record-zone ${recording ? "recording" : ""}`}
        onBlur={finish}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.code === "Escape") {
            finish();
            return;
          }
          if (!e.repeat) record(e.code, true);
        }}
        onKeyUp={(e) => {
          if (recording) {
            e.preventDefault();
            record(e.code, false);
          }
        }}
      >
        {recording
          ? "Запись активна. Нажимайте клавиши здесь. Esc — завершить."
          : "Запись — только в этой области. Esc — завершить."}
      </div>
      <Keyboard
        profile={profile}
        selected={[key]}
        pressed={layout.flatMap((k, i) =>
          held.current.has(k.code) ? [i] : [],
        )}
        interactive={!recording}
        onSelect={(index) => {
          if (!recording && index !== 81) {
            onSelect(index, false);
            setMessage("");
          }
        }}
        frame={0}
        playing={false}
        mode="macros"
        layer={layer}
        hardware={null}
        time={0}
      />
      <p className="canvas-hint macro-board-hint">
        Макрос сработает при нажатии {layer === "fn" ? "Fn + " : ""}
        {layout[key].label} после записи профиля в клавиатуру.
      </p>
      <div className="section-heading">
        <h2>
          Действия при нажатии {layer === "fn" ? "Fn + " : ""}
          {layout[key].label}
        </h2>
        <span>{shown.length} / 80 событий</span>
      </div>
      {key === 81 ? (
        <p className="muted">Fn защищена. Выберите другую клавишу.</p>
      ) : (
        <>
          <div className="macro-presets">
            {shortcuts.map((p) => (
              <button
                key={p.name}
                className="quiet small"
                disabled={recording}
                onClick={() =>
                  replace(
                    chordMacro(
                      key,
                      layer,
                      [shortcutModifier, ...p.codes.slice(1)],
                      p.name,
                    ),
                  )
                }
              >
                {p.name}
              </button>
            ))}
            <label className="shortcut-modifier">
              <span className="sr-only">Модификатор готовых сочетаний</span>
              <select
                aria-label="Модификатор готовых сочетаний"
                value={shortcutModifier}
                disabled={recording}
                onChange={(e) => setShortcutModifier(Number(e.target.value))}
              >
                <option value={224}>Ctrl</option>
                <option value={227}>Cmd</option>
              </select>
            </label>
          </div>

          {!macro && !recording ? (
            <div className="macro-empty">
              <p>Выберите сочетание или начните запись.</p>
            </div>
          ) : (
            <div className="macro-properties">
              <label>
                Название
                <input
                  aria-label="Название макроса"
                  maxLength={64}
                  disabled={recording}
                  value={macro?.name ?? "Мой макрос"}
                  onChange={(e) => {
                    if (macro && e.target.value.trim())
                      replace({ ...macro, name: e.target.value });
                  }}
                />
              </label>
              <label>
                Повторы
                <select
                  aria-label="Повторы макроса"
                  disabled={recording}
                  value={macro?.repeat ?? 1}
                  onChange={(e) =>
                    macro &&
                    replace({ ...macro, repeat: Number(e.target.value) })
                  }
                >
                  {[...new Set([1, 2, 3, 5, 10, 20, 32, macro?.repeat ?? 1])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <details className="macro-manual">
            <summary>Добавить клавиши вручную</summary>
            <p className="canvas-hint">
              Клик добавит нажатие в последовательность для {layout[key].label}.
            </p>
            <Keyboard
              profile={profile}
              selected={[]}
              interactive={!recording}
              onSelect={(index) => {
                if (recording || index === 81) return;
                const original =
                  macro ?? chordMacro(key, layer, [], "Мой макрос");
                const next = appendMacroTap(original, layout[index].code);
                if (next === original) {
                  setMessage("Достигнут лимит: 80 событий.");
                  return;
                }
                replace(next);
              }}
              frame={0}
              playing={false}
              mode="tap"
              layer={layer}
              hardware={null}
              time={0}
            />
          </details>
          {message && (
            <p className="macro-message" role="status">
              {message}
            </p>
          )}
          {shown.length > 0 && (
            <div className="event-list" aria-label="События макроса">
              <div className="event-header">
                <span>Событие</span>
                <span>Клавиша</span>
                <span>Задержка до события</span>
                <span />
              </div>
              {shown.map((event, index) => (
                <div key={index} className="macro-event">
                  <span>
                    {event.down ? (
                      <ArrowDown size={13} />
                    ) : (
                      <ArrowUp size={13} />
                    )}{" "}
                    {event.down ? "Нажать" : "Отпустить"}
                  </span>
                  <strong>{actionLabel(event.code)}</strong>
                  <select
                    aria-label={`Задержка события ${index + 1}`}
                    value={event.delayMs}
                    disabled={recording}
                    onChange={(e) =>
                      macro &&
                      replace({
                        ...macro,
                        events: macro.events.map((item, i) =>
                          i === index
                            ? { ...item, delayMs: Number(e.target.value) }
                            : item,
                        ),
                      })
                    }
                  >
                    {[
                      ...new Set([
                        20,
                        40,
                        60,
                        100,
                        200,
                        500,
                        1000,
                        2000,
                        5000,
                        event.delayMs,
                      ]),
                    ]
                      .sort((a, b) => a - b)
                      .map((delay) => (
                        <option key={delay} value={delay}>
                          {delay} мс
                        </option>
                      ))}
                  </select>
                  <button
                    className="icon-button"
                    disabled={recording}
                    title="Удалить нажатие вместе с отпусканием"
                    aria-label={`Удалить пару события ${index + 1}`}
                    onClick={() => removePair(index)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {macro && (
            <div className="macro-bottom">
              <button
                className="quiet small"
                disabled={recording}
                onClick={() =>
                  onChange(
                    setBinding(
                      profile,
                      key,
                      layer,
                      layer === "base" ? layout[key].code : 0,
                    ),
                  )
                }
              >
                <Trash2 size={14} />
                Удалить макрос
              </button>
            </div>
          )}
          <p className="muted macro-note">
            Удаление вернёт обычную клавишу в основном слое; во Fn-слое отключит
            назначение.
          </p>
        </>
      )}
      {(profile.macros ?? []).length > 0 && (
        <div className="macro-assigned">
          <h3>Макросы профиля</h3>
          {profile.macros?.map((m) => (
            <button
              key={`${m.key}-${m.layer}`}
              className="quiet small"
              disabled={recording}
              onClick={() => {
                onSelect(m.key, false);
                onLayer(m.layer);
              }}
            >
              {m.layer === "fn" ? "Fn + " : ""}
              {layout[m.key].label}
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
