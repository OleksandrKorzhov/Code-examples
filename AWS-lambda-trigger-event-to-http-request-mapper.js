import http from 'http';
import * as express from 'express';
import {
  IEvent,
  IGeneralProxyFactoryArguments,
  InternalMapper,
  IPathMapper,
  IServerAdditionalProps,
  Server,
} from '../types';
import { Readable } from "stream";

const getEventBody = (event: IEvent) =>
  Buffer.from(JSON.stringify(event));

const getResponseBody = async (response: http.IncomingMessage) => {
  const buffer = [];

  for await (const chunk of Readable.from(response)) {
    buffer.push(chunk);
  }

  return Buffer.concat(buffer).toString('utf8');
};

const generateRandomString = () =>
  Math.random().toString(36).substring(2, 15);

/** Support only for Linux */
export const getSocketPath = (params: Pick<IServerAdditionalProps, '_socketPathSufix'>) =>
  `/tmp/server-${params._socketPathSufix}.sock`;

export const startServer = (server: Server): Server =>
  server.listen(getSocketPath(server));

export const createServer = (app: express.Express): Server => {
  const server: Server = http.createServer(app) as Server;
  server._socketPathSufix = generateRandomString();

  server.on('listening', () => {
    server._isListening = true;
  });

  server.on('close', () => {
    server._isListening = false;
  });

  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(
        `Attempting to listen to socket ${getSocketPath(server)} but it is already in use. This is likely as a result of a previous invocation error or timeout. Check the logs for the invocation(s) immediately prior to this for root cause, and consider increasing the timeout and/or cpu/memory allocation if this is purely as a result of a timeout. aws-serverless-express will restart the Node.js server listening on a new port and continue with this request.`
      );
      server._socketPathSufix = generateRandomString();
      server.close(() => startServer(server)); // @TODO: properly start server
    } else {
      console.log('ERROR: server error!');
      console.error(error);
    }
  });


  return server as Server;
};

export const createGeneralProxy = <E = IEvent, OP = any, RFR = http.IncomingMessage, RE = any, LE = any>(params: IGeneralProxyFactoryArguments<E, OP, http.IncomingMessage, RFR, RE, LE>): Promise<http.IncomingMessage | RFR> =>
  new Promise((resolve, reject) => {
    const {
      server,
      event,
      proxyOptions,
      eventToHttpRequestMapper,
      runtimeResponseMapper,
      eventBodyGetter,
      libraryErrorToResponseMapper,
      runtimeErrorToResponseMapper,
    } = params;

    const handleError = (errorMapper: any, promiseReject: any) => (error: Error) => {
      if (typeof errorMapper !== 'function') {
        return promiseReject(error);
      }

      errorMapper({
        server,
        event,
        proxyOptions,
        error,
      })
        .then(promiseReject)
        .catch(promiseReject); // @TODO: add report about the mapping error
    };

    let chain = Promise.resolve();

    if (!server._isListening) {
      chain = chain.then(() => {
        // console.log('Starting  a server');

        return new Promise((serverStartResolve, serverStartReject) => {
          startServer(server)
            .on('listening', serverStartResolve)
            .on('error', serverStartReject);
        });
      });
    }

    chain.then(() => {
      console.log('making a request');

      const requestOptions = eventToHttpRequestMapper({
        event,
        server,
        proxyOptions,
      });
      const request: http.ClientRequest = http.request(requestOptions,(response: http.IncomingMessage) => {
        console.log('response received');

        getResponseBody(response)
          .then(m => {
            console.log(m);
          });

        if (typeof runtimeResponseMapper !== 'function') {
          return getResponseBody(response)
            .then(resolve as any);
        }

        runtimeResponseMapper({
          response,
          event,
          server,
          proxyOptions,
        })
          .then(resolve)
          .catch(handleError(libraryErrorToResponseMapper, reject));
      });

      request.write(
        typeof eventBodyGetter === 'function'
          ? eventBodyGetter({ event, server, proxyOptions })
          : getEventBody(event as unknown as IEvent),
      );
      request.on('error', handleError(runtimeErrorToResponseMapper, reject));
    })
      .catch(handleError(libraryErrorToResponseMapper, reject));
  });

export const generalEventToRequestMapperFactory = <E extends IEvent, O = Record<string, unknown>>(params: IPathMapper<E, O>): InternalMapper<E, O, http.RequestOptions> =>
  (mapperParams) => {
    const {
      event,
      server,
      proxyOptions,
    } = mapperParams;

    const getPath = () => {
      let resultPath;

      if (typeof params?.pathMapper !== 'function') {
        resultPath = params?.mapToPath;
      }

      resultPath = typeof params.pathMapper === 'function' && !resultPath
        ? params.pathMapper({
            event,
            proxyOptions,
          })
        : resultPath;

      return resultPath
        ? (resultPath[0] !== '/' ? '/' + resultPath : resultPath)
        : '/custom-event';
    };

    return {
      path: getPath(),
      method: 'POST',
      headers: {
        'x-event-source': event.eventSource || 'aws:custom-event',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(getEventBody(event)),
      },
      socketPath: getSocketPath(server),
    };
  };
