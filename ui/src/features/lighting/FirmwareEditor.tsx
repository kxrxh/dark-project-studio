import { Wand2 } from "lucide-react";
import Keyboard from "../../components/Keyboard";
import { hex, rgb } from "../../model/profile";
import type { FirmwareTuning, Profile } from "../../model/types";
import { firmwareModes, switchFirmware } from "./firmware";

export default function FirmwareEditor({
  profile,
  onChange,
  onReplace,
  readOnly = false,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onReplace: () => void;
  readOnly?: boolean;
}) {
  const mode = profile.firmware?.mode;
  const limits = firmwareModes.find((item) => item.mode === mode)?.limits;
  const tuning = profile.firmware?.tuning;
  const patch = (value: Partial<FirmwareTuning>) => {
    if (profile.firmware && tuning)
      onChange({
        ...profile,
        firmware: { ...profile.firmware, tuning: { ...tuning, ...value } },
      });
  };
  return (
    <section className="firmware-editor" aria-label="Встроенные эффекты">
      <div className="firmware-controls">
        <label>
          Эффект клавиатуры
          <select
            aria-label="Встроенный эффект"
            disabled={readOnly}
            value={profile.firmware?.mode ?? ""}
            onChange={(event) => {
              onChange(
                switchFirmware(profile, Number(event.currentTarget.value)),
              );
            }}
          >
            {!profile.firmware && (
              <option value="" disabled>
                Выберите эффект
              </option>
            )}
            {firmwareModes.map((item) => (
              <option key={item.mode} value={item.mode}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tuning && limits ? (
        <>
          <fieldset className="firmware-options" disabled={readOnly}>
            <div className="field">
              <label>Цвета отклика</label>
              <div className="firmware-colors">
                {tuning.colors.map((color, bank) => (
                  <label key={bank}>
                    <span className="sr-only">Цвет отклика {bank + 1}</span>
                    <input
                      type="color"
                      aria-label={`Цвет отклика ${bank + 1}`}
                      value={hex(color)}
                      disabled={tuning.randomColors}
                      onInput={(event) => {
                        const colors: FirmwareTuning["colors"] = [
                          ...tuning.colors,
                        ];
                        colors[bank] = rgb(event.currentTarget.value);
                        patch({ colors });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <label className="firmware-rainbow">
              <input
                type="checkbox"
                checked={tuning.randomColors}
                onChange={(event) =>
                  patch({ randomColors: event.currentTarget.checked })
                }
              />
              Радужный отклик
            </label>
            <div className="field">
              <label htmlFor="firmware-speed">
                Скорость{" "}
                <output>
                  {Math.round(
                    ((limits[1] - tuning.speed) / (limits[1] - limits[0])) *
                      100,
                  )}
                  %
                </output>
              </label>
              <input
                id="firmware-speed"
                type="range"
                min={limits[0]}
                max={limits[1]}
                step={5}
                value={limits[0] + limits[1] - tuning.speed}
                onChange={(event) =>
                  patch({
                    speed:
                      limits[0] + limits[1] - Number(event.currentTarget.value),
                  })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="firmware-brightness">
                Яркость <output>{tuning.brightness * 5}%</output>
              </label>
              <input
                id="firmware-brightness"
                type="range"
                min={0}
                max={20}
                value={tuning.brightness}
                onChange={(event) =>
                  patch({ brightness: Number(event.currentTarget.value) })
                }
              />
            </div>
          </fieldset>
          <p className="firmware-note">
            Два цвета чередуются; фон задаёт прошивка. Настройки реакций
            экспериментальные.
          </p>
        </>
      ) : (
        <p className="firmware-note">
          Параметры этого профиля сохраняются из выбранного слота.{" "}
          {limits && !readOnly && (
            <button
              className="quiet small"
              onClick={() => onChange(switchFirmware(profile, mode!))}
            >
              Настроить цвета и скорость
            </button>
          )}
        </p>
      )}
      <div className="overview-caption">
        <span>Эффект виден на клавиатуре после записи</span>
      </div>
      <Keyboard
        profile={{ ...profile, brightness: 0 }}
        selected={[]}
        interactive={false}
        onSelect={() => {}}
        frame={0}
        playing={false}
        mode="lighting"
        layer="base"
        hardware={null}
        time={0}
      />
      {!readOnly && (
        <button className="quiet" onClick={onReplace}>
          <Wand2 size={15} />
          Заменить своей анимацией
        </button>
      )}
    </section>
  );
}
