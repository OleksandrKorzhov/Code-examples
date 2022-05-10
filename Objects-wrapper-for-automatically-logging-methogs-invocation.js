import { logger } from './contextLogger.js';
import util from 'util';
import http from 'http';

const serialize = value => {
  if (value instanceof http.IncomingMessage) {
    return '[Object: IncomingMessage]';
  }

  if (value instanceof http.ServerResponse) {
    return '[Object: ServerResponse]';
  }

  return util.inspect(value);
};

const logInvocation = (context, ...args) => logger.info(context, `invoke : ${args.map(serialize)}`);

const logAndReturnResult = context => value => {
  logger.info(context, `result : ${serialize(value)}`);
  return value;
};

const logAndThrowError = context => error => {
  logger.fatal(context, `error : ${error}`);
  throw error;
};

/**
 * @param context
 * @param {object} object
 * @param [options]
 * @returns {object}
 */
const trackMethodsInvocationWithContext = (context, object, options) => {
  const result = {};
  const optionsWithDefaults = { methodContextKey: 'method', ...options };

  for (const [key, value] of Object.entries(object)) {
    const methodContext = { ...context, [optionsWithDefaults.methodContextKey]: key };

    result[key] = (...args) => {
      try {
        logInvocation(methodContext, ...args);

        const returnValue = logger.asyncContext.run(methodContext, () => value(...args));

        if (
          returnValue &&
          (returnValue instanceof Promise || typeof returnValue.then === 'function')
        ) {
          return returnValue
            .then(logAndReturnResult(methodContext))
            .catch(logAndThrowError(methodContext));
        }

        return logAndReturnResult(methodContext)(returnValue);
      } catch (e) {
        logAndThrowError(methodContext, e);
      }
    };
  }

  return result;
};

export const trackControllerInvocation = (controllerName, object) =>
  trackMethodsInvocationWithContext({ controller: controllerName }, object, {
    methodContextKey: 'action'
  });

export const trackServiceInvocation = (serviceName, object) =>
  trackMethodsInvocationWithContext({ service: serviceName }, object, {
    methodContextKey: 'method'
  });

export const trackModuleInvocation = (moduleName, object) =>
  trackMethodsInvocationWithContext({ module: moduleName }, object, {
    methodContextKey: 'function'
  });
