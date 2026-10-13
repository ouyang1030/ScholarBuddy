import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// One crash-safe write for the files the Bridge owns: a complete temporary file
// renamed over the target, so a reader sees the old content or the new and never
// half of either. The temporary name is hidden so a vault indexer skips it.
// `check` runs after the new content is on disk and before it replaces the old;
// throwing there abandons the write.
export async function writeFileAtomic(file, content, { mode = 0o600, check } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode, flag: "wx" });
  try {
    await check?.();
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
