import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  limit,
  getDoc,
  query,
  setDoc,
  updateDoc,
  where,
  doc,
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { MonthlyChallengesService } from "./monthlyChallengesService";
import { perfBytes, perfStart } from "./perfLogger";
import type { FriendDoc, FriendEntry } from "../types/friends";

export type FriendRequestDoc = {
  fromUserId: string;
  fromUsername?: string;
  fromDisplayName?: string;
  toUserId: string;
  toUsername?: string;
  participants?: string[];
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  distanceKm?: number;
  areaKm2?: number;
};

const usersCol = collection(db, "users");
const friendRequestsCol = collection(db, "friendRequests");
const loadFriendsInFlight = new Map<string, Promise<FriendDoc[]>>();

async function findUserByUsernameLower(usernameLower: string) {
  // Try case-insensitive match via stored lowercase field
  let snap = await getDocs(
    query(usersCol, where("usernameLower", "==", usernameLower), limit(1))
  );
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...(docSnap.data() as any) };
  }

  // Fallback: some older profiles might not have usernameLower; try direct username match
  snap = await getDocs(
    query(usersCol, where("username", "==", usernameLower), limit(1))
  );
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...(docSnap.data() as any) };
  }

  return null;
}

export async function sendFriendRequest(
  fromUserId: string,
  fromUsername: string | undefined,
  toUsername: string
) {
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "sendFriendRequest",
    meta: { fromUserId, toUsername },
  });
  const desiredRaw = toUsername.trim();
  const desired = desiredRaw.toLowerCase();
  if (!desiredRaw) {
    throw new Error("Username required");
  }

  // Support calling this with a userId (some UI paths pass an id rather than a username).
  // Prefer direct user doc lookup first; fallback to username lookup.
  let target: any = null;
  try {
    const snap = await getDoc(doc(db, "users", desiredRaw));
    if (snap.exists()) {
      target = { id: snap.id, ...(snap.data() as any) };
    }
  } catch {
    // ignore
  }
  if (!target) {
    target = await findUserByUsernameLower(desired);
  }
  if (!target) {
    throw new Error("No user found with that username.");
  }
  if (target.id === fromUserId) {
    throw new Error("You cannot add yourself.");
  }

  // Enforce "only one outgoing pending request per (from -> to)".
  // If the user tries to send again, cancel the existing request instead of duplicating.
  const existingPending = await getDocs(
    query(
      friendRequestsCol,
      where("fromUserId", "==", fromUserId),
      where("toUserId", "==", target.id),
      where("status", "==", "pending")
    )
  );
  if (!existingPending.empty) {
    await Promise.all(existingPending.docs.map((d) => deleteDoc(d.ref)));
    endPerf({ action: "cancelled" });
    return { action: "cancelled" as const, toUserId: target.id };
  }

  const requestId = `${fromUserId}_${target.id}`;
  await setDoc(
    doc(db, "friendRequests", requestId),
    {
      fromUserId,
      fromUsername,
      toUserId: target.id,
      toUsername: target.username ?? target.displayName ?? target.email ?? "",
      participants: [fromUserId, target.id],
      status: "pending",
      createdAt: Date.now(),
    } satisfies FriendRequestDoc,
    { merge: false }
  );

  endPerf({ action: "sent" });
  return { action: "sent" as const, toUserId: target.id, requestId };
}

export async function loadIncomingFriendRequests(userId: string) {
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "loadIncomingFriendRequests",
    meta: { userId },
  });
  const snap = await getDocs(
    query(friendRequestsCol, where("toUserId", "==", userId), where("status", "==", "pending"))
  );
  const docs = snap.docs.map((d) => {
    const data = d.data() as FriendRequestDoc;
    return {
      id: d.id,
      ...data,
      createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    };
  });

  // Hydrate display names for senders
  const withNames = await Promise.all(
    docs.map(async (req) => {
      if (!req.fromUserId) return req;
      try {
        const userSnap = await getDoc(doc(db, "users", req.fromUserId));
        if (userSnap.exists()) {
          const data = userSnap.data() as any;
          return {
            ...req,
            fromDisplayName: data.displayName,
            fromUsername: req.fromUsername ?? data.username,
          };
        }
      } catch {
        // ignore
      }
      return req;
    })
  );

  endPerf({ count: withNames.length, bytes: perfBytes(withNames) });
  return withNames;
}

export async function respondToFriendRequest(
  requestId: string,
  status: "accepted" | "declined"
) {
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "respondToFriendRequest",
    meta: { requestId, status },
  });
  const ref = doc(db, "friendRequests", requestId);
  // Ensure participants array exists for older docs so both sides see the friendship
  const snap = await getDocs(query(friendRequestsCol, where("__name__", "==", requestId), limit(1)));
  let participants: string[] | undefined = undefined;
  if (!snap.empty) {
    const data = snap.docs[0].data() as FriendRequestDoc;
    if (data.fromUserId && data.toUserId) {
      participants = [data.fromUserId, data.toUserId];
    }
  }
  const acceptedAt = status === "accepted" ? Date.now() : undefined;
  await updateDoc(ref, { status, ...(participants ? { participants } : {}), ...(acceptedAt ? { acceptedAt } : {}) } as any);

  // Monthly friends challenge (best-effort; never block the friend accept flow).
  if (status === "accepted" && participants?.length === 2 && acceptedAt) {
    const [a, b] = participants;
    const eventA = `friendRequest:${requestId}:${a}`;
    const eventB = `friendRequest:${requestId}:${b}`;
    MonthlyChallengesService.ingestFriendAdded({ userId: a, eventId: eventA, acceptedAt }).catch(() => {});
    MonthlyChallengesService.ingestFriendAdded({ userId: b, eventId: eventB, acceptedAt }).catch(() => {});
  }
  endPerf({ participants: participants?.length ?? 0 });
}

export async function loadFriends(userId: string): Promise<FriendDoc[]> {
  const existing: Promise<FriendDoc[]> | undefined = loadFriendsInFlight.get(userId);
  if (existing) return existing;
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "loadFriends",
    meta: { userId },
  });
  const promise = (async () => {
    const acceptedWithParticipants = await getDocs(
      query(
        friendRequestsCol,
        where("status", "==", "accepted"),
        where("participants", "array-contains", userId)
      )
    );

  // Fallback for older docs without participants field
  const sentAccepted = await getDocs(
    query(friendRequestsCol, where("status", "==", "accepted"), where("fromUserId", "==", userId))
  );
  const receivedAccepted = await getDocs(
    query(friendRequestsCol, where("status", "==", "accepted"), where("toUserId", "==", userId))
  );

    const allDocs = [
      ...acceptedWithParticipants.docs,
      ...sentAccepted.docs,
      ...receivedAccepted.docs,
    ];

    const seenDocs = new Set<string>();
    const byOther: Record<
      string,
      {
        id: string;
        otherUserId: string;
        otherUsername?: string;
        createdAt: number;
        areaKm2?: number;
        distanceKm?: number;
      }
    > = {};

    for (const d of allDocs) {
      if (seenDocs.has(d.id)) continue;
      seenDocs.add(d.id);
      const data = d.data() as FriendRequestDoc;
      const otherId =
        data.fromUserId === userId ? data.toUserId : data.fromUserId;
      const otherUsername =
        data.fromUserId === userId ? data.toUsername : data.fromUsername;
      const areaKm2 = data.areaKm2 ?? 0;
      const distanceKm = data.distanceKm ?? 0;
      const createdAt = typeof data.createdAt === "number" ? data.createdAt : Date.now();
      if (!otherId) continue;
      const existing = byOther[otherId];
      if (!existing || createdAt < existing.createdAt) {
        byOther[otherId] = {
          id: d.id,
          otherUserId: otherId,
          otherUsername,
          createdAt,
          areaKm2,
          distanceKm,
        };
      }
    }

    const results: FriendDoc[] = Object.values(byOther);
    endPerf({ count: results.length, bytes: perfBytes(results) });
    return results;
  })();
  loadFriendsInFlight.set(userId, promise);
  try {
    return await promise;
  } finally {
    loadFriendsInFlight.delete(userId);
  }
}

export async function hydrateFriendProfiles(entries: {
  id?: string;
  otherUserId: string;
  otherUsername?: string;
  createdAt: number;
  areaKm2?: number;
  distanceKm?: number;
}[]) {
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "hydrateFriendProfiles",
    meta: { count: entries.length },
  });
  if (!entries.length) {
    endPerf({ count: 0 });
    return [];
  }

  const results = await Promise.all(
    entries.map(async (f) => {
    const snap = await getDoc(doc(db, "users", f.otherUserId));
    const data = snap.exists() ? (snap.data() as any) : {};
    return {
      ...f,
      id: f.id ?? `${f.otherUserId}-${f.createdAt}`,
      displayName: data.displayName,
      avatarUrl: data.avatarUrl,
      bannerUrl: data.bannerUrl,
      territoryColor: data.territoryColor,
      areaKm2: f.areaKm2,
      distanceKm: f.distanceKm,
      selectedMedals: (data as any)?.selectedMedals ?? [],
    };
  })
);

  endPerf({ count: results.length, bytes: perfBytes(results) });
  return results;
}

export async function removeFriend(currentUserId: string, otherUserId: string) {
  const endPerf = perfStart({
    screen: "FriendService",
    phase: "DATA",
    label: "removeFriend",
    meta: { currentUserId, otherUserId },
  });
  // Remove any accepted friendRequest docs that tie these two users together
  const queries = [
    query(
      friendRequestsCol,
      where("status", "==", "accepted"),
      where("participants", "array-contains", currentUserId)
    ),
    query(
      friendRequestsCol,
      where("status", "==", "accepted"),
      where("fromUserId", "==", currentUserId),
      where("toUserId", "==", otherUserId)
    ),
    query(
      friendRequestsCol,
      where("status", "==", "accepted"),
      where("fromUserId", "==", otherUserId),
      where("toUserId", "==", currentUserId)
    ),
  ];

  const toDelete: string[] = [];
  for (const q of queries) {
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as FriendRequestDoc;
      if (
        (data.participants &&
          data.participants.includes(currentUserId) &&
          data.participants.includes(otherUserId)) ||
        (data.fromUserId === currentUserId && data.toUserId === otherUserId) ||
        (data.fromUserId === otherUserId && data.toUserId === currentUserId)
      ) {
        toDelete.push(d.id);
      }
    });
  }

  await Promise.all(
    toDelete.map((id) => deleteDoc(doc(db, "friendRequests", id)))
  );
  endPerf({ removed: toDelete.length });
}
