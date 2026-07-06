/**
 * 穿搭配置 —— 对应 design.md 表③
 * 占位阶段:换装 = 换颜色。
 * 换真实美术后:把 shirt/skirt/hair 换成贴图/动画前缀 key,
 * Hero.setOutfit 里从 setFillStyle 改成 setTexture / play 即可。
 */
export interface Outfit {
  name: string;
  shirt: number;
  skirt: number;
  hair: number;
}

export const OUTFITS: Outfit[] = [
  { name: '草原绿', shirt: 0xd6913c, skirt: 0x3f7f74, hair: 0x6b4226 },
  { name: '暮色蓝', shirt: 0xc4b48a, skirt: 0x4a5a8a, hair: 0x3a2c22 },
  { name: '野莓红', shirt: 0xe8d8b8, skirt: 0x9a4a4a, hair: 0x8a5a36 },
];
