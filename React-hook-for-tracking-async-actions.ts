import { useCallback, useState } from 'react';
import _ from 'lodash';

type TrackableFn = (...args: any[]) => Promise<any>;

type TrackingProps = {
  inProgress: boolean;
  completed: boolean;
  initial: boolean;
  failed: boolean;
};

enum TrackableStatus {
  Initial,
  InProgress,
  Completed,
  Failed,
}

export type Trackable<T extends TrackableFn> = T & TrackingProps;

export const useTrackable = <T extends TrackableFn>(fn: T): Trackable<T> => {
  const [status, setStatus] = useState<TrackableStatus>(
    TrackableStatus.Initial
  );

  const fnWrapper = useCallback(
    async (...args: any[]) => {
      let result: any;

      try {
        setStatus(TrackableStatus.InProgress);

        result = await fn(...args);

        setStatus(TrackableStatus.Completed);

        return result;
      } catch (e) {
        setStatus(TrackableStatus.Failed);

        throw e;
      }
    },
    [fn]
  );

  return _.merge<T, TrackingProps>(fnWrapper as T, {
    initial: status === TrackableStatus.Initial,
    inProgress: status === TrackableStatus.InProgress,
    completed: status === TrackableStatus.Completed,
    failed: status === TrackableStatus.Failed,
  });
};
