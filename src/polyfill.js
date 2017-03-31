/**
 * Polyfill on demand using import()
 * @See http://anzorb.com/we-dont-need-your-polyfills/
 * @see https://hackernoon.com/polyfills-everything-you-ever-wanted-to-know-or-maybe-a-bit-less-7c8de164e423
 * @see http://anujnair.com/blog/13-conditionally-load-multiple-polyfills-using-webpack-promises-and-code-splitting
 */
import 'core-js/es6/promise';

export default function polyfill() {
  const promises = [];

  if (!window._babelPolyfill) {
    promises.push(import('babel-polyfill'));
  }

  if (!window.fetch) {
    promises.push(import('whatwg-fetch'));
  }

  if(!window.Proxy) {
    promises.push(import('harmony-reflect'));
  }

  if (!window.Intl) {
    promises.push(import('intl'));
    promises.push(import('intl/locale-data/jsonp/en.js'));
    promises.push(import('intl/locale-data/jsonp/nb.js'));
  }
  //... other polyfills

  return Promise.all(promises);
}