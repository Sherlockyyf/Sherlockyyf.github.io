# yifanyuan.com · 袁一帆个人主页

纯静态网站（HTML + CSS + 少量 JS），无需构建，中英文双语，可直接部署到 GitHub Pages。

## 文件结构

```
index.html            主页（页面框架；里面的内容由 data/ 生成）
data/home.json        个人信息、简介、研究方向、经历、科研项目、学术服务、页脚
data/news.json        最新动态
data/publications.json 论文
data/lab.json         实验室网站独有的内容：简介、MUSE 释义、负责人简介、成员、联系方式
admin/                登录页（index.html）和网页编辑器（editor.js、render.js 等）
404.html              404 页面
CNAME                 自定义域名 yifanyuan.com（GitHub Pages 用）
.nojekyll             告诉 GitHub Pages 不要用 Jekyll 处理
robots.txt / sitemap.xml
assets/css/style.css  样式
assets/js/main.js     语言切换、论文列表切换、手机菜单
assets/fonts/         标题字体（已内置，国内访问不依赖 Google Fonts）
images/yifan-yuan.jpg 个人照片（原图尺寸，无边框）
images/muse-logo.png  MUSE Lab 图标（原版 logo 去背景，只保留 M 图形）
images/papers/        论文配图（各论文 PDF 中的框架图；后台上传的配图也放在这里）
images/logos/         深大、复旦校徽，腾讯、商汤徽标
lab/                  MUSE Lab 实验室网站：index.html（页面框架，内容由 data/ 生成）、lab.css（样式）、lab.js（交互）
```

## 本地预览

直接双击 `index.html` 即可在浏览器里打开。

## 在网页上直接修改内容

网站上线后打开 `https://yifanyuan.com/admin/`，用 GitHub 令牌登录（登录页有三步说明），会直接进入主页的编辑模式。以后在这台设备上打开主页，左下角会出现“✎ 编辑页面”按钮，访客看不到它。

- **文字**：点一下就能在原位置修改，个人简介、姓名、职位、签名、标语、栏目标题、研究方向、实验室介绍、动态和论文里的文字都可以。选中文字后可以加粗、加链接；Enter 完成，Esc 取消。
- **中英文**：改的是当前显示的语言；点底部的“中文 / EN”切换后，再改另一种语言。
- **照片**：点照片换一张，会自动压缩。
- **列表**：联系方式、简介段落、动态、论文、经历、科研项目、此前的项目、学术服务、页脚链接。
  - 栏目标题右边的“＋ 添加…”用来新增。
  - 鼠标移到某一条上，右上角会出现“编辑 / ↑ / ↓ / 删除”。“编辑”打开右侧面板，所有字段（中英文、日期、图标、链接、Logo 等）都在里面，左边的页面会跟着实时变化。
- **论文**：
  - 在面板里粘贴 arXiv 链接或 DOI，会自动填好标题、作者和链接；也可以上传 PDF。
  - 选一张研究方向卡片，会自动生成标签。
  - 打开“代表性论文”后上传框架图（自动压缩到 1400 像素宽），再写中英文简介。
  - 新增论文后，可以一键写一条对应的动态。
- **研究方向卡片**：标题、介绍、印章字都能改。卡片底部的论文标签在对应论文的面板里设置。
- **Google Scholar 等链接**：在侧栏点“＋ 添加联系方式”，图标选 Google Scholar。
- **底部编辑栏**：撤销、预览（隐藏编辑标记，看最终效果）、放弃修改、**发布到网站**、退出。发布时所有修改合成一次提交，约 1 分钟后网站更新，页脚的“最后更新”会自动改成当月。
- **修改记录和冲突**：每次发布都记录在 GitHub 仓库的提交历史里，改错了可以在 GitHub 上恢复。如果在另一台设备上发布过，编辑器会提示先重新载入，不会覆盖那边的修改。
- **实验室网站同步更新**：实验室网站上的动态、研究方向和论文与主页用的是同一份数据，在主页编辑器里发布时，`lab/index.html` 会在同一次提交里一起更新。动态面板里有“也显示在实验室网站上”的开关，个人经历类的动态（比如博士毕业）可以关掉。
- **令牌**：只保存在自己设备的浏览器里，有效期一年，过期后照登录页的步骤重新生成。登录页不会被搜索引擎收录。

编辑器改的是 `data/` 里的三个 JSON 文件，并据此重新生成 `index.html` 和 `lab/index.html` 里的内容（在 `<!-- 名称:start -->` 和 `<!-- 名称:end -->` 标记之间，这部分不要手动改）。想跳过编辑器、直接改 JSON 时，改完在项目文件夹运行 `node tools/render_site.js` 重新生成两个页面。

## 实验室网站（lab/）

地址 `https://yifanyuan.com/lab/`，从上到下：首屏（五线谱、音符、水彩画笔的互动背景，最新一条动态）、实验室简介（含 MUSE 四个字母的释义）、研究方向、论文（代表性论文分页展示框架图和简介，全部论文按年份排列、可按研究方向筛选）、最新动态、团队成员、联系我们。

- 动态、研究方向卡片、论文：和主页共用数据，在主页编辑器里改，发布时自动同步。
- 简介、MUSE 释义、负责人简介和链接、成员、联系方式：在 `data/lab.json` 里，改完运行 `node tools/render_site.js`。
- 负责人的姓名、职位和照片用的是主页 `data/home.json` 里的个人信息。
- 加成员：在 `data/lab.json` 的 `members` 里加一条，`group` 填 `phd`（博士生）、`master`（硕士生）、`undergrad`（本科生）或 `alumni`（毕业生），有人的组才会显示。照片放在 `images/people/`，可以不填，不填时显示姓氏。

  ```json
  { "group": "master", "name": { "zh": "张三", "en": "San Zhang" }, "since": "2025", "photo": "images/people/zhang-san.jpg",
    "topic": { "zh": "可控图像编辑", "en": "Controllable image editing" }, "url": "" }
  ```

- 声音：音符跳起、拨动五线谱、点击时会发出柔和的音符声（五声音阶，越靠上音越高）。浏览器要求先点一下页面才允许出声；右上角的喇叭按钮可以静音，选择会被记住。

## 编辑器以外的部分

下面这些直接改文件：

- 顶部导航文字、语言按钮、MUSE Lab 卡片的图形和按钮：`index.html` 里标记之外的部分。中英文成对出现（`<span class="en">…</span><span class="zh">…</span>`），两份都要改。
- 网页标题和搜索引擎描述：`index.html` 的 `<head>`。
- 研究方向卡片的配色：CSS 的 `.theme-card--visual / --trust / --affect`（实验室网站是 `lab/lab.css` 里的 `.dir--visual / --trust / --affect`）。
- 实验室网站的导航、首屏文字和栏目标题：`lab/index.html` 里标记之外的部分。

访问 `https://yifanyuan.com/?lang=zh` 或 `?lang=en` 可以直接打开指定语言；不带参数时按访客浏览器语言自动选择，访客手动切换后会被记住。

## 配色与动效

- 配色取自照片背景的灰蓝色 `#9ea8be`，在 `assets/css/style.css` 顶部的 `:root` 里统一修改（`--accent` 是链接色，`--photo` 是照片原色）。
- MUSE Lab 卡片和会议名标签用 logo 的藏青 `--muse-navy`、天蓝 `--muse-sky`、橙色 `--muse-orange`；研究方向三张卡片用低饱和的雾蓝（视觉）、灰绿（可信）、浅粉（情感）。
- 个人主页动效：内容随滚动渐次浮现、研究方向的书法印章“盖章”出现、卡片悬停上浮与配图放大、卡片跟随鼠标的柔光、照片随鼠标轻微倾斜、MUSE Lab 卡片的水彩与音符漂浮、标语关键词的荧光笔划出、点击论文标签跳转并高亮、顶部阅读进度条、回到顶部按钮。
- 实验室网站首屏：标题“MUSE”有缓慢流动的光泽；页面载入时一支水彩笔在标题后面写出一个柔和的“M”，结尾拖出一道渐细的弧线；鼠标移动留下彩色水彩笔触（笔迹会顺滑成弧线），划过五线谱会拨动琴弦并弹出音符，靠近音符会让它跳起来，点击会溅出颜料和一串音符，同时发出柔和的音符声；没人操作时会有“隐形画笔”自己作画。首屏滚出屏幕后动画自动暂停。
- 实验室网站其他部分：栏目标题下水彩笔触划出、内容随滚动浮现、研究方向印章“盖章”、卡片悬停上浮与跟随鼠标的柔光、代表性论文切换、论文按方向筛选、顶部导航随滚动变成磨砂玻璃并标出当前栏目。
- 系统开启“减少动态效果”时，所有动画和声音自动关闭，内容直接显示。

## 部署到 GitHub Pages（绑定 yifanyuan.com）

1. 登录 GitHub，新建一个 **Public** 仓库（名字随意，例如 `homepage`）。
2. 进入仓库，`Add file → Upload files`，把本文件夹里的**全部内容**拖进去（包括 `CNAME` 和 `.nojekyll`），点 `Commit changes`。
3. `Settings → Pages`：Source 选 `Deploy from a branch`，Branch 选 `main`、目录选 `/ (root)`，保存。
4. 同一页的 `Custom domain` 填 `yifanyuan.com` 并保存（仓库里已有 CNAME 文件，通常会自动填好）。
5. 到购买域名的平台（阿里云 / 腾讯云 / Namecheap 等）的 DNS 解析里添加记录，并删除冲突的默认记录（如停放页、URL 转发）：

   | 主机记录 | 类型 | 记录值 |
   |---|---|---|
   | `@` | A | `185.199.108.153` |
   | `@` | A | `185.199.109.153` |
   | `@` | A | `185.199.110.153` |
   | `@` | A | `185.199.111.153` |
   | `www` | CNAME | `你的GitHub用户名.github.io` |

   （可选 IPv6：`@` 的 AAAA 记录 `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`）

6. 解析生效后（几分钟到几小时），回到 `Settings → Pages`，勾选 **Enforce HTTPS**。
7. 建议在 GitHub 账号 `Settings → Pages → Add a domain` 里验证域名，防止被他人占用。
8. （可选）在 `admin/config.js` 里把 `repo` 填成 `你的GitHub用户名/仓库名`，登录页就会自动填好仓库。

以后改内容：在主页的编辑模式里改；编辑器以外的部分在 GitHub 网页上直接编辑文件并提交。两种方式都是约 1 分钟后网站自动更新。

> GitHub Pages 服务器在境外，使用自己的域名**不需要 ICP 备案**。若以后想换到阿里云 OSS、腾讯云 COS 等国内服务器以提升国内访问速度，绑定自定义域名需要先完成备案。

## 致谢

版式参考 [AcademicPages](https://github.com/academicpages/academicpages.github.io) 与 [WowPage](https://github.com/WD7ang/WowPage)。
字体：Inter、Fraunces、马善政毛笔楷书 Ma Shan Zheng（均为 SIL OFL 1.1），许可证见 `assets/fonts/`。
毛笔字体只内置了主页和实验室网站的标题、签名、印章里用到的约 110 个字（文件仅 38 KB）；新增中文标题后需要重新生成字体子集（`tools/build_fonts.py`），否则新增的字会用系统楷体显示。
