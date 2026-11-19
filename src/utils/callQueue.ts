// One call at a time per doctor.
//
// Doctors can accept and chat with as many patients as they like — the only
// thing that's exclusive is a live call. While a doctor is ringing or on a
// call, any other patient who calls them is put in a first-come queue
// instead of ringing a doctor who can't pick up. When the current call ends
// (hang-up, decline, no answer, or a dropped connection) the next patient in
// line is rung automatically.
//
// State is in memory on purpose: it only describes calls that are happening
// right now, and every call is gone anyway if the socket server restarts.

export type CallInvite = {
  chatId: string;
  callId: string;
  from: string; // patient
  to: string; // doctor
  callType?: "audio" | "video";
  callerName?: string;
  callerImage?: string;
  [key: string]: any;
};

type CurrentCall = {
  callId: string;
  chatId: string;
  peerId: string; // the patient on the other end
  state: "ringing" | "connected";
  timer?: ReturnType<typeof setTimeout>;
};

type QueuedCall = { invite: CallInvite; queuedAt: number };

const currentCalls = new Map<string, CurrentCall>(); // doctorId -> call
const queues = new Map<string, QueuedCall[]>(); // doctorId -> waiting callers

export const RING_TIMEOUT_MS = 45 * 1000;

export const getCurrentCall = (doctorId: string) => currentCalls.get(String(doctorId));

export const isDoctorOnCall = (doctorId: string) => currentCalls.has(String(doctorId));

export const getQueue = (doctorId: string) => queues.get(String(doctorId)) || [];

export const setCurrentCall = (doctorId: string, call: CurrentCall) => {
  const prev = currentCalls.get(String(doctorId));
  if (prev?.timer) clearTimeout(prev.timer);
  currentCalls.set(String(doctorId), call);
};

export const markConnected = (callId: string) => {
  for (const call of currentCalls.values()) {
    if (call.callId === callId) {
      if (call.timer) clearTimeout(call.timer);
      call.timer = undefined;
      call.state = "connected";
      return true;
    }
  }
  return false;
};

/** Doctor whose current call has this id (ringing or connected), if any. */
export const findDoctorByCallId = (callId: string) => {
  for (const [doctorId, call] of currentCalls.entries()) {
    if (call.callId === callId) return doctorId;
  }
  return null;
};

export const clearCurrentCall = (doctorId: string) => {
  const call = currentCalls.get(String(doctorId));
  if (call?.timer) clearTimeout(call.timer);
  currentCalls.delete(String(doctorId));
  return call;
};

/** Adds (or refreshes) a caller in the doctor's queue; returns their 1-based position. */
export const enqueue = (doctorId: string, invite: CallInvite) => {
  const list = getQueue(doctorId).filter((q) => q.invite.from !== invite.from);
  list.push({ invite, queuedAt: Date.now() });
  queues.set(String(doctorId), list);
  return list.length;
};

/** Removes a queued call by id (caller hung up while waiting). */
export const removeQueued = (callId: string) => {
  for (const [doctorId, list] of queues.entries()) {
    const next = list.filter((q) => q.invite.callId !== callId);
    if (next.length !== list.length) {
      queues.set(doctorId, next);
      return doctorId;
    }
  }
  return null;
};

/** Removes every queued call from this user (they went offline). Returns affected doctor ids. */
export const removeQueuedByUser = (userId: string) => {
  const touched: string[] = [];
  for (const [doctorId, list] of queues.entries()) {
    const next = list.filter((q) => q.invite.from !== userId);
    if (next.length !== list.length) {
      queues.set(doctorId, next);
      touched.push(doctorId);
    }
  }
  return touched;
};

export const shiftQueue = (doctorId: string) => {
  const list = getQueue(doctorId);
  const next = list.shift();
  queues.set(String(doctorId), list);
  return next || null;
};

/** Doctor ids that currently have a live/ringing call involving this user. */
export const callsInvolving = (userId: string) => {
  const result: string[] = [];
  for (const [doctorId, call] of currentCalls.entries()) {
    if (doctorId === userId || call.peerId === userId) result.push(doctorId);
  }
  return result;
};
