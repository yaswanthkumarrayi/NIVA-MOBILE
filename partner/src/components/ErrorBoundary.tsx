/**
 * ErrorBoundary — app-wide crash guard for the NIVA Partner app.
 *
 * WHY THIS EXISTS (Bug 1 + Bug 2):
 *   Without an error boundary, a single uncaught render exception (e.g. a
 *   malformed realtime payload, an unexpected API shape, or a null order
 *   object touched during an accept/refresh cycle) unmounts the entire
 *   navigator tree. In production that surfaces as the app "jumping back" to a
 *   previous/blank screen or hard-crashing — exactly the symptoms reported for
 *   order acceptance ("navigates backward" / "crashes during or after accept").
 *
 *   This boundary catches those render errors, keeps the process alive, shows a
 *   recoverable fallback using the existing NIVA styling, and lets the partner
 *   retry WITHOUT losing their session. It does NOT swallow the error silently:
 *   it logs a redacted message so the crash is still diagnosable.
 *
 * SCOPE:
 *   React error boundaries only catch errors thrown during render / lifecycle /
 *   constructors of the child tree. They do NOT catch async errors (those are
 *   handled where the promise is awaited). This is the correct, documented use
 *   of an error boundary and is intentionally narrow — not a global catch-all.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NIVA_COLORS } from '@niva/shared';

interface Props {
  children: React.ReactNode;
  /** Optional label so logs can tell which boundary tripped. */
  name?: string;
}

interface State {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'Unexpected error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    // Production-safe logging: record the error message + component stack so the
    // crash is diagnosable, but never dump tokens / PII. The objects handled
    // here are React nodes and Error instances, not session data.
    const where = this.props.name ? `[ErrorBoundary:${this.props.name}]` : '[ErrorBoundary]';
    // eslint-disable-next-line no-console
    console.error(`${where} caught a render error:`, error instanceof Error ? error.message : error);
    if (info?.componentStack) {
      // eslint-disable-next-line no-console
      console.error(`${where} component stack:`, info.componentStack);
    }
  }

  private handleRetry = () => {
    // Clear the error so the child tree re-mounts and re-renders from scratch.
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.container}>
        <Text style={s.emoji}>⚠️</Text>
        <Text style={s.title}>Something went wrong</Text>
        <Text style={s.subtitle}>
          The screen hit an unexpected error. Your session is still active — tap
          below to reload and continue.
        </Text>
        <TouchableOpacity style={s.btn} onPress={this.handleRetry} activeOpacity={0.8}>
          <Text style={s.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NIVA_COLORS.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: {
    fontSize: 19,
    fontFamily: 'Montserrat-Bold',
    color: NIVA_COLORS.gray900,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: NIVA_COLORS.gray500,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: NIVA_COLORS.black,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontFamily: 'Montserrat-Bold' },
});
