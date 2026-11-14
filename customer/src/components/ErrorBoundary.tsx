/**
 * ErrorBoundary — app-wide crash guard for the NIVA Customer app.
 *
 * Catches render/lifecycle errors in the child tree (e.g. a malformed API or
 * realtime payload) so a single bad render can't unmount the whole navigator
 * and bounce the customer out of their session. Shows a recoverable fallback
 * and logs a redacted message — never tokens or PII. Async errors are handled
 * where they're awaited; this boundary is intentionally narrow.
 *
 * Mirrors mobile/partner/src/components/ErrorBoundary.tsx.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  children: React.ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    const where = this.props.name ? `[ErrorBoundary:${this.props.name}]` : '[ErrorBoundary]';
    // eslint-disable-next-line no-console
    console.error(`${where} caught a render error:`, error instanceof Error ? error.message : error);
    if (info?.componentStack) {
      // eslint-disable-next-line no-console
      console.error(`${where} component stack:`, info.componentStack);
    }
  }

  private handleRetry = () => this.setState({ hasError: false, message: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={s.container}>
        <Text style={s.emoji}>⚠️</Text>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.subtitle}>
          This screen hit an unexpected error. Your session is still active — tap
          below to reload and continue.
        </Text>
        <TouchableOpacity style={s.btn} onPress={this.handleRetry} activeOpacity={0.85}>
          <Text style={s.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.lg,
    paddingVertical: 15,
    paddingHorizontal: 40,
  },
  btnText: { color: theme.colors.textOnPrimary, fontSize: theme.fontSize.md, fontFamily: theme.fonts.bold },
});
