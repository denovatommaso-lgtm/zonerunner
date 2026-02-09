import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  COUNTRIES,
  getCountryByCode,
  getRegionByCode,
  type CountryOption,
  type RegionOption,
} from '../../lib/rankingLocationData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type RankingsLocationValue = {
  countryCode?: string;
  stateCode?: string;
  countryName?: string;
  stateName?: string;
};

type Props = {
  value: RankingsLocationValue;
  onChange: (next: RankingsLocationValue) => void;
  label?: string;
  helperText?: string;
  variant?: 'card' | 'plain';
};

export function RankingsLocationPicker({
  value,
  onChange,
  label,
  helperText,
  variant = 'card',
}: Props) {
  const insets = useSafeAreaInsets();
  const [activePicker, setActivePicker] = useState<'country' | 'state' | null>(null);
  const [search, setSearch] = useState('');

  const selectedCountry = getCountryByCode(value.countryCode);
  const selectedState = getRegionByCode(value.countryCode, value.stateCode);

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredStates = useMemo(() => {
    const regions = selectedCountry?.regions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
    );
  }, [search, selectedCountry]);

  const openPicker = (picker: 'country' | 'state') => {
    setSearch('');
    setActivePicker(picker);
  };

  const handleSelectCountry = (country: CountryOption) => {
    onChange({
      countryCode: country.code,
      countryName: country.name,
      stateCode: undefined,
      stateName: undefined,
    });
    setActivePicker(null);
  };

  const handleSelectState = (region: RegionOption) => {
    onChange({
      countryCode: value.countryCode,
      countryName: selectedCountry?.name,
      stateCode: region.code,
      stateName: region.name,
    });
    setActivePicker(null);
  };

  return (
    <View style={variant === 'card' ? styles.card : undefined}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <View style={styles.pickerRow}>
        <TouchableOpacity style={styles.pickerField} onPress={() => openPicker('country')}>
          <Text style={styles.pickerLabel}>Country</Text>
          <Text style={styles.pickerValue}>
            {selectedCountry ? `${selectedCountry.name} (${selectedCountry.code})` : 'Select country'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pickerField, !selectedCountry && styles.pickerFieldDisabled]}
          onPress={() => {
            if (selectedCountry) openPicker('state');
          }}
          disabled={!selectedCountry}
        >
          <Text style={styles.pickerLabel}>State / Region</Text>
          <Text style={styles.pickerValue}>
            {selectedState ? `${selectedState.name} (${selectedState.code})` : 'Optional'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <TouchableOpacity
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(16, insets.top + 8),
              paddingBottom: Math.max(16, insets.bottom + 12),
            },
          ]}
          activeOpacity={1}
          onPress={() => setActivePicker(null)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitle}>
              {activePicker === 'country' ? 'Select country' : 'Select state / region'}
            </Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#6b7280"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={{ maxHeight: 360 }}>
              {(activePicker === 'country' ? filteredCountries : filteredStates).map((opt) => (
                <TouchableOpacity
                  key={`${activePicker}-${opt.code}`}
                  style={styles.optionRow}
                  onPress={() =>
                    activePicker === 'country'
                      ? handleSelectCountry(opt as CountryOption)
                      : handleSelectState(opt as RegionOption)
                  }
                >
                  <Text style={styles.optionText}>{opt.name}</Text>
                  <Text style={styles.optionCode}>{opt.code}</Text>
                </TouchableOpacity>
              ))}
              {activePicker === 'state' && selectedCountry && filteredStates.length === 0 ? (
                <Text style={styles.emptyText}>No matches.</Text>
              ) : null}
              {activePicker === 'country' && filteredCountries.length === 0 ? (
                <Text style={styles.emptyText}>No matches.</Text>
              ) : null}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0b1120',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#111827',
  },
  label: {
    color: '#e5e7eb',
    fontWeight: '700',
    marginBottom: 6,
  },
  helperText: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 10,
  },
  pickerRow: {
    gap: 10,
  },
  pickerField: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  pickerFieldDisabled: {
    opacity: 0.5,
  },
  pickerLabel: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 4,
  },
  pickerValue: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#0b1120',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 16,
    maxHeight: '88%',
  },
  modalTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  searchInput: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#1f2937',
    marginBottom: 10,
  },
  optionRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  optionCode: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
