import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships flat configs directly, so there is no need for
// the FlatCompat shim — which, with this version, ends up building a circular
// config object and fails to load at all.
const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "tests/**"] },
];

export default config;
