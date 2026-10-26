import { layout } from "../../model/keyboard.ts";
import type { Color, Profile } from "../../model/types.ts";
import type { Distribution } from "./builder.ts";
import { buildLighting, colorAt, defaultSettings } from "./builder.ts";

type Pattern =
  | Distribution
  | "diagonal"
  | "mirror"
  | "border"
  | "checker"
  | "zones"
  | "quadrants"
  | "rows"
  | "accents";
const collection: {
  id: string;
  name: string;
  description: string;
  pattern: Pattern;
  colors: Color[];
  brightness?: number;
}[] = [
  {
    id: "porcelain",
    name: "Фарфор",
    description: "Холодный голубой переходит в тёплый белый",
    pattern: "horizontal",
    colors: [
      [125, 170, 235],
      [235, 230, 210],
      [255, 245, 225],
    ],
    brightness: 80,
  },
  {
    id: "neon-diptych",
    name: "Неоновый диптих",
    description: "Чёткое деление на розовую и бирюзовую половины",
    pattern: "bands",
    colors: [
      [255, 20, 140],
      [0, 225, 235],
    ],
  },
  {
    id: "stained-glass",
    name: "Витраж",
    description: "Четыре цветных сектора: синий, розовый, янтарный и мятный",
    pattern: "quadrants",
    colors: [
      [35, 105, 235],
      [235, 45, 155],
      [255, 170, 35],
      [30, 215, 155],
    ],
  },
  {
    id: "piano",
    name: "Слоновая кость",
    description: "Светлые буквы, синие модификаторы и медная навигация",
    pattern: "zones",
    colors: [
      [235, 225, 195],
      [35, 60, 105],
      [245, 125, 55],
    ],
    brightness: 80,
  },
  {
    id: "metro",
    name: "Линии метро",
    description: "Каждый ряд — отдельная цветная линия",
    pattern: "rows",
    colors: [
      [245, 65, 85],
      [255, 165, 40],
      [60, 210, 150],
      [45, 150, 245],
      [160, 95, 235],
    ],
    brightness: 85,
  },
  {
    id: "violet-rim",
    name: "Ультрафиолетовый контур",
    description: "Холодный контур вокруг тёмно-фиолетовой середины",
    pattern: "border",
    colors: [
      [45, 15, 80],
      [130, 220, 255],
    ],
  },
  {
    id: "lagoon",
    name: "Лагуна",
    description: "Светлая бирюзовая середина в тёмно-синих краях",
    pattern: "radial",
    colors: [
      [150, 255, 225],
      [0, 130, 155],
      [10, 25, 90],
    ],
  },
  {
    id: "checker-ice",
    name: "Ледяная мозаика",
    description: "Шахматное чередование синего и ледяного белого",
    pattern: "checker",
    colors: [
      [25, 70, 150],
      [185, 235, 255],
    ],
  },
  {
    id: "dune",
    name: "Дюна",
    description: "Песок, медь и глубокий терракотовый",
    pattern: "diagonal",
    colors: [
      [255, 225, 150],
      [200, 105, 45],
      [80, 25, 20],
    ],
    brightness: 85,
  },
  {
    id: "blueprint",
    name: "Цианотипия",
    description: "Глубокий синий, белая середина и голубой край",
    pattern: "horizontal",
    colors: [
      [15, 35, 145],
      [195, 225, 255],
      [0, 160, 230],
    ],
  },
  {
    id: "afterglow",
    name: "Послесвечение",
    description: "Лиловый верх, коралловая середина и янтарный низ",
    pattern: "vertical",
    colors: [
      [105, 45, 180],
      [255, 75, 120],
      [255, 155, 55],
    ],
  },
  {
    id: "matcha",
    name: "Матча",
    description: "Приглушённые зелёные ряды с кремовым переходом",
    pattern: "vertical",
    colors: [
      [20, 70, 45],
      [115, 175, 95],
      [235, 225, 165],
    ],
    brightness: 75,
  },
  {
    id: "velvet",
    name: "Бархат",
    description: "Индиго, мягкий фиолетовый и винный",
    pattern: "horizontal",
    colors: [
      [25, 35, 120],
      [135, 75, 200],
      [195, 30, 100],
    ],
    brightness: 70,
  },
  {
    id: "emberglass",
    name: "Огненное стекло",
    description: "Золотая середина и тёмные рубиновые края",
    pattern: "radial",
    colors: [
      [255, 230, 135],
      [255, 80, 15],
      [85, 5, 30],
    ],
  },
  {
    id: "pearl",
    name: "Перламутр",
    description: "Белая середина с лавандовыми и стальными краями",
    pattern: "radial",
    colors: [
      [245, 235, 255],
      [145, 155, 215],
      [50, 70, 105],
    ],
    brightness: 80,
  },
  {
    id: "copper",
    name: "Медный сплав",
    description: "Графит, медь и слоновая кость широкими полосами",
    pattern: "bands",
    colors: [
      [35, 45, 65],
      [225, 115, 50],
      [245, 220, 170],
    ],
    brightness: 80,
  },
  {
    id: "sorbet",
    name: "Сорбет",
    description: "Мягкая диагональ от мяты через сливки к розовому",
    pattern: "diagonal",
    colors: [
      [95, 225, 180],
      [255, 240, 160],
      [255, 120, 175],
    ],
    brightness: 80,
  },
  {
    id: "moonlit",
    name: "Лунное серебро",
    description: "Белое ядро между двумя синими краями",
    pattern: "mirror",
    colors: [
      [20, 45, 110],
      [135, 185, 230],
      [235, 245, 255],
    ],
    brightness: 75,
  },
  {
    id: "ruby-mirror",
    name: "Рубиновое зеркало",
    description: "Розовый центр и симметричные бордовые края",
    pattern: "mirror",
    colors: [
      [70, 5, 30],
      [210, 25, 70],
      [255, 150, 180],
    ],
  },
  {
    id: "amber-rim",
    name: "Латунная рамка",
    description: "Янтарная рамка вокруг приглушённого графита",
    pattern: "border",
    colors: [
      [25, 35, 45],
      [255, 170, 45],
    ],
    brightness: 85,
  },
  {
    id: "coral-reef",
    name: "Коралловый риф",
    description: "Мятные буквы, синий периметр и коралловая навигация",
    pattern: "zones",
    colors: [
      [50, 225, 180],
      [15, 45, 100],
      [255, 80, 105],
    ],
  },
  {
    id: "acid-ink",
    name: "Кислотные чернила",
    description: "Тихая синяя основа с лаймовыми акцентами",
    pattern: "accents",
    colors: [
      [15, 25, 55],
      [190, 255, 25],
      [225, 240, 255],
    ],
    brightness: 85,
  },
  {
    id: "cherry-ink",
    name: "Вишнёвые чернила",
    description: "Пыльно-розовая основа, рубиновые акценты и белые стрелки",
    pattern: "accents",
    colors: [
      [105, 40, 75],
      [255, 25, 90],
      [245, 230, 220],
    ],
    brightness: 75,
  },
  {
    id: "checker-candy",
    name: "Конфетная мозаика",
    description: "Розовые и лавандовые клавиши в шахматном порядке",
    pattern: "checker",
    colors: [
      [255, 100, 155],
      [100, 90, 220],
    ],
    brightness: 80,
  },
];

export function staticPresets(): Profile[] {
  return collection.map(
    ({ id, name, description, pattern, colors, brightness = 100 }) => {
      const base: Profile = {
        version: 1,
        id: `static-v3-${id}`,
        name,
        description,
        brightness,
        keys: [],
        frames: [],
        bindings: [],
        macros: [],
      };
      const distribution = [
        "horizontal",
        "vertical",
        "radial",
        "bands",
        "solid",
      ].includes(pattern)
        ? (pattern as Distribution)
        : "horizontal";
      const profile = buildLighting(base, {
        ...defaultSettings(),
        pattern: "steady",
        distribution,
        colors,
        brightness,
      });
      if (pattern === distribution) return profile;
      profile.keys = profile.keys.map((style, index) => {
        const key = layout[index],
          x = key.x / 17.5,
          y = key.y / 5.4;
        let color: Color;
        switch (pattern) {
          case "diagonal":
            color = colorAt(colors, x * 0.65 + y * 0.35);
            break;
          case "mirror":
            color = colorAt(colors, 1 - Math.abs(x - 0.5) * 2);
            break;
          case "border":
            color =
              colors[
                key.y === 0 || key.y >= 5.4 || key.x === 0 || key.x >= 15.5
                  ? 1
                  : 0
              ];
            break;
          case "checker":
            color = colors[(Math.floor(key.x) + Math.round(key.y)) % 2];
            break;
          case "zones":
            color =
              colors[
                key.x >= 15.5 ? 2 : key.code >= 4 && key.code <= 29 ? 0 : 1
              ];
            break;
          case "quadrants":
            color = colors[(x > 0.5 ? 1 : 0) + (y > 0.5 ? 2 : 0)];
            break;
          case "rows":
            color = colors[Math.round(key.y) % colors.length];
            break;
          case "accents":
            color =
              colors[
                ["up", "left", "down", "right"].includes(key.name)
                  ? 2
                  : key.y === 0 || key.name === "enter" || key.name === "space"
                    ? 1
                    : 0
              ];
            break;
          default:
            color = style.color;
        }
        return { ...style, color: [...color] as Color };
      });
      return profile;
    },
  );
}
