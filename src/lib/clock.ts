// Where the application layer reads the time, injected so that tests can set it
// (e.g. to just past an Approval's 7-day deadline).
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
