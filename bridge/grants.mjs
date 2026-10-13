import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./atomic-file.mjs";

// Pairing gives one site one credential. Each is bound to the origin it was
// issued to, can be limited to reading, can be revoked on its own from the local
// setup page, and lapses when it goes unused or simply gets old. Only a hash is
// kept, so the file cannot be replayed against the Bridge.
const DAY = 86_400_000;
export const GRANT_IDLE_MS = 30 * DAY;
export const GRANT_MAX_AGE_MS = 180 * DAY;
// "Last used" is for the researcher's eyes; an hour's resolution is plenty and
// keeps an open tab from rewriting the file with every request.
const USE_RESOLUTION_MS = 60 * 60_000;
const ACCESS = new Set(["full", "read"]);

const digest = (token) => createHash("sha256").update(token).digest("hex");

export function createGrantStore(file, { clock = Date.now } = {}) {
  let grants = [];
  // When everyone was last revoked, by this process or by the rotate command
  // running beside it.
  let revokedAt = 0;
  let tail = Promise.resolve();
  const live = (grant, now) => grant.expiresAt > now && grant.lastUsedAt + GRANT_IDLE_MS > now;
  const stored = async () => JSON.parse(await readFile(file, "utf8"));
  const save = () => {
    const write = async () => {
      // A running Bridge holds this list in memory and writes it back whole. If
      // the rotate command has revoked everyone since it was read, that stands:
      // nothing issued before the revocation is written back or trusted again.
      const revoked = Number((await stored().catch(() => null))?.revokedAt) || 0;
      if (revoked > revokedAt) {
        revokedAt = revoked;
        grants = grants.filter((grant) => grant.createdAt > revokedAt);
      }
      await writeFileAtomic(
        file,
        `${JSON.stringify({ version: 1, revokedAt, grants }, null, 2)}\n`,
      );
    };
    tail = tail.then(write, write);
    return tail;
  };
  const find = (id) => grants.find((grant) => grant.id === id);
  return {
    // Returns false when a list exists but cannot be read. Nothing is trusted
    // then, which is the safe direction: every browser simply pairs again.
    async load() {
      let list;
      try {
        list = await stored();
      } catch (error) {
        grants = [];
        return error?.code === "ENOENT";
      }
      const now = clock();
      revokedAt = Number(list?.revokedAt) || 0;
      grants = (Array.isArray(list?.grants) ? list.grants : []).filter(
        (grant) =>
          grant &&
          typeof grant.id === "string" &&
          typeof grant.origin === "string" &&
          /^[0-9a-f]{64}$/.test(grant.hash) &&
          ACCESS.has(grant.access) &&
          [grant.createdAt, grant.lastUsedAt, grant.expiresAt].every(Number.isFinite) &&
          live(grant, now),
      );
      return true;
    },
    // A site keeps the limit it was given: pairing again, from this browser or
    // another, does not hand a read-only site back the right to write. A browser
    // that presents the credential it already holds trades it in, so no second
    // one is left alive behind it.
    async issue(origin, { replaces } = {}) {
      const now = clock();
      const token = randomBytes(32).toString("base64url");
      grants = grants.filter((grant) => live(grant, now));
      const limited = grants.some((grant) => grant.origin === origin && grant.access === "read");
      grants = grants.filter((grant) => grant.id !== replaces);
      grants.push({
        id: randomUUID(),
        origin,
        hash: digest(token),
        access: limited ? "read" : "full",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + GRANT_MAX_AGE_MS,
      });
      await save();
      return token;
    },
    verify(origin, token) {
      if (typeof token !== "string" || !token) return null;
      const now = clock();
      const hash = digest(token);
      const grant = grants.find((item) => item.hash === hash && item.origin === origin);
      if (!grant || !live(grant, now)) return null;
      if (now - grant.lastUsedAt >= USE_RESOLUTION_MS) {
        grant.lastUsedAt = now;
        void save().catch(() => {});
      }
      return grant;
    },
    list() {
      const now = clock();
      return grants
        .filter((grant) => live(grant, now))
        .map(({ id, origin, access, createdAt, lastUsedAt, expiresAt }) => ({
          id,
          origin,
          access,
          createdAt: new Date(createdAt).toISOString(),
          lastUsedAt: new Date(lastUsedAt).toISOString(),
          expiresAt: new Date(Math.min(expiresAt, lastUsedAt + GRANT_IDLE_MS)).toISOString(),
        }))
        .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
    },
    async setAccess(id, access) {
      const grant = find(id);
      if (!grant || !ACCESS.has(access)) return false;
      grant.access = access;
      await save();
      return true;
    },
    async revoke(id) {
      if (!find(id)) return false;
      grants = grants.filter((grant) => grant.id !== id);
      await save();
      return true;
    },
    async revokeAll() {
      revokedAt = clock();
      grants = [];
      await save();
    },
    // "Last used" is written in the background; this waits for whatever is pending.
    flush: () => tail.catch(() => {}),
  };
}
