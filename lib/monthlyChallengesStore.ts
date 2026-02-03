import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { MonthlyChallengesState } from './monthlyChallenges';
import { perfBytes, perfLog, perfStart } from './perfLogger';

export function monthlyChallengesDocRef(userId: string) {
  // Separate doc to avoid write contention with the main profile doc.
  // Path: users/{uid}/state/monthlyChallenges
  return doc(db, 'users', userId, 'state', 'monthlyChallenges');
}

export async function loadMonthlyChallengesState(userId: string): Promise<MonthlyChallengesState | null> {
  const endPerf = perfStart({
    screen: "MonthlyChallengesStore",
    phase: "DATA",
    label: "loadMonthlyChallengesState",
    meta: { userId },
  });
  const snap = await getDoc(monthlyChallengesDocRef(userId));
  if (!snap.exists()) {
    endPerf({ count: 0 });
    return null;
  }
  const data = (snap.data() as any)?.monthlyChallenges ?? (snap.data() as any);
  endPerf({ bytes: perfBytes(data) });
  return data;
}

export async function saveMonthlyChallengesState(userId: string, state: MonthlyChallengesState) {
  // Store state as the whole document body to keep reads simple.
  await setDoc(monthlyChallengesDocRef(userId), state, { merge: false });
}

export function subscribeMonthlyChallengesState(
  userId: string,
  onValue: (state: MonthlyChallengesState | null) => void,
  onError?: (err: unknown) => void
) {
  return onSnapshot(
    monthlyChallengesDocRef(userId),
    (snap) => {
      if (!snap.exists()) {
        perfLog({
          screen: "MonthlyChallengesStore",
          phase: "DATA",
          label: "monthlyChallenges:snapshot-empty",
          durationMs: 0,
        });
        onValue(null);
        return;
      }
      perfLog({
        screen: "MonthlyChallengesStore",
        phase: "DATA",
        label: "monthlyChallenges:snapshot",
        durationMs: 0,
      });
      onValue(snap.data() as any as MonthlyChallengesState);
    },
    (err) => {
      if (onError) onError(err);
      else if (__DEV__) console.log('monthlyChallenges snapshot failed', err);
    }
  );
}
