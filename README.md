# 全球旅行指南

一个可以旋转、缩放的三维地球。点选国家，打开这一站的城市、景点、最佳时节和旅行贴士。界面是简体中文，数据都在本地，不需要后端，也不需要地图密钥。

已写好 20 个目的地：中国、日本、泰国、印度、土耳其、法国、意大利、英国、西班牙、希腊、冰岛、埃及、摩洛哥、南非、美国、墨西哥、巴西、秘鲁、澳大利亚、新西兰。没有收入指南的国家仍可点选，面板会显示「指南即将上线」。

## 本地运行

需要 Node.js 18 或更新版本。

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:4731/global-travel-guide/](http://127.0.0.1:4731/global-travel-guide/)。开发服务器和正式构建都挂在这个子路径上，和 GitHub Pages 项目站点一致。

拖拽地球旋转，滚轮或双指缩放，点击国家或金色标记。顶部搜索框可以跳到国家、城市或景点。

检查数据是否完整：

```bash
npm run validate
```

## 构建与部署

```bash
npm run build
npm run preview
```

`dist/` 是纯静态文件。`vite.config.js` 里的 `base` 是 `/global-travel-guide/`，脚本、样式、国界、指南和地表贴图都会从该子路径加载。

线上地址是 [https://duimalves94-beep.github.io/global-travel-guide/](https://duimalves94-beep.github.io/global-travel-guide/)。推送到 `main` 后，`.github/workflows/deploy.yml` 会执行 `npm ci` 和 `npm run build`，再用 `actions/upload-pages-artifact` 与 `actions/deploy-pages` 发布到 GitHub Pages。仓库的 Pages 来源要选 GitHub Actions。

本地按正式产物、并带上子路径检查：

```bash
npm run build
mkdir -p /tmp/gh-pages/global-travel-guide
cp -a dist/. /tmp/gh-pages/global-travel-guide/
python3 -m http.server 4759 --directory /tmp/gh-pages
```

然后打开 [http://127.0.0.1:4759/global-travel-guide/](http://127.0.0.1:4759/global-travel-guide/)。

## 如何添加一个国家

1. 打开 `public/data/guides.json`，在 `countries` 数组末尾加一个对象。
2. `iso2` 和 `iso3` 必须能对上 `public/data/countries.geojson`。例如法国是 `FR` / `FRA`。这份国界里，法国和挪威的原始 `ISO_A2` 是 `-99`，文件里已经改成了常用代码。
3. 每个国家写 2 到 4 个城市，每个城市至少 2 个景点。`lat` 是纬度，`lng` 是经度，东经和北纬为正。
4. 保存后刷新页面。底部芯片、搜索和地球上的标记会一起出现，不用改别的文件。
5. 再跑一次 `npm run validate`。

```json
{
  "iso2": "KR",
  "iso3": "KOR",
  "name": "韩国",
  "nameEn": "South Korea",
  "aliases": ["Korea"],
  "continent": "亚洲",
  "tagline": "一句话辨认这个国家",
  "summary": "两到三句介绍，写清楚为什么值得去、和邻近目的地有什么不同。",
  "bestTime": "最适合出发的月份，以及需要避开的季节。",
  "stay": "7–10 天",
  "camera": { "lat": 36.5, "lng": 127.8, "altitude": 1.25 },
  "tips": [
    "一条具体的交通建议。",
    "一条关于预约或闭馆日的建议。",
    "一条当地才会碰到的小事。"
  ],
  "cities": [
    {
      "id": "seoul",
      "name": "首尔",
      "nameEn": "Seoul",
      "lat": 37.5665,
      "lng": 126.978,
      "blurb": "这座城市怎么安排才不会只剩打卡。",
      "bestTime": "如果和全国差异大，就写在城市上；否则可以省略。",
      "attractions": [
        {
          "id": "gyeongbokgung",
          "name": "景福宫",
          "nameEn": "Gyeongbokgung",
          "aliases": ["景福宫"],
          "lat": 37.5796,
          "lng": 126.977,
          "desc": "两句以内：它是什么、什么时候去更合适、有没有必须提前知道的规矩。"
        }
      ]
    }
  ]
}
```

`id` 用在网址哈希里，例如 `#KR/seoul/gyeongbokgung`，同一国家内不要重复。`camera` 是点开国家时飞到的位置，`altitude` 越小离地面越近。

## 数据从哪来

- 国界：Natural Earth 1:110m 国家界，公有领域。中文名来自其中的 `NAME_ZH`，已收成只保留几何和少量字段的 `public/data/countries.geojson`。
- 地表与地形：NASA Blue Marble 及地形晕渲，随 three-globe 示例提供。
- 云层：globe.gl 云层示例所用纹理，源自 [webgl-earth](https://github.com/turban/webgl-earth)，本站做了缩小。

旅行文字是供安排行程的简介，不是实时票务。面板里也写了：开放时间和票价出发前再核对。

## 技术栈

Vite、原生 JavaScript、[globe.gl](https://github.com/vasturiano/globe.gl) / Three.js。没有账号系统，也没有构建期以外的服务。
