# Archify Visual Editor

**Local-first, dependency-light visual editing for Archify architecture diagrams.**

> Community extension for the existing Archify CLI. The official Archify HTML remains
> the source of truth for final presentation and export; this project adds a separate
> editor for changing the underlying JSON. Not an official Archify product.

## What's new compared with the original Archify viewer?

| Capability | Added by this project |
| --- | --- |
| Drag nodes on a visual canvas | Move and reposition architecture components with the mouse |
| Edit properties | Change node names, descriptions, types, coordinates, and sizes |
| Edit graph edges | Create, delete, relabel, or redirect connections |
| Manage descriptions | Add, edit, and remove information cards |
| Undo / redo | Browser-session history and zoom/pan controls |
| **Same connections as official HTML** | Ask **Archify's renderer** for the exact orthogonal paths, corners, and label coordinates; no alternate straight-line routing |
| Safe persistence | Reject invalid candidates before overwriting JSON; create timestamped backups |
| Verified export | Run original Archify `validate`, `deliver`, `check`, and `browser-check` through `finalize` |
| Security | Loopback-only HTTP listener with random local URL and same-origin save protection |

### Exact route parity

For example, when a connection goes from a sorting state machine to a packaging state
machine, the editor draws the **same right → down → left-entry route** as the generated
Archify HTML. After node dragging, the editor requests new official routes, rather
than approximating with diagonal arrows. If routing fails, it refuses to show a
misleading fallback route.

## What's new in v0.2 — Manual layout

- **Canvas bounds**: moving a node above or left of the zero-origin canvas clamps it to a valid positive position; right/bottom overflow expands `meta.viewBox` when necessary. In-range layouts keep the original dimensions and edge routes.
- **Multi-select, alignment & distribution**: Ctrl-click several nodes, then use left/right/top/bottom alignment, horizontal/vertical centering, or even spacing for three or more nodes. Optional 24px grid snapping.
- **Manual routing**: choose each edge's departure/arrival side, auto/straight/orthogonal route, edit `via` points or `labelAt`, and drag orange waypoint handles directly. Reset an edge to automatic routing when desired.
- **No vanishing arrows**: if the renderer rejects an intermediate manual layout, show the most recent valid paths as dimmed dashed *reference* lines, never as a falsely verified final preview.
- **Quality options**: Showcase remains the default; Standard is available for dense layouts. Both still enforce Archify validation, so certain colliding labels or invalid waypoints must be corrected before saving.
- **Browser UI regression test**: covers boundary correction with valid JSON/HTML output, alignment, waypoint controls and edge preservation.

## Requirements

- Node.js 18+ (tested on Windows with Node.js 24)
- A separately installed **Archify 3.0.x** Skill / CLI
- An Archify **architecture**, schema v1 `candidate.json` diagram
- A modern desktop browser (Chrome or Edge recommended)

No npm install or third-party npm dependencies are needed for this editor.

## Quick start (Windows Git Bash)

Clone this repository or copy it to your computer. Then set the Archify CLI path and
run the editor **from the directory of the diagram's project**:

```bash
export ARCHIFY_CLI="D:/ShunCode-Skills/<your-skill-directory>/archify/bin/archify.mjs"
cd "D:/my-architecture-project"
node "D:/archify-visual-editor/editor/serve.mjs" \
  ".archify/architecture-my-app/candidate.json"
```

Replace both installation paths and the example diagram path with your own locations.
Open the `http://127.0.0.1:<port>/<random-token>/` URL printed in the terminal.
Press **Ctrl+C** in that terminal to stop the local server.

If you copy this `editor/` folder into the installed Archify Skill next to `bin/`,
`ARCHIFY_CLI` is optional because the editor can find `../bin/archify.mjs` automatically.

### Usage

To align, Ctrl-click several nodes and use the alignment bar. To control a route, click an edge and edit its side/route/waypoint/label fields, or drag the orange control circles. If a provisional layout cannot be rendered, prior lines remain dim and dashed; a valid Archify result is always required before saving.


1. Click a node to edit labels and properties in the right sidebar.
2. Drag nodes to reposition; choose **Connect nodes** to create a connection by clicking its endpoints.
3. Select a connection to rename, redirect, or delete it.
4. Use **Export JSON Draft** at any time to save an offline draft.
5. Click **Save & Generate HTML** to validate, back up the JSON, and rebuild the original Archify HTML.

The editor uses a separate interactive visual theme. Exact connection geometry and
label placement come from Archify, while the canonical HTML retains its own styling,
exploration, and export UI.

## 中文使用说明

**v0.2 新增：** Ctrl 多选节点、左/右/上/下对齐、水平/垂直居中、水平/垂直等间距分布、24px 网格吸附。可自由调整节点摆放，左上越界会被限制到合法坐标，右下越界则扩展视图。选中箭头后可设置起止边和走线模式、编辑 `via` 折点或拖动橙色圆点，也可设置标签坐标。未通过临时渲染时保留虚线参考线路，不再整张图断线；保存仍需通过原版 Archify 校验。



这是一个给 **Archify 架构图增加鼠标可视化编辑能力**的独立扩展项目，并不是
Archify 官方版本。**原版 Archify CLI 仍然需要单独安装。**

新增功能包括：拖动节点、编辑模块名称/描述、增加或删除连线、修改连线文字、
编辑说明卡片、撤销/重做，以及导出 JSON 草稿和校验后保存。

**重要改进：编辑器直接调用原版 Archify 渲染器获取全部连线路径与标签位置**，
因此连线会与最终 HTML 的正交走线、转弯和箭头落点一致，而不是自己计算斜线。
拖动节点期间临时隐藏旧连线，松开后更新。若路由失败，会明确报错。

启动时在 Bash 中设置 `ARCHIFY_CLI` 为实际的 `bin/archify.mjs` 路径；
在工程目录运行 `node <本仓库>/editor/serve.mjs <candidate.json>`，
浏览器打开终端显示的本地地址。点击“保存并生成 HTML”时会先校验 JSON，
再进行备份并调用 Archify 原版完整交付检查。

## Tests

Use a real Archify architecture candidate as the fixture. Tests work on a **temporary copy**
so the original project files remain untouched.

```bash
export ARCHIFY_CLI="D:/path/to/archify/bin/archify.mjs"
node editor/test-editor.mjs "D:/path/to/project/.archify/diagram-folder/candidate.json"
```

Checks include route parity against the real generated HTML, moved-node rerouting,
browser SVG rendering (when Chrome/Edge is installed), cross-origin rejection,
stale-version protection, invalid-candidate rejection, backup, and verified HTML output.

## Scope & safety

- **Supported now:** `architecture` / `schema_version: 1` candidates.
- **Not supported yet:** workflow / sequence / dataflow / lifecycle; arbitrary
  collaborative editing; hosted servers; editing the finalized HTML directly.
- Local server binds only to `127.0.0.1`. **Keep its private URL secret.**
- Save runs Showcase validation first and leaves original files untouched if validation fails.
  If final delivery fails later, the editor preserves the backup and shows the error.
- No telemetry or third-party browser dependencies are included.

## Architecture

```text
Browser visual editor (editor/editor.html)
  ├─ Edit nodes/edges/cards in memory; undo/redo
  ├─ POST /api/routes → official Archify render → canonical SVG paths + label positions
  └─ POST /api/save → Showcase validation → JSON backup → official Archify finalize
Node.js localhost server (editor/serve.mjs)
  └─ Route extraction adapter (editor/route-preview.mjs)
        └─ Existing external Archify CLI (not bundled)
```

## License and acknowledgment

The editor code is released under the [MIT License](LICENSE).
Archify is separately MIT-licensed and is credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The editor is a community extension; it is not endorsed by or affiliated with the
Archify authors.
