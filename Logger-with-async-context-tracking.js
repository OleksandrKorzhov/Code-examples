import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';

const loggerContextStorage = new AsyncLocalStorage();

const ASYNC_CONTEXT_KEY = 'asyncContext';
const LOCAL_CONTEXT_LOG_MESSAGE_KEY = 'context';
const ASYNC_CONTEXT_LOG_MESSAGE_KEY = 'asyncContext';

/**
 * @callback RunWithinContextFn
 * @param {Object} value
 * @param {Function} fn
 * @returns {*}
 */

/**
 * @typedef LoggerContext
 * @property {RunWithinContextFn} run
 */

/**
 * @typedef LoggerContextHost
 * @property {LoggerContext} asyncContext
 */

const normalizeContext = (value, rootKey) =>
  typeof value === 'object' ? value : { [rootKey]: value };

/**
 * @param {pino.Logger & LoggerContextHost} logger
 * @returns {pino.Logger & LoggerContextHost}
 */
const createWrapper = logger =>
  new Proxy(logger, {
    get(target, property, receiver) {
      if (property === ASYNC_CONTEXT_KEY) {
        return Reflect.get(target, property, receiver);
      }

      if (property === 'child') {
        return (...args) => prepareLogger(target.child(...args));
      }

      return (...args) => {
        const activeLogger = target;
        const contextStorage = activeLogger.asyncContext?.asyncStorage;
        const asyncContextValue = contextStorage.getStore() || {};
        const [localContextValue, ...restArgs] = args;
        const localContextPassed = localContextValue && restArgs.length;
        const normalizedLocalContext = localContextPassed
          ? normalizeContext(localContextValue, LOCAL_CONTEXT_LOG_MESSAGE_KEY)
          : {};
        const normalizedAsyncContext = normalizeContext(
          asyncContextValue,
          ASYNC_CONTEXT_LOG_MESSAGE_KEY
        );
        const normalizedContext = { ...normalizedAsyncContext, ...normalizedLocalContext };
        const normalizedArguments = localContextPassed ? restArgs : args;

        return activeLogger[property](normalizedContext, ...normalizedArguments);
      };
    }
  });

/**
 * @param {pino.Logger} logger
 * @returns {pino.Logger & LoggerContextHost}
 */
const prepareLogger = logger => {
  logger[ASYNC_CONTEXT_KEY] = {
    asyncStorage: loggerContextStorage,
    run: (value, fn) => {
      const existingContext = loggerContextStorage.getStore() || {};
      const newContextValue = { ...existingContext, ...value };

      return loggerContextStorage.run(newContextValue, fn);
    }
  };

  return createWrapper(logger);
};

/**
 * @returns {pino.Logger}
 */
export const createLogger = () => pino();

/**
 * @type {pino.Logger & LoggerContextHost}
 */
export const logger = prepareLogger(createLogger());
