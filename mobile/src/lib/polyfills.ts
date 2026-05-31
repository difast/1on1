// Global polyfills required for supabase-js (and other libs) to run safely in a
// release Hermes build. Importing this module for its side effects sets up
// everything before any network/auth code runs. Keep this import FIRST.

import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { decode as atobDecode, encode as btoaEncode } from 'base-64';

const g = globalThis as any;

// atob / btoa — used by supabase-js when decoding JWTs and tokens.
if (typeof g.atob === 'undefined') g.atob = atobDecode;
if (typeof g.btoa === 'undefined') g.btoa = btoaEncode;

// structuredClone — referenced by some dependencies; Hermes lacks it.
if (typeof g.structuredClone === 'undefined') {
  g.structuredClone = (value: any) => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };
}
