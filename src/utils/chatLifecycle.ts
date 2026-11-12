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
