import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadEnv } from "./load-env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

loadEnv();

const IMAGE_EXTENSIONS = new Set([
	".avif",
	".gif",
	".jpeg",
	".jpg",
	".png",
	".webp",
]);

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.album) {
	printHelp();
	process.exit(args.help ? 0 : 1);
}

const albumId = args.album;
const sourceDir = path.resolve(
	rootDir,
	args.source || `public/images/albums/${albumId}`,
);
const infoPath = path.resolve(
	rootDir,
	args.info || `public/images/albums/${albumId}/info.json`,
);
const publicBase = stripTrailingSlash(
	args.publicBase || process.env.R2_PUBLIC_BASE || "https://img.wanxiao.ovh",
);
const remote = normalizeRemote(args.remote || process.env.R2_REMOTE || "mizuki-r2");
const bucket = args.bucket || process.env.R2_BUCKET || "mizuki-images";
const destPrefix = stripSlashes(
	args.destPrefix || process.env.R2_DEST_PREFIX || `images/albums/${albumId}`,
);
const namePrefix = args.prefix || albumId;
const date = args.date || new Date().toISOString().split("T")[0];
const tag = args.tag || albumId.toUpperCase();
const mode = args.mode || "append";
const coverMode = args.cover || "uploaded-cover";

if (!["append", "replace", "metadata-only"].includes(mode)) {
	fail(`Unsupported --mode "${mode}". Use append, replace, or metadata-only.`);
}

if (!["uploaded-cover", "first-photo", "keep"].includes(coverMode)) {
	fail(
		`Unsupported --cover "${coverMode}". Use uploaded-cover, first-photo, or keep.`,
	);
}

if (!fs.existsSync(sourceDir)) {
	fail(`Source directory does not exist: ${sourceDir}`);
}

if (!fs.existsSync(infoPath)) {
	fail(`Album info.json does not exist: ${infoPath}`);
}

if (!commandExists("rclone")) {
	fail("rclone is required but was not found in PATH.");
}

const uploadItems = await prepareUploadItems(sourceDir, namePrefix);

if (uploadItems.photos.length === 0) {
	fail(`No photos found in ${sourceDir}`);
}

if (args.dryRun) {
	printPlan(uploadItems);
	process.exit(0);
}

if (mode !== "metadata-only") {
	if (!args.overwrite) {
		await assertNoPublicUrlCollisions(uploadItems);
	}
	await stageAndUpload(uploadItems);
}

const updatedInfo = await updateAlbumInfo(uploadItems);
await verifyPublicUrls(updatedInfo, uploadItems);

console.log(`\n完成：${albumId} 相册已更新`);
console.log(`照片数量：${updatedInfo.photos.length}`);
console.log(`封面：${updatedInfo.cover}`);

function parseArgs(rawArgs) {
	const parsed = {};

	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (!arg.startsWith("--")) continue;

		const key = toCamelCase(arg.slice(2));
		const next = rawArgs[i + 1];

		if (!next || next.startsWith("--")) {
			parsed[key] = true;
			continue;
		}

		parsed[key] = next;
		i++;
	}

	return parsed;
}

function toCamelCase(value) {
	return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp() {
	console.log(`
Usage:
  pnpm upload-album-r2 -- --album eva
  pnpm upload-album-r2 -- --album eva --source /path/to/images --prefix eva-extra

Options:
  --album <id>             Album folder/id under public/images/albums (required)
  --source <dir>           Directory of images to upload
  --info <file>            Album info.json path
  --prefix <name>          R2 object/id prefix, default: album id
  --mode <mode>            append (default), replace, or metadata-only
  --cover <mode>           uploaded-cover (default), first-photo, or keep
  --date <YYYY-MM-DD>      Date written to new photo metadata
  --tag <tag>              Tag written to new photo metadata
  --remote <name>          rclone remote, default: mizuki-r2
  --bucket <name>          R2 bucket, default: mizuki-images
  --dest-prefix <path>     R2 object prefix, default: images/albums/<album>
  --public-base <url>      Public image domain, default: https://img.wanxiao.ovh
  --overwrite              Allow uploading over existing public object URLs
  --dry-run                Show the plan without uploading or editing

Environment overrides:
  R2_REMOTE, R2_BUCKET, R2_DEST_PREFIX, R2_PUBLIC_BASE
`);
}

async function prepareUploadItems(dir, prefix) {
	const files = fs
		.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
		.sort((a, b) =>
			a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
		);

	const coverFile = files.find((file) => /^cover\./i.test(file));
	const photoFiles = files.filter((file) => file !== coverFile);
	const photos = [];

	for (let index = 0; index < photoFiles.length; index++) {
		const file = photoFiles[index];
		const source = path.join(dir, file);
		const ext = path.extname(file).toLowerCase();
		const number = String(index + 1).padStart(2, "0");
		const name = `${prefix}-${number}${ext}`;
		const dimensions = await getImageDimensions(source);

		photos.push({
			file,
			source,
			objectName: name,
			id: `${prefix}-${number}`,
			url: `${publicBase}/${destPrefix}/${name}`,
			width: dimensions.width,
			height: dimensions.height,
		});
	}

	let cover = null;
	if (coverFile) {
		const source = path.join(dir, coverFile);
		const ext = path.extname(coverFile).toLowerCase();
		const name = `${prefix}-cover${ext}`;
		const dimensions = await getImageDimensions(source);

		cover = {
			file: coverFile,
			source,
			objectName: name,
			id: `${prefix}-cover`,
			url: `${publicBase}/${destPrefix}/${name}`,
			width: dimensions.width,
			height: dimensions.height,
		};
	}

	return { cover, photos };
}

async function getImageDimensions(filePath) {
	const metadata = await sharp(filePath).metadata();
	return {
		width: metadata.width,
		height: metadata.height,
	};
}

function printPlan(uploadItems) {
	console.log("Dry run upload plan:");
	console.log(`Remote: ${remote}:${bucket}/${destPrefix}/`);
	if (uploadItems.cover) {
		console.log(`${uploadItems.cover.file} -> ${uploadItems.cover.url}`);
	}
	for (const photo of uploadItems.photos) {
		console.log(`${photo.file} -> ${photo.url}`);
	}
}

async function assertNoPublicUrlCollisions(uploadItems) {
	const items = [uploadItems.cover, ...uploadItems.photos].filter(Boolean);
	const collisions = [];

	for (const item of items) {
		const response = await fetch(item.url, { method: "HEAD" });
		if (response.ok) {
			collisions.push(item.url);
		}
	}

	if (collisions.length > 0) {
		fail(
			[
				"Target object URL already exists. Choose a different --prefix or pass --overwrite.",
				...collisions.slice(0, 10),
				collisions.length > 10
					? `...and ${collisions.length - 10} more`
					: "",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
}

async function stageAndUpload(uploadItems) {
	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "mizuki-r2-album-"));
	const items = [uploadItems.cover, ...uploadItems.photos].filter(Boolean);

	try {
		for (const item of items) {
			fs.copyFileSync(item.source, path.join(stagingDir, item.objectName));
		}

		const destination = `${remote}:${bucket}/${destPrefix}/`;
		const result = spawnSync(
			"rclone",
			[
				"copy",
				stagingDir,
				destination,
				"--transfers",
				"8",
				"--checkers",
				"8",
				"--s3-no-head",
				"--s3-no-head-object",
				"--ignore-checksum",
				"--low-level-retries",
				"2",
				"--retries",
				"2",
			],
			{ cwd: rootDir, stdio: "inherit" },
		);

		if (result.status !== 0) {
			fail(`rclone upload failed with status ${result.status}`);
		}
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

async function updateAlbumInfo(uploadItems) {
	const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
	const newPhotos = uploadItems.photos.map((photo) => ({
		id: photo.id,
		src: photo.url,
		alt: titleFromId(photo.id),
		title: titleFromId(photo.id),
		tags: [tag],
		date,
		width: photo.width,
		height: photo.height,
	}));

	info.mode = "external";

	if (coverMode === "uploaded-cover" && uploadItems.cover) {
		info.cover = uploadItems.cover.url;
	} else if (coverMode === "first-photo" && newPhotos[0]) {
		info.cover = newPhotos[0].src;
	} else if (!info.cover && newPhotos[0]) {
		info.cover = newPhotos[0].src;
	}

	if (mode === "replace") {
		const ids = new Set(newPhotos.map((photo) => photo.id));
		info.photos = [
			...(info.photos || []).filter((photo) => !ids.has(photo.id)),
			...newPhotos,
		];
	} else {
		const existingIds = new Set((info.photos || []).map((photo) => photo.id));
		info.photos = [
			...(info.photos || []),
			...newPhotos.filter((photo) => !existingIds.has(photo.id)),
		];
	}

	fs.writeFileSync(infoPath, `${JSON.stringify(info, null, "\t")}\n`);
	return info;
}

function titleFromId(id) {
	return id
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

async function verifyPublicUrls(info, uploadItems) {
	const urls = [
		info.cover,
		uploadItems.photos[0]?.url,
		uploadItems.photos.at(-1)?.url,
	].filter(Boolean);
	const uniqueUrls = [...new Set(urls)];

	for (const url of uniqueUrls) {
		const response = await fetch(url, { method: "HEAD" });
		if (!response.ok) {
			fail(`Public URL check failed: ${url} (${response.status})`);
		}
	}
}

function normalizeRemote(value) {
	return value.endsWith(":") ? value.slice(0, -1) : value;
}

function stripTrailingSlash(value) {
	return value.replace(/\/+$/, "");
}

function stripSlashes(value) {
	return value.replace(/^\/+|\/+$/g, "");
}

function commandExists(command) {
	const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
		stdio: "ignore",
	});
	return result.status === 0;
}

function fail(message) {
	console.error(`Error: ${message}`);
	process.exit(1);
}
