"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUsernameAvailable = checkUsernameAvailable;
exports.signUpWithEmail = signUpWithEmail;
exports.signInWithEmail = signInWithEmail;
exports.signInWithGoogle = signInWithGoogle;
exports.signInWithApple = signInWithApple;
exports.sendPasswordReset = sendPasswordReset;
exports.loadUserProfile = loadUserProfile;
exports.loadUserProfileByUsername = loadUserProfileByUsername;
exports.updateUserProfile = updateUserProfile;
exports.logout = logout;
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const firebaseConfig_1 = require("./firebaseConfig");
const monthlyChallengesStore_1 = require("./monthlyChallengesStore");
const perfLogger_1 = require("./perfLogger");
const bootstrapLogger_1 = require("./bootstrapLogger");
function buildDefaultProfile(user, overrides) {
    const displayName = overrides?.displayName ??
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
        notificationPrefs: {
            pushEnabled: false,
            localEnabled: true,
            territoryStolen: true,
            groupRunStarting: true,
            friendRequest: true,
        },
    };
}
async function ensureUserProfile(user, overrides) {
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "users", user.uid);
    const snap = await (0, firestore_1.getDoc)(ref);
    if (snap.exists())
        return;
    const profile = buildDefaultProfile(user, overrides);
    await (0, firestore_1.setDoc)(ref, profile);
}
function normalizeUserProfile(raw) {
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
        notificationPrefs: raw.notificationPrefs,
    };
}
async function isUsernameTaken(username) {
    if (!username)
        return false;
    const usernameLower = username.toLowerCase();
    const q = (0, firestore_1.query)((0, firestore_1.collection)(firebaseConfig_1.db, "users"), (0, firestore_1.where)("usernameLower", "==", usernameLower), (0, firestore_1.limit)(1));
    const snap = await (0, firestore_1.getDocs)(q);
    return !snap.empty;
}
async function checkUsernameAvailable(username) {
    if (!username.trim())
        return false;
    return !(await isUsernameTaken(username.trim()));
}
async function signUpWithEmail(email, password, displayName, options) {
    const endPerf = (0, perfLogger_1.perfStart)({
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
    const cred = await (0, auth_1.createUserWithEmailAndPassword)(firebaseConfig_1.auth, email, password);
    const user = cred.user;
    try {
        await (0, auth_1.sendEmailVerification)(user);
    }
    catch (e) {
        // Best-effort; allow signup to continue even if email can't be sent.
        console.log("Failed to send verification email", e);
    }
    const profile = {
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
        notificationPrefs: {
            pushEnabled: false,
            localEnabled: true,
            territoryStolen: true,
            groupRunStarting: true,
            friendRequest: true,
        },
    };
    await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", user.uid), profile);
    endPerf({ uid: user.uid });
    return user;
}
async function signInWithEmail(email, password) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "signInWithEmail",
        meta: { email: email?.toLowerCase?.() ?? "" },
    });
    const cred = await (0, auth_1.signInWithEmailAndPassword)(firebaseConfig_1.auth, email, password);
    // Enforce verified email before allowing sign-in to proceed.
    await (0, auth_1.reload)(cred.user);
    if (!cred.user.emailVerified) {
        try {
            await (0, auth_1.sendEmailVerification)(cred.user);
        }
        catch (e) {
            console.log("Failed to send verification email on login", e);
        }
        await (0, auth_1.signOut)(firebaseConfig_1.auth);
        const err = new Error("Please verify your email. We just sent you a new verification link.");
        err.code = "auth/email-not-verified";
        endPerf({ verified: false });
        throw err;
    }
    // Ensure the profile doc exists
    const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", cred.user.uid));
    if (!snap.exists()) {
        const profile = {
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
            notificationPrefs: {
                pushEnabled: false,
                localEnabled: true,
                territoryStolen: true,
                groupRunStarting: true,
            },
        };
        await (0, firestore_1.setDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", cred.user.uid), profile);
    }
    endPerf({ uid: cred.user.uid, verified: true });
    return cred.user;
}
async function signInWithGoogle(idToken, accessToken) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "signInWithGoogle",
    });
    if (!idToken) {
        throw new Error("Missing Google ID token.");
    }
    const credential = auth_1.GoogleAuthProvider.credential(idToken, accessToken);
    const result = await (0, auth_1.signInWithCredential)(firebaseConfig_1.auth, credential);
    await ensureUserProfile(result.user);
    endPerf({ uid: result.user.uid });
    return result.user;
}
async function signInWithApple(identityToken, rawNonce, displayName, email) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "signInWithApple",
    });
    if (!identityToken) {
        throw new Error("Missing Apple identity token.");
    }
    const provider = new auth_1.OAuthProvider("apple.com");
    const credential = provider.credential({
        idToken: identityToken,
        rawNonce,
    });
    const result = await (0, auth_1.signInWithCredential)(firebaseConfig_1.auth, credential);
    await ensureUserProfile(result.user, {
        displayName: displayName || result.user.displayName || undefined,
        email: email ?? result.user.email ?? null,
    });
    endPerf({ uid: result.user.uid });
    return result.user;
}
async function sendPasswordReset(email) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "sendPasswordReset",
        meta: { email: email?.toLowerCase?.() ?? "" },
    });
    if (!email)
        throw new Error("Please enter your email first.");
    await (0, auth_1.sendPasswordResetEmail)(firebaseConfig_1.auth, email);
    endPerf();
}
async function loadUserProfile(uid) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "loadUserProfile",
        meta: { uid },
    });
    const tag = `AuthService.loadUserProfile:${uid}`;
    (0, bootstrapLogger_1.logStart)(tag, { uid });
    try {
        const userSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", uid));
        if (!userSnap.exists()) {
            endPerf({ exists: false });
            (0, bootstrapLogger_1.logSuccess)(tag, { exists: false });
            return null;
        }
        const base = normalizeUserProfile(userSnap.data());
        // Monthly challenges moved to a separate doc to avoid write contention on the main user profile.
        // Fall back to the legacy embedded field if rules don't allow the subcollection yet.
        try {
            const stateSnap = await (0, firestore_1.getDoc)((0, monthlyChallengesStore_1.monthlyChallengesDocRef)(uid));
            if (stateSnap.exists()) {
                const state = stateSnap.data();
                const profile = { ...base, monthlyChallenges: state };
                endPerf({ exists: true, bytes: (0, perfLogger_1.perfBytes)(profile) });
                (0, bootstrapLogger_1.logSuccess)(tag, { exists: true, bytes: (0, perfLogger_1.perfBytes)(profile) ?? 0 });
                return profile;
            }
        }
        catch {
            // ignore (offline/permission issues)
        }
        endPerf({ exists: true, bytes: (0, perfLogger_1.perfBytes)(base) });
        (0, bootstrapLogger_1.logSuccess)(tag, { exists: true, bytes: (0, perfLogger_1.perfBytes)(base) ?? 0 });
        return base;
    }
    catch (e) {
        (0, bootstrapLogger_1.logFailure)(tag, e, { uid });
        throw e;
    }
}
async function loadUserProfileByUsername(username) {
    const endPerf = (0, perfLogger_1.perfStart)({
        screen: "AuthService",
        phase: "DATA",
        label: "loadUserProfileByUsername",
        meta: { username: username?.toLowerCase?.() ?? "" },
    });
    const trimmed = username.trim().replace(/^@+/, "");
    const usernameLower = trimmed.toLowerCase();
    const tag = `AuthService.loadUserProfileByUsername:${usernameLower}`;
    (0, bootstrapLogger_1.logStart)(tag, { usernameLower });
    try {
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebaseConfig_1.db, "users"), (0, firestore_1.where)("usernameLower", "==", usernameLower), (0, firestore_1.limit)(1));
        const snap = await (0, firestore_1.getDocs)(q);
        if (!snap.empty) {
            const docSnap = snap.docs[0];
            const profile = { ...normalizeUserProfile(docSnap.data()), uid: docSnap.id };
            endPerf({ found: true, bytes: (0, perfLogger_1.perfBytes)(profile) });
            (0, bootstrapLogger_1.logSuccess)(tag, { found: true, bytes: (0, perfLogger_1.perfBytes)(profile) ?? 0 });
            return profile;
        }
        // Fallback for older profiles without usernameLower field
        const fallbackSnap = await (0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(firebaseConfig_1.db, "users"), (0, firestore_1.where)("username", "==", usernameLower), (0, firestore_1.limit)(1)));
        if (fallbackSnap.empty) {
            endPerf({ found: false });
            (0, bootstrapLogger_1.logSuccess)(tag, { found: false });
            return null;
        }
        const docSnap = fallbackSnap.docs[0];
        const profile = { ...normalizeUserProfile(docSnap.data()), uid: docSnap.id };
        endPerf({ found: true, bytes: (0, perfLogger_1.perfBytes)(profile), fallback: true });
        (0, bootstrapLogger_1.logSuccess)(tag, { found: true, bytes: (0, perfLogger_1.perfBytes)(profile) ?? 0, fallback: true });
        return profile;
    }
    catch (e) {
        (0, bootstrapLogger_1.logFailure)(tag, e, { usernameLower });
        throw e;
    }
}
async function updateUserProfile(uid, profile) {
    const endPerf = (0, perfLogger_1.perfStart)({
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
        const current = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebaseConfig_1.db, "users", uid));
        const currentLower = current.exists()
            ? current.data().usernameLower
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
    const sanitized = {};
    Object.entries(profile).forEach(([key, value]) => {
        if (value === undefined)
            return;
        if (typeof value === "number" && Number.isNaN(value))
            return;
        sanitized[key] = value;
    });
    const ref = (0, firestore_1.doc)(firebaseConfig_1.db, "users", uid);
    await (0, firestore_1.setDoc)(ref, sanitized, { merge: true });
    endPerf({ fields: Object.keys(sanitized).length });
}
async function logout() {
    await (0, auth_1.signOut)(firebaseConfig_1.auth);
}
