import {
  ArrowRight,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  Search,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { layout } from "../../model/keyboard";
import type { Profile } from "../../model/types";
import type { ProfileFilter } from "./library";
import { isStaticProfile, visibleProfiles } from "./library";
import { previewColors } from "./preview";

export default memo(function ProfileLibrary({
  profiles,
  presetIds,
  onSelect,
  onCreate,
  disabled,
  active,
}: {
  profiles: Profile[];
  presetIds: ReadonlySet<string>;
  onSelect: (profile: Profile) => void;
  onCreate: () => void;
  disabled: boolean;
  active: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProfileFilter>("all");
  const [playing, setPlaying] = useState(true);
  const previewTime = useRef(450);
  const shown = useMemo(
    () => visibleProfiles(profiles, search, filter, presetIds),
    [profiles, search, filter, presetIds],
  );
  const hasAnimation = shown.some(
    (profile) => !profile.firmware && !isStaticProfile(profile),
  );
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !grid.current) return;
    const root = grid.current;
    const profilesById = new Map(shown.map((profile) => [profile.id, profile]));
    const visible = new Set<HTMLCanvasElement>();
    const animated = new Set<HTMLCanvasElement>();
    const canvases = Array.from(
      root.querySelectorAll<HTMLCanvasElement>("canvas"),
    );
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const started = performance.now();
    const phase = previewTime.current;
    let animation = 0,
      last = -Infinity;
    function paint(canvas: HTMLCanvasElement, time: number) {
      const profile = profilesById.get(canvas.dataset.profileId!);
      const context = canvas.getContext("2d");
      if (!profile || !context || !canvas.width) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(
        canvas.width / 18.5,
        0,
        0,
        canvas.height / 6.4,
        0,
        0,
      );
      const colors = previewColors(profile, time);
      layout.forEach((key, index) => {
        context.fillStyle = profile.firmware
          ? "#303031"
          : `rgb(${colors[index].join(",")})`;
        context.fillRect(key.x + 0.04, key.y + 0.04, key.width - 0.08, 0.72);
      });
    }
    function resize(canvas: HTMLCanvasElement, width: number) {
      const pixels = Math.round(
        width * Math.min(window.devicePixelRatio || 1, 2),
      );
      if (canvas.width !== pixels) {
        canvas.width = pixels;
        canvas.height = Math.round((pixels * 6.4) / 18.5);
      }
    }
    function tick(now: number) {
      if (now - last >= 50) {
        last = now;
        previewTime.current = now - started + phase;
        animated.forEach((canvas) => paint(canvas, previewTime.current));
      }
      animation = requestAnimationFrame(tick);
    }
    function wake() {
      cancelAnimationFrame(animation);
      if (playing && !document.hidden && !motion.matches && animated.size)
        animation = requestAnimationFrame(tick);
    }
    function motionChanged() {
      visible.forEach((canvas) => paint(canvas, previewTime.current));
      wake();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const canvas = entry.target as HTMLCanvasElement;
          if (entry.isIntersecting && entry.boundingClientRect.width > 0) {
            resize(canvas, entry.boundingClientRect.width);
            visible.add(canvas);
            const profile = profilesById.get(canvas.dataset.profileId!);
            if (profile && !profile.firmware && !isStaticProfile(profile))
              animated.add(canvas);
            paint(canvas, previewTime.current);
          } else {
            visible.delete(canvas);
            animated.delete(canvas);
            canvas.width = canvas.height = 0;
          }
        }
        wake();
      },
      { root: root.closest(".profile-browser") },
    );
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        if (!visible.has(canvas)) continue;
        resize(canvas, entry.contentRect.width);
        paint(canvas, previewTime.current);
      }
    });
    canvases.forEach((canvas) => {
      observer.observe(canvas);
      sizes.observe(canvas);
    });
    document.addEventListener("visibilitychange", wake);
    motion.addEventListener("change", motionChanged);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      sizes.disconnect();
      document.removeEventListener("visibilitychange", wake);
      motion.removeEventListener("change", motionChanged);
      canvases.forEach((canvas) => {
        canvas.width = canvas.height = 0;
      });
    };
  }, [shown, active, playing]);
  return (
    <section className="profile-browser">
      <div className="browser-heading">
        <div>
          <h1>Подсветка</h1>
          <p>Выберите профиль или соберите свой.</p>
        </div>
        <button className="primary" disabled={disabled} onClick={onCreate}>
          <Plus size={16} />
          Создать профиль
        </button>
      </div>
      <div className="browser-tools">
        <div className="segmented" role="group" aria-label="Тип подсветки">
          {(
            [
              { id: "all", label: "Все" },
              { id: "mine", label: "Мои" },
              { id: "static", label: "Статические" },
              { id: "firmware", label: "Встроенные" },
              { id: "reactive", label: "Реагируют на нажатия" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={filter === item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {hasAnimation && (
          <button
            className="quiet small"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
            {playing ? "Пауза превью" : "Включить анимацию"}
          </button>
        )}
        <label className="browser-search">
          <Search size={15} />
          <input
            aria-label="Поиск профилей"
            placeholder="Найти профиль"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {shown.some((profile) => profile.firmware) && (
        <p className="browser-note">
          Встроенные эффекты видны на клавиатуре после записи.
        </p>
      )}
      <div className="profile-grid" ref={grid}>
        {shown.map((profile) => (
          <button
            className="profile-preview"
            key={profile.id}
            disabled={disabled}
            onClick={() => onSelect(profile)}
          >
            <canvas
              className="profile-miniature"
              data-profile-id={profile.id}
              width={0}
              height={0}
              aria-hidden="true"
            />
            <span className="profile-preview-name">
              <strong>{profile.name}</strong>
              {presetIds.has(profile.id) ? (
                <LockKeyhole size={13} aria-label="Готовый профиль" />
              ) : (
                <ArrowRight size={15} />
              )}
            </span>
            <span className="profile-capability">
              {profile.firmware
                ? "Встроенный эффект"
                : isStaticProfile(profile)
                  ? "Статическая подсветка"
                  : "Анимация"}
            </span>
          </button>
        ))}
      </div>
      {!shown.length && (
        <div className="browser-empty">
          <h2>
            {filter === "mine" && !search.trim()
              ? "У вас пока нет своих профилей"
              : "Ничего не найдено"}
          </h2>
          <p>
            {filter === "mine" && !search.trim()
              ? "Создайте профиль с нуля или скопируйте готовый."
              : "Измените запрос или выберите другой тип подсветки."}
          </p>
          {filter === "mine" && !search.trim() && (
            <>
              <button className="primary" onClick={onCreate}>
                Создать профиль
              </button>
              <button onClick={() => setFilter("all")}>Выбрать готовый</button>
            </>
          )}
        </div>
      )}
    </section>
  );
});
