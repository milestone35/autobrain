import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function atomicWriteJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

export async function readJson(file, fallback) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Bozuk JSON: ${file}: ${e.message}`);
  }
}
