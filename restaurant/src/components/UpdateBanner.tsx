import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { NIVA_COLORS } from '@niva/shared';

export function UpdateBanner({ downloadUrl }: { downloadUrl: string }) {
  return (
    <View style={s.banner}>
      <Text style={s.text}>A new version of NIVA Restaurant is available.</Text>
      <TouchableOpacity onPress={() => Linking.openURL(downloadUrl)}>
        <Text style={s.btn}>Download</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: NIVA_COLORS.amberLight, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.amber + '30',
  },
  text: { fontSize: 12, color: NIVA_COLORS.gray700, flex: 1 },
  btn: { fontSize: 12, color: NIVA_COLORS.orange, fontFamily: 'Montserrat-Bold', marginLeft: 8 },
});
