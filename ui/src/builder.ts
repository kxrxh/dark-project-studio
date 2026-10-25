import { layout } from "./model.ts";
import type { Color, Effect, Profile, Frame } from "./model.ts";
export const patterns = [
  {
    id: "steady",
    name: "Постоянный свет",
    group: "Ритм",
    description: "Все клавиши светятся одновременно",
  },
  {
    id: "wave",
    name: "Горизонтальная волна",
    group: "Движение",
    description: "Полоса проходит слева направо",
  },
  {
    id: "vertical",
    name: "Вертикальная волна",
    group: "Движение",
    description: "Полоса движется сверху вниз",
  },
  {
    id: "diagonal",
    name: "Диагональ",
    group: "Движение",
    description: "Косая полоса пересекает клавиатуру",
  },
  {
    id: "reverse-diagonal",
    name: "Обратная диагональ",
    group: "Движение",
    description: "Полоса идёт под другим углом",
  },
  {
    id: "scanner",
    name: "Сканер",
    group: "Движение",
    description: "Луч движется туда и обратно",
  },
  {
    id: "curtain",
    name: "Шторки",
    group: "Симметрия",
    description: "Две полосы встречаются в центре",
  },
  {
    id: "ripple",
    name: "Круги",
    group: "Симметрия",
    description: "Кольцо расходится от центра",
  },
  {
    id: "radar",
    name: "Радар",
    group: "Симметрия",
    description: "Вращающийся луч вокруг центра",
  },
  {
    id: "spiral",
    name: "Спираль",
    group: "Симметрия",
    description: "Закрученный луч вращается по кругу",
  },
  {
    id: "orbit",
    name: "Орбита",
    group: "Симметрия",
    description: "Световое пятно обходит клавиатуру",
  },
  {
    id: "rain",
    name: "Дождь",
    group: "Искры",
    description: "Капли бегут вниз по столбцам",
  },
  {
    id: "sparkle",
    name: "Россыпь",
    group: "Искры",
    description: "Меняющиеся группы светящихся клавиш",
  },
  {
    id: "stars",
    name: "Звёзды",
    group: "Искры",
    description: "Редкие огни появляются по всей схеме",
  },
  {
    id: "checker",
    name: "Шахматы",
    group: "Ритм",
    description: "Чередование двух шахматных масок",
  },
  {
    id: "columns",
    name: "Через столбец",
    group: "Ритм",
    description: "Чётные и нечётные столбцы по очереди",
  },
  {
    id: "rows",
    name: "Через ряд",
    group: "Ритм",
    description: "Чередование соседних рядов",
  },
  {
    id: "blocks",
    name: "Квадранты",
    group: "Ритм",
    description: "Четыре части загораются по очереди",
  },
  {
    id: "cross",
    name: "Перекрестие",
    group: "Симметрия",
    description: "Горизонтальный и вертикальный лучи",
  },
  {
    id: "snake",
    name: "Змейка",
    group: "Движение",
    description: "След проходит клавиши рядами",
  },
  {
    id: "comet",
    name: "Комета",
    group: "Движение",
    description: "Огонь с хвостом обходит края",
  },
  {
    id: "sweep",
    name: "Заполнение",
    group: "Движение",
    description: "Клавиатура постепенно наполняется светом",
  },
  {
    id: "wipe",
    name: "Стирание",
    group: "Движение",
    description: "Свет постепенно исчезает справа налево",
  },
  {
    id: "heartbeat",
    name: "Сердцебиение",
    group: "Ритм",
    description: "Двойной импульс с паузой",
  },
  {id:'double-wave',name:'Встречные волны',group:'Движение',description:'Две полосы движутся навстречу друг другу'},
  {id:'diamond-ring',name:'Ромбовые кольца',group:'Симметрия',description:'Ромб расходится от центра'},
  {id:'twin-spiral',name:'Двойная спираль',group:'Симметрия',description:'Две закрученные полосы вращаются вместе'},
  {id:'waterfall',name:'Водопад',group:'Движение',description:'Изогнутая полоса проходит сверху вниз'},
  {id:'pinwheel',name:'Вертушка',group:'Симметрия',description:'Четыре луча вращаются вокруг центра'},
  {id:'converge',name:'Схлопывание',group:'Симметрия',description:'Полосы от краёв сходятся к центру'},
  {id:'braid',name:'Коса',group:'Движение',description:'Две волнистые полосы переплетаются'},
  {id:'zipper',name:'Молния',group:'Движение',description:'Соседние столбцы движутся в разные стороны'},
] as const;
export type PatternId = (typeof patterns)[number]["id"];
export const palettes: { id: string; name: string; colors: Color[] }[] = [
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    colors: [
      [0, 255, 255],
      [114, 75, 255],
      [255, 0, 160],
    ],
  },
  {
    id: "sunset",
    name: "Закат",
    colors: [
      [255, 135, 26],
      [255, 50, 105],
      [100, 0, 255],
    ],
  },
  {
    id: "aurora",
    name: "Северное сияние",
    colors: [
      [30, 255, 155],
      [35, 175, 255],
      [175, 80, 255],
    ],
  },
  {
    id: "ocean",
    name: "Океан",
    colors: [
      [5, 40, 180],
      [0, 170, 255],
      [65, 255, 225],
    ],
  },
  {
    id: "fire",
    name: "Огонь",
    colors: [
      [255, 25, 5],
      [255, 115, 5],
      [255, 235, 70],
    ],
  },
  {
    id: "ice",
    name: "Лёд",
    colors: [
      [50, 140, 255],
      [155, 230, 255],
      [240, 250, 255],
    ],
  },
  {
    id: "forest",
    name: "Лес",
    colors: [
      [10, 95, 45],
      [35, 215, 95],
      [205, 255, 100],
    ],
  },
  {
    id: "violet",
    name: "Ультрафиолет",
    colors: [
      [60, 10, 160],
      [145, 40, 255],
      [245, 125, 255],
    ],
  },
  {
    id: "candy",
    name: "Сахарная вата",
    colors: [
      [255, 105, 180],
      [175, 160, 255],
      [105, 225, 255],
    ],
  },
  {
    id: "retro",
    name: "Ретро",
    colors: [
      [255, 75, 30],
      [255, 200, 90],
      [55, 200, 185],
    ],
  },
  { id: "mono", name: "Белый свет", colors: [[255, 255, 255]] },
  {
    id: "ember",
    name: "Угли",
    colors: [
      [160, 5, 15],
      [255, 40, 10],
      [255, 115, 30],
    ],
  },
];
export type Distribution =
  | "horizontal"
  | "horizontal-reverse"
  | "vertical"
  | "vertical-reverse"
  | "diagonal"
  | "anti-diagonal"
  | "radial"
  | "radial-in"
  | "bands"
  | "solid";
export interface BuilderSettings {
  pattern: PatternId;
  colors: Color[];
  distribution: Distribution;
  effect: Effect;
  width: number;
  duration: number;
  reverse: boolean;
  reverseColors: boolean;
  brightness: number;
}
export const defaultSettings = (): BuilderSettings => ({
  pattern: "wave",
  colors: palettes[0].colors.map((c) => [...c] as Color),
  distribution: "horizontal",
  effect: "static",
  width: 3,
  duration: 1,
  reverse: false,
  reverseColors: false,
  brightness: 100,
});
const mod = (value: number, base = 1) => ((value % base) + base) % base;
const snakeOrder = layout
  .map((_, i) => i)
  .sort(
    (a, b) =>
      Math.round(layout[a].y) - Math.round(layout[b].y) ||
      (Math.round(layout[a].y) % 2 ? -1 : 1) * (layout[a].x - layout[b].x),
  );
export function colorAt(colors: Color[], position: number): Color {
  const p = Math.max(0, Math.min(1, position)) * (colors.length - 1),
    i = Math.floor(p),
    fraction = p - i;
  return colors[i].map((v, c) =>
    Math.round(
      v + (colors[Math.min(i + 1, colors.length - 1)][c] - v) * fraction,
    ),
  ) as Color;
}
function framesFor(s: BuilderSettings): Frame[] {
  const all = layout.map((_, i) => i);
  if (s.pattern === "steady") return [{ keys: all, duration: s.duration }];
  if (s.pattern === "heartbeat") {
    const frames = [all, [], all, []].map((keys, i) => ({
      keys,
      duration: s.duration * [2, 1, 2, 8][i],
    }));
    return s.reverse ? frames.reverse() : frames;
  }
  const count =
    (s.pattern === "wave" || s.pattern === "double-wave")
      ? 18
      : s.pattern === "vertical"
        ? 6
        : s.pattern === "scanner"
          ? 18
          : s.pattern === "curtain"
            ? 10
            : ["checker", "columns", "rows"].includes(s.pattern)
              ? 2
              : s.pattern === "blocks"
                ? 4
                : s.pattern === "cross"
                  ? 12
                  : 20;
  const frames = Array.from({ length: count }, (_, frame) => ({
    duration: s.duration,
    keys: layout.flatMap((key, index) => {
      const x = key.x / 17.5,
        y = key.y / 5.4,
        row = Math.round(key.y),
        col = Math.floor(key.x),
        t = frame / count,
        w = s.width;
      const r = Math.hypot(x - 0.5, y - 0.5),
        angle = mod(Math.atan2(y - 0.5, x - 0.5) / (Math.PI * 2));
      let on = false;
      switch (s.pattern) {
        case 'double-wave':
          on=mod(col-frame,18)<w || mod(col+frame,18)<w; break;
        case 'diamond-ring':
          on=mod((Math.abs(x-0.5)+Math.abs(y-0.5))*0.9-t)<w/22; break;
        case 'twin-spiral':
          on=mod(angle*2+r*1.5-t)<w/16; break;
        case 'waterfall':
          on=mod(y+Math.sin(x*Math.PI*6)*0.12-t)<w/20; break;
        case 'pinwheel':
          on=mod(angle*4-t)<w/15 && r>0.06; break;
        case 'converge':
          on=Math.abs(x-0.5)<=0.5*(1-t) && Math.abs(x-0.5)>0.5*(1-t)-w/22; break;
        case 'braid': {
          const wave=Math.sin((x-t)*Math.PI*2)*0.32;
          on=Math.abs(y-(0.5+wave))<w/20 || Math.abs(y-(0.5-wave))<w/20; break;
        }
        case 'zipper':
          on=mod(y+(col%2?t:-t))<w/18; break;
        case "wave":
          on = mod(col - frame, 18) < w;
          break;
        case "vertical":
          on = mod(row - frame, 6) < Math.min(w, 3);
          break;
        case "diagonal":
          on = mod(x * 0.7 + y * 0.3 - t) < w / 22;
          break;
        case "reverse-diagonal":
          on = mod(x * 0.7 + (1 - y) * 0.3 - t) < w / 22;
          break;
        case "scanner":
          on = Math.abs(x - (frame < 9 ? frame : 18 - frame) / 9) < w / 20;
          break;
        case "curtain":
          on = Math.abs(Math.abs(x - 0.5) - (0.5 - frame / 18)) < w / 24;
          break;
        case "ripple":
          on = mod(r / 0.71 - t) < w / 20;
          break;
        case "radar":
          on = mod(angle - t) < w / 22;
          break;
        case "spiral":
          on = mod(angle + r * 1.5 - t) < w / 20;
          break;
        case "orbit":
          on =
            Math.hypot(
              x - (0.5 + 0.42 * Math.cos(t * Math.PI * 2)),
              y - (0.5 + 0.42 * Math.sin(t * Math.PI * 2)),
            ) <
            w / 12;
          break;
        case "rain":
          on = mod(y + ((col * 7) % 13) / 13 - t) < w / 18;
          break;
        case "sparkle":
          on = (index * 17 + frame * 29) % 87 < w * 6;
          break;
        case "stars":
          on = (index * 37 + frame * 11) % 89 < w * 2;
          break;
        case "checker":
          on = (row + col + frame) % 2 === 0;
          break;
        case "columns":
          on = (col + frame) % 2 === 0;
          break;
        case "rows":
          on = (row + frame) % 2 === 0;
          break;
        case "blocks":
          on = (x > 0.5 ? 1 : 0) + (y > 0.5 ? 2 : 0) === frame;
          break;
        case "cross":
          on = Math.abs(x - t) < w / 24 || Math.abs(y - (1 - t)) < w / 24;
          break;
        case "snake":
          on = mod(snakeOrder.indexOf(index) / 87 - t) < w / 22;
          break;
        case "comet":
          on = r > 0.35 && mod(angle - t) < w / 12;
          break;
        case "sweep":
          on = x <= frame / (count - 1);
          break;
        case "wipe":
          on = x <= 1 - frame / (count - 1);
          break;
      }
      return on ? [index] : [];
    }),
  }));
  return s.reverse ? frames.reverse() : frames;
}
export function buildLighting(base: Profile, s: BuilderSettings): Profile {
  if (
    !patterns.some((p) => p.id === s.pattern) ||
    !["horizontal", "horizontal-reverse", "vertical", "vertical-reverse", "diagonal", "anti-diagonal", "radial", "radial-in", "bands", "solid"].includes(
      s.distribution,
    ) ||
    typeof s.reverseColors !== "boolean" ||
    !["static", "breathing", "cycle", "rainbow"].includes(s.effect) ||
    !Number.isInteger(s.width) ||
    s.width < 1 ||
    s.width > 6 ||
    !Number.isInteger(s.duration) ||
    s.duration < 1 ||
    s.duration > 10 ||
    !Number.isInteger(s.brightness) ||
    s.brightness < 0 ||
    s.brightness > 100 ||
    s.colors.length < 1 ||
    s.colors.length > 5 ||
    s.colors.some(
      (c) =>
        c.length !== 3 ||
        c.some((v) => !Number.isInteger(v) || v < 0 || v > 255),
    )
  )
    throw new Error("Некорректные настройки конструктора");
  const colors = s.reverseColors ? [...s.colors].reverse() : s.colors;
  const keys = layout.map((key, i) => {
    const x = key.x / 17.5,
      y = key.y / 5.4;
    const position =
      s.distribution === "solid"
        ? 0
        : s.distribution === "horizontal-reverse"
          ? 1-x
        : s.distribution === "vertical"
          ? y
          : s.distribution === "vertical-reverse"
            ? 1-y
          : s.distribution === "diagonal"
            ? (x+y)/2
          : s.distribution === "anti-diagonal"
            ? (x+1-y)/2
          : s.distribution === "radial"
            ? Math.min(1, Math.hypot(x - 0.5, y - 0.5) / 0.71)
            : s.distribution === "radial-in"
              ? 1-Math.min(1,Math.hypot(x-.5,y-.5)/.71)
            : s.distribution === "bands"
              ? (Math.floor(x * s.colors.length) % s.colors.length) /
                Math.max(1, s.colors.length - 1)
              : x;
    return {
      color:
        s.effect === "cycle"
          ? ([255, 255, 255] as Color)
          : colorAt(colors, position),
      effect: s.effect,
      speed: s.duration,
      pause: s.effect === "cycle" ? i % 6 : 32,
    };
  });
  const profile = { ...base, brightness: s.brightness, keys, frames: framesFor(s) };
  delete profile.firmware;
  return profile;
}
