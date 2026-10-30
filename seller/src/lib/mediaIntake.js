import { classifyFile, inspectMedia, sizeProblem, videoFileProblem } from "@epicmkt/shared";
import { readVideo } from "./videoPoster.js";

const codeOf = (err) => err?.code ?? "video_unplayable";

async function checkPhoto(file) {
  const info = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (!info.ok) return { ok: false, code: info.reason };
  return info.kind === "image" ? { ok: true, kind: "image" } : { ok: false, code: "unsupported_type" };
}

async function checkVideo(file) {
  let info;
  try {
    info = await readVideo(file);
  } catch (err) {
    return { ok: false, code: codeOf(err) };
  }
  const problem = videoFileProblem({ size: file.size, durationSec: info.durationSec });
  if (problem) return { ok: false, code: problem };
  return { ok: true, kind: "video", durationSec: Math.round(info.durationSec * 100) / 100, width: info.width, height: info.height, poster: info.poster };
}

export async function inspectFile(file) {
  const { kind, code } = classifyFile(file);
  if (code) return { ok: false, code };
  const big = sizeProblem(kind, file.size);
  if (big) return { ok: false, code: big };
  return kind === "video" ? checkVideo(file) : checkPhoto(file);
}
