import { StyleSheet, Text, View } from 'react-native';
import { TestProgress } from './TestProgress';

type Props = { title: string; statusText: string; message?: string };

// Replaces Harness' own RunnerScreen (see metro.config.js). It stays mounted for the whole runtime,
// unlike render() overlays that Harness unmounts after every test, so the screen does not flicker.
export const RunnerScreen = ({ title, statusText, message }: Props) => {
  if (statusText === 'Environment Error') {
    return (
      <View style={styles.error}>
        <Text style={styles.title}>{title}</Text>
        <Text>{statusText}</Text>
        {message ? <Text>{message}</Text> : null}
      </View>
    );
  }

  return <TestProgress />;
};

const styles = StyleSheet.create({
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 18, fontWeight: '700' },
});
