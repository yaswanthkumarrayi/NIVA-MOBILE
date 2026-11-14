/**
 * NIVA Customer — Design System
 *
 * The customer app is a distinct product surface with its own premium brand:
 * a warm cream background, NIVA orange as the primary action color, and a near
 * black ink for text. Neutral grays are re-used from @niva/shared's NIVA_COLORS
 * so the whole mobile suite stays visually consistent and we never duplicate a
 * neutral ramp.
 *
 * Everything here is plain data consumed by React Native StyleSheet — no
 * styling library, matching the existing partner/restaurant apps.
 */
import { NIVA_COLORS } from '@niva/shared';

export const colors = {
  // Brand (customer)
  primary: '#F47738',        // NIVA orange — primary actions, accents
  primaryDark: '#D85F22',    // pressed / emphasis
  primarySoft: '#FEEFE4',    // tinted backgrounds, chips
  ink: '#202124',            // near-black for headings / primary text
  surface: '#FFFFFF',        // cards
  background: '#FFF9F3',      // warm app background
  backgroundAlt: '#FBF2EA',  // alternate warm section background

  // Text
  textPrimary: '#202124',
  textSecondary: NIVA_COLORS.gray600,
  textMuted: NIVA_COLORS.gray400,
  textOnPrimary: '#FFFFFF',

  // Lines & neutrals (shared ramp)
  border: NIVA_COLORS.gray200,
  borderStrong: NIVA_COLORS.gray300,
  white: NIVA_COLORS.white,
  black: '#000000',

  // Semantic
  success: NIVA_COLORS.green,
  successSoft: NIVA_COLORS.greenLight,
  error: NIVA_COLORS.red,
  errorSoft: NIVA_COLORS.redLight,
  warning: NIVA_COLORS.amber,
  warningSoft: NIVA_COLORS.amberLight,
  info: NIVA_COLORS.blue,
  infoSoft: NIVA_COLORS.blueLight,

  gray: NIVA_COLORS,
} as const;

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Typography. We ship a single display/body family via expo-font so the UI
 * looks consistent across OEM Android devices. Loaded in app/_layout.tsx.
 *
 * Montserrat is used because the TTFs already live in the NIVA repo and are
 * proven to load across the partner/restaurant apps. The master spec prefers
 * Jakarta Sans / Inter — swap the four TTFs and these names to adopt it later;
 * nothing else in the design system needs to change.
 */
export const fonts = {
  regular: 'Montserrat-Regular',
  medium: 'Montserrat-Medium',
  semibold: 'Montserrat-SemiBold',
  bold: 'Montserrat-Bold',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 30,
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: fontSize.display, color: colors.textPrimary },
  title: { fontFamily: fonts.bold, fontSize: fontSize.xxl, color: colors.textPrimary },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.xl, color: colors.textPrimary },
  subheading: { fontFamily: fonts.semibold, fontSize: fontSize.lg, color: colors.textPrimary },
  body: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.textPrimary },
  bodyMuted: { fontFamily: fonts.regular, fontSize: fontSize.md, color: colors.textSecondary },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.textSecondary },
  caption: { fontFamily: fonts.regular, fontSize: fontSize.xs, color: colors.textMuted },
} as const;

/** Elevation presets (Android elevation + iOS shadow). */
export const shadows = {
  card: {
    shadowColor: '#202124',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#202124',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
} as const;

export const theme = { colors, spacing, radii, fonts, fontSize, typography, shadows } as const;

export type Theme = typeof theme;
export default theme;
