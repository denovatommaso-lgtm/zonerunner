import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { User } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { loadUserProfile, updateUserProfile, UserProfile } from '../lib/authService';
import { ensureRemoteUri, uploadImageAsync } from '../lib/storageService';
import { logFailure, logStart, logSuccess } from '../lib/bootstrapLogger';

type ProfileSettings = {
  territoryColor: string;
  avatarUri?: string;
  bannerUri?: string;
};

const PROFILE_KEY = 'zonerunner:profile';
const imageMediaTypes = ['images'] as any; // explicit for Expo SDKs

export function useProfileData(currentUser: User | null) {
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>({
    territoryColor: '#1e90ff',
    avatarUri: undefined,
    bannerUri: undefined,
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const loadProfileSettings = useCallback(async () => {
    const tag = currentUser?.uid
      ? `ProfileData.loadProfileSettings:${currentUser.uid}`
      : 'ProfileData.loadProfileSettings:anonymous';
    logStart(tag, { userId: currentUser?.uid ?? null });
    try {
      if (currentUser?.uid) {
        const dbProfile = await loadUserProfile(currentUser.uid);
        if (dbProfile?.territoryColor) {
          const fixedAvatar = await ensureRemoteUri(
            dbProfile.avatarUrl,
            currentUser.uid,
            `users/${currentUser.uid}/avatar.jpg`,
            (remote) => updateUserProfile(currentUser.uid!, { avatarUrl: remote })
          );
          const fixedBanner = await ensureRemoteUri(
            dbProfile.bannerUrl,
            currentUser.uid,
            `users/${currentUser.uid}/banner.jpg`,
            (remote) => updateUserProfile(currentUser.uid!, { bannerUrl: remote })
          );
          setProfileSettings((prev) => ({
            ...prev,
            territoryColor: dbProfile.territoryColor,
            avatarUri: fixedAvatar || dbProfile.avatarUrl || prev.avatarUri,
            bannerUri: fixedBanner || dbProfile.bannerUrl || prev.bannerUri,
          }));
          setUserProfile(dbProfile);
          await AsyncStorage.setItem(
            PROFILE_KEY,
            JSON.stringify({
              territoryColor: dbProfile.territoryColor,
              avatarUri: fixedAvatar || dbProfile.avatarUrl,
              bannerUri: fixedBanner || dbProfile.bannerUrl,
            })
          );
          logSuccess(tag, { source: 'db', userId: currentUser.uid });
          return;
        }
      }

      const stored = await AsyncStorage.getItem(PROFILE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') {
            let avatarUri = parsed.avatarUri;
            let bannerUri = parsed.bannerUri;
            if (currentUser?.uid) {
              avatarUri = await ensureRemoteUri(
                avatarUri,
                currentUser.uid,
                `users/${currentUser.uid}/avatar.jpg`,
                (remote) => updateUserProfile(currentUser.uid!, { avatarUrl: remote })
              );
              bannerUri = await ensureRemoteUri(
                bannerUri,
                currentUser.uid,
                `users/${currentUser.uid}/banner.jpg`,
                (remote) => updateUserProfile(currentUser.uid!, { bannerUrl: remote })
              );
            }
            setProfileSettings({
              ...parsed,
              avatarUri,
              bannerUri,
            });
            logSuccess(tag, { source: 'cache', userId: currentUser?.uid ?? null });
          }
        } catch (e) {
          console.log('Failed to parse profile settings', e);
        }
      }
    } catch (e) {
      logFailure(tag, e, { userId: currentUser?.uid ?? null });
      console.log('Failed to load profile settings', e);
    }
  }, [currentUser?.uid]);

  const handleChangeAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photos to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageMediaTypes as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      let remoteUrl = uri;
      if (currentUser?.uid) {
        try {
          remoteUrl = await uploadImageAsync(uri, `users/${currentUser.uid}/avatar-${Date.now()}.jpg`);
        } catch (e) {
          console.log('Failed to upload avatar, using local uri', e);
        }
      }
      const updated = { ...profileSettings, avatarUri: remoteUrl };
      setProfileSettings(updated);
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
      if (currentUser?.uid) {
        try {
          await updateUserProfile(currentUser.uid, { avatarUrl: remoteUrl });
        } catch (e) {
          console.log('Failed to save avatar URL to Firestore', e);
        }
      }
    }
  }, [currentUser?.uid, profileSettings]);

  const handleChangeBanner = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photos to set a banner.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageMediaTypes as any,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      let remoteUrl = uri;
      if (currentUser?.uid) {
        try {
          remoteUrl = await uploadImageAsync(uri, `users/${currentUser.uid}/banner-${Date.now()}.jpg`);
        } catch (e) {
          console.log('Failed to upload banner, using local uri', e);
        }
      }
      const updated = { ...profileSettings, bannerUri: remoteUrl };
      setProfileSettings(updated);
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
      if (currentUser?.uid) {
        try {
          await updateUserProfile(currentUser.uid, { bannerUrl: remoteUrl });
        } catch (e) {
          console.log('Failed to save banner URL to Firestore', e);
        }
      }
    }
  }, [currentUser?.uid, profileSettings]);

  const handleAvatarPress = useCallback(() => {
    const hasAvatar = !!profileSettings.avatarUri;
    Alert.alert(
      'Profile picture',
      undefined,
      [
        hasAvatar && {
          text: 'View picture',
          onPress: () => setPreviewUri(profileSettings.avatarUri!),
        },
        { text: 'Change picture', onPress: handleChangeAvatar },
        { text: 'Cancel', style: 'cancel' },
      ].filter(Boolean) as any
    );
  }, [profileSettings.avatarUri, handleChangeAvatar]);

  const handleBannerPress = useCallback(() => {
    const hasBanner = !!profileSettings.bannerUri;
    Alert.alert(
      'Banner',
      undefined,
      [
        hasBanner && {
          text: 'View banner',
          onPress: () => setPreviewUri(profileSettings.bannerUri!),
        },
        { text: 'Change banner', onPress: handleChangeBanner },
        { text: 'Cancel', style: 'cancel' },
      ].filter(Boolean) as any
    );
  }, [profileSettings.bannerUri, handleChangeBanner]);

  return {
    profileSettings,
    setProfileSettings,
    userProfile,
    setUserProfile,
    previewUri,
    setPreviewUri,
    loadProfileSettings,
    handleAvatarPress,
    handleBannerPress,
  };
}
