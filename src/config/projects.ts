/**
 * 阁楼工作台上的项目卡片。内容全部在这里改。
 *
 * 写法建议(招聘方 30 秒内要看懂):
 *   problem —— 一句话:要解决什么问题、为谁
 *   did     —— 3~4 条,每条以动词开头,写"你"做了什么
 *   result  —— 能量化就量化(访问量、转化率、节省的时间、用户反馈)
 *
 * TODO(Harry):标了 TODO 的地方是我不知道的信息,请补上真实内容;
 * links 为空的项目不会显示按钮。
 */
export interface Project {
  id: string;
  title: string;
  meta: string;            // 角色 · 时间 · 类型
  problem: string;
  did: string[];
  result: string;
  tags: string[];
  links: { label: string; url: string }[];
}

export const PROJECTS: Record<string, Project> = {
  site: {
    id: 'site',
    title: 'The Wandering Cottage',
    meta: 'Solo project · Product, design & engineering · 2026',
    problem: 'A résumé lists what you did, not how you think. I wanted a portfolio that shows how I take an idea from spec to shipped product.',
    did: [
      'Wrote a design spec (scenes, interactions, scope rules) before writing any code, and kept it in the repo.',
      'Built it with Phaser 3, TypeScript and Vite: a walkable 2.5D cottage with a day/night and seasons system.',
      'Wrote custom GLSL shaders for the fire and this LiDAR-style scan, plus a perspective-projected window you can open.',
      'Built a Python/OpenCV asset pipeline that cuts, recolors and paints art so every scene matches the hand-drawn style.',
    ],
    // TODO(Harry):上线后补一个结果,比如访问量、面试官的反馈
    result: 'Everything you are looking at, including procedural wind, rain and fire sound made with the Web Audio API.',
    tags: ['TypeScript', 'Phaser 3', 'GLSL', 'Web Audio', 'Python', 'OpenCV'],
    links: [{ label: 'GitHub', url: 'https://github.com/bilijiujiu/my-ghibli-site' }],
  },
  superauto: {
    id: 'superauto',
    title: 'SuperAuto USA',
    meta: 'Owner & web lead · Shopify e-commerce · Tukwila, WA',
    problem: 'An auto parts store lives or dies by whether a customer can find the part that fits their car in a few clicks.',
    did: [
      'Built and designed the Shopify storefront, including landing pages and the shop-by-brand search.',
      'Designed a Window Visors page with a vehicle fitment finder, a before/after comparison slider and product video sections.',
      'Unified typography, buttons and product cards into one consistent UI system across pages.',
      'Runs day-to-day e-commerce operations alongside the site work.',
    ],
    // TODO(Harry):补真实数字,比如改版前后的转化率、客单价、月订单量
    result: 'TODO: add a measurable result (conversion, orders, or time saved).',
    tags: ['Shopify', 'HTML/CSS', 'JavaScript', 'UX', 'E-commerce'],
    // TODO(Harry):填店铺网址
    links: [],
  },
  jobtrack: {
    id: 'jobtrack',
    title: 'JobTrack',
    meta: 'Personal project · Job application tracking platform',
    problem: 'Job hunting means dozens of applications across sites, and spreadsheets stop working once the list gets long.',
    did: [
      'Designed and built a responsive job-tracking site with HTML, CSS, JavaScript and React concepts.',
      'Implemented interactive search, filtering and application status tracking.',
      'Focused on a clean information hierarchy so the next action is always obvious.',
    ],
    // TODO(Harry):补结果,比如自己用它追踪了多少份申请
    result: 'TODO: add how you used it and what it improved.',
    tags: ['HTML/CSS', 'JavaScript', 'React', 'Information architecture'],
    // TODO(Harry):填 GitHub 或在线地址
    links: [],
  },
};

/** 软木板上的"制作过程":每组一张改前、一张改后,图在 public/process/ */
export const PROCESS = [
  {
    id: 'clouds', title: 'Clouds: pixelated → painted',
    caption: 'A 6752px painting was shrunk 10× on the GPU without mipmaps, so brushstrokes turned into pixel blocks. '
      + 'I pre-scaled the art, split it into two clouds, and generated a daylight version so noon clouds aren\'t sunset-orange.',
  },
  {
    id: 'window', title: 'Window: a picture → a window that opens',
    caption: 'The window scene now zooms into the actual window from the room art. I keyed out the glass with OpenCV, '
      + 'cut the sashes out, and rotate them on their hinges with my own perspective projection on a subdivided mesh.',
  },
  {
    id: 'fire', title: 'Fire: particles → GLSL shader',
    caption: 'Orange particle blobs became a domain-warped noise shader posterized into five cel-shaded bands with a dark rim, '
      + 'so it matches the inked art. Logs, ember cracks, flickering firelight and procedural crackle sound came with it.',
  },
];
