import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface Props { children: React.ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: any) {
    // eslint-disable-next-line no-console
    console.error('Caught by ErrorBoundary:', error);
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Что-то пошло не так</Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.msg}>{this.state.message}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.btn} onPress={this.reset}>
          <Text style={styles.btnText}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0E14', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  box: { maxHeight: 200, alignSelf: 'stretch', backgroundColor: '#161B26', borderRadius: 10 },
  msg: { fontSize: 13, color: '#FCA5A5' },
  btn: { backgroundColor: '#0061ff', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 13 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
