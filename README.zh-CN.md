# Puppet Parts Studio

[English](README.md) | 简体中文

一个纯前端素材处理工作台，用于把立绘、图片或 PSD 文件拆分成可用的零件图层，也能把多个透明素材自动排布合并。图片解析、拆分、合并与导出全部在浏览器本地完成，不会上传到服务器。

## 界面预览

<table>
  <tr>
    <td align="center"><img src="img/SnowShot_2026-09-06_15-25-49.png" width="400" alt="Merge Assets" /></td>
    <td align="center"><img src="img/SnowShot_2026-09-06_15-24-37.png" width="400" alt="Split & Distribute" /></td>
  </tr>
  <tr>
    <td align="center"><img src="img/SnowShot_2026-09-06_15-25-07.png" width="400" alt="PSD Layer Extraction" /></td>
    <td align="center"><img src="img/SnowShot_2026-09-06_15-24-47.png" width="400" alt="Extract All Parts" /></td>
  </tr>
</table>

## 适用场景

 **Wallpaper Engine 动态壁纸**，拆分后的透明 PNG 可以直接用来做视差、木偶拼接、呼吸或旋转效果。
 **Live2D / Spine 骨骼动画**，可以用它从立绘原图快速拆出可绑定的零件图层，省去手动描边和逐层裁切的时间。
 **Adobe After Effects** 做动效合成，批量导出的分层 PNG 可以直接拖入时间轴。
 **Unity / Godot / Unreal** 开发游戏，自动排布的合并图和 JSON 坐标数据可以直接当作 Sprite Atlas 使用。
它也适合作为 **Photoshop「图层导出为文件」** 的轻量替代——无需打开 PS 就能批量导出 PSD 图层为 PNG。

## 功能

### 拆分分配

- 上传或拖入 PNG / JPG / WEBP 等图片。
- 自动识别透明背景中的连通零件。
- 可按份数输出为多个图层。
- 支持面积均衡、数量均衡、位置分带三种分组方式。
- 支持"紧凑打包"与"原位裁剪"两种输出布局。
- 可预览单个图层、下载全部 PNG，以及导出 JSON 数据清单。

### 拆分零件

- 逐个识别并导出图片中检测到的零件。
- 可设置最小零件面积，过滤噪点和小碎片。
- 支持紧凑打包与原位裁剪布局。
- 可打包下载全部零件与数据清单。

### PSD 拆分零件

- 支持上传或拖入 `.psd` / `.psb` 文件。
- 读取 PSD 原始图层，并将图层导出为独立 PNG。
- 可选择是否包含隐藏图层。
- 紧凑打包模式会裁掉空白；原位裁剪模式保留原图尺寸与图层坐标。
- 优先由可见图层重建预览，并保留 PSD 内的文件夹结构。

### 合并素材

- 支持选择多个图片文件，或导入整个文件夹。
- 自动裁切透明边缘并进行近方形排布。
- 可调整零件间距、大小倍数，并可开启自动旋转。
- 支持下载合并图、打包下载素材，以及导出排布数据。

### 界面与安全

- 提供明暗主题切换。
- 所有素材仅在当前浏览器中处理，适合处理本地或未公开资源。

## 环境要求

- Node.js 18 或更高版本，推荐使用 LTS 版本。
- 现代浏览器，例如最新版 Chrome、Edge、Firefox 或 Safari。
- "选择文件夹"功能在支持 File System Access API 的浏览器中体验最佳；不支持的浏览器会回退为选择文件。

## 启动方式

有两种方式启动项目：

### 方式一：双击启动（Windows 推荐）

双击项目根目录下的 `start.cmd` 文件即可。脚本会自动完成以下操作：

1. 检查 `node_modules` 是否存在，不存在时自动执行 `npm install` 安装依赖。
2. 检查 5173 端口是否已有服务在运行，有则直接打开浏览器。
3. 首次启动时自动打开浏览器访问页面。

使用完毕后，关闭命令行窗口即可停止服务。

### 方式二：命令行手动启动

如果需要手动控制启动过程，在项目根目录执行：

```bash
npm install
```

安装完成后执行：

```bash
npm run dev
```

默认启动 Vite 开发服务器。终端会显示本地访问地址，通常是：

```text
http://127.0.0.1:5173/
```

## 构建生产版本

```bash
npm run build
```

构建结果会输出到 `dist/` 目录。

## 本地预览构建结果

```bash
npm run preview
```

## 项目结构

```text
.
├─ src/
│  ├─ index.html        # 页面结构与四个功能面板
│  ├─ main.js           # 拆分、PSD 解析、合并、导出与交互逻辑
│  └─ style.css         # 界面样式与主题
├─ dist/                # 构建产物
└─ package.json
```
