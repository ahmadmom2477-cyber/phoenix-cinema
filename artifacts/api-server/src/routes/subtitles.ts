import { Router, text } from "express";
import { randomUUID } from "crypto";
import { gunzip, inflateRaw } from "zlib";
import { promisify } from "util";

const router = Router();
const gunzipAsync = promisify(gunzip);
const inflateRawAsync = promisify(inflateRaw);

const store = new Map<string, string>();
const downloadCache = new Map<string, string>();

const OPENSUBS_UA = "SubDownloader";
const OPENSUBS_REST = "https://rest.opensubtitles.org/search";

function padImdbId(imdbId: string): string {
  const numeric = imdbId.replace(/^tt0*/i, "");
  return numeric.padStart(7, "0");
}

function storeSrt(content: string): string {
  const id = randomUUID();
  store.set(id, content);
  const t = setTimeout(() => store.delete(id), 8 * 60 * 60 * 1000);
  if (t && typeof t === "object") (t as NodeJS.Timeout).unref?.();
  return id;
}

function msToSrtTime(ms: number): string {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rem).padStart(3, "0")}`;
}

function srtTimeToMs(t: string): number {
  const parts = t.split(":");
  if (parts.length < 3) return 0;
  const [h, m, sMsRaw] = parts;
  const [s, ms = "0"] = sMsRaw.split(",");
  return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s)) * 1000 + parseInt(ms);
}

function shiftSrt(content: string, offsetSec: number): string {
  if (offsetSec === 0) return content;
  const offsetMs = Math.round(offsetSec * 1000);
  return content.replace(
    /(\d{1,2}:\d{2}:\d{2},\d{3}) --> (\d{1,2}:\d{2}:\d{2},\d{3})/g,
    (_, start, end) =>
      `${msToSrtTime(srtTimeToMs(start) + offsetMs)} --> ${msToSrtTime(srtTimeToMs(end) + offsetMs)}`
  );
}

async function extractSrtFromZip(buf: Buffer): Promise<string | null> {
  try {
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) !== 0x06054b50) continue;
      const cdOffset = buf.readUInt32LE(i + 16);
      const cdSize = buf.readUInt32LE(i + 12);
      let pos = cdOffset;
      while (pos < cdOffset + cdSize && pos + 46 <= buf.length) {
        if (buf.readUInt32LE(pos) !== 0x02014b50) break;
        const comp = buf.readUInt16LE(pos + 10);
        const compSz = buf.readUInt32LE(pos + 20);
        const fnLen = buf.readUInt16LE(pos + 28);
        const exLen = buf.readUInt16LE(pos + 30);
        const cmLen = buf.readUInt16LE(pos + 32);
        const lhOff = buf.readUInt32LE(pos + 42);
        const fn = buf.subarray(pos + 46, pos + 46 + fnLen).toString("utf-8");
        if (fn.toLowerCase().endsWith(".srt")) {
          if (lhOff + 30 > buf.length) return null;
          const lhFnLen = buf.readUInt16LE(lhOff + 26);
          const lhExLen = buf.readUInt16LE(lhOff + 28);
          const dataStart = lhOff + 30 + lhFnLen + lhExLen;
          if (dataStart + compSz > buf.length) return null;
          const compressed = buf.subarray(dataStart, dataStart + compSz);
          const srtText = comp === 0
            ? compressed.toString("utf-8")
            : comp === 8
              ? (await inflateRawAsync(compressed)).toString("utf-8")
              : null;
          if (srtText?.trim()) return srtText;
        }
        pos += 46 + fnLen + exLen + cmLen;
      }
      break;
    }
  } catch { /* fall through */ }
  return null;
}

interface OpenSubsResult {
  IDSubtitleFile: string;
  SubFileName: string;
  SubDownloadLink: string;
  SubDownloadsCnt: string;
  SubRating: string;
  SubLanguageID: string;
  LanguageName: string;
  SubEncoding: string;
  SubHearingImpaired: string;
  MovieReleaseName?: string;
  SubComments?: string;
}

// ──────────────────────────────────────────
// POST /api/subtitles  (manual .srt upload)
// ──────────────────────────────────────────
router.post("/subtitles", text({ type: "*/*", limit: "5mb" }), (req, res) => {
  const content = req.body;
  if (typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Invalid subtitle content" });
    return;
  }
  const id = storeSrt(content);
  res.json({ id });
});

// ──────────────────────────────────────────
// GET /api/subtitles/search
// ──────────────────────────────────────────
router.get("/subtitles/search", async (req, res) => {
  const imdbId = req.query.imdbId as string;
  const season = req.query.season as string | undefined;
  const episode = req.query.episode as string | undefined;

  if (!imdbId) {
    res.status(400).json({ error: "Missing imdbId" });
    return;
  }

  const paddedId = padImdbId(imdbId);
  let searchUrl = `${OPENSUBS_REST}/imdbid-${paddedId}/sublanguageid-ara`;
  if (season) searchUrl += `/season-${season}`;
  if (episode) searchUrl += `/episode-${episode}`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": OPENSUBS_UA,
        "X-User-Agent": OPENSUBS_UA,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    if (!response.ok) {
      req.log.warn({ status: response.status }, "OpenSubtitles search non-OK");
      res.json({ subtitles: [] });
      return;
    }

    let data: OpenSubsResult[];
    try {
      data = await response.json() as OpenSubsResult[];
    } catch {
      res.json({ subtitles: [] });
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      res.json({ subtitles: [] });
      return;
    }

    const sorted = [...data]
      .filter((s) => s.SubDownloadLink)
      .sort((a, b) => {
        const dlDiff = parseInt(b.SubDownloadsCnt || "0") - parseInt(a.SubDownloadsCnt || "0");
        const rDiff = parseFloat(b.SubRating || "0") - parseFloat(a.SubRating || "0");
        return dlDiff !== 0 ? dlDiff : rDiff;
      });

    res.json({
      subtitles: sorted.slice(0, 15).map((s) => ({
        id: s.IDSubtitleFile,
        fileId: s.IDSubtitleFile,
        fileName: s.SubFileName,
        downloadLink: s.SubDownloadLink,
        downloads: parseInt(s.SubDownloadsCnt || "0"),
        rating: parseFloat(s.SubRating || "0"),
        language: s.LanguageName || "Arabic",
        hearingImpaired: s.SubHearingImpaired === "1",
        releaseName: s.MovieReleaseName || s.SubFileName.replace(/\.srt$/i, ""),
        comments: s.SubComments || "",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "OpenSubtitles search error");
    res.json({ subtitles: [] });
  }
});

// ──────────────────────────────────────────
// POST /api/subtitles/fetch  (download & store)
// ──────────────────────────────────────────
router.post("/subtitles/fetch", async (req, res) => {
  const body = req.body as { fileId?: string; downloadLink?: string };
  const downloadLink = body.downloadLink || body.fileId;

  if (!downloadLink) {
    res.status(400).json({ error: "Missing downloadLink or fileId" });
    return;
  }

  if (downloadCache.has(downloadLink)) {
    const cachedId = downloadCache.get(downloadLink)!;
    if (store.has(cachedId)) {
      const host = `${req.protocol}://${req.get("host")}`;
      res.json({ id: cachedId, url: `${host}/api/subtitles/${cachedId}.srt`, cached: true });
      return;
    }
    downloadCache.delete(downloadLink);
  }

  const fetchUrl = downloadLink.startsWith("http")
    ? downloadLink
    : `https://dl.subdl.com${downloadLink}`;

  try {
    const r = await fetch(fetchUrl, {
      headers: { "User-Agent": OPENSUBS_UA, "X-User-Agent": OPENSUBS_UA },
      signal: AbortSignal.timeout(20000),
    });

    if (!r.ok) {
      res.status(502).json({ error: `Download failed: ${r.status}` });
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    let srt: string | null = null;

    const ct = r.headers.get("content-type") ?? "";
    if (fetchUrl.endsWith(".zip") || ct.includes("zip")) {
      srt = await extractSrtFromZip(buf);
    }

    if (!srt) {
      try { srt = (await gunzipAsync(buf)).toString("utf-8"); }
      catch { srt = buf.toString("utf-8"); }
    }

    if (!srt?.trim()) {
      res.status(502).json({ error: "Empty subtitle content" });
      return;
    }

    const id = storeSrt(srt);
    downloadCache.set(downloadLink, id);
    if (downloadCache.size > 600) {
      const k = downloadCache.keys().next().value;
      if (k !== undefined) downloadCache.delete(k);
    }

    const host = `${req.protocol}://${req.get("host")}`;
    res.json({ id, url: `${host}/api/subtitles/${id}.srt` });
  } catch (err) {
    req.log.error({ err }, "Subtitle fetch error");
    res.status(502).json({ error: "Failed to process subtitle" });
  }
});

// ──────────────────────────────────────────
// OPTIONS preflight for external players
// ──────────────────────────────────────────
router.options("/subtitles/:filename", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.sendStatus(204);
});

// ──────────────────────────────────────────
// GET /api/subtitles/:filename[?offset=N]
// ──────────────────────────────────────────
router.get("/subtitles/:filename", (req, res) => {
  const id = req.params.filename.replace(/\.srt$/i, "");
  const rawContent = store.get(id);
  if (!rawContent) {
    res.status(404).send("Not found");
    return;
  }

  const offsetParam = req.query.offset;
  const offsetSec = offsetParam ? parseFloat(offsetParam as string) : 0;
  const content = Number.isFinite(offsetSec) && offsetSec !== 0
    ? shiftSrt(rawContent, offsetSec)
    : rawContent;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.send(content);
});

export default router;
