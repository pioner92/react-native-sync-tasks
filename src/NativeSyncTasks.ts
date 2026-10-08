import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // New architecture installs the JSI bindings when the module is created;
  // the old architecture needs this explicit call.
  install(): boolean;
}

export default TurboModuleRegistry.get<Spec>('SyncTasksManager');
