# R2 相册图片上传流程

这个项目把相册图片上传到 Cloudflare R2 后，通过 `https://img.wanxiao.ovh` 作为公开图床域名访问。

## 默认配置

- rclone remote: `mizuki-r2`
- R2 bucket: `mizuki-images`
- 公开域名: `https://img.wanxiao.ovh`
- 对象路径: `images/albums/<album-id>/`
- 相册配置: `public/images/albums/<album-id>/info.json`

## 常用命令

上传某个相册目录里的本地图片，并追加到相册：

```bash
pnpm upload-album-r2 -- --album eva --prefix eva-local
```

上传下载目录里的新图，并指定对象名前缀：

```bash
pnpm upload-album-r2 -- --album eva --source /Users/wanxiao/Downloads/eva-new --prefix eva-new
```

先预览将要上传和生成的链接：

```bash
pnpm upload-album-r2 -- --album eva --source /path/to/images --prefix eva-new --dry-run
```

## 规则

- `cover.*` 会上传为 `<prefix>-cover.<ext>`，并默认设为相册封面。
- 其它图片按文件名自然排序，上传为 `<prefix>-01.<ext>`、`<prefix>-02.<ext>`。
- 脚本会把相册切到 `mode: "external"`，并把生成的公开链接写入 `photos`。
- 为避免误覆盖，目标公开链接如果已经存在，脚本会停止；确认要覆盖时加 `--overwrite`。
- 上传后会抽查封面、第一张、最后一张公开链接是否可访问。

## 可选参数

- `--mode append`: 默认，只追加不存在的 photo id。
- `--mode replace`: 用同 id 的新图片元数据替换旧项。
- `--cover keep`: 保留现有封面。
- `--cover first-photo`: 用第一张照片作为封面。
- `--date YYYY-MM-DD`: 指定新照片元数据日期。
- `--tag EVA`: 指定新照片标签。
- `--overwrite`: 允许上传覆盖同名 R2 对象。

## 环境变量覆盖

可以在 `.env` 中覆盖默认值：

```bash
R2_REMOTE=mizuki-r2
R2_BUCKET=mizuki-images
R2_PUBLIC_BASE=https://img.wanxiao.ovh
R2_DEST_PREFIX=images/albums/eva
```
