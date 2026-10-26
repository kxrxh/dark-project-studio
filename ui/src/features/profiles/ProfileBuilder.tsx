import { Check, Pause, Play, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Keyboard from "../../components/Keyboard";
import { effectNames, frameAt, hex, rgb } from "../../model/profile";
import type { Color, Effect, Profile } from "../../model/types";
import type { BuilderSettings, Distribution, PatternId } from "./builder";
import { buildLighting, defaultSettings, palettes, patterns } from "./builder";
interface Props {
  profile: Profile;
  creating?: boolean;
  onCreate: (profile: Profile) => void;
  onApply: (profile: Profile) => void;
}
export default function ProfileBuilder({
  profile,
  creating = false,
  onCreate,
  onApply,
}: Props) {
  const [settings, setSettings] = useState<BuilderSettings>(defaultSettings),
    [palette, setPalette] = useState("cyberpunk"),
    [name, setName] = useState("Моя анимация"),
    [playing, setPlaying] = useState(true),
    [time, setTime] = useState(0);
  const compiled = useMemo(
    () => buildLighting(profile, settings),
    [profile, settings],
  );
  const selected = patterns.find((p) => p.id === settings.pattern)!;
  const displayColors = settings.reverseColors
    ? [...settings.colors].reverse()
    : settings.colors;
  const patch = (value: Partial<BuilderSettings>) => {
    setSettings((s) => ({ ...s, ...value }));
  };
  useEffect(() => {
    if (!playing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const start = performance.now();
    const timer = setInterval(() => setTime(performance.now() - start), 60);
    return () => clearInterval(timer);
  }, [playing, settings]);
  function choosePalette(id: string) {
    setPalette(id);
    if (id !== "custom")
      patch({
        colors: palettes
          .find((p) => p.id === id)!
          .colors.map((c) => [...c] as Color),
      });
  }
  return (
    <section className="profile-builder">
      <div className="builder-save">
        {creating ? (
          <label>
            Название профиля
            <input
              aria-label="Название создаваемого профиля"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : (
          <p>Выберите анимацию и цвета. Назначения клавиш сохранятся.</p>
        )}
        <button
          className="primary"
          disabled={creating && !name.trim()}
          onClick={() => {
            const result = {
              ...compiled,
              description: `${selected.name} · ${palettes.find((p) => p.id === palette)?.name ?? "свои цвета"}`,
            };
            if (creating)
              onCreate({
                ...result,
                name: name.trim(),
                bindings: [],
                macros: [],
              });
            else onApply(result);
          }}
        >
          {creating ? <Plus size={15} /> : <Check size={15} />}{" "}
          {creating ? "Создать и открыть профиль" : "Применить подсветку"}
        </button>
      </div>
      <div className="builder-pickers">
        <label>
          Анимация
          <select
            aria-label="Анимация конструктора"
            value={settings.pattern}
            onChange={(e) => patch({ pattern: e.target.value as PatternId })}
          >
            {[...new Set(patterns.map((p) => p.group))].map((group) => (
              <optgroup key={group} label={group}>
                {patterns
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Палитра
          <select
            aria-label="Палитра конструктора"
            disabled={settings.effect === "cycle"}
            value={palette}
            onChange={(e) => choosePalette(e.target.value)}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="custom">Свои цвета</option>
          </select>
        </label>
        <button
          className="quiet small"
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}Предпросмотр
        </button>
      </div>
      <div className="builder-caption">
        <p>{selected.description}</p>
        <span>
          {compiled.frames.length}{" "}
          {compiled.frames.length === 1 ? "кадр" : "кадров"} ·{" "}
          {(compiled.frames.reduce((n, f) => n + f.duration, 0) / 10).toFixed(
            1,
          )}{" "}
          с
        </span>
      </div>
      <Keyboard
        profile={compiled}
        selected={[]}
        onSelect={() => {}}
        interactive={false}
        frame={playing ? frameAt(compiled, time) : 0}
        playing={playing}
        mode="lighting"
        layer="base"
        hardware={null}
        time={time}
      />
      <div className="builder-colors">
        <div className="section-heading">
          <h2>Цвета палитры</h2>
          <select
            aria-label="Распределение цветов"
            value={settings.distribution}
            disabled={settings.effect === "cycle"}
            onChange={(e) =>
              patch({ distribution: e.target.value as Distribution })
            }
          >
            <option value="horizontal">Слева направо</option>
            <option value="horizontal-reverse">Справа налево</option>
            <option value="vertical">Сверху вниз</option>
            <option value="vertical-reverse">Снизу вверх</option>
            <option value="diagonal">Диагональ вниз</option>
            <option value="anti-diagonal">Диагональ вверх</option>
            <option value="radial">От центра</option>
            <option value="radial-in">К центру</option>
            <option value="bands">Цветные полосы</option>
            <option value="solid">Один цвет</option>
          </select>
        </div>
        <label className="checkbox-label palette-reverse">
          <input
            type="checkbox"
            checked={settings.reverseColors}
            disabled={settings.effect === "cycle"}
            onChange={(e) => patch({ reverseColors: e.target.checked })}
          />
          Развернуть цвета
        </label>
        <div
          className="palette-strip"
          aria-label="Предпросмотр палитры"
          style={{
            background:
              settings.effect === "cycle"
                ? "#eeeeee"
                : `linear-gradient(90deg,${displayColors.map(hex).join(",")}${displayColors.length === 1 ? "," + hex(displayColors[0]) : ""})`,
          }}
        />
        <div className="palette-editors">
          {settings.colors.map((color, index) => (
            <div key={index}>
              <label>
                <span className="sr-only">Цвет {index + 1}</span>
                <input
                  type="color"
                  aria-label={`Цвет палитры ${index + 1}`}
                  disabled={settings.effect === "cycle"}
                  value={hex(color)}
                  onChange={(e) => {
                    setPalette("custom");
                    patch({
                      colors: settings.colors.map((c, i) =>
                        i === index ? rgb(e.target.value) : c,
                      ),
                    });
                  }}
                />
              </label>
              <span>{hex(color).toUpperCase()}</span>
              <button
                className="icon-button"
                aria-label={`Удалить цвет ${index + 1}`}
                disabled={
                  settings.colors.length === 1 || settings.effect === "cycle"
                }
                onClick={() => {
                  setPalette("custom");
                  patch({
                    colors: settings.colors.filter((_, i) => i !== index),
                  });
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button
            className="quiet small"
            disabled={
              settings.colors.length >= 5 || settings.effect === "cycle"
            }
            onClick={() => {
              setPalette("custom");
              patch({ colors: [...settings.colors, [255, 255, 255]] });
            }}
          >
            <Plus size={14} />
            Цвет
          </button>
        </div>
        {settings.effect === "cycle" && (
          <p className="muted">
            В режиме смены цветов прошивка сама выбирает спектр. Своя палитра
            снова доступна в других эффектах.
          </p>
        )}
      </div>
      <div className="builder-tuning">
        <label>
          Скорость
          <select
            aria-label="Скорость конструктора"
            value={settings.duration}
            onChange={(e) => patch({ duration: Number(e.target.value) })}
          >
            {[
              { v: 1, n: "Быстро · 0,1 с" },
              { v: 2, n: "Средне · 0,2 с" },
              { v: 3, n: "Спокойно · 0,3 с" },
              { v: 5, n: "Медленно · 0,5 с" },
              { v: 10, n: "Очень медленно · 1 с" },
            ].map((o) => (
              <option key={o.v} value={o.v}>
                {o.n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ширина рисунка
          <select
            aria-label="Ширина конструктора"
            value={settings.width}
            onChange={(e) => patch({ width: Number(e.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Эффект клавиш
          <select
            aria-label="Эффект конструктора"
            value={settings.effect}
            onChange={(e) => patch({ effect: e.target.value as Effect })}
          >
            {Object.entries(effectNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.reverse}
            onChange={(e) => patch({ reverse: e.target.checked })}
          />
          Анимация в обратную сторону
        </label>
        <label className="builder-brightness">
          Яркость <output>{settings.brightness}%</output>
          <input
            aria-label="Яркость конструктора"
            type="range"
            min={0}
            max={100}
            value={settings.brightness}
            onChange={(e) => patch({ brightness: Number(e.target.value) })}
          />
        </label>
      </div>
      <details className="builder-catalog">
        <summary>
          <Wand2 size={14} />
          Каталог анимаций · {patterns.length}
        </summary>
        <div>
          {patterns.map((pattern) => (
            <button
              key={pattern.id}
              className={settings.pattern === pattern.id ? "active" : ""}
              aria-pressed={settings.pattern === pattern.id}
              onClick={() => patch({ pattern: pattern.id })}
            >
              <strong>{pattern.name}</strong>
              <small>{pattern.description}</small>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
