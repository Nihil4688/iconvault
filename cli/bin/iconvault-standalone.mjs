#!/usr/bin/env node
import { runStandalone } from "../src/standalone.mjs";

runStandalone()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Could not start IconVault.");
    process.exitCode = 1;
  });
