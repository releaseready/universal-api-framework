// Process entrypoint of the runner image: runs the runner against the environment and sets the exit code.
import { runRunner } from "./cli.js";

process.exitCode = await runRunner(process.env);
