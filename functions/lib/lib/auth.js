"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useGoogleAuth = useGoogleAuth;
const auth_1 = require("firebase/auth");
const firestore_1 = require("firebase/firestore");
const react_1 = require("react");
const authService_1 = require("./authService");
const firebaseConfig_1 = require("./firebaseConfig");
const monthlyChallengesStore_1 = require("./monthlyChallengesStore");
const perfLogger_1 = require("./perfLogger");
function useGoogleAuth() {
    const [user, setUser] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        const endAuthInit = (0, perfLogger_1.perfStart)({
            screen: "Auth",
            phase: "BOOT",
            label: "auth-init",
        });
        let unsubscribeProfile = null;
        let unsubscribeMonthly = null;
        let snapshotSettled = false;
        let fallbackTimer = null;
        let lastProfile = null;
        let lastMonthly = null;
        const emit = (firebaseUser) => {
            setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                profile: lastProfile
                    ? {
                        ...lastProfile,
                        monthlyChallenges: lastMonthly ?? lastProfile.monthlyChallenges,
                    }
                    : null,
            });
        };
        const unsubscribeAuth = (0, auth_1.onAuthStateChanged)(firebaseConfig_1.auth, async (firebaseUser) => {
            const endAuthState = (0, perfLogger_1.perfStart)({
                screen: "Auth",
                phase: "DATA",
                label: firebaseUser ? "auth-state:authed" : "auth-state:missing",
            });
            if (!firebaseUser) {
                if (unsubscribeProfile) {
                    unsubscribeProfile();
                    unsubscribeProfile = null;
                }
                if (unsubscribeMonthly) {
                    unsubscribeMonthly();
                    unsubscribeMonthly = null;
                }
                snapshotSettled = false;
                if (fallbackTimer) {
                    clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
                lastProfile = null;
                lastMonthly = null;
                setUser(null);
                setLoading(false);
                endAuthState();
                return;
            }
            // Listen for live profile updates so color changes propagate instantly
            try {
                const profileRef = (0, firestore_1.doc)(firebaseConfig_1.db, "users", firebaseUser.uid);
                snapshotSettled = false;
                if (fallbackTimer)
                    clearTimeout(fallbackTimer);
                // Never allow auth to be "stuck loading" if Firestore snapshot fails/hangs.
                fallbackTimer = setTimeout(async () => {
                    if (snapshotSettled)
                        return;
                    try {
                        const endProfileLoad = (0, perfLogger_1.perfStart)({
                            screen: "Auth",
                            phase: "DATA",
                            label: "profile-load:fallback",
                        });
                        const profile = await (0, authService_1.loadUserProfile)(firebaseUser.uid);
                        lastProfile = profile;
                        lastMonthly = profile?.monthlyChallenges ?? lastMonthly;
                        emit(firebaseUser);
                        endProfileLoad();
                    }
                    catch {
                        lastProfile = null;
                        emit(firebaseUser);
                    }
                    finally {
                        snapshotSettled = true;
                        setLoading(false);
                    }
                }, 3500);
                // Monthly challenges live in a separate doc; subscribe so they update even when the profile doc doesn't change.
                if (unsubscribeMonthly)
                    unsubscribeMonthly();
                try {
                    unsubscribeMonthly = (0, monthlyChallengesStore_1.subscribeMonthlyChallengesState)(firebaseUser.uid, (state) => {
                        // Do not clear existing monthly state if subdoc is missing/unreadable.
                        if (state) {
                            lastMonthly = state;
                            if (lastProfile)
                                emit(firebaseUser);
                            (0, perfLogger_1.perfLog)({
                                screen: "Auth",
                                phase: "DATA",
                                label: "monthly-challenges:live",
                                durationMs: 0,
                            });
                        }
                    }, () => {
                        // ignore (rules may not allow this yet)
                    });
                }
                catch {
                    // ignore
                }
                unsubscribeProfile = (0, firestore_1.onSnapshot)(profileRef, (snap) => {
                    (0, perfLogger_1.perfLog)({
                        screen: "Auth",
                        phase: "DATA",
                        label: "profile-snapshot",
                        durationMs: 0,
                    });
                    snapshotSettled = true;
                    if (fallbackTimer) {
                        clearTimeout(fallbackTimer);
                        fallbackTimer = null;
                    }
                    const profile = snap.exists() ? snap.data() : null;
                    lastProfile = profile;
                    emit(firebaseUser);
                    setLoading(false);
                    endAuthState();
                }, async (err) => {
                    snapshotSettled = true;
                    if (fallbackTimer) {
                        clearTimeout(fallbackTimer);
                        fallbackTimer = null;
                    }
                    // Permission/offline errors can happen; don't block app entry.
                    setError(err?.message ?? "Failed to load profile");
                    try {
                        const profile = await (0, authService_1.loadUserProfile)(firebaseUser.uid);
                        lastProfile = profile;
                        lastMonthly = profile?.monthlyChallenges ?? lastMonthly;
                        emit(firebaseUser);
                    }
                    catch {
                        lastProfile = null;
                        emit(firebaseUser);
                    }
                    finally {
                        setLoading(false);
                        endAuthState();
                    }
                });
            }
            catch (e) {
                // Fallback: load once if snapshot setup fails
                const endProfileLoad = (0, perfLogger_1.perfStart)({
                    screen: "Auth",
                    phase: "DATA",
                    label: "profile-load:once",
                });
                const profile = await (0, authService_1.loadUserProfile)(firebaseUser.uid);
                lastProfile = profile;
                lastMonthly = profile?.monthlyChallenges ?? lastMonthly;
                emit(firebaseUser);
                setLoading(false);
                endProfileLoad();
                endAuthState();
            }
        });
        return () => {
            if (unsubscribeProfile)
                unsubscribeProfile();
            if (unsubscribeMonthly)
                unsubscribeMonthly();
            if (fallbackTimer)
                clearTimeout(fallbackTimer);
            unsubscribeAuth();
            endAuthInit();
        };
    }, []);
    const signUp = (0, react_1.useCallback)(async (email, password, displayName) => {
        setLoading(true);
        setError(null);
        try {
            await (0, authService_1.signUpWithEmail)(email, password, displayName);
        }
        catch (e) {
            setError(e?.message ?? "Could not sign up");
        }
        finally {
            setLoading(false);
        }
    }, []);
    const signIn = (0, react_1.useCallback)(async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            await (0, authService_1.signInWithEmail)(email, password);
        }
        catch (e) {
            setError(e?.message ?? "Could not sign in");
        }
        finally {
            setLoading(false);
        }
    }, []);
    const signOut = (0, react_1.useCallback)(async () => {
        setLoading(true);
        setError(null);
        try {
            await (0, authService_1.logout)();
            setUser(null);
        }
        catch (e) {
            setError(e?.message ?? "Could not sign out");
        }
        finally {
            setLoading(false);
        }
    }, []);
    const updateProfile = (0, react_1.useCallback)(async (data) => {
        if (!user?.uid)
            return;
        try {
            await (0, authService_1.updateUserProfile)(user.uid, data);
            const profile = await (0, authService_1.loadUserProfile)(user.uid);
            setUser((prev) => prev
                ? {
                    ...prev,
                    profile,
                }
                : prev);
        }
        catch (e) {
            setError(e?.message ?? "Could not update profile");
        }
    }, [user?.uid]);
    return {
        user,
        loading,
        error,
        signUp,
        signIn,
        signOut,
        updateProfile,
    };
}
