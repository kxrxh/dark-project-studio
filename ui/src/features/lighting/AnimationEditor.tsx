import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Plus,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { layout } from "../../model/keyboard";
import { hex } from "../../model/profile";
import type { Profile } from "../../model/types";
import type { AnimationKind } from "./frames";
import { copyFrame, generateAnimation, moveFrame } from "./frames";
interface Props {
  profile: Profile;
  frame: number;
  selected: number[];
  painting: boolean;
  onPaint: (value: boolean) => void;
  onFrame: (index: number) => void;
  onSelect: (keys: number[]) => void;
  onChange: (profile: Profile) => void;
}
export default function AnimationEditor({
  profile,
  frame,
  selected,
  painting,
  onPaint,
  onFrame,
  onSelect,
  onChange,
}: Props) {
  const [kind, setKind] = useState<AnimationKind>("wave"),
    [width, setWidth] = useState(3),
    [duration, setDuration] = useState(1),
    [reverse, setReverse] = useState(false);
  const active = Math.min(frame, profile.frames.length - 1);
  return (
    <section className="timeline">
      <div className="section-heading">
        <div>
          <h2>Кадры анимации</h2>
          <span>
            {profile.frames.length} / 20 кадров ·{" "}
            {(profile.frames.reduce((n, f) => n + f.duration, 0) / 10).toFixed(
              1,
            )}{" "}
            с
          </span>
        </div>
        <div>
          <button
            className="icon-button"
            aria-label="Кадр влево"
            title="Переместить кадр влево"
            disabled={active === 0}
            onClick={() => {
              onChange(moveFrame(profile, active, -1));
              onFrame(active - 1);
            }}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Кадр вправо"
            title="Переместить кадр вправо"
            disabled={active === profile.frames.length - 1}
            onClick={() => {
              onChange(moveFrame(profile, active, 1));
              onFrame(active + 1);
            }}
          >
            <ArrowRight size={15} />
          </button>
          <button
            className="icon-button"
            title="Копировать кадр"
            aria-label="Копировать кадр"
            disabled={profile.frames.length >= 20}
            onClick={() => {
              onChange(copyFrame(profile, active));
              onFrame(active + 1);
            }}
          >
            <Copy size={15} />
          </button>
          <button
            className="quiet small"
            disabled={profile.frames.length >= 20}
            onClick={() => {
              onChange({
                ...profile,
                frames: [...profile.frames, { keys: [...selected], duration }],
              });
              onFrame(profile.frames.length);
            }}
          >
            <Plus size={14} />
            Кадр
          </button>
          <button
            className="icon-button"
            title="Удалить выбранный кадр"
            aria-label="Удалить выбранный кадр"
            disabled={profile.frames.length <= 1}
            onClick={() => {
              onChange({
                ...profile,
                frames: profile.frames.filter((_, i) => i !== active),
              });
              onFrame(Math.max(0, active - 1));
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="frames">
        {profile.frames.map((f, index) => (
          <button
            key={index}
            aria-label={`Кадр ${index + 1}, ${f.duration / 10} секунды`}
            aria-pressed={active === index}
            className={`frame ${active === index ? "active" : ""}`}
            onClick={() => onFrame(index)}
          >
            <span className="frame-mini">
              {layout.map((key, i) => (
                <i
                  key={i}
                  style={{
                    left: `${(key.x / 18.5) * 100}%`,
                    top: `${(key.y / 6.4) * 100}%`,
                    width: `${(key.width / 18.5) * 100}%`,
                    height: "13%",
                    background: f.keys.includes(i)
                      ? hex(profile.keys[i].color)
                      : "#333336",
                  }}
                />
              ))}
            </span>
            <span>
              <b>{String(index + 1).padStart(2, "0")}</b>
              {(f.duration / 10).toFixed(1)} с
            </span>
          </button>
        ))}
      </div>
      <div className="frame-controls">
        <label>
          Длительность
          <select
            aria-label="Длительность кадра"
            value={profile.frames[active]?.duration ?? 1}
            onChange={(e) => {
              onFrame(active);
              onChange({
                ...profile,
                frames: profile.frames.map((f, i) =>
                  i === active ? { ...f, duration: Number(e.target.value) } : f,
                ),
              });
            }}
          >
            {[
              ...new Set([
                1,
                2,
                3,
                5,
                10,
                20,
                50,
                100,
                255,
                profile.frames[active]?.duration ?? 1,
              ]),
            ]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n / 10} с
                </option>
              ))}
          </select>
        </label>
        <button
          className="quiet small"
          onClick={() => {
            onFrame(active);
            onChange({
              ...profile,
              frames: profile.frames.map((f, i) =>
                i === active ? { ...f, keys: [...selected] } : f,
              ),
            });
          }}
        >
          Кадр из выбора
        </button>
        <button
          className="quiet small"
          onClick={() => onSelect(profile.frames[active].keys)}
        >
          Выбрать маску
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={painting}
            onChange={(e) => {
              onFrame(active);
              onPaint(e.target.checked);
            }}
          />
          Рисовать на клавиатуре
        </label>
      </div>
      <details className="animation-generator">
        <summary>
          <Wand2 size={14} />
          Генератор анимации
        </summary>
        <div className="generator-controls">
          <label>
            Рисунок
            <select
              aria-label="Рисунок анимации"
              value={kind}
              onChange={(e) => setKind(e.target.value as AnimationKind)}
            >
              <option value="wave">Волна</option>
              <option value="meet">Встречные волны</option>
              <option value="sparkle">Искры</option>
            </select>
          </label>
          <label>
            Ширина
            <select
              aria-label="Ширина рисунка"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Шаг
            <select
              aria-label="Длительность генерируемого кадра"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n / 10} с
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reverse}
              onChange={(e) => setReverse(e.target.checked)}
            />
            Обратно
          </label>
          <button
            className="quiet small"
            onClick={() => {
              onChange({
                ...profile,
                frames: generateAnimation(kind, width, duration, reverse),
              });
              onFrame(0);
            }}
          >
            <Wand2 size={14} />
            Создать кадры
          </button>
        </div>
        <p className="muted">
          Заменит текущие кадры. Цвета и назначения сохранятся.
        </p>
      </details>
      <div className="animation-bottom">
        <p className="muted">Кадр задаёт светящиеся клавиши. Цвета общие.</p>
        <button
          className="quiet small"
          onClick={() => {
            onChange({ ...profile, frames: [...profile.frames].reverse() });
            onFrame(0);
          }}
        >
          <RotateCcw size={14} />
          Развернуть
        </button>
      </div>
    </section>
  );
}
