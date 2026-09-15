#!/usr/bin/env node
import { migrate, closeDb } from './db/index.js';
import { seedDefaultPrompts } from './ai/prompts.js';
import { seedDemoAgency } from '../db/seed.js';
import { tick } from './jobs/scheduler.js';
import { queueStats } from './jobs/queue.js';
import { log } from './core/logger.js';

/** Small operational CLI: migrate, seed, scheduler tick, queue inspection. */

const [, , command, ...args] = process.argv;

const COMMANDS = {
  migrate() {
    const version = migrate();
    const prompts = seedDefaultPrompts();
    console.log(`Schema applied (${version}). Seeded ${prompts} system prompts.`);
  },

  seed() {
    migrate();
    seedDefaultPrompts();
    const result = seedDemoAgency({ reset: args.includes('--reset') });
    console.log(JSON.stringify(result, null, 2));
  },

  tick() {
    migrate();
    console.log(JSON.stringify(tick(new Date()), null, 2));
  },

  queue() {
    migrate();
    console.log(JSON.stringify(queueStats(), null, 2));
  },

  help() {
    console.log(`social-os

  node src/cli.js migrate        apply the schema and seed system prompts
  node src/cli.js seed [--reset] create a demo agency with sample data
  node src/cli.js tick           run one scheduler tick by hand
  node src/cli.js queue          show queue depth and dead-lettered jobs
`);
  },
};

const run = COMMANDS[command ?? 'help'] ?? COMMANDS.help;
try {
  run();
} catch (err) {
  log.error('cli_failed', { command, err: String(err.stack ?? err) });
  process.exitCode = 1;
} finally {
  closeDb();
}
