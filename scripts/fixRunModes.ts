/**
 * Scan runs (and groupRuns if present) for invalid mode values and fix them.
 * Dry-run by default. Use --apply to write changes.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *   npx ts-node scripts/fixRunModes.ts --apply
 */
// @ts-ignore - admin-only dependency, not installed in app runtime.
import { initializeApp, cert } from 'firebase-admin/app';
// @ts-ignore - admin-only dependency, not installed in app runtime.
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

type Mode = 'personal' | 'group';

type FixDecision =
  | { action: 'set'; mode: Mode }
  | { action: 'delete' }
  | { action: 'skip' };

const APPLY = process.argv.includes('--apply');
const BATCH_LIMIT = 400;

function decideFix(data: Record<string, unknown>): FixDecision {
  const mode = data.mode as unknown;
  const hasGroupId = !!data.groupId;
  const hasUserId = !!data.userId;
  if (mode === 'personal' || mode === 'group') return { action: 'skip' };
  if (hasGroupId) return { action: 'set', mode: 'group' };
  if (hasUserId) return { action: 'set', mode: 'personal' };
  return { action: 'delete' };
}

async function scanCollection(db: ReturnType<typeof getFirestore>, name: string) {
  const col = db.collection(name) as any;
  let lastDoc: any | null = null;
  let scanned = 0;
  let invalid = 0;
  let updated = 0;
  let deleted = 0;

  for (;;) {
    let q: any = col.orderBy('__name__').limit(500);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    lastDoc = snap.docs[snap.docs.length - 1] ?? lastDoc;

    const batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data() as Record<string, unknown>;
      const mode = data.mode as unknown;
      if (mode === 'personal' || mode === 'group' || mode === undefined) continue;
      invalid += 1;
      const decision = decideFix(data);
      if (decision.action === 'skip') continue;
      if (decision.action === 'delete') {
        if (APPLY) {
          batch.update(doc.ref, { mode: FieldValue.delete() });
          batchCount += 1;
          deleted += 1;
        } else {
          deleted += 1;
        }
        continue;
      }
      if (APPLY) {
        batch.update(doc.ref, { mode: decision.mode });
        batchCount += 1;
        updated += 1;
      } else {
        updated += 1;
      }

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (APPLY && batchCount > 0) {
      await batch.commit();
    }
  }

  console.log(
    `[fixRunModes] ${name} scanned=${scanned} invalid=${invalid} updated=${updated} deleted=${deleted} apply=${APPLY}`
  );
}

async function main() {
  initializeApp({
    credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS as string),
  });
  const db = getFirestore();

  const collections = await db.listCollections();
  const names = new Set(collections.map((c: { id: string }) => c.id));
  const targets = ['runs', 'groupRuns'].filter((name) => names.has(name));

  if (!targets.length) {
    console.log('[fixRunModes] No runs or groupRuns collections found.');
    return;
  }

  for (const name of targets) {
    await scanCollection(db, name);
  }
}

main().catch((e) => {
  console.error('fixRunModes failed', e);
  process.exit(1);
});
