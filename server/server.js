/**
 * Code inspired by https://github.com/mxstbr/react-boilerplate/blob/master/server/middlewares/frontendMiddleware.js
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

import path from 'path';
import express from 'express';
import bodyParser from 'body-parser';
import webpack from 'webpack';

import router from './router';
import logger from './logger';

/*
 * Configuration:
 * NODE_ENV: 'test' || 'development' || 'production'
 *
 * argv (NODE_ENV flags):
 *   --hot
 *   --env.dev
 *   --env.prod
 *
 * NODE_ENV + argv flags combined:
 *   'test' + (env.dev || env.prod)
 *   'development' + ('' || hot)
 *   'production' + ''
 *
 * isDev  = NODE_ENV === 'development' || (NODE_ENV === 'test' && !env.prod);
 * isProd = NODE_ENV === 'production'  || (NODE_ENV === 'test' && env.prod);
 *
 * config.default.json + (config.test.json || config.development.json || config.production.json)
 *
 */

const ENV = {
  test: 'test',
  development: 'development',
  production: 'production'
};

const nodeEnv = process.env.NODE_ENV;
const appCfg = require('nconf');
appCfg
  .argv()
  .env()
  .file( nodeEnv, { file: path.resolve(process.cwd(), `config.${nodeEnv}.json`) })
  .file( 'default', { file: path.resolve(process.cwd(), 'config.default.json') })
  .load();

// isDev and isProd must not be true at the same time
const isDev = nodeEnv === ENV.development || (nodeEnv === ENV.test && !appCfg.get('env:prod'));
const isProd = nodeEnv === ENV.production || (nodeEnv === ENV.test && appCfg.get('env:prod')) || false;
const isHot = (nodeEnv === ENV.development && appCfg.get('hot')) || false;
const host = appCfg.get('server').host;
const port = appCfg.get('server').port;
const publicPath = appCfg.get('server').publicPath;
const apiPath = appCfg.get('server').apiPath;
const isProxy = appCfg.get('proxy') || false;
let proxyHost;
let proxyPort;
let proxyPath;

if (isProxy) {
  proxyHost = appCfg.get('proxyServer').host;
  proxyPort = appCfg.get('proxyServer').port;
  proxyPath = appCfg.get('proxyServer').path;
}

const webpackCfg = require('../webpack.config.babel');

// Code is (still) a bit messy. In need of some refactoring :-)

logger.log('Express config:', 'NODE_ENV:', nodeEnv,
  'isProd:', isProd, 'isDev:', isDev,
  'isHot:', isHot, 'public path:', publicPath,
  'API path:', apiPath, 'proxy:', isProxy);


// ------------------------
// Common config
// ------------------------
const app = express();

let devMiddleware = null;

if (isProxy) {
  // Proxy middleware
  const proxy = require('http-proxy-middleware'); // eslint-disable-line global-require
  app.use(proxy(proxyPath, {
    target: `http://${proxyHost}:${proxyPort}`,
    changeOrigin: true,
    onProxyReq(proxyReq) {
      logger.log(`Proxying to: ${proxyReq.path}`);
    }
  }));
}
else {
  // Middleware for handling JSON, Raw, Text and URL encoded form data
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  // Api router. Must be defined before any app.get
  app.use(apiPath, router);
}

if(webpackCfg.devServer.historyApiFallback) {
  // This rewrites all routes requests to the root /index.html file
  // (ignoring file requests). If you want to implement universal
  // rendering, you'll want to remove this middleware.
  const history = require('connect-history-api-fallback'); // eslint-disable-line global-require
  app.use(history(webpackCfg.devServer.historyApiFallback));
}

if (isDev || isHot) {
  // ------------------------
  // webpack config
  // ------------------------

  // Step 1: Create & configure a webpack compiler
  const compiler = webpack(webpackCfg);
  compiler.apply(new webpack.ProgressPlugin());

  // Step 2: Attach the dev middleware to the compiler & the server
  const webpackDevMiddleware = require('webpack-dev-middleware'); // eslint-disable-line global-require

  //devMiddleware = webpackDevMiddleware(compiler, {
  //  noInfo: true,
  //  quiet: true,
  //  publicPath: publicPath
  //});

  devMiddleware = webpackDevMiddleware(compiler, webpackCfg.devServer);

  app.use(devMiddleware);


  if(isHot) {
    // Step 3: Attach the hot middleware to the compiler & the server
    // See: https://github.com/glenjamin/webpack-hot-middleware
    //
    // eslint-disable-next-line global-require
    // app.use(require('webpack-hot-middleware')(compiler, {
    //   log: console.log, // eslint-disable-line no-console // A function used to log lines, pass false to disable. Defaults to console.log
    //   heartbeat: 10 * 1000, // How often to send heartbeat updates to the client to keep the connection alive. Should be less than the client's timeout setting - usually set to half its value.
    //   path: '/__webpack_hmr', // The path which the middleware will serve the event stream on, must match the client setting
    //   // You can use full urls, like:
    //   // path: `http://${host}:${port}${publicPath}/__webpack_hmr`
    //   // Remember to update webpack-hot-middleware in ../webpack-config.babel
    // }));

    // eslint-disable-next-line global-require
    app.use(require('webpack-hot-middleware')(compiler, { path: '/__webpack_hmr' }));
  }

  app.use(publicPath, express.static(webpackCfg.context));

  app.get(/\.dll\.js$/, (req, res) => {
    const filename = req.path.startsWith(publicPath)
      ? req.path.replace(publicPath, '')
      : req.path;

    //console.log('### .dll.js', req.path, filename);

    res.sendFile(path.join(compiler.outputPath, filename));
  });

  // Since webpackDevMiddleware uses memory-fs internally to store build
  // artifacts, we use it instead
  const fs = devMiddleware.fileSystem;

  app.get(/\.map$|\.htm[l]?$/, (req, res) => {
    const filename = req.path.replace(/^\//, '');

    //console.log('§§§ .map|.html', req.path, filename);

    fs.readFile(path.join(compiler.outputPath, filename), (err, file) => {
      if (err) {
        res.sendStatus(404);
      } else {
        res.send(file.toString());
      }
    });
  });

  app.get('*', (req, res) => {
    const filename = req.path.startsWith(publicPath)
      ? req.path.replace(publicPath, '')
      : req.path;

    // console.log('@@@ *', req.path, filename);

    if (filename.indexOf('.') > -1) {
      res.sendFile(path.join(compiler.outputPath, filename), err => {
        if (err) {
          res.sendStatus(404);
        }
      });
    }
    else {
      fs.readFile(path.join(compiler.outputPath, 'index.html'), (err, file) => {
        if (err) {
          res.sendStatus(404);
        } else {
          res.send(file.toString());
        }
      });
    }
  });
}
else {
  // ------------------------
  // Dist/Build config
  // ------------------------

  // compression middleware compresses your server responses which makes them
  // smaller (applies also to assets). You can read more about that technique
  // and other good practices on official Express.js docs http://mxs.is/googmy
  const compression = require('compression');
  app.use(compression());

  // Eventually override output path in production
  const outputPath = appCfg.get('outputPath') || webpackCfg.output.path;

  app.use(publicPath, express.static(outputPath));

  app.get(/\.map$|\.htm[l]?$/, (req, res) => {
    const filename = req.path.replace(/^\//, '');
    //console.log('§§§ .map|.html', req.path, filename);

    res.sendFile(path.resolve(outputPath, filename), err => {
      if (err) {
        res.sendStatus(404);
      }
    });
  });

  app.get('*', (req, res) => {
    const filename = req.path.startsWith(publicPath)
      ? req.path.replace(publicPath, '')
      : req.path;

    //console.log('@@@ *', req.path, filename);

    if (filename.indexOf('.') > -1) {
      res.sendFile(path.join(outputPath, filename), err => {
        if (err) {
          res.sendStatus(404);
        }
      });
    }
    else {
      res.sendFile(path.resolve(outputPath, 'index.html'), err => {
        if (err) {
          res.sendStatus(404);
        }
      });
    }
  });
}

const server = {
  app: app,
  handle: null,

  start: () => {
    const pingProxyServer = () => {
      const ping = require('node-http-ping'); // eslint-disable-line global-require
      ping(proxyHost, proxyPort)
        .then(time => logger.log(`Proxy response time: ${time}ms`))
        .catch(error => {
          logger.error(`Could not connect to: ${proxyHost}:${proxyPort}. Error: ${error}\n` +
            'Try to restart the proxy server');
          process.exit(1);
        });
    };

    const startServer = () => {
      if (server.handle === null) {

        server.handle = app.listen(port, host, (err) => {
          if (err) {
            logger.error(err.message);
            process.exit(1);
          }

          server.app.emit('serverStarted');
          logger.serverStarted(port, proxyPort, publicPath, isHot);

          if (isProxy) {
            pingProxyServer();
          }
        });
      }
    };

    if (devMiddleware) {
      devMiddleware.waitUntilValid(() => {
        logger.info('webpack is in a valid state');
        startServer();
      });
    }
    else {
      startServer();
    }
  },

  stop: (done = () => {}) => {
    if (server.handle !== null) {
      server.handle.close(done);
      server.handle = null;
      logger.log('Server stopped');
    }
  },
};

if (nodeEnv !== ENV.test) {
  process.on('uncaughtException', err => {
    logger.error('Server Uncaught Exception ', err.stack);
    process.exit(1);
  });

  server.start();
}

// Export for test
export default server;
