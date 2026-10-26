import {
  ArrowLeft,
  ArrowRight,
  Command,
  Copy,
  Film,
  HardDrive,
  Lightbulb,
  LockKeyhole,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Undo2,
  Wand2,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import Keyboard from "../../components/Keyboard";
import { actionLabel, groups, layout } from "../../model/keyboard";
import { hex } from "../../model/profile";
import type { Hardware, Profile } from "../../model/types";
import AnimationEditor from "../lighting/AnimationEditor";
import FirmwareEditor from "../lighting/FirmwareEditor";
import MacroEditor from "../macros/MacroEditor";
import ProfileBuilder from "./ProfileBuilder";
import ProfileInspector from "./ProfileInspector";
import type { ProfileEditorState } from "./useProfileEditor";

const all = layout.map((_, i) => i);

export default function ProfileEditor({
  current,
  isPreset,
  tab,
  setTab,
  busy,
  add,
  hardware,
  hasDevice,
  slot,
  refreshAssignments,
  fileMenu,
  editing,
}: {
  current: Profile;
  isPreset: boolean;
  tab: string;
  setTab: Dispatch<SetStateAction<string>>;
  busy: string;
  add: (profile: Profile) => void;
  hardware: Hardware | null;
  hasDevice: boolean;
  slot: number | null;
  refreshAssignments: () => Promise<void>;
  fileMenu: RefObject<HTMLDivElement | null>;
  editing: ProfileEditorState;
}) {
  const page =
    tab === "macros" ? "macros" : tab === "bindings" ? "bindings" : "lighting";
  const {
    selected,
    setSelected,
    layer,
    setLayer,
    frame,
    changeFrame,
    playing,
    setPlaying,
    painting,
    setPainting,
    time,
    undo,
    redo,
    update,
    selectKey,
    history,
    setGradientFrom,
    animates,
  } = editing;
  return (
    <fieldset
      className={`editor ${isPreset || !["lighting", "frames", "bindings"].includes(tab) ? "editor-wide" : ""}`}
      disabled={!!busy}
    >
      <div className="editor-main">
        {page === "lighting" && (
          <button
            className="back-link"
            onClick={() =>
              setTab(
                ["overview", "firmware"].includes(tab)
                  ? "library"
                  : current.firmware
                    ? "firmware"
                    : "overview",
              )
            }
          >
            <ArrowLeft size={15} />
            {["overview", "firmware"].includes(tab)
              ? "Все профили"
              : "Вернуться к профилю"}
          </button>
        )}
        <div className="profile-title">
          <div>
            {page === "macros" || page === "bindings" ? (
              <h1 className="builder-title">
                {page === "macros" ? "Макросы" : "Переназначение"}
              </h1>
            ) : isPreset ? (
              <h1 className="builder-title">{current.name}</h1>
            ) : (
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
            {isPreset && (
              <span className="preset-label">
                <LockKeyhole size={12} />
                Готовый профиль · только просмотр
              </span>
            )}
            {page === "lighting" &&
              tab === "overview" &&
              current.description && <p>{current.description}</p>}
          </div>
          <div className="profile-actions">
            <button
              className={isPreset ? "primary" : "quiet small"}
              onClick={() =>
                add({
                  ...current,
                  name: `${current.name} — копия`.slice(0, 64),
                })
              }
            >
              <Copy size={14} />
              {isPreset ? "Создать копию" : "Дублировать"}
            </button>
            <button
              className="icon-button"
              aria-label="Файл профиля"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                if (fileMenu.current) {
                  fileMenu.current.style.top = `${box.bottom + 6}px`;
                  fileMenu.current.style.right = `${window.innerWidth - box.right}px`;
                  fileMenu.current.togglePopover();
                }
              }}
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
          {!isPreset && (
            <div className="history">
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
            </div>
          )}
        </div>
        {!isPreset && (page === "macros" || page === "bindings") && (
          <p className="page-intro">
            {page === "macros"
              ? "Выберите клавишу на схеме, затем запишите последовательность."
              : "Выберите клавишу на схеме и задайте новое действие справа."}{" "}
            Изменения относятся к «{current.name}».
          </p>
        )}
        {page === "lighting" && ["lighting", "frames"].includes(tab) && (
          <nav className="tabs" aria-label="Ручное редактирование">
            <button
              className={tab === "lighting" ? "active" : ""}
              onClick={() => setTab("lighting")}
            >
              Цвета клавиш
            </button>
            <button
              className={tab === "frames" ? "active" : ""}
              onClick={() => setTab("frames")}
            >
              Кадры анимации
            </button>
          </nav>
        )}
        {isPreset && page !== "lighting" ? (
          <section className="preset-editing-lock">
            <p>
              Чтобы настроить{" "}
              {page === "macros" ? "макросы" : "назначения клавиш"} для «
              {current.name}», создайте копию профиля.
            </p>
            <Keyboard
              profile={current}
              selected={[]}
              interactive={false}
              onSelect={() => {}}
              frame={0}
              playing={false}
              mode={page}
              layer={layer}
              hardware={null}
              time={0}
            />
          </section>
        ) : tab === "firmware" ? (
          <FirmwareEditor
            profile={current}
            onChange={update}
            readOnly={isPreset}
            onReplace={() => setTab("builder")}
          />
        ) : tab === "overview" || isPreset ? (
          <section className="profile-overview">
            {!isPreset && (
              <div className="overview-actions">
                <button className="quiet" onClick={() => setTab("builder")}>
                  <Wand2 size={16} />
                  Заменить анимацию
                </button>
                <button
                  className="quiet"
                  onClick={() => {
                    update({ ...current, firmware: { mode: 0 } });
                    setTab("firmware");
                  }}
                >
                  <HardDrive size={16} />
                  Встроенные эффекты
                </button>
                <button
                  className="quiet"
                  onClick={() => {
                    setSelected(all);
                    setGradientFrom(hex(current.keys[0].color));
                    setTab("lighting");
                  }}
                >
                  <Lightbulb size={16} />
                  Изменить цвета клавиш
                </button>
              </div>
            )}
            <div className="overview-caption">
              <span>
                {animates ? "Предпросмотр подсветки" : "Статическая подсветка"}
              </span>
              {animates && (
                <button
                  className="quiet small"
                  aria-pressed={playing}
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
                  {playing ? "Пауза" : "Воспроизвести"}
                </button>
              )}
            </div>
            <Keyboard
              profile={current}
              selected={[]}
              interactive={false}
              onSelect={() => {}}
              frame={frame}
              playing={playing}
              mode="lighting"
              layer="base"
              hardware={null}
              time={time}
            />
            <div className="overview-controls">
              <label htmlFor="overview-brightness">
                Яркость <output>{current.brightness}%</output>
                <input
                  id="overview-brightness"
                  type="range"
                  disabled={isPreset}
                  min={0}
                  max={100}
                  value={current.brightness}
                  onChange={(e) =>
                    update({ ...current, brightness: Number(e.target.value) })
                  }
                />
              </label>
            </div>

            {!isPreset && (
              <details className="manual-tools">
                <summary>Дополнительные настройки</summary>
                <button onClick={() => setTab("frames")}>
                  <Film size={15} />
                  Редактировать кадры
                </button>
              </details>
            )}
          </section>
        ) : tab === "builder" ? (
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
                {selected.length === 1 ? "клавиша выбрана" : "клавиш выбрано"}
              </span>
              {tab !== "bindings" && (
                <div>
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
                </div>
              )}
            </div>
            <p className="canvas-hint">
              {tab === "bindings"
                ? "Нажмите клавишу для выбора."
                : "Нажмите клавишу для выбора. Shift + клик — выбрать несколько."}
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
      {!isPreset && ["lighting", "frames", "bindings"].includes(tab) && (
        <ProfileInspector
          current={current}
          tab={tab}
          setTab={setTab}
          editing={editing}
          hardware={hardware}
          hasDevice={hasDevice}
          slot={slot}
          refreshAssignments={refreshAssignments}
        />
      )}
    </fieldset>
  );
}
