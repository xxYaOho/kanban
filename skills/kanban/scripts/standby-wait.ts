#!/usr/bin/env bun
/**
 * Foreground standby wait controller.
 *
 * It owns the polling timer and backoff policy. It does not execute role work.
 */
import {
  getStandbyTrigger,
  parseStandbyTriggerArgs,
  type StandbyTriggerArgs,
  type StandbyTriggerResult,
} from "./standby-trigger";
import { isCliEntry } from "./cli-entry";

export interface StandbyWaitConfig {
  initialIntervalSec: number;
  pollsPerStep: number;
  maxIntervalSec: number;
  maxEmptyPolls: number;
}

export interface StandbyWaitHooks {
  log: (message: string) => void;
}

export interface StandbyWaitExpiredResult {
  ready: false;
  expired: true;
  emptyPolls: number;
  maxEmptyPolls: number;
  totalWaitSec: number;
  reason: string;
  message: string;
}

export const defaultStandbyWaitConfig: StandbyWaitConfig = {
  initialIntervalSec: 15,
  pollsPerStep: 5,
  maxIntervalSec: 240,
  maxEmptyPolls: 100,
};

export function standbyBackoffIntervalSec(
  emptyPollNumber: number,
  config: StandbyWaitConfig = defaultStandbyWaitConfig,
): number {
  if (!Number.isInteger(emptyPollNumber) || emptyPollNumber < 1) {
    throw new Error(`emptyPollNumber must be a positive integer: ${emptyPollNumber}`);
  }
  const step = Math.floor((emptyPollNumber - 1) / config.pollsPerStep);
  return Math.min(config.initialIntervalSec * (2 ** step), config.maxIntervalSec);
}

export function standbyBackoffTotalWaitSec(
  emptyPolls = defaultStandbyWaitConfig.maxEmptyPolls,
  config: StandbyWaitConfig = defaultStandbyWaitConfig,
): number {
  let total = 0;
  for (let i = 1; i <= emptyPolls; i++) {
    total += standbyBackoffIntervalSec(i, config);
  }
  return total;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join("");
}

function expiredResult(emptyPolls: number, totalWaitSec: number): StandbyWaitExpiredResult {
  return {
    ready: false,
    expired: true,
    emptyPolls,
    maxEmptyPolls: defaultStandbyWaitConfig.maxEmptyPolls,
    totalWaitSec,
    reason: `standby wait reached ${emptyPolls} empty polls`,
    message: "已退出 Standby，请根据需要重启",
  };
}

export async function waitForStandbyTrigger(
  args: StandbyTriggerArgs,
  sleepMs: (ms: number) => Promise<void> = sleep,
  hooks: StandbyWaitHooks = { log: (message) => console.error(message) },
): Promise<StandbyTriggerResult | StandbyWaitExpiredResult> {
  return runStandbyWait(() => getStandbyTrigger(args), sleepMs, hooks);
}

export async function runStandbyWait(
  getTrigger: () => Promise<StandbyTriggerResult>,
  sleepMs: (ms: number) => Promise<void> = sleep,
  hooks: StandbyWaitHooks = { log: (message) => console.error(message) },
): Promise<StandbyTriggerResult | StandbyWaitExpiredResult> {
  let totalWaitSec = 0;
  let previousIntervalSec = 0;

  for (let emptyPolls = 1; emptyPolls <= defaultStandbyWaitConfig.maxEmptyPolls; emptyPolls++) {
    const trigger = await getTrigger();
    if (trigger.ready) return trigger;

    const intervalSec = standbyBackoffIntervalSec(emptyPolls);
    if (previousIntervalSec !== 0 && intervalSec !== previousIntervalSec) {
      hooks.log(`standby wait interval -> ${intervalSec}s after ${emptyPolls - 1} empty polls`);
    }
    previousIntervalSec = intervalSec;

    await sleepMs(intervalSec * 1000);
    totalWaitSec += intervalSec;
  }

  const result = expiredResult(defaultStandbyWaitConfig.maxEmptyPolls, totalWaitSec);
  hooks.log(`standby wait expired after ${result.emptyPolls} empty polls (${formatDuration(totalWaitSec)})`);
  return result;
}

async function main() {
  const args = parseStandbyTriggerArgs(Bun.argv.slice(2));
  const result = await waitForStandbyTrigger(args);
  console.log(JSON.stringify(result, null, 2));
}

if (isCliEntry(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
