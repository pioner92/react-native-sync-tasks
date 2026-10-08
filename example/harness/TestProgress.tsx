import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HTTP } from './utils';

export type TestStatus = 'running' | 'passed' | 'failed' | 'skipped' | 'todo';

export type ReportEntry = {
  file: string;
  suite: string;
  name: string;
  status: TestStatus;
  ms?: number;
  error?: string;
  order: number;
};

type Report = { finished: boolean; results: ReportEntry[] };

type Row =
  | {
      type: 'file';
      key: string;
      file: string;
      passed: number;
      failed: number;
      total: number;
    }
  | { type: 'test'; key: string; entry: ReportEntry };

const ICON: Record<TestStatus, string> = {
  running: '⏳',
  passed: '✓',
  failed: '✗',
  skipped: '○',
  todo: '○',
};

function toRows(results: ReportEntry[]): Row[] {
  const rows: Row[] = [];
  for (const file of [...new Set(results.map((r) => r.file))]) {
    const tests = results.filter((r) => r.file === file);
    rows.push({
      type: 'file',
      key: `file|${file}`,
      file,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      total: tests.length,
    });
    for (const entry of tests) {
      rows.push({
        type: 'test',
        key: `${file}|${entry.suite}|${entry.name}`,
        entry,
      });
    }
  }
  return rows;
}

// Live list of every test in the current Harness run. The mock server keeps the list
// because the JS runtime is reset between test files.
export function TestProgress() {
  const [report, setReport] = useState<Report>({
    finished: false,
    results: [],
  });

  useEffect(() => {
    let alive = true;
    let last = '';
    const load = async () => {
      try {
        const res = await fetch(`${HTTP}/__report`);
        const text = await res.text();
        // Skip identical snapshots so the list only re-renders on real changes.
        if (!alive || text === last) return;
        last = text;
        const body = JSON.parse(text);
        setReport({
          finished: body.finished,
          results: [...body.results].sort(
            (a: ReportEntry, b: ReportEntry) => a.order - b.order
          ),
        });
      } catch {}
    };
    load();
    const timer = setInterval(load, 300);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const { results, finished } = report;
  const count = (s: TestStatus) => results.filter((r) => r.status === s).length;

  return (
    <View style={styles.container} testID="harness-progress">
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>SyncTasks · Harness</Text>
          {finished ? (
            <Text
              style={[
                styles.state,
                count('failed') ? styles.failed : styles.passed,
              ]}
            >
              Done
            </Text>
          ) : (
            <ActivityIndicator size="small" color="#2563eb" />
          )}
        </View>
        <Text style={styles.summary} testID="harness-summary">
          <Text style={styles.passed}>{count('passed')} passed</Text>
          {'   '}
          <Text style={styles.failed}>{count('failed')} failed</Text>
          {'   '}
          <Text style={styles.muted}>{results.length} total</Text>
        </Text>
      </View>
      {/* Inverted: the newest row stays pinned to the bottom while the run is in progress. */}
      <FlatList
        inverted
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={toRows(results).reverse()}
        keyExtractor={(row: Row) => row.key}
        renderItem={({ item }: { item: Row }) =>
          item.type === 'file' ? (
            <Text style={styles.fileName}>
              {item.file}
              <Text style={styles.muted}>
                {'  '}
                {item.passed}/{item.total}
                {item.failed ? ` · ${item.failed} failed` : ''}
              </Text>
            </Text>
          ) : (
            <View>
              <View style={styles.row}>
                <Text style={[styles.icon, styles[item.entry.status]]}>
                  {ICON[item.entry.status]}
                </Text>
                <Text
                  style={[
                    styles.testName,
                    item.entry.status === 'failed' && styles.failed,
                  ]}
                  numberOfLines={1}
                >
                  {item.entry.name}
                </Text>
                {item.entry.ms !== undefined ? (
                  <Text style={styles.ms}>{item.entry.ms}ms</Text>
                ) : null}
              </View>
              {item.entry.error ? (
                <Text style={styles.errorText} numberOfLines={2}>
                  {item.entry.error}
                </Text>
              ) : null}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: 56 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#18181b', fontSize: 18, fontWeight: '700' },
  state: { fontSize: 14, fontWeight: '600' },
  summary: { marginTop: 4, fontSize: 14 },
  list: { flex: 1, paddingHorizontal: 16 },
  // Inverted list: top padding of the content is the space under the last row.
  listContent: { paddingTop: 96 },
  fileName: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  icon: { width: 20, fontSize: 12 },
  testName: { flex: 1, color: '#27272a', fontSize: 13 },
  ms: { color: '#71717a', fontSize: 11, marginLeft: 8 },
  passed: { color: '#16a34a' },
  failed: { color: '#dc2626' },
  running: { color: '#ca8a04' },
  skipped: { color: '#a1a1aa' },
  todo: { color: '#a1a1aa' },
  errorText: {
    color: '#dc2626',
    fontSize: 11,
    marginLeft: 20,
    marginBottom: 2,
  },
  muted: { color: '#71717a' },
});
