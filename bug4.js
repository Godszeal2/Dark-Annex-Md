await sock.reportSpam(
  groupJid,
  [{ id: messageId, from: userJid, t: Math.floor(Date.now() / 1000) }],
  'group_info_report',
  'Example group'
)

const userAccepted = await sock.reportUser(userJid, 'spam')
const messageAccepted = await sock.reportMessage(
  userJid,
  messageId,
  'harassment',
  participantJid
)
await sock.reportAndBlockUser(userJid, 'scam')