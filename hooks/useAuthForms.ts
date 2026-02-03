import { useState } from 'react';
import { sendPasswordReset, signInWithEmail, signUpWithEmail } from '../lib/authService';

type AuthMode = 'choose' | 'signup' | 'login';

export function useAuthForms() {
  const [authMode, setAuthMode] = useState<AuthMode>('choose');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetSentAt, setResetSentAt] = useState<number | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  const signUp = async () => {
    setAuthError(null);
    try {
      setAuthLoading(true);
      const emailTrim = email.trim();
      const usernameTrim = username.trim();
      const display = displayName.trim() || emailTrim;
      if (!emailTrim) {
        setAuthError('Please enter your email.');
        return;
      }
      if (!usernameTrim) {
        setAuthError('Please choose a username.');
        return;
      }
      if (password.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }
      const usernameLower = usernameTrim.toLowerCase();
      const user = await signUpWithEmail(
        emailTrim,
        password,
        display,
        {
          phoneNumber: phoneNumber.trim(),
          username: usernameLower,
        }
      );
      return user;
    } catch (e: any) {
      setAuthError(e?.message ?? 'Failed to sign up');
    } finally {
      setAuthLoading(false);
    }
  };

  const signIn = async () => {
    setAuthError(null);
    setNeedsVerification(false);
    try {
      setAuthLoading(true);
      await signInWithEmail(email.trim(), password);
    } catch (e: any) {
      if (e?.code === 'auth/email-not-verified') {
        setNeedsVerification(true);
      }
      setAuthError(e?.message ?? 'Failed to sign in');
    } finally {
      setAuthLoading(false);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setAuthError('Enter your email to reset password.');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordReset(email.trim());
      setResetSentAt(Date.now());
    } catch (e: any) {
      setAuthError(e?.message ?? 'Failed to send reset email');
    } finally {
      setResetting(false);
    }
  };

  return {
    authMode,
    setAuthMode,
    email,
    setEmail,
    phoneNumber,
    setPhoneNumber,
    username,
    setUsername,
    password,
    setPassword,
    displayName,
    setDisplayName,
    authLoading,
    authError,
    resetting,
    resetSentAt,
    signUp,
    signIn,
    sendReset,
    setAuthError,
    needsVerification,
    setNeedsVerification,
  };
}

export type UseAuthFormsReturn = ReturnType<typeof useAuthForms>;
