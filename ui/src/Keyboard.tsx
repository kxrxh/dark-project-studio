import type { CSSProperties } from "react";
import { layout, hex, actionLabel } from "./model";
import type { Profile, Layer, Hardware } from "./model";

interface Props {
  profile: Profile;
  interactive?: boolean;
  selected: number[];
  pressed?: number[];
  onSelect: (index: number, multiple: boolean) => void;
  frame: number;
  playing: boolean;
  mode: string;
  layer: Layer;
  hardware: Hardware | null;
  time: number;
}
export default function Keyboard({
  profile,
  interactive = true,
  selected,
  pressed = [],
  onSelect,
  frame,
  playing,
  mode,
  layer,
  hardware,
  time,
}: Props) {
  const mask = new Set(profile.frames[Math.min(frame, profile.frames.length - 1)]?.keys);
  return (
    <div className="keyboard-case">
      <div className="keyboard-top">
        <span>DARK PROJECT</span>
        <span>KD3B / TKL 87</span>
        <div className="indicators">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div
        className="keyboard"
        role="group"
        aria-label="Клавиатура KD3B, 87 клавиш"
      >
        {layout.map((key, index) => {
          const style = profile.keys[index];
          const lit = mask.has(index);
          let color = style.color;
          if (
            playing &&
            (style.effect === "cycle" || style.effect === "rainbow")
          ) {
            const phase = time / (1800 * style.speed) + index / 87;
            color = [0, 2, 4].map((offset) =>
              Math.round((Math.sin(phase * Math.PI * 2 + offset) + 1) * 127.5),
            ) as [number, number, number];
          }
          const pulse =
            playing && style.effect === "breathing"
              ? 0.18 + (0.82 * (Math.sin(time / (600 * style.speed)) + 1)) / 2
              : 1;
          const strength =
            (((lit ? 1 : 0.08) * profile.brightness) / 100) * pulse;
          const binding = profile.bindings.find(
            (b) => b.key === index && b.layer === layer,
          );
          const macro = profile.macros?.find(
            (m) => m.key === index && m.layer === layer,
          );
          const code = macro
            ? 0xb2
            : (binding?.action ??
              (layer === "base"
                ? hardware?.base[index]
                : hardware?.function[index]));
          const assignmentMode=mode === "bindings" || mode === "macros" || mode === "tap";
          const protectedKey=(mode === "macros" || mode === "tap") && index === 81;
          const label=mode === "tap" ? `Добавить нажатие ${key.label}` : mode === "macros"
            ? `${key.name.startsWith("left-") ? "Левый " : key.name.startsWith("right-") ? "Правый " : ""}${key.label}: ${protectedKey ? "защищена" : macro ? `макрос ${macro.name}` : "без макроса"}`
            : `${key.label}${mode === "bindings" ? `: ${actionLabel(code)}` : ""}`;
          const css = {
            left: `${(key.x / 18.5) * 100}%`,
            top: `${(key.y / 6.4) * 100}%`,
            width: `${(key.width / 18.5) * 100}%`,
            height: `${100 / 6.4}%`,
            "--key-color": assignmentMode ? "#eeeeee" : hex(color),
            "--key-strength": assignmentMode ? 0 : strength,
          } as CSSProperties;
          return (
            <button
              key={key.name}
              disabled={!interactive || protectedKey}
              style={css}
              className={`key ${selected.includes(index) ? "selected" : ""} ${(mode === "tap" ? false : mode === "macros" ? macro : binding || macro) ? "remapped" : ""} ${pressed.includes(index) ? "pressed" : ""} ${protectedKey ? "protected" : ""}`}
              aria-pressed={selected.includes(index)}
              aria-label={label}
              title={label}
              onClick={(event) =>
                onSelect(
                  index,
                  event.shiftKey || event.metaKey || event.ctrlKey,
                )
              }
            >
              <span className="key-cap">
                <span>{key.label}</span>
                {assignmentMode && mode !== "tap" && (
                  <small>
                    {index === 81
                      ? "Fn"
                      : macro
                        ? "Макрос"
                        : mode === "macros"
                          ? ""
                        : binding
                          ? actionLabel(binding.action)
                          : layer === "fn" && code !== undefined
                            ? actionLabel(code)
                            : ""}
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
