import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { createTask, SyncTasksManager } from 'react-native-sync-tasks';

type TData = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

const task = createTask<TData>({
  config: {
    url: 'https://jsonplaceholder.typicode.com/posts/1/',
    interval: 2000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  },
  onData: (data: { body: TData; status_code: number }) => {
    console.log('DATA 1 ', data.body.id);
  },
  onError: (error: { error: string; status_code: number }) => {
    console.log('ERROR 1 ', error);
  },
});

const task2 = createTask<TData>({
  config: {
    url: 'https://jsonplaceholder.typicode.com/posts/2/',
    interval: 2000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  },
  onData: (data: { body: TData; status_code: number }) => {
    console.log('DATA 2 ', data.body.id);
  },
  onError: (error: { error: string; status_code: number }) => {
    console.log('ERROR 2 ', error);
  },
});

export default function App() {
  const onStart = () => {
    SyncTasksManager.addTasks([task]);
    SyncTasksManager.startAll();
  };

  const onStop = () => {
    SyncTasksManager.stopAll();
    // task.stop();
  };

  const onRestart = () => {
    SyncTasksManager.startAll();
    // task.start();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onStart}>
        <Text>START</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onStart}>
        <Text>CHECK STATUS</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onStop}>
        <Text>STOP</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRestart}>
        <Text>RESTART</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
