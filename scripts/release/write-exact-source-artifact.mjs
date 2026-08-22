#!/usr/bin/env node

import { writeExactSourceArtifact } from "./exact-source-artifact.mjs";

const result = writeExactSourceArtifact();
console.log(`[release:exact-source] Wrote required exact-SHA artifact for ${result.artifact.commitSha} to ${result.outputPath}.`);
