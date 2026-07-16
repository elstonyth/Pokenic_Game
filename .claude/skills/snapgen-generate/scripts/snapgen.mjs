#!/usr/bin/env node
// SnapGen (GeminiGen) API adapter — submit → poll → download. Zero deps.
// Auth: SNAPGEN_API_KEY env var (never printed). Docs: https://docs.snapgen.ai
//
//   node snapgen.mjs account
//   node snapgen.mjs image "prompt" --model nano-banana-2 [--aspect_ratio 3:2] [--resolution 2K] [--style Photorealistic] [--files a.png,b.png] [--file_urls u1,u2]
//   node snapgen.mjs gpt-image "prompt" [--mode low|medium|high] [--resolution 1K|2K|4K|8K|10K|12K] [--aspect_ratio 1:1] [--files ref.png]
//   node snapgen.mjs grok-image "prompt" [--mode SPEED|QUALITY] [--orientation landscape|portrait|square] [--num_result 1-8] [--files ref.png] [--ref_history <uuid>]
//   node snapgen.mjs meta-image "prompt" [--orientation landscape|portrait|square] [--num_result 1-4] [--files ref.png] [--ref_history <uuid>]
//   node snapgen.mjs video <veo|sora|grok|seedance|kling|meta> "prompt" --model <model> [--duration 8] [--resolution 720p] [--aspect_ratio 16:9] [--mode standard] [--ref_images a.png,https://…] ...
//   node snapgen.mjs extend <veo|grok|seedance|kling> "prompt" --ref_history <uuid> [--mode fast] [--duration N]
//   node snapgen.mjs storyboard '[{"prompt":"scene 1","duration":6,"mode":"custom"},...]' [--aspect_ratio landscape|portrait|square] [--resolution 480p|720p] [--files ...]
//     (scenes = JSON array, 2-10 scenes, <=45s total; scene N's last frame chains into scene N+1)
//   node snapgen.mjs status <uuid> | wait <uuid> | history [--filter_by image]
// Any extra --key value passes through as a form/query field.
// Flags: --dry-run (print request, send nothing)  --no-wait  --no-download  --out <dir>
import { openAsBlob } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.SNAPGEN_BASE || 'https://api.snapgen.ai';
const POLL_MS = Number(process.env.SNAPGEN_POLL_MS || 5000);
const TIMEOUT_MS = Number(process.env.SNAPGEN_TIMEOUT_MS || 15 * 60_000);

// Key: env var, else auto-load from a .env in cwd or the skill root — the key
// value must never appear in argv, logs, or output.
function loadKey() {
  if (process.env.SNAPGEN_API_KEY) return process.env.SNAPGEN_API_KEY;
  const skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  for (const dir of [process.cwd(), skillRoot]) {
    try {
      const m = readFileSync(join(dir, '.env'), 'utf8').match(
        /^\s*SNAPGEN_API_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m,
      );
      if (m) return m[1].trim();
    } catch {} // ponytail: no .env here — try the next candidate
  }
  return '';
}
const KEY = loadKey();

const VIDEO_PATHS = {
  veo: 'video-gen/veo',
  sora: 'video-gen/sora',
  grok: 'video-gen/grok',
  seedance: 'video-gen/seedance',
  kling: 'video-gen/kling',
  meta: 'video-gen/meta',
};

// --- arg parsing: positionals then --key value pairs (booleans: --dry-run etc.)
const argv = process.argv.slice(2);
const pos = [];
const opts = {};
const BOOLS = new Set(['dry-run', 'no-wait', 'no-download']);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (BOOLS.has(k)) opts[k] = true;
    else opts[k] = argv[++i];
  } else pos.push(a);
}
const [cmd, ...rest] = pos;
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!cmd)
  die(
    'usage: snapgen.mjs <account|image|gpt-image|grok-image|meta-image|video|extend|storyboard|status|wait|history> ... (see header comment)',
  );

const {
  'dry-run': dryRun,
  'no-wait': noWait,
  'no-download': noDownload,
  out: outDir = '.',
  ...fields
} = opts;

// Known closed enums (verified against the docs openapi.json, 2026-07).
// Warn-only typo guard before spending — the server stays authoritative.
const ENUMS = {
  image: {
    aspect_ratio: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    resolution: ['1K', '2K', '4K'],
    output_format: ['png', 'jpeg'],
  },
  'gpt-image': {
    aspect_ratio: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'],
    mode: ['low', 'medium', 'high'],
    resolution: ['1K', '2K', '4K', '8K', '10K', '12K'],
  },
  'grok-image': {
    orientation: ['landscape', 'portrait', 'square'],
    mode: ['SPEED', 'QUALITY'],
  },
  'meta-image': { orientation: ['landscape', 'portrait', 'square'] },
  'video:veo': {
    aspect_ratio: ['16:9', '9:16'],
    resolution: ['720p', '1080p'],
    mode_image: ['frame', 'ingredient'],
    duration: ['4', '6', '8', '10'],
  },
  'video:sora': {
    resolution: ['small', 'large'],
    aspect_ratio: ['landscape', 'portrait'],
  },
  'video:seedance': {
    aspect_ratio: ['16:9', '9:16', '1:1', '3:4', '4:3', '21:9'],
  },
  'video:grok': {
    aspect_ratio: ['landscape', 'portrait', 'square'],
    resolution: ['480p', '720p'],
    duration: ['6', '10', '15'],
  },
  'video:kling': {
    mode: [
      'standard',
      'professional',
      'professional_audio',
      'relax',
      'default',
    ],
  },
  'video:meta': { orientation: ['landscape', 'portrait', 'square'] },
  storyboard: {
    aspect_ratio: ['landscape', 'portrait', 'square'],
    resolution: ['480p', '720p'],
  },
};
{
  // Guard applies to generate commands only — extend endpoints have their own
  // param sets (e.g. extend kling/seedance mode defaults to "fast").
  const scope = cmd === 'video' ? `video:${rest[0]}` : cmd;
  for (const [k, allowed] of Object.entries(ENUMS[scope] ?? {})) {
    const v = fields[k];
    if (v !== undefined && !allowed.includes(String(v)))
      console.error(
        `warn: ${k}="${v}" is not a known ${scope} value (${allowed.join('|')}) — server may reject or coerce`,
      );
  }
}
if (!KEY && !dryRun)
  die(
    'SNAPGEN_API_KEY is not set. Set it in your environment first (never paste keys in chat).',
  );

async function api(method, path, { form, query } = {}) {
  const url = new URL(`${BASE}/uapi/v1/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  if (dryRun) {
    const shown = form
      ? Object.fromEntries(
          [...form.entries()].map(([k, v]) => [
            k,
            v instanceof Blob ? `<file>` : v,
          ]),
        )
      : (query ?? {});
    console.log(
      `[dry-run] ${method} ${url}\n${JSON.stringify(shown, null, 2)}`,
    );
    process.exit(0);
  }
  const res = await fetch(url, {
    method,
    headers: { 'x-api-key': KEY },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    die(
      `HTTP ${res.status} ${path}: ${JSON.stringify(data.detail ?? data).slice(0, 400)}`,
    );
  return data;
}

// Media keys: comma-split; local paths are blob-uploaded, but URL entries
// (veo/seedance accept URL strings) and bare UUIDs (grok video ref_images =
// history uuids) pass through as plain strings.
const UPLOAD_KEYS = new Set([
  'files',
  'ref_images',
  'ref_videos',
  'ref_audios',
]);
const isRemoteRef = (v) =>
  /^https?:\/\//i.test(v) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function buildForm(prompt, extra) {
  const form = new FormData();
  if (prompt) form.set('prompt', prompt);
  for (const [k, v] of Object.entries(extra)) {
    if (UPLOAD_KEYS.has(k))
      for (const f of v.split(',')) {
        const t = f.trim();
        if (isRemoteRef(t)) form.append(k, t);
        else form.append(k, await openAsBlob(t), basename(t));
      }
    else if (k === 'file_urls')
      for (const u of v.split(',')) form.append(k, u.trim());
    else form.set(k, v);
  }
  return form;
}

// Result URLs live in nested arrays (history detail) or top-level generate_result.
const resultUrls = (h) =>
  [
    ...(h.generated_image ?? []).map(
      (i) => i.file_download_url || i.image_url || i.image_uri,
    ),
    ...(h.generated_video ?? []).map((v) => v.video_url),
    ...(h.generated_audio ?? []).map((a) => a.file_download_url || a.audio_url),
    ...(h.generate_result ? [h.generate_result] : []),
  ].filter(Boolean);

async function waitDone(uuid) {
  const t0 = Date.now();
  for (;;) {
    const h = await api('GET', `history/${uuid}`);
    if (h.status === 2) return h;
    if (h.status === 3)
      die(`FAILED ${uuid}: ${h.error_code ?? ''} ${h.error_message ?? ''}`);
    if (Date.now() - t0 > TIMEOUT_MS)
      die(
        `TIMEOUT ${uuid} after ${TIMEOUT_MS / 1000}s (still status ${h.status}, ${h.status_percentage ?? '?'}%)`,
      );
    process.stderr.write(`  …${h.status_percentage ?? 0}%\r`);
    await new Promise((ok) => setTimeout(ok, POLL_MS));
  }
}

async function finish(job) {
  console.log(
    `job ${job.uuid} submitted (estimated_credit: ${job.estimated_credit ?? '?'})`,
  );
  if (noWait) return console.log(`poll with: snapgen.mjs wait ${job.uuid}`);
  const h = await waitDone(job.uuid);
  const urls = resultUrls(h);
  console.log(`DONE (used_credit: ${h.used_credit ?? '?'})`);
  for (const u of urls) console.log(u);
  if (!urls.length)
    console.log(
      '(completed but no media URL — inspect: snapgen.mjs status ' +
        job.uuid +
        ')',
    );
  if (!noDownload && urls.length) {
    await mkdir(outDir, { recursive: true });
    for (const [i, u] of urls.entries()) {
      const r = await fetch(u);
      if (!r.ok) {
        console.error(`download failed ${r.status}: ${u}`);
        continue;
      }
      const ext = extname(new URL(u).pathname) || '.bin';
      const file = join(outDir, `snapgen-${job.uuid.slice(0, 8)}-${i}${ext}`);
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
      console.log(`saved ${file}`);
    }
  }
}

switch (cmd) {
  case 'account': {
    const a = await api('GET', 'account');
    console.log(
      `plan: ${a.plan_id} | credits available: ${a.user_credit?.available_credit} (locked: ${a.user_credit?.locked_credit})`,
    );
    break;
  }
  case 'image':
    await finish(
      await api('POST', 'generate_image', {
        form: await buildForm(rest.join(' '), {
          model: 'nano-banana-2',
          ...fields,
        }),
      }),
    );
    break;
  case 'gpt-image':
    await finish(
      await api('POST', 'imagen/gpt-image-2', {
        form: await buildForm(rest.join(' '), fields),
      }),
    );
    break;
  case 'grok-image':
    await finish(
      await api('POST', 'imagen/grok', {
        form: await buildForm(rest.join(' '), fields),
      }),
    );
    break;
  case 'meta-image':
    await finish(
      await api('POST', 'meta_ai/generate', {
        form: await buildForm(rest.join(' '), fields),
      }),
    );
    break;
  case 'video': {
    const fam = rest.shift();
    const path =
      VIDEO_PATHS[fam] ??
      die(
        `unknown video family "${fam}" — use ${Object.keys(VIDEO_PATHS).join('|')}`,
      );
    await finish(
      await api('POST', path, {
        form: await buildForm(rest.join(' '), fields),
      }),
    );
    break;
  }
  case 'extend': {
    // Extend a previous video generation: extend <veo|grok|seedance|kling> "prompt" --ref_history <uuid>
    const fam = rest.shift();
    if (!VIDEO_PATHS[fam] || fam === 'meta' || fam === 'sora')
      die(`extend supports veo|grok|seedance|kling, not "${fam}"`);
    await finish(
      await api('POST', `video-extend/${fam}`, {
        form: await buildForm(rest.join(' '), fields),
      }),
    );
    break;
  }
  case 'storyboard':
    // Grok storyboard: positional arg is the required `scenes` field, not `prompt`
    await finish(
      await api('POST', 'video-storyboard/grok', {
        form: await buildForm(null, { scenes: rest.join(' '), ...fields }),
      }),
    );
    break;
  case 'status':
    console.log(
      JSON.stringify(await api('GET', `history/${rest[0]}`), null, 2),
    );
    break;
  case 'wait':
    await finish({ uuid: rest[0] });
    break;
  case 'history': {
    const h = await api('GET', 'histories', {
      query: { items_per_page: '10', page: '1', ...fields },
    });
    for (const r of h.result ?? [])
      console.log(
        `${r.uuid}  ${String(r.status_desc).padEnd(10)}  ${r.model_name}  ${String(r.input_text ?? '').slice(0, 60)}`,
      );
    break;
  }
  default:
    die(`unknown command "${cmd}"`);
}
