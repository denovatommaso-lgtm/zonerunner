import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { YearlyChallengesState } from './yearlyChallenges';
import { perfBytes, perfLog, perfStart } from './perfLogger';

export function yearlyChallengesDocRef(userId: string) {
  return doc(db, 'users', userId, 'state', 'yearlyChallenges');
}

export async function loadYearlyChallengesState(userId: string): Promise<YearlyChallengesState | null> {
  const endPerf = perfStart({
    screen: "YearlyChallengesStore",
    phase: "DATA",
    label: "loadYearlyChallengesState",
    meta: { userId },
  });
  const snap = await getDoc(yearlyChallengesDocRef(userId));
  if (!snap.exists()) {
    endPerf({ count: 0 });
    return null;
  }
  const data = (snap.data() as any) as YearlyChallengesState;
  endPerf({ bytes: perfBytes(data) });
  return data;
}

export async function saveYearlyChallengesState(userId: string, state: YearlyChallengesState) {
  await setDoc(yearlyChallengesDocRef(userId), state, { merge: false });
}

export function subscribeYearlyChallengesState(
  userId: string,
  onValue: (state: YearlyChallengesState | null) => void,
  onError?: (err: unknown) => void
) {
  return onSnapshot(
    yearlyChallengesDocRef(userId),
    (snap) => {
      if (!snap.exists()) {
        perfLog({
          screen: "YearlyChallengesStore",
          phase: "DATA",
          label: "yearlyChallenges:snapshot-empty",
          durationMs: 0,
        });
        onValue(null);
        return;
      }
      perfLog({
        screen: "YearlyChallengesStore",
        phase: "DATA",
        label: "yearlyChallenges:snapshot",
        durationMs: 0,
      });
      onValue(snap.data() as any as YearlyChallengesState);
    },
    (err) => {
      if (onError) onError(err);
      else if (__DEV__) console.log('yearlyChallenges snapshot failed', err);
    }
  );
}
