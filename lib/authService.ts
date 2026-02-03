import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithCredential,
  User,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { monthlyChallengesDocRef } from "./monthlyChallengesStore";
import type { MonthlyChallengesState } from "./monthlyChallenges";
import { perfBytes, perfStart } from "./perfLogger";
import { logFailure, logStart, logSuccess } from "./bootstrapLogger";

export type UserProfile = {
  email: string | null;
  displayName: string;
  username?: string;
  usernameLower?: string;
  phoneNumber?: string;
  state?: string;
  country?: string;
  stateCode?: string;
  countryCode?: string;
  stateName?: string;
  countryName?: string;
  rankLocationSetAtMs?: number;
  heightCm?: number;
  weightKg?: number;
  gender?: 'male' | 'female' | 'other';
  birthDay?: number;
  birthMonth?: number;
  birthYear?: number;
  bannerUrl?: string;
  territoryColor: string;
  avatarUrl: string;
  createdAt: number;
  territoryNameStyleMode?: 'auto' | 'manual';
  selectedTerritoryNameStyleTier?: string;
  levelBorderMode?: 'auto' | 'manual';
  selectedLevelBorderTier?: string;
  levelBorderStyleMode?: 'auto' | 'manual';
  selectedLevelBorderStyleTier?: string;
  selectedMedals?: string[];
  friendsCount?: number; // optional analytics field
  bestLeaderboardRank?: number; // optional best rank achieved
  onboardingChallengeId?: string; // optional choice from signup
  lifetimeXp?: number; // cumulative XP, non-decreasing
  monthlyChallenges?: import('./monthlyChallenges').MonthlyChallengesState;
};

function buildDefaultProfile(user: User, overrides?: Partial<UserProfile>): UserProfile {
  const displayName =
    overrides?.displayName ??
    user.displayName ??
    user.email ??
    "Runner";
  const username = overrides?.username;
  const usernameLower = overrides?.usernameLower ?? (username ? username.toLowerCase() : undefined);
  return {
    email: overrides?.email ?? user.email ?? null,
    displayName,
    username,
    usernameLower,
    phoneNumber: overrides?.phoneNumber,
    heightCm: undefined,
    weightKg: undefined,
    gender: undefined,
    birthDay: undefined,
    birthMonth: undefined,
    birthYear: undefined,
    bannerUrl: "",
    territoryColor: overrides?.territoryColor ?? "#22c55e",
    avatarUrl: "",
    createdAt: Date.now(),
    territoryNameStyleMode: "auto",
    selectedTerritoryNameStyleTier: "default",
    levelBorderMode: "auto",
    selectedLevelBorderTier: "default",
    selectedMedals: [],
    lifetimeXp: 0,
  };
}

async function ensureUserProfile(user: User, overrides?: Partial<UserProfile>) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const profile = buildDefaultProfile(user, overrides);
  await setDoc(ref, profile);
}

function normalizeUserProfile(raw: Partial<UserProfile>): UserProfile {
  return {
    email: raw.email ?? null,
    displayName: raw.displayName ?? raw.username ?? 'Runner',
    username: raw.username,
    usernameLower: raw.usernameLower,
    phoneNumber: raw.phoneNumber,
    state: raw.state,
    country: raw.country,
    stateCode: raw.stateCode,
    countryCode: raw.countryCode,
    stateName: raw.stateName,
    countryName: raw.countryName,
    rankLocationSetAtMs: raw.rankLocationSetAtMs,
    heightCm: raw.heightCm,
    weightKg: raw.weightKg,
    gender: raw.gender,
    birthDay: raw.birthDay,
    birthMonth: raw.birthMonth,
    birthYear: raw.birthYear,
    bannerUrl: raw.bannerUrl ?? '',
    territoryColor: raw.territoryColor ?? '#22c55e',
    avatarUrl: raw.avatarUrl ?? '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    territoryNameStyleMode: raw.territoryNameStyleMode,
    selectedTerritoryNameStyleTier: raw.selectedTerritoryNameStyleTier,
    levelBorderMode: raw.levelBorderMode,
    selectedLevelBorderTier: raw.selectedLevelBorderTier,
    levelBorderStyleMode: raw.levelBorderStyleMode,
    selectedLevelBorderStyleTier: raw.selectedLevelBorderStyleTier,
    selectedMedals: raw.selectedMedals ?? [],
    friendsCount: raw.friendsCount,
    bestLeaderboardRank: raw.bestLeaderboardRank,
    onboardingChallengeId: raw.onboardingChallengeId,
    lifetimeXp: typeof raw.lifetimeXp === 'number' ? raw.lifetimeXp : 0,
    monthlyChallenges: raw.monthlyChallenges,
  };
}

async function isUsernameTaken(username: string): Promise<boolean> {
  if (!username) return false;
  const usernameLower = username.toLowerCase();
  const q = query(
    collection(db, "users"),
    where("usernameLower", "==", usernameLower),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  if (!username.trim()) return false;
  return !(await isUsernameTaken(username.trim()));
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  options?: { username?: string; phoneNumber?: string }
): Promise<User> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "signUpWithEmail",
    meta: { email: email?.toLowerCase?.() ?? "", hasUsername: !!options?.username },
  });
  if (options?.username) {
    const desiredLower = options.username.trim().toLowerCase();
    const taken = await isUsernameTaken(desiredLower);
    if (taken) {
      throw new Error("That username is already taken. Please choose another.");
    }
  }

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  try {
    await sendEmailVerification(user);
  } catch (e) {
    // Best-effort; allow signup to continue even if email can't be sent.
    console.log("Failed to send verification email", e);
  }

  const profile: UserProfile = {
    email: user.email,
    displayName: displayName || email,
    username: options?.username ? options.username.trim().toLowerCase() : undefined,
    usernameLower: options?.username ? options.username.trim().toLowerCase() : undefined,
    phoneNumber: options?.phoneNumber,
    heightCm: undefined,
    weightKg: undefined,
    gender: undefined,
    birthDay: undefined,
    birthMonth: undefined,
    birthYear: undefined,
    bannerUrl: "",
    territoryColor: "#22c55e",
    avatarUrl: "",
    createdAt: Date.now(),
    territoryNameStyleMode: 'auto',
    selectedTerritoryNameStyleTier: 'default',
    levelBorderMode: 'auto',
    selectedLevelBorderTier: 'default',
    selectedMedals: [],
    lifetimeXp: 0,
  };

  await setDoc(doc(db, "users", user.uid), profile);
  endPerf({ uid: user.uid });
  return user;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<User> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "signInWithEmail",
    meta: { email: email?.toLowerCase?.() ?? "" },
  });
  const cred = await signInWithEmailAndPassword(auth, email, password);

  // Enforce verified email before allowing sign-in to proceed.
  await reload(cred.user);
  if (!cred.user.emailVerified) {
    try {
      await sendEmailVerification(cred.user);
    } catch (e) {
      console.log("Failed to send verification email on login", e);
    }
    await signOut(auth);
    const err: any = new Error(
      "Please verify your email. We just sent you a new verification link."
    );
    err.code = "auth/email-not-verified";
    endPerf({ verified: false });
    throw err;
  }

  // Ensure the profile doc exists
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) {
    const profile: UserProfile = {
      email: cred.user.email,
      displayName: cred.user.email || "",
      username: undefined,
      phoneNumber: undefined,
      heightCm: undefined,
      weightKg: undefined,
      gender: undefined,
      birthDay: undefined,
      birthMonth: undefined,
      birthYear: undefined,
    bannerUrl: "",
    territoryColor: "#22c55e",
    avatarUrl: "",
    createdAt: Date.now(),
    lifetimeXp: 0,
  };
    await setDoc(doc(db, "users", cred.user.uid), profile);
  }

  endPerf({ uid: cred.user.uid, verified: true });
  return cred.user;
}

export async function signInWithGoogle(
  idToken: string,
  accessToken?: string
): Promise<User> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "signInWithGoogle",
  });
  if (!idToken) {
    throw new Error("Missing Google ID token.");
  }
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const result = await signInWithCredential(auth, credential);
  await ensureUserProfile(result.user);
  endPerf({ uid: result.user.uid });
  return result.user;
}

export async function signInWithApple(
  identityToken: string,
  rawNonce: string,
  displayName?: string,
  email?: string | null
): Promise<User> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "signInWithApple",
  });
  if (!identityToken) {
    throw new Error("Missing Apple identity token.");
  }
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({
    idToken: identityToken,
    rawNonce,
  });
  const result = await signInWithCredential(auth, credential);
  await ensureUserProfile(result.user, {
    displayName: displayName || result.user.displayName || undefined,
    email: email ?? result.user.email ?? null,
  });
  endPerf({ uid: result.user.uid });
  return result.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "sendPasswordReset",
    meta: { email: email?.toLowerCase?.() ?? "" },
  });
  if (!email) throw new Error("Please enter your email first.");
  await sendPasswordResetEmail(auth, email);
  endPerf();
}

export async function loadUserProfile(uid: string): Promise<UserProfile | null> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "loadUserProfile",
    meta: { uid },
  });
  const tag = `AuthService.loadUserProfile:${uid}`;
  logStart(tag, { uid });
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) {
      endPerf({ exists: false });
      logSuccess(tag, { exists: false });
      return null;
    }
    const base = normalizeUserProfile(userSnap.data() as Partial<UserProfile>);

    // Monthly challenges moved to a separate doc to avoid write contention on the main user profile.
    // Fall back to the legacy embedded field if rules don't allow the subcollection yet.
    try {
      const stateSnap = await getDoc(monthlyChallengesDocRef(uid));
      if (stateSnap.exists()) {
        const state = stateSnap.data() as any as MonthlyChallengesState;
        const profile = { ...base, monthlyChallenges: state };
        endPerf({ exists: true, bytes: perfBytes(profile) });
        logSuccess(tag, { exists: true, bytes: perfBytes(profile) ?? 0 });
        return profile;
      }
    } catch {
      // ignore (offline/permission issues)
    }

    endPerf({ exists: true, bytes: perfBytes(base) });
    logSuccess(tag, { exists: true, bytes: perfBytes(base) ?? 0 });
    return base;
  } catch (e) {
    logFailure(tag, e, { uid });
    throw e;
  }
}

export async function loadUserProfileByUsername(username: string): Promise<(UserProfile & { uid: string }) | null> {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "loadUserProfileByUsername",
    meta: { username: username?.toLowerCase?.() ?? "" },
  });
  const trimmed = username.trim().replace(/^@+/, "");
  const usernameLower = trimmed.toLowerCase();
  const tag = `AuthService.loadUserProfileByUsername:${usernameLower}`;
  logStart(tag, { usernameLower });
  try {
    const q = query(
      collection(db, "users"),
      where("usernameLower", "==", usernameLower),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const profile = { ...normalizeUserProfile(docSnap.data() as Partial<UserProfile>), uid: docSnap.id };
      endPerf({ found: true, bytes: perfBytes(profile) });
      logSuccess(tag, { found: true, bytes: perfBytes(profile) ?? 0 });
      return profile;
    }

    // Fallback for older profiles without usernameLower field
    const fallbackSnap = await getDocs(
      query(collection(db, "users"), where("username", "==", usernameLower), limit(1))
    );
    if (fallbackSnap.empty) {
      endPerf({ found: false });
      logSuccess(tag, { found: false });
      return null;
    }
    const docSnap = fallbackSnap.docs[0];
    const profile = { ...normalizeUserProfile(docSnap.data() as Partial<UserProfile>), uid: docSnap.id };
    endPerf({ found: true, bytes: perfBytes(profile), fallback: true });
    logSuccess(tag, { found: true, bytes: perfBytes(profile) ?? 0, fallback: true });
    return profile;
  } catch (e) {
    logFailure(tag, e, { usernameLower });
    throw e;
  }
}

export async function updateUserProfile(
  uid: string,
  profile: Partial<UserProfile>
) {
  const endPerf = perfStart({
    screen: "AuthService",
    phase: "DATA",
    label: "updateUserProfile",
    meta: { uid },
  });
  // Enforce unique username if provided
  if (profile.username) {
    const desired = profile.username.trim();
    const desiredLower = desired.toLowerCase();

    // Allow keeping the same username
    const current = await getDoc(doc(db, "users", uid));
    const currentLower = current.exists()
      ? (current.data().usernameLower as string | undefined)
      : undefined;

    if (currentLower !== desiredLower) {
      const taken = await isUsernameTaken(desired);
      if (taken) {
        throw new Error("That username is already taken. Please choose another.");
      }
    }

    profile.usernameLower = desiredLower;
    profile.username = desired;
  }

  const sanitized: Partial<UserProfile> = {};
  Object.entries(profile).forEach(([key, value]) => {
    if (value === undefined) return;
    if (typeof value === "number" && Number.isNaN(value)) return;
    (sanitized as any)[key] = value;
  });

  const ref = doc(db, "users", uid);
  await setDoc(ref, sanitized, { merge: true });
  endPerf({ fields: Object.keys(sanitized).length });
}

export async function logout() {
  await signOut(auth);
}
