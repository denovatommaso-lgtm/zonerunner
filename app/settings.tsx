import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoogleAuth } from '../lib/auth';
import { updateUserProfile } from '../lib/authService';
import { COLOR_SET } from '../lib/constants';
import { BackButton } from '../components/common/BackButton';
import { SaveButton } from '../components/common/SaveButton';
import { checkAndRecordMainRanking } from '../lib/rankingTracker';
import {
  RankingsLocationPicker,
  type RankingsLocationValue,
} from '../components/common/RankingsLocationPicker';

const PROFILE_KEY = 'zonerunner:profile';
const PRIVACY_POLICY_URL = 'https://zonerunner.app/privacy';
const LOCATION_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export default function SettingsScreen() {
  const { user, loading } = useGoogleAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [territoryColor, setTerritoryColor] = useState('#1e90ff');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [rankLocation, setRankLocation] = useState<RankingsLocationValue>({});
  const [rankLocationSetAtMs, setRankLocationSetAtMs] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [pickerField, setPickerField] = useState<'day' | 'month' | 'year' | null>(null);

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

  useEffect(() => {
    if (user?.profile?.displayName) {
      setDisplayName(user.profile.displayName);
    }
    if (user?.profile?.username) {
      setUsername(user.profile.username);
    }
    if (user?.profile?.territoryColor) {
      setTerritoryColor(user.profile.territoryColor);
    }
    if (user?.profile?.heightCm !== undefined && user.profile.heightCm !== null) {
      setHeightCm(String(user.profile.heightCm));
    }
    if (user?.profile?.weightKg !== undefined && user.profile.weightKg !== null) {
      setWeightKg(String(user.profile.weightKg));
    }
    if (user?.profile?.gender) {
      setGender(user.profile.gender);
    }
    if (user?.profile?.birthDay) setBirthDay(String(user.profile.birthDay));
    if (user?.profile?.birthMonth) setBirthMonth(String(user.profile.birthMonth));
    if (user?.profile?.birthYear) setBirthYear(String(user.profile.birthYear));
    if (user?.profile?.rankLocationSetAtMs) {
      setRankLocationSetAtMs(user.profile.rankLocationSetAtMs);
    }
    setRankLocation({
      countryCode: user?.profile?.countryCode,
      stateCode: user?.profile?.stateCode,
      countryName: user?.profile?.countryName,
      stateName: user?.profile?.stateName,
    });
  }, [user?.profile]);

  const handleSave = async () => {
    if (!user?.uid) return;
    try {
      setSaving(true);
      await updateUserProfile(user.uid, {
        displayName: displayName.trim() || user.email || 'ZoneRunner player',
        username: username.trim() || user.profile?.username,
        heightCm: heightCm.trim() ? parseFloat(heightCm) : undefined,
        weightKg: weightKg.trim() ? parseFloat(weightKg) : undefined,
        gender: gender || undefined,
        birthDay: birthDay ? parseInt(birthDay, 10) : undefined,
        birthMonth: birthMonth ? parseInt(birthMonth, 10) : undefined,
        birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
        territoryColor,
      });
      // keep local cache in sync for other screens that read AsyncStorage
      await AsyncStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({
          territoryColor,
          avatarUri: user.profile?.avatarUrl,
        })
      );
      Alert.alert('Saved', 'Your settings have been updated.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (e) {
      const message =
        (e as any)?.message ?? 'Failed to save settings. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        Alert.alert(
          'Link unavailable',
          'Please visit zonerunner.app/privacy in your browser.'
        );
      }
    } catch (e) {
      console.log('Failed to open privacy policy', e);
      Alert.alert(
        'Link unavailable',
        'Please visit zonerunner.app/privacy in your browser.'
      );
    }
  };

  const handleSaveRankLocation = async () => {
    if (!user?.uid) return;
    const now = Date.now();
    const existing = {
      countryCode: user.profile?.countryCode ?? '',
      stateCode: user.profile?.stateCode ?? '',
    };
    const next = {
      countryCode: rankLocation.countryCode ?? '',
      stateCode: rankLocation.stateCode ?? '',
    };
    const changed =
      existing.countryCode !== next.countryCode ||
      existing.stateCode !== next.stateCode;
    if (!changed) {
      Alert.alert('No changes', 'Rankings location is unchanged.');
      return;
    }
    if (rankLocationSetAtMs && now - rankLocationSetAtMs < LOCATION_CHANGE_COOLDOWN_MS) {
      const nextAllowed = new Date(rankLocationSetAtMs + LOCATION_CHANGE_COOLDOWN_MS);
      Alert.alert(
        'Try again later',
        `You can change rankings location after ${nextAllowed.toLocaleDateString()}.`
      );
      return;
    }
    try {
      setLocationSaving(true);
      await updateUserProfile(user.uid, {
        stateCode: rankLocation.stateCode || undefined,
        countryCode: rankLocation.countryCode || undefined,
        stateName: rankLocation.stateName || undefined,
        countryName: rankLocation.countryName || undefined,
        rankLocationSetAtMs: now,
      });
      void checkAndRecordMainRanking({
        userId: user.uid,
        reason: 'rank_location_updated',
        force: true,
      }).catch(() => undefined);
      setRankLocationSetAtMs(now);
      Alert.alert('Saved', 'Rankings location updated.');
    } catch (e) {
      const message = (e as any)?.message ?? 'Failed to save rankings location.';
      Alert.alert('Error', message);
    } finally {
      setLocationSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerSide}>
            <BackButton onPress={() => router.back()} />
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.title}>Settings</Text>
          </View>
          <View style={styles.headerSide}>
            <SaveButton onPress={handleSave} disabled={saving || loading} label={saving ? 'Saving…' : 'Save'} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Display name</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Your display name"
              placeholderTextColor="#6b7280"
              value={displayName}
              onChangeText={setDisplayName}
            />
            {displayName.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setDisplayName('')}
              >
                <Text style={styles.clearButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.helperText}>
            This is the name people will see in the app.
          </Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <RankingsLocationPicker
            label="Rankings Location"
            helperText="Used only for State/Country leaderboards."
            value={rankLocation}
            onChange={setRankLocation}
          />
        </View>
        <View style={styles.rankLocationActions}>
          <TouchableOpacity
            style={[styles.devButton, (locationSaving || loading) && styles.devButtonDisabled]}
            onPress={handleSaveRankLocation}
            disabled={locationSaving || loading}
          >
            <Text style={styles.devButtonText}>
              {locationSaving ? 'Saving…' : 'Save rankings location'}
            </Text>
          </TouchableOpacity>
          {rankLocationSetAtMs ? (
            <Text style={styles.helperText}>
              Changes allowed every 30 days.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Personal info</Text>
          <View style={[styles.infoRow, styles.infoRowSpaced]}>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 175"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={heightCm}
                onChangeText={setHeightCm}
              />
            </View>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 70"
                placeholderTextColor="#6b7280"
                keyboardType="numeric"
                value={weightKg}
                onChangeText={setWeightKg}
              />
            </View>
          </View>
          <View style={styles.divider} />
          <View style={[styles.infoRow, styles.infoRowSpaced]}>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {['male', 'female', 'other'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.chip,
                      gender === g && styles.chipActive,
                    ]}
                    onPress={() => setGender(g as any)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        gender === g && styles.chipTextActive,
                      ]}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={[styles.infoRow, styles.infoRowSpaced]}>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Birth date</Text>
              <View style={styles.birthRow}>
                <TouchableOpacity
                  style={[styles.birthPicker]}
                  onPress={() => setPickerField('day')}
                >
                  <Text style={styles.birthPickerLabel}>Day</Text>
                  <Text style={styles.birthPickerValue}>{birthDay || 'DD'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.birthPicker]}
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
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Your username"
              placeholderTextColor="#6b7280"
              value={username}
              autoCapitalize="none"
              onChangeText={setUsername}
            />
            {username.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setUsername('')}
              >
                <Text style={styles.clearButtonText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.card, styles.linkCard]}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={handleOpenPrivacyPolicy}
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy in browser"
          >
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Text style={styles.linkArrow}>›</Text>
          </TouchableOpacity>
          <Text style={styles.linkHelper}>Opens in your browser</Text>
        </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: 'white',
    textAlign: 'center',
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerSide: { width: 88, alignItems: 'flex-start' },
  subtitle: {
    display: 'none',
  },
  card: {
    backgroundColor: '#0b1120',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#111827',
    marginBottom: 16,
  },
  label: {
    color: '#e5e7eb',
    fontWeight: '700',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  clearButton: {
    width: 36,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '800',
  },
  helperText: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 6,
  },
  rankLocationActions: {
    marginTop: -8,
    marginBottom: 16,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoRowSpaced: {
    marginBottom: 8,
  },
  infoField: {
    flex: 1,
  },
  infoLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
  },
  chipActive: {
    borderColor: '#22c55e',
    backgroundColor: '#0b1220',
  },
  chipText: {
    color: '#e5e7eb',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#22c55e',
  },
  divider: {
    height: 1,
    backgroundColor: '#111827',
    marginVertical: 12,
  },
  birthRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0b1120',
  },
  colorSelected: {
    borderColor: '#ffffff',
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
  linkCard: {
    paddingVertical: 12,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 15,
  },
  linkArrow: {
    color: '#6b7280',
    fontSize: 22,
    fontWeight: '800',
  },
  linkHelper: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 12,
  },
  devButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  devButtonDisabled: {
    opacity: 0.6,
  },
  devButtonText: {
    color: '#e5e7eb',
    fontWeight: '700',
    fontSize: 13,
  },
});
