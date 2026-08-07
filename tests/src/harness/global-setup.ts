/**
 * Prints, exactly once per `npm test`, which backends the suite is about to run against.
 *
 * This matters for the deliverable: "npm test green" means nothing if the reader cannot tell
 * whether it ran against the real compiled contract or only against the spec model.
 */

import { backendBanner, backends } from "./index.js";

export default async function setup(): Promise<void> {
  const found = await backends();
  console.info(`\n  testigo · ${backendBanner(found)}\n`);
}
