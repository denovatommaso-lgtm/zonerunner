import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import {
  loadUserProfile,
  signInWithEmail,
  signUpWithEmail,
  updateUserProfile,
  UserProfile,
  logout,
} from "./authService";
import { auth, db } from "./firebaseConfig";
import { subscribeMonthlyChallengesState } from "./monthlyChallengesStore";
import type { MonthlyChallengesState } from "./monthlyChallenges";
import { perfLog, perfStart } from "./perfLogger";

type UseAuthResult = {
  user: {
    uid: string;
    email: string | null;
    profile: UserProfile | null;
  } | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
};

export function useGoogleAuth(): UseAuthResult {
  const [user, setUser] = useState<UseAuthResult["user"]>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const endAuthInit = perfStart({
      screen: "Auth",
      phase: "BOOT",
      label: "auth-init",
    });
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeMonthly: (() => void) | null = null;
    let snapshotSettled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let lastProfile: UserProfile | null = null;
    let lastMonthly: MonthlyChallengesState | null = null;

    const emit = (firebaseUser: any) => {
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        profile: lastProfile
          ? ({
              ...lastProfile,
              monthlyChallenges: lastMonthly ?? lastProfile.monthlyChallenges,
            } as UserProfile)
          : null,
      });
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const endAuthState = perfStart({
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
        const profileRef = doc(db, "users", firebaseUser.uid);
        snapshotSettled = false;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        // Never allow auth to be "stuck loading" if Firestore snapshot fails/hangs.
        fallbackTimer = setTimeout(async () => {
          if (snapshotSettled) return;
          try {
            const endProfileLoad = perfStart({
              screen: "Auth",
              phase: "DATA",
              label: "profile-load:fallback",
            });
            const profile = await loadUserProfile(firebaseUser.uid);
            lastProfile = profile;
            lastMonthly = (profile as any)?.monthlyChallenges ?? lastMonthly;
            emit(firebaseUser);
            endProfileLoad();
          } catch {
            lastProfile = null;
            emit(firebaseUser);
          } finally {
            snapshotSettled = true;
            setLoading(false);
          }
        }, 3500);

        // Monthly challenges live in a separate doc; subscribe so they update even when the profile doc doesn't change.
        if (unsubscribeMonthly) unsubscribeMonthly();
        try {
          unsubscribeMonthly = subscribeMonthlyChallengesState(
            firebaseUser.uid,
            (state) => {
              // Do not clear existing monthly state if subdoc is missing/unreadable.
              if (state) {
                lastMonthly = state;
                if (lastProfile) emit(firebaseUser);
                perfLog({
                  screen: "Auth",
                  phase: "DATA",
                  label: "monthly-challenges:live",
                  durationMs: 0,
                });
              }
            },
            () => {
              // ignore (rules may not allow this yet)
            }
          );
        } catch {
          // ignore
        }

        unsubscribeProfile = onSnapshot(
          profileRef,
          (snap) => {
            perfLog({
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
            const profile = snap.exists() ? (snap.data() as UserProfile) : null;
            lastProfile = profile;
            emit(firebaseUser);
            setLoading(false);
            endAuthState();
          },
          async (err) => {
            snapshotSettled = true;
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            // Permission/offline errors can happen; don't block app entry.
            setError((err as any)?.message ?? "Failed to load profile");
            try {
              const profile = await loadUserProfile(firebaseUser.uid);
              lastProfile = profile;
              lastMonthly = (profile as any)?.monthlyChallenges ?? lastMonthly;
              emit(firebaseUser);
            } catch {
              lastProfile = null;
              emit(firebaseUser);
            } finally {
              setLoading(false);
              endAuthState();
            }
          }
        );
      } catch (e) {
        // Fallback: load once if snapshot setup fails
        const endProfileLoad = perfStart({
          screen: "Auth",
          phase: "DATA",
          label: "profile-load:once",
        });
        const profile = await loadUserProfile(firebaseUser.uid);
        lastProfile = profile;
        lastMonthly = (profile as any)?.monthlyChallenges ?? lastMonthly;
        emit(firebaseUser);
        setLoading(false);
        endProfileLoad();
        endAuthState();
      }
    });

    return () => {
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeMonthly) unsubscribeMonthly();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribeAuth();
      endAuthInit();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      setLoading(true);
      setError(null);
      try {
        await signUpWithEmail(email, password, displayName);
      } catch (e: any) {
        setError(e?.message ?? "Could not sign up");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      setError(e?.message ?? "Could not sign in");
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await logout();
      setUser(null);
    } catch (e: any) {
      setError(e?.message ?? "Could not sign out");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(
    async (data: Partial<UserProfile>) => {
      if (!user?.uid) return;
      try {
        await updateUserProfile(user.uid, data);
        const profile = await loadUserProfile(user.uid);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                profile,
              }
            : prev
        );
      } catch (e: any) {
        setError(e?.message ?? "Could not update profile");
      }
    },
    [user?.uid]
  );

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
