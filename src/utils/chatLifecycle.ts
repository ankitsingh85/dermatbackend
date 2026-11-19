// Shared "is this consultation chat still usable" logic — there's no
// background job in this codebase, so a chat whose 7-day window has
// passed is lazily closed the moment anything actually touches it
// (send a message, start a call, load the doctor's inbox) rather than
// on a schedule.
export const CONSULTATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const resolveChatClosure = async (chat: any) => {
  if (!chat) return chat;
  if (chat.source !== "consultation") return chat;
  if (chat.closedAt) return chat;
  if (chat.consultationExpiresAt && new Date() > new Date(chat.consultationExpiresAt)) {
    chat.closedAt = chat.consultationExpiresAt;
    chat.closedBy = "system";
    await chat.save();
  }
  return chat;
};

export const isChatClosed = (chat: any) => Boolean(chat?.closedAt);

// ---------------------------------------------------------------------------
// Pending chat requests in first-come order (by requestedAt), plus the
// doctor's open consultations. Doctors can accept any number of chats; only
// live calls are one-at-a-time (see utils/callQueue.ts).
// ---------------------------------------------------------------------------
export const isActiveConsultation = (chat: any) =>
  chat?.source === "consultation" && chat?.status === "accepted" && !chat?.closedAt;

export const getDoctorQueue = async (ChatModel: any, doctorId: any) => {
  const chats = await ChatModel.find({
    doctorId,
    $or: [{ status: "pending" }, { status: "accepted", source: "consultation", closedAt: null }],
  }).sort({ requestedAt: 1 });

  await Promise.all(chats.map((chat: any) => resolveChatClosure(chat)));

  const active = chats.filter(isActiveConsultation);
  const waiting = chats.filter((chat: any) => chat.status === "pending");
  return { active, waiting };
};
