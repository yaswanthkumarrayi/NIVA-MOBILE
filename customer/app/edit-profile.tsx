/**
 * NIVA — Edit Profile Screen
 * Update name, phone, college. Calls PUT /api/customers/update/:id.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../src/theme';
import { useCustomerStore } from '../src/services/customerStore';
import { customerApi } from '@niva/shared';

const COLLEGES = [
  'VIT Vellore',
  'VIT Chennai',
  'VIT Bhopal',
  'VIT AP',
  'Other',
];

export default function EditProfileScreen() {
  const { session, customer, setCustomer } = useCustomerStore();

  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [college, setCollege] = useState(customer?.college ?? '');
  const [saving, setSaving] = useState(false);

  if (!session || !customer) {
    router.replace('/(auth)/login');
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Name is required.'); return; }
    if (phone && !/^\d{10}$/.test(phone)) { Alert.alert('Error', 'Phone must be 10 digits.'); return; }

    setSaving(true);
    try {
      const res = await customerApi.updateProfile(customer.id, { name: name.trim(), phone, college }, session.token);
      if (res.data) {
        setCustomer({ ...customer, ...res.data });
        Alert.alert('Saved', 'Profile updated successfully.');
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update profile.');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>Edit Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Field label="Name *">
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={theme.colors.textMuted} />
          </Field>
          <Field label="Email">
            <TextInput style={[s.input, s.inputDisabled]} value={customer.email} editable={false} />
            <Text style={s.hint}>Email cannot be changed here.</Text>
          </Field>
          <Field label="Phone">
            <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" maxLength={10} />
          </Field>
          <Field label="College">
            <View style={s.collegeGrid}>
              {COLLEGES.map((c) => (
                <TouchableOpacity key={c} style={[s.collegeChip, college === c && s.collegeChipActive]} onPress={() => setCollege(c)}>
                  <Text style={[s.collegeText, college === c && s.collegeTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!COLLEGES.includes(college) && college.length > 0 && (
              <TextInput style={[s.input, { marginTop: 8 }]} value={college} onChangeText={setCollege} placeholder="Enter your college" placeholderTextColor={theme.colors.textMuted} />
            )}
          </Field>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 10, gap: 10 },
  backBtn: { padding: 6 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textPrimary },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingTop: 8, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  field: { marginBottom: 16 },
  fieldLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.sm, paddingHorizontal: 12, height: 46, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  inputDisabled: { backgroundColor: theme.colors.backgroundAlt, color: theme.colors.textMuted },
  hint: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 4 },
  collegeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  collegeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.border },
  collegeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  collegeText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  collegeTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: '#fff' },
});
