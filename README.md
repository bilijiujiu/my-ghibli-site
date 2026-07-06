# 風の小屋 — A Walkable Portfolio

吉卜力风可行走个人网站。三幕开场:远景标题 → zoom 推镜 → 换装 → WASD 室内。

## 本地运行
```bash
npm install
npm run dev        # http://localhost:5173
```

## 构建
```bash
npm run build      # 输出到 dist/
```

## 目录
- `design.md` — 设计文档(四张表),一切以它为准
- `src/config/` — 常量与穿搭配置
- `src/entities/Hero.ts` — 角色(占位小人,后续换 sprite)
- `src/scenes/` — 三幕场景
- `src/systems/dialog.ts` — 弹层(阶段 4 升级为 DOM)
- `public/img` `public/audio` — 美术与音频资源

## 调试
第三幕按 `(反引号)开调试模式:显示交互点范围圈、可行走区域,点击打印坐标。
