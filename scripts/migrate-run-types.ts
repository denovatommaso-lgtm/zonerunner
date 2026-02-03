/**
 * One-time migration helper to backfill groupRunType/scope fields.
 * Run with `ts-node` or transpile as needed in a Firebase admin context.
 * This script marks all existing group runs as official (since legacy behavior
 * affected territory/leaderboards) and sets scope/mode defaults.
 */
// @ts-ignore - admin-only dependency, not installed in app runtime.
import { initializeApp, cert } from 'firebase-admin/app';
// @ts-ignore - admin-only dependency, not installed in app runtime.
import { getFirestore } from 'firebase-admin/firestore';

async function migrate() {
  initializeApp({
    credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS as string),
  });
  const db = getFirestore();
  const runsCol = db.collection('runs');
  const snap = await runsCol.get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as any;
    const isGroup = !!data.groupId || data.mode === 'group' || data.scope === 'group';
    const groupRunType = isGroup ? data.groupRunType ?? 'official' : undefined;
    await doc.ref.set(
      {
        mode: data.mode || (isGroup ? 'group' : 'personal'),
        scope: data.scope || (isGroup ? 'group' : 'personal'),
        groupRunType,
      },
      { merge: true }
    );
    updated += 1;
  }
  console.log(`Migration complete. Updated ${updated} runs.`);
}

migrate().catch((e) => {
  console.error('Migration failed', e);
  process.exit(1);
});
