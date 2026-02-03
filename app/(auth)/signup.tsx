import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@/components/common/Ionicons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../lib/firebaseConfig';
import { updateUserProfile, checkUsernameAvailable, logout } from '../../lib/authService';
import { useAuthForms } from '../../hooks/useAuthForms';
import { monthlyChallenges } from '../../lib/monthlyChallengesConfig';
import { getAllColorsWithRequiredLevels } from '../../lib/rewards/rewardSchedule';
import {
  RankingsLocationPicker,
  type RankingsLocationValue,
} from '../../components/common/RankingsLocationPicker';

const PROFILE_KEY = 'zonerunner:profile';

export default function SignupScreen() {
  const router = useRouter();
  const {
    email,
    setEmail,
    password,
    setPassword,
    phoneNumber,
    setPhoneNumber,
    username,
    setUsername,
    displayName,
    setDisplayName,
    signUp,
    authError,
    setAuthError,
    authLoading,
  } = useAuthForms();
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [signupStep, setSignupStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [phonePrefix, setPhonePrefix] = useState('+52');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const defaultColors = useMemo(
    () => getAllColorsWithRequiredLevels().filter((c) => c.requiredLevel === 0).map((c) => c.hex),
    []
  );
  const [territoryColor, setTerritoryColor] = useState<string>(defaultColors[0] ?? '#1e90ff');
  const [pickerField, setPickerField] = useState<'day' | 'month' | 'year' | null>(null);
  const [firstChallengeId, setFirstChallengeId] = useState<string | null>(null);
  const [rankLocation, setRankLocation] = useState<RankingsLocationValue>({});
  const clearError = () => setAuthError(null);

  const dayOptions = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const monthOptions = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];
  const yearOptions = Array.from({ length: 2026 - 1900 + 1 }, (_, i) => String(1900 + i)).reverse();

  const passwordStrength = useMemo(() => {
    const pwd = password || '';
    const lengthScore = pwd.length >= 10 ? 2 : pwd.length >= 6 ? 1 : 0;
    const variety =
      Number(/[A-Z]/.test(pwd)) +
      Number(/[a-z]/.test(pwd)) +
      Number(/[0-9]/.test(pwd)) +
      Number(/[^A-Za-z0-9]/.test(pwd));
    const score = lengthScore + variety;
    if (!pwd) return { label: 'Add a password', color: '#94a3b8' };
    if (score <= 2) return { label: 'Weak • use 8+ chars and numbers', color: '#f97316' };
    if (score === 3) return { label: 'Okay • add symbols for extra strength', color: '#facc15' };
    return { label: 'Strong', color: '#22c55e' };
  }, [password]);

  const featuredChallenges = useMemo(
    () =>
      monthlyChallenges.map((c) => ({
        id: c.id,
        label: c.baseLabel,
        description: c.description,
        firstStar: 'Stage I',
      })),
    []
  );

  const handleCreateAccount = async () => {
    const emailTrim = email.trim();
    const user = await signUp();
    const uid = user?.uid ?? auth.currentUser?.uid;
    if (!uid) return;
    const lowerUsername = username.trim().toLowerCase();
    const display = displayName.trim() || emailTrim;
    const parsedWeight = weightKg ? Number(weightKg) : undefined;
    const phoneCombined = phoneNumber.trim()
      ? `${phonePrefix}${phoneNumber.trim()}`
      : undefined;
    try {
      const now = Date.now();
      await updateUserProfile(uid, {
        displayName: display,
        username: lowerUsername,
        phoneNumber: phoneCombined,
        territoryColor,
        birthDay: birthDay ? Number(birthDay) : undefined,
        birthMonth: birthMonth ? Number(birthMonth) : undefined,
        birthYear: birthYear ? Number(birthYear) : undefined,
        gender: gender === '' ? undefined : gender,
        weightKg: Number.isFinite(parsedWeight as number) ? parsedWeight : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        onboardingChallengeId: firstChallengeId || undefined,
        countryCode: rankLocation.countryCode || undefined,
        stateCode: rankLocation.stateCode || undefined,
        countryName: rankLocation.countryName || undefined,
        stateName: rankLocation.stateName || undefined,
        rankLocationSetAtMs: rankLocation.countryCode ? now : undefined,
      });
      await AsyncStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          territoryColor,
        })
      );
      await logout();
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: emailTrim },
      });
    } catch (e) {
      console.log('Failed to finish signup', e);
      setAuthError('Could not finish signup, please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace('/(auth)/welcome')}
            >
              <Ionicons name="arrow-back" size={18} color="#e5e7eb" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              Capture territory, compete with friends, and build your crew.
            </Text>
          </View>

          {signupStep === 1 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Welcome to ZoneRunner</Text>
              <Text style={styles.stepSubtitle}>What should we call you?</Text>
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor="#64748b"
                value={displayName}
                onChangeText={(txt) => {
                  setDisplayName(txt);
                  clearError();
                }}
              />
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  if (!displayName.trim()) {
                    setAuthError('Please enter a display name.');
                    return;
                  }
                  setAuthError(null);
                  setSignupStep(2);
                }}
              >
                <Text style={styles.primaryText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {signupStep === 2 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Account details</Text>
              <View style={styles.gap}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(txt) => {
                    setEmail(txt);
                    clearError();
                  }}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password (min 6 characters)"
                  placeholderTextColor="#64748b"
                  secureTextEntry
                  value={password}
                  onChangeText={(txt) => {
                    setPassword(txt);
                    clearError();
                  }}
                />
                <Text style={[styles.hintText, { color: passwordStrength.color }]}>
                  {passwordStrength.label}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#64748b"
                  secureTextEntry
                  value={passwordConfirm}
                  onChangeText={(txt) => {
                    setPasswordConfirm(txt);
                    clearError();
                  }}
                />
                <View style={styles.inlineRow}>
                  <TouchableOpacity
                    style={styles.prefixPill}
                    onPress={() => {
                      const options = ['+1', '+34', '+44', '+52'];
                      const currentIdx = options.indexOf(phonePrefix);
                      const next = options[(currentIdx + 1) % options.length];
                      setPhonePrefix(next);
                    }}
                  >
                    <Text style={styles.prefixText}>{phonePrefix}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                  placeholder="Phone number"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={(txt) => {
                    setPhoneNumber(txt);
                    clearError();
                  }}
                />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Username (lowercase)"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  value={username}
                  onChangeText={async (txt) => {
                    const lowered = txt.toLowerCase();
                    setUsername(lowered);
                    clearError();
                    if (!lowered.trim()) {
                      setUsernameStatus('idle');
                      return;
                    }
                    setUsernameStatus('checking');
                    try {
                      const available = await checkUsernameAvailable(lowered);
                      setUsernameStatus(available ? 'available' : 'taken');
                    } catch {
                      setUsernameStatus('idle');
                    }
                  }}
                />
                {usernameStatus === 'taken' ? (
                  <Text style={styles.usernameError}>Username is already taken.</Text>
                ) : usernameStatus === 'checking' ? (
                  <Text style={styles.usernameInfo}>Checking availability…</Text>
                ) : null}
              </View>
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.secondaryButton, { flex: 1 }]}
                  onPress={() => setSignupStep(1)}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, { flex: 1 }]}
                  onPress={() => {
                    if (!email.trim() || !password || !passwordConfirm || !username.trim()) {
                      setAuthError('Email, password, confirm password, and username are required.');
                      return;
                    }
                    if (password !== passwordConfirm) {
                      setAuthError('Passwords do not match.');
                      return;
                    }
                    if (passwordStrength.label.startsWith('Add') || passwordStrength.label.startsWith('Weak')) {
                      setAuthError('Please strengthen your password a bit more.');
                      return;
                    }
                    if (usernameStatus === 'taken' || usernameStatus === 'checking') {
                      setAuthError('Please choose an available username.');
                      return;
                    }
                    setAuthError(null);
                    Alert.alert(
                      'Verify your email',
                      'After creating your account we will send a verification link to this email. Confirm it before signing in.',
                      [
                        {
                          text: 'Got it',
                          onPress: () => setSignupStep(3),
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {signupStep === 3 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>About you</Text>
              <Text style={styles.stepSubtitle}>Date of birth & sex</Text>
              <View style={styles.inlineRow}>
                <TouchableOpacity
                  style={styles.birthPicker}
                  onPress={() => setPickerField('day')}
                >
                  <Text style={styles.birthPickerLabel}>Day</Text>
                  <Text style={styles.birthPickerValue}>{birthDay || 'DD'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.birthPicker}
                  onPress={() => setPickerField('month')}
                >
                  <Text style={styles.birthPickerLabel}>Month</Text>
                  <Text style={styles.birthPickerValue}>
                    {birthMonth ? monthOptions.find((m) => m.value === birthMonth)?.label ?? birthMonth : 'Month'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.birthPicker, styles.birthPickerYear]}
                  onPress={() => setPickerField('year')}
                >
                  <Text style={styles.birthPickerLabel}>Year</Text>
                  <Text style={styles.birthPickerValue}>{birthYear || 'YYYY'}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.inlineRow, { marginTop: 8 }]}>
                {[
                  { key: 'male', label: 'Male' },
                  { key: 'female', label: 'Female' },
                  { key: 'other', label: 'Other' },
                ].map((g) => (
                  <TouchableOpacity
                    key={g.key}
                    style={[
                      styles.prefixPill,
                      gender === g.key && styles.prefixPillActive,
                      { flex: 1, justifyContent: 'center' },
                    ]}
                    onPress={() => setGender(g.key as any)}
                  >
                    <Text
                      style={[
                        styles.prefixText,
                        gender === g.key && styles.prefixTextActive,
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setSignupStep(2)}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => {
                    if (!birthDay || !birthMonth || !birthYear || !gender) {
                      setAuthError('Please fill date of birth and select sex.');
                      return;
                    }
                    setAuthError(null);
                    setSignupStep(4);
                  }}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {signupStep === 4 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Almost done</Text>
              <Text style={styles.stepSubtitle}>Height & weight personalize your stats.</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  style={[styles.input, styles.mediumInput]}
                  placeholder="Height (cm)"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={heightCm}
                  onChangeText={setHeightCm}
                />
                <TextInput
                  style={[styles.input, styles.mediumInput]}
                  placeholder="Weight (kg)"
                  placeholderTextColor="#64748b"
                  keyboardType="numeric"
                  value={weightKg}
                  onChangeText={setWeightKg}
                />
              </View>
              <Text style={[styles.stepSubtitle, { marginTop: 8 }]}>Pick your territory color</Text>
              <View style={styles.colorGrid}>
                {defaultColors.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c, borderColor: c },
                      territoryColor === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setTerritoryColor(c)}
                  />
                ))}
              </View>
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setSignupStep(3)}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, authLoading && { opacity: 0.7 }]}
                  onPress={() => setSignupStep(5)}
                >
                  <Text style={styles.primaryText}>
                    Next
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {signupStep === 5 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Pick your first challenge</Text>
              <Text style={styles.stepSubtitle}>
                Choose a starting goal. You can change it later in your profile.
              </Text>
              <View style={{ gap: 10, marginTop: 8 }}>
                {featuredChallenges.map((ch) => (
                  <TouchableOpacity
                    key={ch.id}
                    style={[
                      styles.challengePill,
                      firstChallengeId === ch.id && styles.challengePillActive,
                    ]}
                    onPress={() => setFirstChallengeId(ch.id)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.challengeTitle}>{ch.label}</Text>
                      <Text style={styles.challengeStar}>{ch.firstStar}</Text>
                    </View>
                    <Text style={styles.challengeDescription}>{ch.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setSignupStep(4)}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, authLoading && { opacity: 0.7 }]}
                  onPress={() => setSignupStep(6)}
                  disabled={authLoading}
                >
                  <Text style={styles.primaryText}>
                    Next
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {signupStep === 6 && (
            <View style={styles.card}>
              <Text style={styles.stepTitle}>Set your rankings location</Text>
              <Text style={styles.stepSubtitle}>
                Used only for State/Country leaderboards.
              </Text>
              <RankingsLocationPicker
                value={rankLocation}
                onChange={setRankLocation}
                variant="plain"
              />
              <View style={styles.rowBetween}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setSignupStep(5)}
                >
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, authLoading && { opacity: 0.7 }]}
                  onPress={() => {
                    if (!rankLocation.countryCode) {
                      setAuthError('Select a country or skip for now.');
                      return;
                    }
                    clearError();
                    void handleCreateAccount();
                  }}
                  disabled={authLoading}
                >
                  <Text style={styles.primaryText}>
                    {authLoading ? 'Creating…' : 'Continue'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.linkButton, { marginTop: 6 }]}
                onPress={handleCreateAccount}
                disabled={authLoading}
              >
                <Text style={styles.linkButtonText}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.linkButtonText}>Have an account? Log in</Text>
          </TouchableOpacity>

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

          <Modal
            key={pickerField ?? 'picker-none'}
            visible={pickerField !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setPickerField(null)}
          >
            <TouchableOpacity
              style={styles.pickerOverlay}
              activeOpacity={1}
              onPress={() => setPickerField(null)}
            >
              <TouchableOpacity
                style={[
                  styles.pickerCard,
                  pickerField === 'day' && styles.pickerCardDay,
                  pickerField === 'month' && styles.pickerCardMonth,
                  pickerField === 'year' && styles.pickerCardYear,
                ]}
                activeOpacity={1}
              >
                <Text style={styles.pickerTitle}>
                  {pickerField === 'day'
                    ? 'Select day'
                    : pickerField === 'month'
                    ? 'Select month'
                    : 'Select year'}
                </Text>
                <ScrollView style={{ maxHeight: 320 }}>
                  {(pickerField === 'day'
                    ? dayOptions
                    : pickerField === 'month'
                    ? monthOptions.map((m) => m.label)
                    : yearOptions
                  ).map((opt, idx) => {
                    const value =
                      pickerField === 'month'
                        ? monthOptions[idx].value
                        : opt;
                    return (
                      <TouchableOpacity
                        key={`${pickerField}-${opt}`}
                        style={[styles.pickerOption, idx > 0 && styles.pickerOptionSeparator]}
                        onPress={() => {
                          if (pickerField === 'day') setBirthDay(value as string);
                          if (pickerField === 'month') setBirthMonth(value as string);
                          if (pickerField === 'year') setBirthYear(value as string);
                          setPickerField(null);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 20,
  },
  content: {
    paddingVertical: 24,
    gap: 16,
  },
  navRow: {
    marginBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: 'white',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#0b1220',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111827',
    gap: 10,
  },
  stepTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  stepSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  mediumInput: {
    flex: 1,
  },
  birthPicker: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1120',
  },
  birthPickerYear: {
    flex: 1.2,
  },
  birthPickerLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 2,
  },
  birthPickerValue: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#020617',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
  },
  secondaryText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  prefixPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
  },
  prefixPillActive: {
    backgroundColor: '#1e293b',
    borderColor: '#22c55e',
  },
  prefixText: {
    color: '#9ca3af',
    fontWeight: '700',
  },
  prefixTextActive: {
    color: '#22c55e',
  },
  linkButton: {
    alignSelf: 'center',
    marginTop: 4,
  },
  linkButtonText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    alignSelf: 'center',
  },
  gap: {
    gap: 10,
  },
  usernameError: {
    color: '#f87171',
    fontSize: 12,
  },
  usernameInfo: {
    color: '#9ca3af',
    fontSize: 12,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#111827',
  },
  colorSwatchActive: {
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerCard: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#9ca3af44',
  },
  pickerCardDay: {
    width: 200,
  },
  pickerCardMonth: {
    width: 240,
  },
  pickerCardYear: {
    width: 180,
  },
  pickerTitle: {
    color: 'white',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  pickerOption: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  pickerOptionSeparator: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
  },
  pickerOptionText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  challengePill: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  challengePillActive: {
    borderColor: '#22c55e',
    backgroundColor: '#0b1220',
  },
  challengeTitle: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 15,
  },
  challengeStar: {
    color: '#22c55e',
    fontWeight: '700',
    fontSize: 12,
  },
  challengeDescription: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
  },
});
