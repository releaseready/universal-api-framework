// Runs the compiled test files with node:test, streams the spec output to stdout and to spec.txt, writes junit.xml and
// returns the test totals. The files are the ones matched by the RR_SUITE glob.
import { createWriteStream } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { run } from "node:test";
import { junit, spec } from "node:test/reporters";
import { SummaryCollector, type Totals, type TestEvent } from "./summary.js";

export async function runSuite(
  suiteGlob: string,
  outDir: string,
): Promise<Totals> {
  const files: string[] = [];
  for await (const file of glob(suiteGlob)) {
    files.push(file);
  }
  const collector = new SummaryCollector();
  const stream = run({ files, concurrency: 1 });
  stream.on("data", (event: TestEvent) => {
    collector.record(event);
  });
  const specOutput = stream.compose(spec);
  specOutput.pipe(process.stdout);
  await Promise.all([
    pipeline(
      stream.compose(junit),
      createWriteStream(join(outDir, "junit.xml")),
    ),
    pipeline(specOutput, createWriteStream(join(outDir, "spec.txt"))),
  ]);
  return collector.totals();
}
