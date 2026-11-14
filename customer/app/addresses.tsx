/**
 * NIVA — Saved Addresses Screen
 * Mirrors SavedAddressesSection.js from the website.
 * List, add, edit, delete, set default delivery addresses.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../src/theme';
import { useCustomerStore } from '../src/services/customerStore';
import { addressApi } from '../src/services/nivaApi';
import type { SavedAddress } from '../src/services/nivaApi';
import { MALE_HOSTELS, FEMALE_HOSTELS, normalizeGender } from '../src/data/hostelData';

interface AddressFormData {
  label: string;
  hostelType: 'boys' | 'girls';
  hostelName: string;
  roomNumber: string;
  recipientName: string;
  recipientPhone: string;
  college: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressFormData = {
  label: 'Home',
  hostelType: 'boys',
  hostelName: '',
  roomNumber: '',
  recipientName: '',
  recipientPhone: '',
  college: '',
  isDefault: false,
};

export default function AddressesScreen() {
  const { session, customer } = useCustomerStore();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    if (!session || !customer) return;
    setLoading(true);
    try {
      const res = await addressApi.getAddresses(customer.id, session.token);
      setAddresses(res.data ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [session, customer]);

  useEffect(() => {
    if (!session) { router.replace('/(auth)/login'); return; }
    loadAddresses();
  }, [session, loadAddresses]);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, college: customer?.college ?? '', recipientName: customer?.name ?? '', recipientPhone: customer?.phone ?? '' });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (addr: SavedAddress) => {
    setForm({
      label: addr.label ?? 'Home',
      hostelType: normalizeGender(addr.hostel_type),
      hostelName: addr.hostel_name,
      roomNumber: addr.room_number,
      recipientName: addr.recipient_name ?? '',
      recipientPhone: addr.recipient_phone ?? '',
      college: addr.college ?? '',
      isDefault: addr.is_default ?? false,
    });
    setEditingId(addr.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.hostelName) { Alert.alert('Error', 'Please select a hostel.'); return; }
    if (!form.roomNumber.trim()) { Alert.alert('Error', 'Please enter a room number.'); return; }
    if (!session || !customer) return;
    setSaving(true);
    try {
      if (editingId) {
        await addressApi.updateAddress(customer.id, editingId, {
          label: form.label,
          hostel_type: form.hostelType,
          hostel_name: form.hostelName,
          room_number: form.roomNumber,
          recipient_name: form.recipientName,
          recipient_phone: form.recipientPhone,
          college: form.college,
          is_default: form.isDefault,
        }, session.token);
      } else {
        await addressApi.addAddress(customer.id, {
          label: form.label,
          hostelType: form.hostelType,
          hostelName: form.hostelName,
          roomNumber: form.roomNumber,
          recipientName: form.recipientName,
          recipientPhone: form.recipientPhone,
          college: form.college,
          isDefault: form.isDefault,
        } as any, session.token);
      }
      setShowForm(false);
      await loadAddresses();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save address.');
    } finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (!session || !customer) return;
          try {
            await addressApi.deleteAddress(customer.id, id, session.token);
            await loadAddresses();
          } catch (e: any) { Alert.alert('Error', e?.message ?? 'Failed to delete.'); }
        },
      },
    ]);
  };

  const handleSetDefault = async (id: string) => {
    if (!session || !customer) return;
    try {
      await addressApi.setDefault(customer.id, id, session.token);
      await loadAddresses();
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'Failed to set default.'); }
  };

  const hostels = form.hostelType === 'boys' ? MALE_HOSTELS : FEMALE_HOSTELS;

  if (!session) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>Saved Addresses</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : addresses.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="location-outline" size={56} color={theme.colors.border} />
          <Text style={s.emptyTitle}>No saved addresses</Text>
          <Text style={s.emptySub}>Add your hostel address for quick checkout.</Text>
          <TouchableOpacity style={s.emptyAddBtn} onPress={openAdd}>
            <Text style={s.emptyAddText}>Add Address</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {addresses.map((addr) => (
            <View key={addr.id} style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardLabel}>
                  <Ionicons name={addr.is_default ? 'home' : 'location-outline'} size={16} color={theme.colors.primary} />
                  <Text style={s.cardLabelText}>{addr.label || addr.hostel_name}</Text>
                  {addr.is_default && (
                    <View style={s.defaultBadge}><Text style={s.defaultBadgeText}>Default</Text></View>
                  )}
                </View>
                <View style={s.cardActions}>
                  <TouchableOpacity onPress={() => openEdit(addr)} style={s.actionBtn}>
                    <Ionicons name="pencil" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(addr.id)} style={s.actionBtn}>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={s.cardDetail}>{addr.hostel_name}, Room {addr.room_number}</Text>
              {addr.recipient_name && <Text style={s.cardDetail}>For: {addr.recipient_name}</Text>}
              {addr.college && <Text style={s.cardDetail}>{addr.college}</Text>}
              {!addr.is_default && (
                <TouchableOpacity style={s.setDefaultBtn} onPress={() => handleSetDefault(addr.id)}>
                  <Text style={s.setDefaultText}>Set as default</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modal} edges={['top']}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingId ? 'Edit Address' : 'Add Address'}</Text>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            <FieldLabel>Label</FieldLabel>
            <TextInput style={s.input} value={form.label} onChangeText={(t) => setForm((f) => ({ ...f, label: t }))} placeholder="Home, Room, etc." placeholderTextColor={theme.colors.textMuted} />

            <FieldLabel>Gender</FieldLabel>
            <View style={s.toggleRow}>
              {(['boys', 'girls'] as const).map((g) => (
                <TouchableOpacity key={g} style={[s.toggleBtn, form.hostelType === g && s.toggleBtnActive]} onPress={() => setForm((f) => ({ ...f, hostelType: g, hostelName: '' }))}>
                  <Text style={[s.toggleText, form.hostelType === g && s.toggleTextActive]}>{g === 'boys' ? '👦 Boys' : '👧 Girls'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <FieldLabel>Hostel</FieldLabel>
            <View style={s.hostelGrid}>
              {hostels.map((h) => (
                <TouchableOpacity key={h} style={[s.hostelChip, form.hostelName === h && s.hostelChipActive]} onPress={() => setForm((f) => ({ ...f, hostelName: h }))}>
                  <Text style={[s.hostelChipText, form.hostelName === h && s.hostelChipTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <FieldLabel>Room Number *</FieldLabel>
            <TextInput style={s.input} value={form.roomNumber} onChangeText={(t) => setForm((f) => ({ ...f, roomNumber: t }))} placeholder="e.g. 203" placeholderTextColor={theme.colors.textMuted} keyboardType="numeric" />

            <FieldLabel>Recipient Name</FieldLabel>
            <TextInput style={s.input} value={form.recipientName} onChangeText={(t) => setForm((f) => ({ ...f, recipientName: t }))} placeholder="Your name" placeholderTextColor={theme.colors.textMuted} />

            <FieldLabel>Recipient Phone</FieldLabel>
            <TextInput style={s.input} value={form.recipientPhone} onChangeText={(t) => setForm((f) => ({ ...f, recipientPhone: t }))} placeholder="10-digit number" placeholderTextColor={theme.colors.textMuted} keyboardType="phone-pad" />

            <FieldLabel>College</FieldLabel>
            <TextInput style={s.input} value={form.college} onChangeText={(t) => setForm((f) => ({ ...f, college: t }))} placeholder="Your college" placeholderTextColor={theme.colors.textMuted} />

            <TouchableOpacity style={s.defaultToggle} onPress={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}>
              <Ionicons name={form.isDefault ? 'checkbox' : 'square-outline'} size={22} color={theme.colors.primary} />
              <Text style={s.defaultToggleText}>Set as default address</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Address</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={s.fieldLabel}>{children}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 10, gap: 10 },
  backBtn: { padding: 6 },
  navTitle: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textPrimary },
  addBtn: { padding: 6 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { ...theme.typography.heading },
  emptySub: { ...theme.typography.bodyMuted, textAlign: 'center' },
  emptyAddBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.radii.pill },
  emptyAddText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
  list: { paddingHorizontal: theme.spacing.lg, paddingTop: 8, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardLabelText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  defaultBadge: { backgroundColor: theme.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radii.pill },
  defaultBadgeText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.primary },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 4 },
  cardDetail: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 2 },
  setDefaultBtn: { marginTop: 8 },
  setDefaultText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  modal: { flex: 1, backgroundColor: theme.colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  modalTitle: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textPrimary },
  modalScroll: { paddingHorizontal: theme.spacing.lg, paddingTop: 16 },
  fieldLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 8, marginTop: 14 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.sm, paddingHorizontal: 12, height: 46, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, backgroundColor: theme.colors.surface },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radii.sm, borderWidth: 1, borderColor: theme.colors.border },
  toggleBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  toggleTextActive: { color: '#fff' },
  hostelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hostelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.border },
  hostelChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  hostelChipText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  hostelChipTextActive: { color: '#fff' },
  defaultToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  defaultToggleText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: '#fff' },
});
