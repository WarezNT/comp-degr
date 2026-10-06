'use strict';

const browser = {
  window: 'readonly', document: 'readonly', Blob: 'readonly', URL: 'readonly',
  FileReader: 'readonly', Promise: 'readonly', confirm: 'readonly', alert: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', Event: 'readonly', CSS: 'readonly',
  CompEngine: 'readonly', AppState: 'readonly', AppValidate: 'readonly', AppUI: 'readonly'
};

module.exports = [
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2017, sourceType: 'script', globals: browser },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'eqeqeq': ['warn', 'smart']
    }
  },
  {
    files: ['tests/run.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'commonjs',
      globals: { require: 'readonly', process: 'readonly', __dirname: 'readonly', console: 'readonly', module: 'writable' }
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' }
  }
];
