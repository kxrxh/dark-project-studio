import { ArrowRight, RefreshCw, RotateCcw } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { actionLabel, actionNames, layout } from "../../model/keyboard";
import type { GradientDirection } from "../../model/profile";
import {
  effectNames,
  gradientDirections,
  hex,
  rgb,
  setBinding,
} from "../../model/profile";
import type { Color, Effect, Hardware, Profile } from "../../model/types";
import type { ProfileEditorState } from "./useProfileEditor";

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
const standardActions = layout.filter(
  (key, index) =>
    key.name !== "fn" && layout.findIndex((k) => k.code === key.code) === index,
);

export default function ProfileInspector({
  current,
  tab,
  setTab,
  editing,
  hardware,
  hasDevice,
  slot,
  refreshAssignments,
}: {
  current: Profile;
  tab: string;
  setTab: Dispatch<SetStateAction<string>>;
  editing: ProfileEditorState;
  hardware: Hardware | null;
  hasDevice: boolean;
  slot: number | null;
  refreshAssignments: () => Promise<void>;
}) {
  const {
    selected,
    layer,
    update,
    patch,
    gradientFrom,
    gradientTo,
    gradientDirection,
    gradientDisabled,
    changeGradient,
  } = editing;
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
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <h2>
          {tab === "bindings" ? "Новое действие" : "Цвета выбранных клавиш"}
        </h2>
        <span>
          {selected.length === 1
            ? layout[selected[0]].label
            : `Выбрано: ${selected.length}`}
        </span>
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
              value={selectedMacro ? "macro" : (binding?.action ?? "keep")}
              onChange={(e) =>
                update(
                  setBinding(
                    current,
                    selected[0],
                    layer,
                    e.target.value === "keep" ? null : Number(e.target.value),
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
                  .filter(([code]) => ![0xac, 0xb2].includes(Number(code)))
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
              Клавиша Fn защищена, чтобы доступ ко второму слою оставался
              доступен.
            </p>
          ) : selected.length !== 1 ? (
            <p className="muted">Выберите одну клавишу для переназначения.</p>
          ) : (
            <div className="readout">
              <span>
                {slot === null ? "Клавиатура не подключена" : `Профиль ${slot}`}
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
            <button className="quiet full" onClick={() => setTab("macros")}>
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
              <span>{selected.length > 1 ? "для выбранных клавиш" : ""}</span>
            </label>
            <div className="color-input">
              <input
                id="key-color"
                type="color"
                disabled={!selected.length || style?.effect === "cycle"}
                value={hex(style?.color ?? [0, 0, 0])}
                onChange={(e) => patch({ color: rgb(e.target.value) })}
              />
              <span>{hex(style?.color ?? [0, 0, 0]).toUpperCase()}</span>
            </div>
            <div className="swatches">
              {swatches.map((color) => (
                <button
                  key={color}
                  aria-label={`Цвет ${color}`}
                  disabled={!selected.length || style?.effect === "cycle"}
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
              Прошивка сама перебирает шесть цветов. Начальная фаза выбирает
              первый цвет.
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
                  onChange={(e) => patch({ speed: Number(e.target.value) })}
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
                  onChange={(e) => patch({ pause: Number(e.target.value) })}
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
            <select
              id="gradient-direction"
              value={gradientDirection}
              disabled={gradientDisabled}
              onChange={(e) =>
                changeGradient(
                  gradientFrom,
                  gradientTo,
                  e.target.value as GradientDirection,
                )
              }
            >
              {Object.entries(gradientDirections).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <div className="gradient-control">
              <input
                type="color"
                aria-label="Начальный цвет градиента"
                value={gradientFrom}
                disabled={gradientDisabled}
                onInput={(e) =>
                  changeGradient(
                    e.currentTarget.value,
                    gradientTo,
                    gradientDirection,
                  )
                }
              />
              <ArrowRight size={15} />
              <input
                id="gradient-end"
                type="color"
                aria-label="Конечный цвет градиента"
                value={gradientTo}
                disabled={gradientDisabled}
                onInput={(e) =>
                  changeGradient(
                    gradientFrom,
                    e.currentTarget.value,
                    gradientDirection,
                  )
                }
              />
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
